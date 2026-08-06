import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountingService } from '@/lib/finance/accounting-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// POST /api/finance/tax-invoices/[id]/credit-note
// Issue a credit note that reverses an existing TaxInvoice.
// Creates a new TaxInvoice with invoiceType=CREDIT_NOTE, originalInvoiceId set,
// negative line amounts, and posts a reversing journal entry to the ledger.
export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { reason, refundAmount } = body;

        if (!reason || !reason.trim()) {
            return NextResponse.json({ error: 'Reason is required' }, { status: 400 });
        }
        const refundAmt = Number(refundAmount);
        if (!refundAmt || refundAmt <= 0) {
            return NextResponse.json({ error: 'Refund amount must be positive' }, { status: 400 });
        }

        const original = await prisma.taxInvoice.findUnique({
            where: { id: params.id },
            include: { lines: true },
        });
        if (!original) {
            return NextResponse.json({ error: 'Original invoice not found' }, { status: 404 });
        }
        if (original.invoiceType === 'CREDIT_NOTE') {
            return NextResponse.json({ error: 'Cannot issue a credit note against another credit note' }, { status: 400 });
        }
        if (refundAmt > original.totalAmount + 0.01) {
            return NextResponse.json({
                error: `Refund amount UGX ${refundAmt.toLocaleString()} exceeds invoice total UGX ${original.totalAmount.toLocaleString()}`,
            }, { status: 400 });
        }

        // Auto-generate credit note number inside a transaction (per-day)
        const creditNote = await prisma.$transaction(async (tx) => {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const count = await tx.taxInvoice.count({
                where: {
                    invoiceType: 'CREDIT_NOTE',
                    createdAt: { gte: startOfDay },
                },
            });
            const { generateCreditNoteNumber } = await import("@/lib/formatters");
            const invoiceNumber = await generateCreditNoteNumber(count + 1, new Date());

            // Create the credit note as a mirror of the original, but with negative
            // line totals so the math naturally zeros out.
            const refundRatio = refundAmt / original.totalAmount;
            const reversedLines = original.lines.map((l, idx) => ({
                lineNumber: idx + 1,
                itemType: l.itemType,
                itemId: l.itemId,
                itemCode: l.itemCode,
                itemName: l.itemName,
                description: l.description ?? null,
                quantity: -l.quantity,
                unitPrice: l.unitPrice,
                discountRate: l.discountRate,
                discountAmount: -(l.discountAmount ?? 0) * refundRatio,
                taxAmount: -(l.taxAmount ?? 0) * refundRatio,
                lineTotal: -l.lineTotal * refundRatio,
                isCovered: l.isCovered,
                insurancePrice: l.insurancePrice,
                ...(l.taxRateId ? { taxRateId: l.taxRateId } : {}),
            }));

            // Round line totals to 2 decimals
            for (const ln of reversedLines) {
                ln.discountAmount = Math.round(ln.discountAmount * 100) / 100;
                ln.taxAmount = Math.round(ln.taxAmount * 100) / 100;
                ln.lineTotal = Math.round(ln.lineTotal * 100) / 100;
            }

            const newSubtotal = reversedLines.reduce((s, l) => s + l.lineTotal, 0);
            const newTax = reversedLines.reduce((s, l) => s + l.taxAmount, 0);
            const newDiscount = reversedLines.reduce((s, l) => s + l.discountAmount, 0);

            return await tx.taxInvoice.create({
                data: {
                    invoiceNumber,
                    invoiceType: 'CREDIT_NOTE',
                    patientId: original.patientId,
                    insuranceId: original.insuranceId,
                    customerName: original.customerName,
                    customerTin: original.customerTin,
                    customerAddress: original.customerAddress,
                    customerEmail: original.customerEmail,
                    invoiceDate: new Date(),
                    postingDate: new Date(),
                    subtotal: newSubtotal,
                    discountTotal: newDiscount,
                    taxTotal: newTax,
                    totalAmount: -refundAmt,
                    balanceDue: 0,
                    amountPaid: 0,
                    paymentStatus: 'PAID',
                    originalInvoiceId: original.id,
                    creditReason: reason.trim(),
                    taxRateId: original.taxRateId,
                    createdById: session.user.id,
                    lines: { create: reversedLines },
                },
                include: { lines: true },
            });
        });

        // Mark the original as cancelled (or partial if under-refund)
        const newOriginalBalance = original.balanceDue - refundAmt;
        const newOriginalStatus = newOriginalBalance <= 0.01 ? 'CANCELLED' : 'PARTIAL';
        await prisma.taxInvoice.update({
            where: { id: original.id },
            data: {
                paymentStatus: newOriginalStatus,
                balanceDue: Math.max(0, newOriginalBalance),
            },
        });

        // Post a reversing journal entry: DR Revenue, CR AR
        try {
            const revAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: '4100' } });
            const arCode = original.insuranceId ? '1132' : '1131';
            const arAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: arCode } });
            if (revAccount && arAccount) {
                const journalNumber = `JNL-CN-${creditNote.invoiceNumber}`;
                await prisma.journalEntry.create({
                    data: {
                        entryNumber: journalNumber,
                        entryDate: new Date(),
                        postingDate: new Date(),
                        description: `Credit Note ${creditNote.invoiceNumber} reversing ${original.invoiceNumber}: ${reason.trim()}`,
                        reference: creditNote.id,
                        referenceType: 'CREDIT_NOTE',
                        totalDebit: refundAmt,
                        totalCredit: refundAmt,
                        status: 'POSTED',
                        createdById: session.user.id,
                        lines: {
                            create: [
                                {
                                    accountId: revAccount.id,
                                    debitAmount: refundAmt,
                                    creditAmount: 0,
                                    description: `Revenue reversal — ${original.invoiceNumber}`,
                                },
                                {
                                    accountId: arAccount.id,
                                    debitAmount: 0,
                                    creditAmount: refundAmt,
                                    description: `AR credit — ${original.invoiceNumber}`,
                                },
                            ],
                        },
                    },
                });
            }
        } catch (postError) {
            console.error('Failed to post credit note to ledger:', postError);
        }

        return NextResponse.json(creditNote, { status: 201 });
    } catch (error) {
        console.error('Credit note error:', error);
        return NextResponse.json({ error: 'Failed to issue credit note' }, { status: 500 });
    }
}
