import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { idValueSchema } from '@/lib/validation/schemas';

/**
 * PATCH /api/pharmacy/batches/[id]
 * Adjust batch quantity remaining, expiry date, storage location, unit cost, and unit price.
 * Audit trail:
 *  - Quantity change → StockMovement + StockAdjustment
 *  - Price change (purchasePrice or sellingPrice) → DrugPriceAudit log
 */
export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== 'PHARMACIST' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Validate the id param directly (params.id is a string, not an object)
        const idCheck = idValueSchema.safeParse(params.id);
        if (!idCheck.success) {
            return NextResponse.json({ error: 'Invalid batch ID' }, { status: 400 });
        }

        const body = await request.json();
        const { quantityRemaining, expiryDate, storageLocation, purchasePrice, sellingPrice, reason } = body;

        // Find the existing batch
        const existing = await prisma.drugBatch.findUnique({
            where: { id: params.id },
            include: { drug: { select: { name: true, id: true } } }
        });
        if (!existing) {
            return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
        }

        // Build update data
        const updateData: any = {};
        const newQty = quantityRemaining != null ? parseInt(String(quantityRemaining), 10) : null;
        const newExpiry = expiryDate ? new Date(expiryDate) : null;
        const newLocation = storageLocation !== undefined ? (storageLocation || null) : null;
        const newPurchasePrice = purchasePrice != null && purchasePrice !== '' ? parseFloat(String(purchasePrice)) : null;
        const newSellingPrice = sellingPrice != null && sellingPrice !== '' ? parseFloat(String(sellingPrice)) : null;

        if (newQty != null) {
            if (isNaN(newQty) || newQty < 0) {
                return NextResponse.json({ error: 'Quantity must be a non-negative number' }, { status: 400 });
            }
            updateData.quantityRemaining = newQty;
        }
        if (newExpiry) {
            if (isNaN(newExpiry.getTime())) {
                return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400 });
            }
            updateData.expiryDate = newExpiry;
        }
        if (newLocation !== undefined) {
            updateData.storageLocation = newLocation;
        }
        if (newPurchasePrice != null) {
            if (isNaN(newPurchasePrice) || newPurchasePrice < 0) {
                return NextResponse.json({ error: 'Purchase price must be a non-negative number' }, { status: 400 });
            }
            updateData.purchasePrice = newPurchasePrice;
        }
        if (newSellingPrice != null) {
            if (isNaN(newSellingPrice) || newSellingPrice < 0) {
                return NextResponse.json({ error: 'Selling price must be a non-negative number' }, { status: 400 });
            }
            updateData.sellingPrice = newSellingPrice;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
        }

        // Apply the update + create audit trail in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const oldQty = existing.quantityRemaining;
            const oldPurchasePrice = existing.purchasePrice;
            const oldSellingPrice = existing.sellingPrice;

            const updated = await tx.drugBatch.update({
                where: { id: params.id },
                data: updateData
            });

            // If quantity changed, record a stock movement and a stock adjustment
            if (newQty != null && newQty !== oldQty) {
                const diff = newQty - oldQty;
                const movementCount = await tx.stockMovement.count();
                await tx.stockMovement.create({
                    data: {
                        movementNumber: `SM-${new Date().getFullYear()}-${String(movementCount + 1).padStart(6, '0')}`,
                        drugId: existing.drugId,
                        drugBatchId: existing.id,
                        movementType: 'ADJUSTMENT',
                        quantity: diff,
                        referenceId: existing.id,
                        referenceType: 'ADJUSTMENT',
                        stockBefore: oldQty,
                        stockAfter: newQty,
                        performedById: session.user.id,
                        notes: reason || `Stock adjustment via Batch Management`
                    }
                });

                // Also create a StockAdjustment record for audit
                const adjustCount = await tx.stockAdjustment.count();
                await tx.stockAdjustment.create({
                    data: {
                        adjustmentNumber: `ADJ-${new Date().getFullYear()}-${String(adjustCount + 1).padStart(5, '0')}`,
                        adjustmentType: 'COUNT_CORRECTION',
                        status: 'APPROVED',
                        items: [{
                            drugId: existing.drugId,
                            drugBatchId: existing.id,
                            drugName: existing.drug.name,
                            batchNumber: existing.batchNumber,
                            quantityBefore: oldQty,
                            quantityAfter: newQty,
                            quantityDifference: diff,
                        }],
                        totalValue: diff * (newPurchasePrice ?? oldPurchasePrice ?? 0),
                        requestedById: session.user.id,
                        approvedById: session.user.id,
                        approvedAt: new Date(),
                        isWrittenOff: false,
                        notes: reason || 'Stock count correction via Batch Management'
                    }
                });
            }

            // If selling price changed, log a DrugPriceAudit entry (REGULAR price)
            if (newSellingPrice != null && newSellingPrice !== oldSellingPrice) {
                await tx.drugPriceAudit.create({
                    data: {
                        drugId: existing.drugId,
                        priceType: 'REGULAR',
                        oldPrice: oldSellingPrice ?? 0,
                        newPrice: newSellingPrice,
                        currency: 'UGX',
                        changedById: session.user.id,
                        reason: reason || `Selling price changed on batch ${existing.batchNumber}`,
                    }
                });

                // Also update the drug's REGULAR price in the DrugPrice table (or create if not exists)
                const existingPrice = await tx.drugPrice.findFirst({
                    where: { drugId: existing.drugId, priceType: 'REGULAR', isActive: true, effectiveTo: null }
                });
                if (existingPrice) {
                    await tx.drugPrice.update({
                        where: { id: existingPrice.id },
                        data: { price: newSellingPrice }
                    });
                } else {
                    // Close out any open price and create a new one
                    await tx.drugPrice.updateMany({
                        where: { drugId: existing.drugId, priceType: 'REGULAR', effectiveTo: null },
                        data: { effectiveTo: new Date() }
                    });
                    await tx.drugPrice.create({
                        data: {
                            drugId: existing.drugId,
                            priceType: 'REGULAR',
                            price: newSellingPrice,
                            currency: 'UGX',
                            effectiveFrom: new Date(),
                            isActive: true,
                        }
                    });
                }
            }

            return updated;
        });

        return NextResponse.json({
            message: 'Batch updated successfully',
            batch: result
        });
    } catch (error: any) {
        console.error('Batch update error:', error);
        return NextResponse.json({ error: error.message || 'Failed to update batch' }, { status: 500 });
    }
}

/**
 * GET /api/pharmacy/batches/[id]
 * Fetch a single batch with full details (for the adjustment modal).
 */
export async function GET(
    _request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idCheck = idValueSchema.safeParse(params.id);
        if (!idCheck.success) {
            return NextResponse.json({ error: 'Invalid batch ID' }, { status: 400 });
        }

        const batch = await prisma.drugBatch.findUnique({
            where: { id: params.id },
            include: {
                drug: {
                    select: {
                        name: true,
                        genericName: true,
                        dosageForm: true,
                        strength: true,
                        packageUnit: true
                    }
                },
                supplier: { select: { name: true } }
            }
        });

        if (!batch) {
            return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
        }

        return NextResponse.json(batch);
    } catch (error) {
        console.error('Failed to fetch batch:', error);
        return NextResponse.json({ error: 'Failed to fetch batch' }, { status: 500 });
    }
}
