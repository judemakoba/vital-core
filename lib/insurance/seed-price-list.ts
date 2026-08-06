/**
 * Insurance Price List Seeder
 *
 * Pulls every active, billable item from the clinic's master catalogs and
 * pre-fills a partner's `InsurancePriceListItem` rows with the clinic's
 * GENERAL price. Each row can be adjusted by the admin afterwards to
 * reflect the negotiated rate.
 *
 * Sources (every active item becomes one row, defaulting to the clinic's
 * general price — never a per-tier or per-buyer price):
 *
 *   1. BillableItem      — consultations, procedures, nursing, room/board
 *   2. DrugPrice (REGULAR) — with DrugBatch.sellingPrice fallback
 *   3. LabTestCatalog    — all catalogued lab tests
 *   4. RadiologyCatalog  — all catalogued radiology exams
 *
 * Idempotent: items already present for this insurer are skipped so that
 * any manual negotiated-price adjustment is preserved.
 *
 * Used by:
 *   - POST /api/admin/insurance/[id]/price-list/seed  (manual "Initialize")
 *   - POST /api/admin/insurance                       (auto on company create)
 *   - PATCH /api/admin/insurance/[id]                 (re-initialize on reactivation)
 */
import { prisma } from '../prisma';

export type PriceListSeedSource = 'billable' | 'drug' | 'lab' | 'radiology';

export interface PriceListSeedBreakdown {
    billable: number;
    drug: number;
    lab: number;
    radiology: number;
}

export interface PriceListSeedResult {
    /** Number of NEW rows created (excludes already-seeded items). */
    created: number;
    /** Total items in the partner's price list after this call. */
    total: number;
    /** Per-source breakdown of the new rows. */
    breakdown: PriceListSeedBreakdown;
    /** True if the partner's price list was empty before this call. */
    wasEmpty: boolean;
}

const BILLABLE_CATEGORY_TO_SERVICE_TYPE: Record<string, string> = {
    MEDICAL_FEE: 'CONSULTATION',
    LABORATORY: 'LAB_TEST',
    RADIOLOGY: 'RADIOLOGY',
    PROCEDURE: 'PROCEDURE',
    MEDICATION: 'PHARMACY',
    CONSUMABLE: 'PHARMACY',
    ROOM_BOARD: 'OTHER',
    NURSING_FEE: 'OTHER',
    THERAPY: 'OTHER',
    SUNDRY: 'OTHER',
    DEPOSIT: 'OTHER',
    OTHER: 'OTHER',
};

