import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== 'PHARMACIST' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            drugId,
            batchNumber,
            expiryDate,
            quantityReceived,
            purchasePrice,
            sellingPrice,
            supplierId,
            storageLocation
        } = body;

        if (!drugId || !batchNumber || !expiryDate || !quantityReceived) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Lookup existing pricing for this drug so we can auto-fill missing values
        // Priority: 1) explicit request value  2) drug's REGULAR DrugPrice  3) latest batch's prices
        let resolvedPurchasePrice = purchasePrice != null && purchasePrice !== '' ? parseFloat(String(purchasePrice)) : null;
        let resolvedSellingPrice = sellingPrice != null && sellingPrice !== '' ? parseFloat(String(sellingPrice)) : null;
        let priceSource = { purchase: 'request', selling: 'request' };

        if (resolvedPurchasePrice == null || resolvedSellingPrice == null) {
            const [regularPrice, latestBatch] = await Promise.all([
                prisma.drugPrice.findFirst({
                    where: { drugId, priceType: 'REGULAR', isActive: true, effectiveTo: null }
                }),
                prisma.drugBatch.findFirst({
                    where: { drugId, isActive: true },
                    orderBy: { receivedDate: 'desc' }
                }),
            ]);
            if (resolvedPurchasePrice == null && latestBatch?.purchasePrice != null) {
                resolvedPurchasePrice = latestBatch.purchasePrice;
                priceSource.purchase = 'latest-batch';
            }
            if (resolvedSellingPrice == null) {
                if (regularPrice?.price != null) {
                    resolvedSellingPrice = regularPrice.price;
                    priceSource.selling = 'regular-price';
                } else if (latestBatch?.sellingPrice != null) {
                    resolvedSellingPrice = latestBatch.sellingPrice;
                    priceSource.selling = 'latest-batch';
                }
            }
        }

        // Final fallback — if still no purchase price, require it (selling can be null)
        if (resolvedPurchasePrice == null || isNaN(resolvedPurchasePrice) || resolvedPurchasePrice < 0) {
            return NextResponse.json({ error: 'Purchase price is required (or set a previous price for this drug)' }, { status: 400 });
        }
        if (resolvedSellingPrice != null && (isNaN(resolvedSellingPrice) || resolvedSellingPrice < 0)) {
            return NextResponse.json({ error: 'Invalid selling price' }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create the Drug Batch
            const batch = await tx.drugBatch.create({
                data: {
                    drugId,
                    batchNumber,
                    supplierId: supplierId || null,
                    expiryDate: new Date(expiryDate),
                    quantityReceived: parseInt(quantityReceived),
                    quantityRemaining: parseInt(quantityReceived),
                    purchasePrice: resolvedPurchasePrice,
                    sellingPrice: resolvedSellingPrice,
                    storageLocation: storageLocation || 'Main Pharmacy',
                    isActive: true
                },
                include: {
                    drug: {
                        select: {
                            name: true
                        }
                    }
                }
            });

            // 2. Register Stock Movement
            const smCount = await tx.stockMovement.count();
            const currentStock = await tx.drugBatch.aggregate({
                where: { drugId },
                _sum: { quantityRemaining: true }
            });

            const stockBefore = (currentStock._sum.quantityRemaining || 0);

            await tx.stockMovement.create({
                data: {
                    movementNumber: `SM-IN-${Date.now().toString().slice(-6)}`,
                    drugId,
                    drugBatchId: batch.id,
                    movementType: 'PURCHASE',
                    quantity: parseInt(quantityReceived),
                    referenceType: 'PURCHASE_ORDER',
                    stockBefore: stockBefore,
                    stockAfter: stockBefore + parseInt(quantityReceived),
                    performedById: (session as any).user.id,
                    notes: `Quick stock entry. Batch: ${batchNumber}`
                }
            });

            return batch;
        });

        return NextResponse.json({
            message: 'Stock received successfully',
            batch: result,
            priceSource, // tells the client whether prices came from request / regular-price / latest-batch
        });

    } catch (error: any) {
        console.error('Stock entry error:', error);
        return NextResponse.json({ error: error.message || 'Failed to enter stock' }, { status: 500 });
    }
}
