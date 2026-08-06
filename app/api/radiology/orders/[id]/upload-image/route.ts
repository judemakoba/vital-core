import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { idValueSchema } from '@/lib/validation/schemas';
import { uploadFile, getNextcloudConfig, isNextcloudConfigured, getDirectFileUrl } from '@/lib/nextcloud';

export const dynamic = 'force-dynamic';
// Increase the body size limit for image uploads
export const maxDuration = 60;

/**
 * POST /api/radiology/orders/[id]/upload-image
 *
 * Multipart upload. Body fields:
 *   file: the scan image (jpg/png/pdf/dcm) — required
 *   caption?: string (stored as radiologistNotes prefix, not currently surfaced)
 *
 * On success, the file is uploaded to Nextcloud, a public share is created
 * (when enabled), and the order's reportUrl/reportShareToken/reportFileName/etc.
 * are updated.
 */
export async function POST(
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

        if (!isNextcloudConfigured()) {
            return NextResponse.json(
                { error: 'Nextcloud is not configured. Set NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_PASSWORD in the server .env file.' },
                { status: 503 }
            );
        }

        const order = await prisma.radiologyOrder.findUnique({
            where: { id: idCheck.data },
            include: { patient: { select: { patientNumber: true } } },
        });
        if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

        const formData = await request.formData();
        const file = formData.get('file');
        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const blob = file as File;
        const maxBytes = 50 * 1024 * 1024; // 50 MB
        if (blob.size > maxBytes) {
            return NextResponse.json({ error: `File too large (max ${maxBytes / 1024 / 1024} MB)` }, { status: 413 });
        }

        const arrayBuffer = await blob.arrayBuffer();
        const data = Buffer.from(arrayBuffer);

        // Build a unique, human-readable filename
        const ts = Date.now();
        const safeName = blob.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
        const ext = safeName.includes('.') ? safeName.split('.').pop() : 'bin';
        const patientNum = order.patient?.patientNumber || 'unknown';
        const visitNum = order.visitId.slice(0, 8);
        const subFolder = `${patientNum}/${order.examName.replace(/[^a-zA-Z0-9]+/g, '_')}_${visitNum}`;
        const fileName = `${ts}_${safeName}`;

        // If there's an existing file, try to delete the old one from Nextcloud
        if (order.reportFileName && order.patient?.patientNumber) {
            try {
                const { deleteFile } = await import('@/lib/nextcloud');
                // Reconstruct the old remote path
                const oldSubFolder = `${patientNum}/${order.examName.replace(/[^a-zA-Z0-9]+/g, '_')}_${visitNum}`;
                const oldRemotePath = `/${getNextcloudConfig().baseFolder}/${oldSubFolder}/${order.reportFileName}`;
                await deleteFile(oldRemotePath);
            } catch (e) {
                console.warn('Failed to delete old file from Nextcloud (non-fatal):', e);
            }
        }

        const result = await uploadFile(data, fileName, blob.type || 'application/octet-stream', subFolder);

        const updated = await prisma.radiologyOrder.update({
            where: { id: idCheck.data },
            data: {
                reportUrl: result.publicUrl || result.webdavPath,
                reportShareToken: result.shareToken,
                reportFileName: blob.name,
                reportMimeType: blob.type || 'application/octet-stream',
                reportFileSize: result.size,
                reportUploadedAt: new Date(),
            },
            select: {
                id: true,
                reportUrl: true,
                reportFileName: true,
                reportMimeType: true,
                reportFileSize: true,
                reportUploadedAt: true,
            },
        });

        return NextResponse.json({
            message: 'Image uploaded to Nextcloud',
            file: {
                ...updated,
                directUrl: getDirectFileUrl(updated.reportShareToken, updated.reportUrl, getNextcloudConfig().baseUrl),
                size: updated.reportFileSize,
                sizeKb: Math.round((updated.reportFileSize || 0) / 1024),
            },
        });
    } catch (error: any) {
        console.error('Radiology image upload error:', error);
        return NextResponse.json({ error: error.message || 'Failed to upload image' }, { status: 500 });
    }
}
