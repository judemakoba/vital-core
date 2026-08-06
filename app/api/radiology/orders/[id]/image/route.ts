import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { idValueSchema } from '@/lib/validation/schemas';
import { deleteFile, isNextcloudConfigured, getNextcloudConfig } from '@/lib/nextcloud';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/radiology/orders/[id]/image
 *
 * Removes the attached scan image from Nextcloud and clears the URL/token on the order.
 */
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const allowedRoles = ['RADIOLOGIST', 'LAB_TECH', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN'];
        if (!allowedRoles.includes(user?.role)) {
            return NextResponse.json({ error: 'Unauthorized role' }, { status: 403 });
        }

        const idCheck = idValueSchema.safeParse(params.id);
        if (!idCheck.success) {
            return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
        }

        const order = await prisma.radiologyOrder.findUnique({
            where: { id: idCheck.data },
            include: { patient: { select: { patientNumber: true } } },
        });
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

        if (!order.reportFileName) {
            return NextResponse.json({ error: 'No image attached to this order' }, { status: 404 });
        }

        // Best-effort: try to remove the file from Nextcloud
        if (isNextcloudConfigured() && order.patient?.patientNumber) {
            try {
                const subFolder = `${order.patient.patientNumber}/${order.examName.replace(/[^a-zA-Z0-9]+/g, '_')}_${order.visitId.slice(0, 8)}`;
                const remotePath = `/${getNextcloudConfig().baseFolder}/${subFolder}/${order.reportFileName}`;
                await deleteFile(remotePath);
            } catch (e) {
                console.warn('Failed to delete file from Nextcloud (non-fatal):', e);
            }
        }

        await prisma.radiologyOrder.update({
            where: { id: idCheck.data },
            data: {
                reportUrl: null,
                reportShareToken: null,
                reportFileName: null,
                reportMimeType: null,
                reportFileSize: null,
                reportUploadedAt: null,
            },
        });

        return NextResponse.json({ message: 'Image removed' });
    } catch (error: any) {
        console.error('Radiology image delete error:', error);
        return NextResponse.json({ error: error.message || 'Failed to delete image' }, { status: 500 });
    }
}

/**
 * GET /api/radiology/orders/[id]/image
 * Returns the current image metadata for this order.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const idCheck = idValueSchema.safeParse(params.id);
        if (!idCheck.success) {
            return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
        }

        const order = await prisma.radiologyOrder.findUnique({
            where: { id: idCheck.data },
            select: {
                reportUrl: true,
                reportShareToken: true,
                reportFileName: true,
                reportMimeType: true,
                reportFileSize: true,
                reportUploadedAt: true,
            },
        });
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

        if (!order.reportFileName) {
            return NextResponse.json({ hasImage: false });
        }

        return NextResponse.json({
            hasImage: true,
            ...order,
            sizeKb: Math.round((order.reportFileSize || 0) / 1024),
            directUrl: order.reportUrl,
        });
    } catch (error: any) {
        console.error('Radiology image get error:', error);
        return NextResponse.json({ error: error.message || 'Failed to get image info' }, { status: 500 });
    }
}
