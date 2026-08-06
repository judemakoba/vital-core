export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET /api/pharmacy/recent-receipts
 *
 * Returns the last 30 days of GoodsReceipts (PO-based receipts),
 * plus the last 30 days of ad-hoc DrugBatch entries (no PO).
 */
export async function GET(_request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);

        const [poReceipts, adHocBatches] = await Promise.all([
            prisma.goodsReceipt.findMany({
                where: { createdAt: { gte: cutoff } },
                orderBy: { createdAt: 'desc' },
                take: 20,
                include: {
                    purchaseOrder: {
                        select: {
                            poNumber: true,
                            supplier: { select: { name: true } },
                        },
                    },
                    receivedBy: { select: { name: true } },
                    items: {
                        select: {
                            id: true,
                            quantityReceived: true,
                            lineTotal: true,
                            drug: { select: { name: true, drugCode: true } },
                        },
                    },
                },
            }),
            // Batches with no GoodsReceipt and no supplier (ad-hoc / opening stock)
            prisma.drugBatch.findMany({
                where: {
                    receivedDate: { gte: cutoff },
                    goodsReceiptItems: { none: {} },
                },
                orderBy: { receivedDate: 'desc' },
                take: 20,
                include: {
                    drug: { select: { name: true, drugCode: true } },
                },
            }),
        ]);

        const poRows = poReceipts.map(gr => ({
            type: 'po' as const,
            id: gr.id,
            grNumber: gr.grNumber,
            poNumber: gr.purchaseOrder.poNumber,
            supplierName: gr.purchaseOrder.supplier.name,
            receivedBy: gr.receivedBy.name,
            receivedAt: gr.receivedDate,
            invoiceNumber: gr.invoiceNumber,
            itemCount: gr.items.length,
            totalQuantity: gr.items.reduce((s, i) => s + i.quantityReceived, 0),
            totalValue: gr.items.reduce((s, i) => s + i.lineTotal, 0),
            status: gr.status,
        }));

        const adHocRows = adHocBatches.map(b => ({
            type: 'adhoc' as const,
            id: b.id,
            batchNumber: b.batchNumber,
            drugCode: b.drug.drugCode,
            drugName: b.drug.name,
            quantityReceived: b.quantityReceived,
            receivedAt: b.receivedDate,
            storageLocation: b.storageLocation,
        }));

        // Merge and sort by date
        const merged = [
            ...poRows.map(r => ({ ...r, sortDate: r.receivedAt })),
            ...adHocRows.map(r => ({ ...r, sortDate: r.receivedAt })),
        ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()).slice(0, 30);

        return NextResponse.json(merged);
    } catch (error) {
        console.error('Recent receipts error:', error);
        return NextResponse.json({ error: 'Failed to fetch recent receipts' }, { status: 500 });
    }
}
