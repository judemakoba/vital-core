export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * POST /api/admin/insurance/enrollments
 *
 * Quick-enroll a patient with an insurance company. Used by the cashier
 * when they realize a patient needs insurance added right at the billing desk
 * (e.g. they came in saying "I have insurance" but aren't enrolled yet).
 *
 * Body:
 *   {
 *     patientId: string,
 *     insuranceId: string,
 *     memberNumber: string,
 *     policyNumber?: string,        // defaults to memberNumber if not provided
 *     coverageStart?: ISO date,     // defaults to today
 *     coverageEnd?: ISO date | null // defaults to null (open-ended)
 *   }
 *
 * Creates the enrollment in VERIFIED + isActive=true state so the
 * patient is immediately eligible for insurance billing.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { patientId, insuranceId, memberNumber, policyNumber, coverageStart, coverageEnd } = body;

        // Validation
        if (!patientId || !insuranceId || !memberNumber) {
            return NextResponse.json(
                { error: 'patientId, insuranceId, and memberNumber are required' },
                { status: 400 }
            );
        }

        // Verify the patient exists
        const patient = await prisma.patient.findUnique({
            where: { id: patientId },
            select: { id: true, firstName: true, lastName: true, patientNumber: true },
        });
        if (!patient) {
            return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
        }

        // Verify the insurance company exists and is active
        const insurance = await prisma.insuranceCompany.findUnique({
            where: { id: insuranceId },
            select: { id: true, name: true, code: true, isActive: true },
        });
        if (!insurance) {
            return NextResponse.json({ error: 'Insurance company not found' }, { status: 404 });
        }
        if (!insurance.isActive) {
            return NextResponse.json(
                { error: `Insurance company "${insurance.name}" is not active` },
                { status: 400 }
            );
        }

        // Check for duplicate enrollment on the same insurance
        const existing = await prisma.patientInsurance.findFirst({
            where: { patientId, insuranceId, isActive: true },
            select: { id: true, memberNumber: true },
        });
        if (existing) {
            return NextResponse.json(
                {
                    error: `Patient is already enrolled with ${insurance.name} (member #${existing.memberNumber})`,
                    existingEnrollmentId: existing.id,
                },
                { status: 409 }
            );
        }

        // Create the enrollment
        const enrollment = await prisma.patientInsurance.create({
            data: {
                patientId,
                insuranceId,
                memberNumber,
                policyNumber: policyNumber || memberNumber,
                coverageStart: coverageStart ? new Date(coverageStart) : new Date(),
                coverageEnd: coverageEnd ? new Date(coverageEnd) : null,
                status: 'VERIFIED',
                isActive: true,
                verifiedAt: new Date(),
                verifiedById: session.user.id,
            },
            include: {
                insurance: { select: { id: true, name: true, code: true } },
            },
        });

        return NextResponse.json(
            {
                enrollment,
                message: `${patient.firstName} ${patient.lastName} enrolled with ${insurance.name}. They are now eligible for insurance billing.`,
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Quick enroll error:', error);
        if (error?.code === 'P2002') {
            return NextResponse.json(
                { error: 'A duplicate enrollment exists for this patient/insurance' },
                { status: 409 }
            );
        }
        return NextResponse.json(
            { error: error?.message || 'Failed to create enrollment' },
            { status: 500 }
        );
    }
}
