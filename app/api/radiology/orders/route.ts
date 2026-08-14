export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { decideNextStatusAfterConsultation } from '@/lib/visits/status';

// GET /api/radiology/orders - List all orders (optionally filtered by visitId or patientId)
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const visitId = searchParams.get('visitId');
        const patientId = searchParams.get('patientId');

        const orders = await prisma.radiologyOrder.findMany({
            where: {
                ...(visitId ? { visitId } : {}),
                ...(patientId ? { patientId } : {}),
            },
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                doctor: { select: { name: true } },
                visit: { select: { visitNumber: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(orders);
    } catch (error) {
        console.error('Radiology orders list error:', error);
        return NextResponse.json({ error: 'Failed to fetch radiology orders' }, { status: 500 });
    }
}

// POST /api/radiology/orders - Create a new radiology order
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        const allowedRoles = ['DOCTOR', 'ADMIN', 'SUPER_ADMIN'];
        if (!session || !allowedRoles.includes(user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { visitId, patientId, examName, category, priority, clinicalNotes } = body;

        if (!visitId || !patientId || !examName) {
            return NextResponse.json({ error: 'visitId, patientId and examName are required' }, { status: 400 });
        }

        // Prevent duplicate exam for the same visit
        const existing = await prisma.radiologyOrder.findFirst({
            where: {
                visitId,
                examName: { equals: examName, mode: 'insensitive' },
                status: { not: 'Cancelled' },
            },
        });

        if (existing) {
            return NextResponse.json(
                { error: `"${examName}" has already been ordered for this visit.` },
                { status: 400 }
            );
        }

        const order = await prisma.radiologyOrder.create({
            data: {
                visitId,
                patientId,
                doctorId: user.id,
                examName,
                category,
                priority: priority || 'Routine',
                clinicalNotes,
                status: 'Ordered',
            },
        });

        // Consolidated visit cycle spec (R45): when the doctor places an
        // order, the visit moves into PendingOrders (was Radiology).
        // PendingOrders means "1+ orders queued, each carries its own
        // SubStatus". When all orders are Fulfilled/Unfulfilled, the visit
        // advances to FinalBilling.
        const newVisitStatus = await decideNextStatusAfterConsultation(prisma, visitId);
        await prisma.visit.update({
            where: { id: visitId },
            data: { status: newVisitStatus }
        });

        // Billing is non-critical — run async so it never blocks the response
        (async () => {
            try {
                const examInCatalog = await prisma.radiologyCatalog.findFirst({ where: { name: examName } });
                if (!examInCatalog) return;

                // The invoice line item always carries the catalog price (what
                // the service actually costs). The patient's copay is NOT
                // subtracted from the line — it's tracked separately on the
                // the route did `price - standardPatientCopay` and clamped to
                // 0, which made the invoice show 0 whenever the copay exceeded
                // the exam price — e.g. AAR Insurance with a 100000 copay on
                // a 25000 X-ray.)
                const finalPrice = examInCatalog.price;

                // Find or create the visit's per-section radiology invoice
                // (RADINV- prefix). Per-section model: each radiology order's
                // line item lands on a rad-only invoice (never bundled with lab
                // or pharmacy). The cashier settles each section's invoice
                // independently; the visit auto-completes when all visit
                // invoices (consultation + lab + radiology + pharmacy) are paid.
                const { findOrCreateInvoiceForTransaction } = await import('@/lib/finance/invoice-helper');
                const resolvedInvoice = await findOrCreateInvoiceForTransaction({
                    visitId,
                    patientId,
                    issuedById: user.id,
                    category: 'Radiology',
                    itemType: 'Radiology',
                    numberPrefix: 'RADINV',
                });

                await prisma.invoiceItem.create({
                    data: {
                        invoiceId: resolvedInvoice.id,
                        description: `Radiology: ${examName}`,
                        quantity: 1,
                        unitPrice: finalPrice,
                        totalPrice: finalPrice,
                        itemType: 'Radiology',
                        referenceId: order.id,
                    },
                });
                await prisma.invoice.update({
                    where: { id: resolvedInvoice.id },
                    data: {
                        totalAmount: { increment: finalPrice },
                        balanceDue: { increment: finalPrice },
                    },
                });

                // Consolidated spec (R45) — insurance-deferred consultation
                // fee. If this visit is the insurance-validated path (no
                // consultation fee invoice was issued at visit creation),
                // add the consultation fee as a line item on the FINAL-
                // invoice now. The cashier will submit the whole invoice
                // as a single claim at end of visit.
                // Consolidated spec (R45): the radiology order's invoiceId FK
                // must point at the FINAL- invoice so the payment route can
                // transition AwaitingPayment → InProgress via
                // transitionInvoiceItemsToInProgress.
                await prisma.radiologyOrder.update({
                    where: { id: order.id },
                    data: { invoiceId: resolvedInvoice.id },
                });
            } catch (e) {
                console.error('Radiology billing step failed (non-critical):', e);
            }
        })();

        return NextResponse.json(order, { status: 201 });
    } catch (error) {
        console.error('Radiology order creation error:', error);
        return NextResponse.json({ error: 'Failed to create radiology order' }, { status: 500 });
    }
}
