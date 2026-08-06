import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * PATCH /api/admin/insurance/authorizations/[id]
 * Update authorization status (e.g., approve or reject)
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const body = await req.json();
        const { status, authorizedAmount, authorizationCode, validFrom, validTo, notes } = body;

        const existing = await prisma.insuranceAuthorization.findUnique({
            where: { id: params.id }
        });

        if (!existing) {
            return NextResponse.json({ error: 'Authorization request not found' }, { status: 404 });
        }

        const updateData: any = {};
        if (status) updateData.status = status;
        if (authorizedAmount !== undefined) updateData.authorizedAmount = authorizedAmount ? parseFloat(authorizedAmount) : null;
        if (authorizationCode !== undefined) updateData.authorizationCode = authorizationCode || null;
        if (validFrom) updateData.validFrom = new Date(validFrom);
        if (validTo) updateData.validTo = new Date(validTo);
        if (notes !== undefined) updateData.notes = notes;

        const updated = await prisma.insuranceAuthorization.update({
            where: { id: params.id },
            data: updateData,
            include: {
                patientInsurance: {
                    include: {
                        patient: { select: { firstName: true, lastName: true } },
                        insurance: { select: { name: true } }
                    }
                }
            }
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('Authorization PATCH error:', error);
        return NextResponse.json({ error: 'Failed to update authorization request' }, { status: 500 });
    }
}
