import { NextRequest, NextResponse } from 'next/server';
import { seedInsurancePriceList } from '@/lib/insurance/seed-price-list';

/**
 * POST /api/admin/insurance/[id]/price-list/seed
 *
 * Manually re-initialize the price list from the clinic's master catalogs.
 * Already-seeded items are preserved (so manual negotiated-price adjustments
 * survive the call). For automatic initialization on company creation, see
 * the POST /api/admin/insurance route which calls the same helper.
 */
export async function POST(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const result = await seedInsurancePriceList(params.id);

        if (result.created === 0) {
            return NextResponse.json({
                success: true,
                count: 0,
                total: result.total,
                breakdown: result.breakdown,
                message: 'All items are already seeded. No new items added.',
            });
        }

        const { billable, drug, lab, radiology } = result.breakdown;
        return NextResponse.json({
            success: true,
            count: result.created,
            total: result.total,
            breakdown: result.breakdown,
            message: `Seeded ${result.created} new items at clinic general prices — ${billable} billable, ${drug} drugs, ${lab} labs, ${radiology} radiology. Adjust individually as needed.`,
        });
    } catch (error) {
        console.error('API Error [Price List Seed]:', error);
        return NextResponse.json({ error: 'Failed to seed price list' }, { status: 500 });
    }
}
