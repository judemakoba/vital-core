// POST /api/inventory/goods-receipt — create a goods receipt and journalize it
// GET  /api/inventory/goods-receipt — list recent goods receipts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountingService } from '@/lib/finance/accounting-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// List recent goods receipts (lightweight — used by inventory dashboard)
export async function GET(request: Request) {
    try {
        const session = (await getServerSession(authOptions)) as any;
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const url = new URL(request.url);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

        const receipts = await prisma.goodsReceipt.findMany({
            take: limit,
            orderBy: { receivedDate: 'desc' },
            include: {
                items: { include: { drug: { select: { name: true } } } },
                receivedBy: { select: { name: true, email: true } },
            },
        });
        return NextResponse.json({ receipts, total: receipts.length });
    } catch (err) {
        console.error('Failed to list goods receipts:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// Create a goods receipt for one or more drug batches and post to the ledger
export async function POST(request: Request) {
    try {
        const session = (await getServerSession(authOptions)) as any;
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const allowedRoles = ['PHARMACIST', 'ADMIN', 'SUPER_ADMIN', 'PHARMACY_TECH'];
        if (!allowedRoles.includes(session.user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            purchaseOrderId,        // optional — link to a PO if you have one
            invoiceNumber,
            invoiceDate,
            deliveryNote,
            paymentMethod = 'Credit', // 'Cash' | 'Bank' | 'Credit'
            notes,
            items,                  // [{ drugId, batchNumber, expiryDate, quantityReceived, purchasePrice, sellingPrice? }]
        } = body;

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'At least one item is required' }, { status: 400 });
        }

        // Generate a GR number (GR-YYYYMMDD-####)
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await prisma.goodsReceipt.count({
            where: { grNumber: { startsWith: `GR-${dateStr}-` } },
        });
        const grNumber = `GR-${dateStr}-${String(count + 1).padStart(4, '0')}`;

        // Compute totals and create
        let totalValue = 0;
        for (const it of items) {
            totalValue += (it.purchasePrice || 0) * (it.quantityReceived || 0);
        }

        // If a PO is not provided, create a minimal one so the FK holds.
        let poId = purchaseOrderId;
        // Resolve a supplierId up-front (also used by DrugBatch)
        const supplierId: string = await (async () => {
            const supplier = await prisma.supplier?.findFirst?.();
            if (supplier) return supplier.id;
            const fallback = await prisma.purchaseOrder.findFirst();
            if (fallback) return (fallback as any).supplierId;
            throw new Error('No supplier found. A goods receipt requires at least one Supplier record.');
        })();

        if (!poId) {
            // Use tenant-configured PO numbering (falls back to legacy PO-AUTO-...)
            const { generatePONumber, getSetting } = await import("@/lib/formatters");
            const useConfig = await getSetting<string>("numbering.po.prefix", "");
            const poNumber = useConfig
                ? await generatePONumber(0, new Date()) // sequence doesn't matter; appended by GR #
                : `PO-AUTO-${grNumber}-${Date.now().toString(36)}`;
            const po = await prisma.purchaseOrder.create({
                data: {
                    poNumber,
                    supplierId,
                    status: 'COMPLETE',  // POStatus enum: DRAFT/SENT/CONFIRMED/PARTIAL/COMPLETE/CANCELLED
                    orderDate: new Date(),
                    subtotal: totalValue,
                    totalAmount: totalValue,
                    paymentStatus: 'PENDING',
                    requestedById: session.user.id,
                },
            });
            poId = po.id;
        }

        const receipt = await prisma.$transaction(async (tx) => {
            // Create the GoodsReceipt
            const gr = await tx.goodsReceipt.create({
                data: {
                    grNumber,
                    purchaseOrderId: poId,
                    receivedById: session.user.id,
                    invoiceNumber,
                    invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
                    deliveryNote,
                    status: 'COMPLETE',  // ReceiptStatus enum: DRAFT/COMPLETE/PARTIAL
                    notes,
                },
            });

            // Create GoodsReceiptItems + corresponding DrugBatches
            for (const it of items) {
                if (!it.drugId || !it.batchNumber || !it.quantityReceived || !it.purchasePrice) {
                    throw new Error('Each item needs drugId, batchNumber, quantityReceived, purchasePrice');
                }

                // Create the DrugBatch first (this is what tracks inventory on hand)
                const batch = await tx.drugBatch.create({
                    data: {
                        drugId: it.drugId,
                        batchNumber: it.batchNumber,
                        expiryDate: new Date(it.expiryDate),
                        quantityReceived: it.quantityReceived,
                        quantityRemaining: it.quantityReceived,
                        purchasePrice: it.purchasePrice,
                        sellingPrice: it.sellingPrice || it.purchasePrice * 1.3,  // default 30% markup
                        receivedDate: new Date(),
                        supplierId: supplierId,
                    },
                });

                // Need a purchase order item — create a minimal one
                const poi = await tx.purchaseOrderItem.create({
                    data: {
                        purchaseOrderId: poId,
                        drugId: it.drugId,
                        quantityOrdered: it.quantityReceived,
                        unitPrice: it.purchasePrice,
                        lineTotal: (it.purchasePrice || 0) * (it.quantityReceived || 0),
                    },
                });

                // Create the GoodsReceiptItem
                await tx.goodsReceiptItem.create({
                    data: {
                        goodsReceiptId: gr.id,
                        purchaseOrderItemId: poi.id,
                        drugId: it.drugId,
                        batchNumber: it.batchNumber,
                        expiryDate: new Date(it.expiryDate),
                        quantityReceived: it.quantityReceived,
                        unitPrice: it.purchasePrice,
                        lineTotal: (it.purchasePrice || 0) * (it.quantityReceived || 0),
                        drugBatchId: batch.id,
                    },
                });
            }

            return gr;
        });

        // Post to ledger (outside the transaction so failures don't roll back the receipt)
        let journalId: string | null = null;
        try {
            const journal = await AccountingService.postGoodsReceiptToLedger(
                receipt.id,
                session.user.id,
                paymentMethod as any,
            );
            journalId = journal?.id || null;
        } catch (ledgerErr) {
            console.error('Failed to post goods receipt to ledger:', ledgerErr);
            // Non-fatal — the receipt is created; ops can re-post later
        }

        return NextResponse.json({
            receipt: { ...receipt, journalEntryId: journalId },
            totalValue,
            message: 'Goods receipt created' + (journalId ? ' and journalized' : ' (ledger post failed)'),
        }, { status: 201 });
    } catch (err: any) {
        console.error('Failed to create goods receipt:', err);
        return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
    }
}
