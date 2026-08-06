export const dynamic = 'force-dynamic';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== 'PHARMACIST' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const nearExpiryDate = new Date();
        nearExpiryDate.setDate(nearExpiryDate.getDate() + 90);

        // 1. Total Drugs (every drug in master data, active or not)
        const totalDrugs = await prisma.drug.count();

        // 1b. Active drugs only (isActive = true)
        const activeDrugs = await prisma.drug.count({ where: { isActive: true } });

        // 2. Aggregate stock across all active, non-expired batches in one round-trip
        const stockAggregate = await prisma.drugBatch.aggregate({
            where: {
                quantityRemaining: { gt: 0 },
                expiryDate: { gt: new Date() },
                isActive: true,
            },
            _sum: {
                quantityRemaining: true,
                purchasePrice: true,  // not quite right (we want qty*price, not sum*price), but useful
            },
        });
        const totalStockUnits = stockAggregate._sum.quantityRemaining ?? 0;

        // 2b. Get full batch list so we can compute total stock value (qty * price) per batch
        const allStockBatches = await prisma.drugBatch.findMany({
            where: {
                quantityRemaining: { gt: 0 },
                expiryDate: { gt: new Date() },
                isActive: true,
            },
            select: { quantityRemaining: true, purchasePrice: true }
        });
        const totalStockValue = allStockBatches.reduce(
            (sum, b) => sum + (b.quantityRemaining * b.purchasePrice),
            0
        );

        // 2c. Count of distinct drugs that currently have stock
        const drugsInStock = await prisma.drugBatch.findMany({
            where: {
                quantityRemaining: { gt: 0 },
                expiryDate: { gt: new Date() },
                isActive: true,
            },
            distinct: ['drugId'],
            select: { drugId: true }
        });
        const drugCountInStock = drugsInStock.length;

        // 3. Low Stock Count — drugs whose total stock <= 10 (heuristic for low)
        const drugsWithStock = await prisma.drug.findMany({
            include: {
                batches: {
                    where: { quantityRemaining: { gt: 0 } }
                }
            }
        });
        const lowStockCount = drugsWithStock.filter(d =>
            d.batches.reduce((sum, b) => sum + b.quantityRemaining, 0) <= 10
        ).length;

        // 3b. Out of stock — drugs with zero active stock
        const outOfStockCount = await prisma.drug.count({
            where: {
                isActive: true,
                batches: {
                    none: {
                        quantityRemaining: { gt: 0 },
                        expiryDate: { gt: new Date() },
                        isActive: true
                    }
                }
            }
        });

        // 4. Near Expiry Count (next 90 days)
        const nearExpiryCount = await prisma.drugBatch.count({
            where: {
                quantityRemaining: { gt: 0 },
                expiryDate: { lte: nearExpiryDate, gt: new Date() }
            }
        });

        // 5. Dispensed Today
        const dispensedToday = await prisma.dispensingLog.count({
            where: {
                createdAt: { gte: today }
            }
        });

        // 6. Recent Movements
        const recentMovements = await prisma.stockMovement.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
                drug: { select: { name: true } },
                drugBatch: { select: { batchNumber: true } }
            }
        });

        return NextResponse.json({
            totalDrugs,
            activeDrugs,
            drugCountInStock,
            outOfStockCount,
            totalStockUnits,
            totalStockValue,
            lowStockCount,
            nearExpiryCount,
            dispensedToday,
            recentMovements
        });
    } catch (error) {
        console.error('Pharmacy summary error:', error);
        return NextResponse.json({ error: 'Failed to fetch pharmacy summary' }, { status: 500 });
    }
}
