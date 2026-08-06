export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET /api/pharmacy/reorder-suggestions
 *
 * Returns drugs that need restocking. For each drug, computes:
 *  - currentStock (sum of all active batches' quantityRemaining)
 *  - reorderPoint (avgMonthlyUsage * leadTimeDays / 30)
 *  - suggestedQty (maxStock - currentStock, or 2-month supply - currentStock)
 *  - urgency (STOCKOUT / CRITICAL / LOW_STOCK / NEAR_REORDER)
 *  - estimated cost using last purchase price
 *
 * Triggers reorder when:
 *  - currentStock <= reorderLevel, OR
 *  - currentStock <= reorderPoint (covers lead-time needs)
 *
 * Sorted by urgency (most critical first).
 */
export async function GET(_request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch every drug with its batch quantities and preferred supplier.
        // We use groupBy to compute current stock per drug in one round-trip.
        const [drugs, batchStocks, recentBatches] = await Promise.all([
            prisma.drug.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    drugCode: true,
                    name: true,
                    genericName: true,
                    dosageForm: true,
                    strength: true,
                    packageUnit: true,
                    reorderLevel: true,
                    maxStock: true,
                    averageMonthlyUsage: true,
                    leadTimeDays: true,
                    lastPurchaseDate: true,
                    standardUnitCost: true,
                    preferredSupplier: {
                        select: {
                            id: true,
                            supplierCode: true,
                            name: true,
                            phone: true,
                            leadTimeDays: true,
                        }
                    }
                },
            }),
            prisma.drugBatch.groupBy({
                by: ['drugId'],
                where: {
                    quantityRemaining: { gt: 0 },
                    expiryDate: { gt: new Date() },
                    isActive: true,
                },
                _sum: { quantityRemaining: true },
            }),
            // Get latest batch per drug (for last purchase price estimate)
            prisma.drugBatch.findMany({
                where: { isActive: true },
                orderBy: { receivedDate: 'desc' },
                select: {
                    drugId: true,
                    purchasePrice: true,
                    receivedDate: true,
                },
            }),
        ]);

        // Build lookup: drugId -> latest purchase price
        const latestPriceByDrug = new Map<string, { price: number; date: Date }>();
        for (const b of recentBatches) {
            if (!latestPriceByDrug.has(b.drugId)) {
                latestPriceByDrug.set(b.drugId, { price: b.purchasePrice, date: b.receivedDate });
            }
        }

        // Build lookup: drugId -> current stock
        const stockByDrug = new Map<string, number>();
        for (const r of batchStocks) {
            stockByDrug.set(r.drugId, r._sum.quantityRemaining || 0);
        }

        // Compute suggestions
        type Suggestion = {
            drugId: string;
            drugCode: string;
            drugName: string;
            genericName: string;
            dosageForm: string;
            strength: string;
            packageUnit: string;
            currentStock: number;
            reorderLevel: number | null;
            maxStock: number | null;
            averageMonthlyUsage: number | null;
            leadTimeDays: number | null;
            reorderPoint: number | null;
            suggestedQty: number;
            estimatedCost: number;
            urgency: 'STOCKOUT' | 'CRITICAL' | 'LOW_STOCK' | 'NEAR_REORDER';
            preferredSupplier: { id: string; supplierCode: string; name: string; phone: string; leadTimeDays: number | null } | null;
            lastPurchasePrice: number | null;
            lastPurchaseDate: Date | null;
        };

        const suggestions: Suggestion[] = [];

        for (const drug of drugs) {
            const currentStock = stockByDrug.get(drug.id) ?? 0;
            const reorderLevel = drug.reorderLevel;
            const maxStock = drug.maxStock;
            const avgMonthly = drug.averageMonthlyUsage;
            const leadDays = drug.leadTimeDays ?? drug.preferredSupplier?.leadTimeDays ?? null;

            // Reorder point: stock level that triggers a PO to ensure continuity
            const reorderPoint = (avgMonthly != null && leadDays != null)
                ? Math.ceil((avgMonthly * leadDays) / 30)
                : null;

            // Trigger reorder if:
            //  - reorderLevel is set AND currentStock <= reorderLevel
            //  - reorderPoint is set AND currentStock <= reorderPoint (safety stock)
            const triggered = (
                (reorderLevel != null && currentStock <= reorderLevel) ||
                (reorderPoint != null && currentStock <= reorderPoint)
            );
            if (!triggered) continue;

            // Suggested quantity
            let suggestedQty = 0;
            if (maxStock != null && maxStock > currentStock) {
                suggestedQty = maxStock - currentStock;
            } else if (avgMonthly != null && avgMonthly > 0) {
                // Default: 2 months of supply
                suggestedQty = Math.max(0, Math.ceil(avgMonthly * 2) - currentStock);
            }
            if (suggestedQty <= 0) continue;

            // Urgency
            let urgency: Suggestion['urgency'] = 'NEAR_REORDER';
            if (currentStock === 0) {
                urgency = 'STOCKOUT';
            } else if (reorderPoint != null && currentStock <= reorderPoint * 0.5) {
                urgency = 'CRITICAL';
            } else if (reorderLevel != null && currentStock <= reorderLevel) {
                urgency = 'LOW_STOCK';
            } else if (reorderPoint != null && currentStock <= reorderPoint) {
                urgency = 'NEAR_REORDER';
            }

            const last = latestPriceByDrug.get(drug.id);

            suggestions.push({
                drugId: drug.id,
                drugCode: drug.drugCode,
                drugName: drug.name,
                genericName: drug.genericName,
                dosageForm: drug.dosageForm,
                strength: drug.strength,
                packageUnit: drug.packageUnit,
                currentStock,
                reorderLevel,
                maxStock,
                averageMonthlyUsage: avgMonthly,
                leadTimeDays: leadDays,
                reorderPoint,
                suggestedQty,
                estimatedCost: last ? Math.round(suggestedQty * last.price) : 0,
                urgency,
                preferredSupplier: drug.preferredSupplier
                    ? {
                        id: drug.preferredSupplier.id,
                        supplierCode: drug.preferredSupplier.supplierCode,
                        name: drug.preferredSupplier.name,
                        phone: drug.preferredSupplier.phone,
                        leadTimeDays: drug.preferredSupplier.leadTimeDays,
                    }
                    : null,
                lastPurchasePrice: last?.price ?? null,
                lastPurchaseDate: last?.date ?? drug.lastPurchaseDate ?? null,
            });
        }

        // Sort: STOCKOUT > CRITICAL > LOW_STOCK > NEAR_REORDER; then by biggest gap
        const urgencyOrder: Record<Suggestion['urgency'], number> = {
            STOCKOUT: 0,
            CRITICAL: 1,
            LOW_STOCK: 2,
            NEAR_REORDER: 3,
        };
        suggestions.sort((a, b) => {
            const u = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
            if (u !== 0) return u;
            // Larger gap (reorderLevel - currentStock) is more urgent
            const gapA = (a.reorderLevel ?? 0) - a.currentStock;
            const gapB = (b.reorderLevel ?? 0) - b.currentStock;
            return gapB - gapA;
        });

        // Group by preferred supplier for PO creation
        const bySupplier: Record<string, { supplier: any; items: Suggestion[]; totalCost: number }> = {};
        for (const s of suggestions) {
            const key = s.preferredSupplier?.id ?? '__none__';
            if (!bySupplier[key]) {
                bySupplier[key] = {
                    supplier: s.preferredSupplier,
                    items: [],
                    totalCost: 0,
                };
            }
            bySupplier[key].items.push(s);
            bySupplier[key].totalCost += s.estimatedCost;
        }

        // Summary KPIs
        const totalItems = suggestions.length;
        const totalStockout = suggestions.filter(s => s.urgency === 'STOCKOUT').length;
        const totalCritical = suggestions.filter(s => s.urgency === 'CRITICAL').length;
        const totalEstimatedCost = suggestions.reduce((sum, s) => sum + s.estimatedCost, 0);
        const suppliersCount = Object.values(bySupplier).filter(b => b.supplier).length;

        return NextResponse.json({
            suggestions,
            bySupplier: Object.values(bySupplier),
            summary: {
                totalItems,
                totalStockout,
                totalCritical,
                totalLowStock: suggestions.filter(s => s.urgency === 'LOW_STOCK').length,
                totalNearReorder: suggestions.filter(s => s.urgency === 'NEAR_REORDER').length,
                totalEstimatedCost,
                suppliersCount,
            },
        });
    } catch (error) {
        console.error('Reorder suggestions error:', error);
        return NextResponse.json({ error: 'Failed to compute reorder suggestions' }, { status: 500 });
    }
}
