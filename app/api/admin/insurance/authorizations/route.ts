export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/insurance/authorizations
 * List all pre-authorization requests
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const patientId = searchParams.get('patientId');

    try {
        const where: any = {};
        if (status && status !== 'ALL') where.status = status;
        if (patientId) {
            where.patientInsurance = { patientId };
        }

        const auths = await prisma.insuranceAuthorization.findMany({
            where,
            include: {
                patientInsurance: {
                    include: {
                        patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
                        insurance: { select: { id: true, name: true, code: true } },
                    }
                }
            },
            orderBy: { requestDate: 'desc' },
            take: 100,
        });

        return NextResponse.json(auths);
    } catch (error) {
        console.error('Authorizations GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch authorizations' }, { status: 500 });
    }
}

/**
 * POST /api/admin/insurance/authorizations
 * Create a pre-authorization request
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { patientInsuranceId, serviceType, serviceName, estimatedCost, notes } = body;

        if (!patientInsuranceId || !serviceType || !serviceName || !estimatedCost) {
            return NextResponse.json(
                { error: 'patientInsuranceId, serviceType, serviceName, and estimatedCost are required' },
                { status: 400 }
            );
        }

        // Generate request number
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.insuranceAuthorization.count({
            where: { requestDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
        });
        const requestNumber = `AUTH-${dateStr}-${(count + 1).toString().padStart(4, '0')}`;

        const auth = await prisma.insuranceAuthorization.create({
            data: {
                patientInsuranceId,
                requestNumber,
                serviceType,
                serviceName,
                estimatedCost: parseFloat(estimatedCost),
                notes: notes || null,
                status: 'PENDING',
            },
            include: {
                patientInsurance: {
                    include: {
                        patient: { select: { firstName: true, lastName: true } },
                        insurance: { select: { name: true } }
                    }
                }
            }
        });

        return NextResponse.json(auth, { status: 201 });
    } catch (error) {
        console.error('Authorization POST error:', error);
        return NextResponse.json({ error: 'Failed to create authorization request' }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/insurance/authorizations/[id]
 * Update authorization status (approve / reject)
 * Called via PATCH /api/admin/insurance/authorizations with id in body
 */
