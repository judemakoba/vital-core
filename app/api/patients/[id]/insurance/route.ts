import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET /api/patients/[id]/insurance
 * List all insurance enrollments for a patient
 */
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const enrollments = await prisma.patientInsurance.findMany({
            where: { patientId: params.id },
            include: {
                insurance: {
                    select: { id: true, name: true, code: true, phone: true, email: true }
                },
                verifiedBy: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(enrollments);
    } catch (error) {
        console.error('API Error [Patient Insurance GET]:', error);
        return NextResponse.json({ error: 'Failed to fetch patient insurance' }, { status: 500 });
    }
}

/**
 * POST /api/patients/[id]/insurance
 * Enroll a patient in an insurance plan
 */
export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const body = await req.json();
        const { insuranceId, policyNumber, memberNumber, coverageStart, coverageEnd } = body;

        if (!insuranceId || !policyNumber || !coverageStart) {
            return NextResponse.json(
                { error: 'insuranceId, policyNumber, and coverageStart are required' },
                { status: 400 }
            );
        }

        // Deactivate any existing active enrollment for same insurer
        await prisma.patientInsurance.updateMany({
            where: { patientId: params.id, insuranceId, isActive: true },
            data: { isActive: false }
        });

        const enrollment = await prisma.patientInsurance.create({
            data: {
                patientId: params.id,
                insuranceId,
                policyNumber,
                memberNumber: memberNumber || null,
                coverageStart: new Date(coverageStart),
                coverageEnd: coverageEnd ? new Date(coverageEnd) : null,
                status: 'PENDING',
                isActive: true
            },
            include: {
                insurance: { select: { name: true, code: true } }
            }
        });

        return NextResponse.json(enrollment, { status: 201 });
    } catch (error: any) {
        console.error('API Error [Patient Insurance POST]:', error);
        if (error.code === 'P2002') {
            return NextResponse.json(
                { error: 'This policy number already exists for this patient and insurer.' },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: 'Failed to enroll patient in insurance' }, { status: 500 });
    }
}

/**
 * PATCH /api/patients/[id]/insurance
 * Mark an enrollment as verified (called after Reception confirms with third party)
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { enrollmentId, status } = body;

        if (!enrollmentId || !status) {
            return NextResponse.json({ error: 'enrollmentId and status are required' }, { status: 400 });
        }

        if (!['VERIFIED', 'REJECTED', 'PENDING'].includes(status)) {
            return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
        }

        const updateData: any = { status };
        if (status === 'VERIFIED') {
            updateData.verifiedAt = new Date();
            updateData.verifiedById = session.user.id;
        }

        const enrollment = await prisma.patientInsurance.update({
            where: { id: enrollmentId, patientId: params.id },
            data: updateData,
            include: {
                insurance: { select: { name: true, code: true } },
                verifiedBy: { select: { id: true, name: true } }
            }
        });

        return NextResponse.json(enrollment);
    } catch (error: any) {
        console.error('API Error [Patient Insurance PATCH]:', error);
        if (error.code === 'P2025') {
            return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to update enrollment' }, { status: 500 });
    }
}
