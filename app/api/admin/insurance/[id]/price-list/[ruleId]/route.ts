import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * PATCH /api/admin/insurance/[id]/price-list/[ruleId]
 * Update the negotiated price for a rule
 */
export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string, ruleId: string }> | { id: string, ruleId: string } }
) {
    try {
        const body = await req.json();
        const { negotiatedPrice, serviceType } = body;
        const params = await context.params;

        const updated = await prisma.insurancePriceListItem.update({
            where: { id: params.ruleId },
            data: {
                negotiatedPrice: negotiatedPrice !== undefined ? parseFloat(negotiatedPrice) : undefined,
                serviceType: serviceType || undefined,
            }
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('API Error [Price List Update]:', error);
        if (error.code === 'P2025') {
            return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to update price rule' }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/insurance/[id]/price-list/[ruleId]
 * Remove a price rule
 */
export async function DELETE(
    _req: NextRequest,
    context: { params: Promise<{ id: string, ruleId: string }> | { id: string, ruleId: string } }
) {
    try {
        const params = await context.params;

        await prisma.insurancePriceListItem.delete({
            where: { id: params.ruleId }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('API Error [Price List Delete]:', error);
        if (error.code === 'P2025') {
            return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to delete price rule' }, { status: 500 });
    }
}
