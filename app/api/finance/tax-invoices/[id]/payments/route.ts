import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountingService } from '@/lib/finance/accounting-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// POST /api/finance/tax-invoices/[id]/payments
// Record a payment against a TaxInvoice. Auto-posts to ledger.
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
        const { amount, paymentMethod, transactionId, notes } = body;

        if (!amount || !paymentMethod) {
            return NextResponse.json({ error: 'Missing amount or paymentMethod' }, { status: 400 });
        }
        const paymentAmount = Number(amount);
        if (paymentAmount <= 0) {
            return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
        }

        const invoice = await prisma.taxInvoice.findUnique({
            where: { id: params.id },
        });
        if (!invoice) {
            return NextResponse.json({ error: 'TaxInvoice not found' }, { status: 404 });
        }
        if (invoice.balanceDue <= 0) {
            return NextResponse.json({ error: 'Invoice is already fully paid' }, { status: 400 });
        }
        if (paymentAmount > invoice.balanceDue + 0.01) {
            return NextResponse.json({
                error: `Payment UGX ${paymentAmount.toLocaleString()} exceeds balance due UGX ${invoice.balanceDue.toLocaleString()}`,
            }, { status: 400 });
        }

        const newAmountPaid = invoice.amountPaid + paymentAmount;
        const newBalanceDue = invoice.totalAmount - newAmountPaid;
        const newStatus = newBalanceDue <= 0.01 ? 'PAID' : (newAmountPaid > 0 ? 'PARTIAL' : 'PENDING');

        // Create payment + update invoice in a single transaction
        const result = await prisma.$transaction(async (tx) => {
            const payment = await tx.payment.create({
                data: {
                    taxInvoiceId: invoice.id,
                    amount: paymentAmount,
                    paymentMethod,
                    transactionId: transactionId || null,
                    notes: notes || null,
                    receivedById: session.user.id,
                },
            });

            await tx.taxInvoice.update({
                where: { id: invoice.id },
                data: {
                    amountPaid: newAmountPaid,
                    balanceDue: newBalanceDue,
                    paymentStatus: newStatus,
                },
            });

            return payment;
        });

        // Auto-post to ledger
        try {
            await AccountingService.postPaymentToLedger(result.id, session.user.id);
        } catch (postError) {
            console.error('Failed to post tax invoice payment to ledger:', postError);
        }

        return NextResponse.json({
            payment: result,
            invoice: {
                id: invoice.id,
                amountPaid: newAmountPaid,
                balanceDue: newBalanceDue,
                paymentStatus: newStatus,
            },
        });
    } catch (error) {
        console.error('TaxInvoice payment error:', error);
        return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
    }
}