export async function seedInsurancePriceList(
    insuranceId: string,
    options?: { onlyIfEmpty?: boolean }
): Promise<PriceListSeedResult> {
    // Already-seeded serviceIds (so manual adjustments are preserved)
    const existingRules = await prisma.insurancePriceListItem.findMany({
        where: { insuranceId },
        select: { serviceId: true },
    });
    const seededServiceIds = new Set(
        existingRules.map((r) => r.serviceId).filter((id): id is string => Boolean(id))
    );

    if (options?.onlyIfEmpty && seededServiceIds.size > 0) {
        return {
            created: 0,
            total: seededServiceIds.size,
            breakdown: { billable: 0, drug: 0, lab: 0, radiology: 0 },
            wasEmpty: false,
        };
    }

    const wasEmpty = seededServiceIds.size === 0;

    // ── 1. BillableItem (consultations, procedures, room/board, etc.) ────
    const billableItems = await prisma.billableItem.findMany({
        where: { isActive: true },
        select: { id: true, category: true, standardRate: true },
    });

    const billableEntries = billableItems
        .filter((item) => !seededServiceIds.has(item.id) && item.standardRate > 0)
        .map((item) => ({
            insuranceId,
            serviceId: item.id,
            serviceType: BILLABLE_CATEGORY_TO_SERVICE_TYPE[item.category] ?? 'OTHER',
            negotiatedPrice: item.standardRate,
        }));

    // ── 2. DrugPrice (REGULAR) with DrugBatch.sellingPrice fallback ───────
    // Prefer DrugPrice.REGULAR — that's the "general" list price.
    // For drugs without a REGULAR price card, fall back to the most recent
    // active DrugBatch.sellingPrice so nothing is left out.
    const regularPrices = await prisma.drugPrice.findMany({
        where: { priceType: 'REGULAR', isActive: true },
        select: { drugId: true, price: true, effectiveFrom: true },
        orderBy: { effectiveFrom: 'desc' },
    });

    const latestRegularByDrug = new Map<string, number>();
    for (const dp of regularPrices) {
        if (!latestRegularByDrug.has(dp.drugId)) {
            latestRegularByDrug.set(dp.drugId, dp.price);
        }
    }

    // Fallback pool — drugs that have an active batch but no DrugPrice card.
    const activeBatches = await prisma.drugBatch.findMany({
        where: {
            isActive: true,
            quantityRemaining: { gt: 0 },
        },
        select: { drugId: true, sellingPrice: true, receivedDate: true },
        orderBy: { receivedDate: 'desc' },
    });

    const latestBatchByDrug = new Map<string, number>();
    for (const b of activeBatches) {
        if (!latestBatchByDrug.has(b.drugId) && b.sellingPrice > 0) {
            latestBatchByDrug.set(b.drugId, b.sellingPrice);
        }
    }

    const drugEntries: { insuranceId: string; serviceId: string; serviceType: 'PHARMACY'; negotiatedPrice: number }[] = [];
    const seenDrugIds = new Set<string>();
    for (const [drugId, price] of latestRegularByDrug) {
        if (seededServiceIds.has(drugId)) continue;
        drugEntries.push({
            insuranceId,
            serviceId: drugId,
            serviceType: 'PHARMACY',
            negotiatedPrice: price,
        });
        seenDrugIds.add(drugId);
    }
    for (const [drugId, price] of latestBatchByDrug) {
        if (seededServiceIds.has(drugId) || seenDrugIds.has(drugId)) continue;
        drugEntries.push({
            insuranceId,
            serviceId: drugId,
            serviceType: 'PHARMACY',
            negotiatedPrice: price,
        });
    }

    // ── 3. LabTestCatalog ────────────────────────────────────────────────
    const labTests = await prisma.labTestCatalog.findMany({
        select: { id: true, price: true },
    });
    const labEntries = labTests
        .filter((test) => !seededServiceIds.has(test.id) && test.price > 0)
        .map((test) => ({
            insuranceId,
            serviceId: test.id,
            serviceType: 'LAB_TEST' as const,
            negotiatedPrice: test.price,
        }));

    // ── 4. RadiologyCatalog ──────────────────────────────────────────────
    const radiologyItems = await prisma.radiologyCatalog.findMany({
        where: { isActive: true },
        select: { id: true, price: true },
    });
    const radiologyEntries = radiologyItems
        .filter((item) => !seededServiceIds.has(item.id) && item.price > 0)
        .map((item) => ({
            insuranceId,
            serviceId: item.id,
            serviceType: 'RADIOLOGY' as const,
            negotiatedPrice: item.price,
        }));

    const allEntries = [
        ...billableEntries,
        ...drugEntries,
        ...labEntries,
        ...radiologyEntries,
    ];

    if (allEntries.length === 0) {
        return {
            created: 0,
            total: seededServiceIds.size,
            breakdown: {
                billable: billableEntries.length,
                drug: drugEntries.length,
                lab: labEntries.length,
                radiology: radiologyEntries.length,
            },
            wasEmpty,
        };
    }

    const result = await prisma.insurancePriceListItem.createMany({
        data: allEntries,
    });

    return {
        created: result.count,
        total: seededServiceIds.size + result.count,
        breakdown: {
            billable: billableEntries.length,
            drug: drugEntries.length,
            lab: labEntries.length,
            radiology: radiologyEntries.length,
        },
        wasEmpty,
    };
}
