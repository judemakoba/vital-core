import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountingService } from '@/lib/finance/accounting-service';
import { PricingEngine } from '@/lib/finance/pricing-engine';
import { ServiceType } from '@/lib/generated-prisma';

// GET /api/finance/tax-invoices
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') ?? '1');
        const limit = parseInt(searchParams.get('limit') ?? '20');
        const status = searchParams.get('status');
        const type = searchParams.get('type');
        const search = searchParams.get('search') ?? '';
        const skip = (page - 1) * limit;

        const where: any = {};
        if (status) where.paymentStatus = status;
        if (type) where.invoiceType = type;
        if (search) where.OR = [
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
            { customerName: { contains: search, mode: 'insensitive' } },
            { patient: { firstName: { contains: search, mode: 'insensitive' } } },
        ];

        const [invoices, total] = await Promise.all([
            prisma.taxInvoice.findMany({
                where,
                skip,
                take: limit,
                orderBy: { invoiceDate: 'desc' },
                include: {
                    patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                    insurance: { select: { name: true } },
                    createdBy: { select: { name: true } },
                    lines: true,
                    _count: { select: { allocations: true } },
                },
            }),
            prisma.taxInvoice.count({ where }),
        ]);

        return NextResponse.json({ invoices, total, page, limit });
    } catch (error) {
        console.error('Tax invoices fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}

// POST /api/finance/tax-invoices — Create a new Tax Invoice
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            invoiceType = 'TAX_INVOICE',
            patientId,
            insuranceId,
            customerName,
            customerTin,
            customerAddress,
            customerEmail,
            invoiceDate,
            dueDate,
            lines,
            createdById,
            taxRateId,
            notes,
        } = body;

        if (!lines || lines.length === 0) {
            return NextResponse.json({ error: 'Invoice must have at least one line item' }, { status: 400 });
        }

        // Calculate totals
        let subtotal = 0;
        let discountTotal = 0;
        let taxTotal = 0;

        const processedLines = await Promise.all(lines.map(async (l: any, idx: number) => {
            
            let finalUnitPrice = l.unitPrice;
            
            // If linked to a patient, run through our Pricing Engine to enforce insurance rules
            if (patientId) {
                const serviceType = l.itemType as ServiceType; // Ensure it casts correctly
                const pricingResult = await PricingEngine.calculateItemPrice(
                    patientId,
                    l.itemId || null,
                    serviceType || null,
                    l.unitPrice
                );
                finalUnitPrice = pricingResult.finalPrice;
            }

            const lineSubtotal = l.quantity * finalUnitPrice;
            const discountAmt = lineSubtotal * ((l.discountRate ?? 0) / 100);
            const netAmount = lineSubtotal - discountAmt;
            const taxAmt = netAmount * ((l.taxRate ?? 0) / 100);
            const lineTotal = netAmount + taxAmt;

            subtotal += lineSubtotal;
            discountTotal += discountAmt;
            taxTotal += taxAmt;

            return {
                lineNumber: idx + 1,
                itemType: l.itemType ?? 'SERVICE',
                itemId: l.itemId ?? null,
                itemCode: l.itemCode ?? null,
                itemName: l.itemName,
                description: l.description ?? null,
                quantity: l.quantity,
                unitPrice: finalUnitPrice,
                discountRate: l.discountRate ?? 0,
                discountAmount: discountAmt,
                taxAmount: taxAmt,
                lineTotal,
                isCovered: l.isCovered ?? false,
                ...(l.taxRateId ? { taxRateId: l.taxRateId } : {}),
            };
        }));

        const totalAmount = subtotal - discountTotal + taxTotal;

        // Auto-generate invoice number inside transaction to avoid race conditions.
        // Per-day counter scoped by prefix — prefix comes from tenant settings.
        const { getMany, generateTaxInvoiceNumber, generateCreditNoteNumber, generateReceiptNumber } = await import("@/lib/formatters");
        const settingsKeys = ["numbering.taxInvoice.prefix", "numbering.creditNote.prefix", "numbering.receipt.prefix"];
        const settings = await getMany(settingsKeys);
        const prefix = invoiceType === 'CREDIT_NOTE'
            ? (settings["numbering.creditNote.prefix"] || "CN")
            : invoiceType === 'RECEIPT'
                ? (settings["numbering.receipt.prefix"] || "RCP")
                : (settings["numbering.taxInvoice.prefix"] || "TAX");
        const today = new Date();
        const startOfDay = new Date(today); startOfDay.setHours(0, 0, 0, 0);

        const invoice = await prisma.$transaction(async (tx) => {
            const count = await tx.taxInvoice.count({
                where: {
                    invoiceType,
                    createdAt: { gte: startOfDay },
                },
            });
            const invoiceNumber = invoiceType === 'CREDIT_NOTE'
                ? await generateCreditNoteNumber(count + 1, today)
                : invoiceType === 'RECEIPT'
                    ? await generateReceiptNumber(count + 1, today)
                    : await generateTaxInvoiceNumber(count + 1, today);

            return await tx.taxInvoice.create({
                data: {
                    invoiceNumber,
                    invoiceType,
                    patientId: patientId ?? null,
                    customerName: customerName ?? null,
                    customerTin: customerTin ?? null,
                    customerAddress: customerAddress ?? null,
                    customerEmail: customerEmail ?? null,
                    invoiceDate: new Date(invoiceDate),
                    dueDate: dueDate ? new Date(dueDate) : null,
                    postingDate: new Date(invoiceDate),
                    subtotal,
                    discountTotal,
                    taxTotal,
                    totalAmount,
                    balanceDue: totalAmount,
                    amountPaid: 0,
                    paymentStatus: 'PENDING',
                    taxRateId: taxRateId ?? null,
                    createdById,
                    lines: { create: processedLines },
                },
                include: {
                    lines: true,
                    patient: { select: { firstName: true, lastName: true } },
                },
            });
        });

        // Automatically post to ledger (best-effort; logged on failure)
        try {
            await AccountingService.postInvoiceToLedger(invoice.id, createdById);
        } catch (postError) {
            console.error('Failed to post invoice to ledger:', postError);
            // We don't fail the whole request, but we log it.
            // In a production system, this might be handled via a background queue.
        }

        return NextResponse.json(invoice, { status: 201 });
    } catch (error) {
        console.error('Create tax invoice error:', error);
        return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
    }
}
