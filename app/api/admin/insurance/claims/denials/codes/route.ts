import { NextRequest, NextResponse } from 'next/server';
import { CARC_DESCRIPTIONS, CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/finance/denial-categorization';
import { categorizeDenial } from '@/lib/finance/denial-categorization';

/**
 * GET /api/admin/insurance/claims/denials/codes
 * Returns the full list of CARC denial reason codes with metadata
 * (used by the UI dropdown when capturing a denial).
 */
export async function GET(_req: NextRequest) {
    const codes = Object.entries(CARC_DESCRIPTIONS).map(([key, meta]) => {
        const category = categorizeDenial(key as any);
        return {
            code: key,
            carcCode: meta.code,
            title: meta.title,
            description: meta.description,
            category,
            categoryLabel: CATEGORY_LABELS[category],
            categoryColor: CATEGORY_COLORS[category],
        };
    });
    return NextResponse.json({ codes });
}
