import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/finance/tax-rates
// Returns active tax rates for invoice line items.
export async function GET() {
    try {
        const rates = await prisma.taxRate.findMany({
            where: { isActive: true },
            orderBy: { rate: 'asc' },
        });
        return NextResponse.json(rates);
    } catch (error) {
        console.error('Tax rates fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch tax rates' }, { status: 500 });
    }
}
