export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AccountingService } from "@/lib/finance/accounting-service";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { transitionInvoiceItemsToInProgress } from "@/lib/visits/substatus";
import { recordAudit, AUDIT_ACTION, ENTITY } from "@/lib/audit";

/**
 * Returns true when the visit's billing is fully settled — every invoice
 * linked to the visit (including the one currently being paid) is in
 * "Paid" or "Cancelled" status, AND the cumulative balanceDue across all
 * open invoices is zero (or near-zero to absorb float).
 *
 * This is the guard for the FinalBilling → Completed transition. A visit
 * is multi-invoice by design (Consultation fee + Lab + Radiology +
 * Pharmacy), so paying ANY one of them must not close the visit — only
 * the LAST one. Without this check the cashier could pay the Lab
 * invoice, the visit would flip to Completed, and the still-pending
 * Pharmacy/Radiology invoices would be orphaned.
 *
 * Pass `excludeInvoiceId` when calling this *after* the payment has
 * already been applied to that invoice in the same transaction — the
 * row's status will already be "Paid" so we don't need to re-check it.
 */
async function areAllVisitInvoicesPaid(
    visitId: string,
    excludeInvoiceId?: string
): Promise<{ paid: boolean; remaining: number; unpaidCount: number }> {
    const invoices = await prisma.invoice.findMany({
        where: {
            visitId,
            ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
        },
        select: { id: true, status: true, balanceDue: true },
    });

    const remaining = invoices.reduce(
        (sum, inv) => sum + (Number(inv.balanceDue) || 0),
        0
    );
    const unpaidCount = invoices.filter(
        (inv) => inv.status === 'Unpaid' || inv.status === 'Partial'
    ).length;

    return {
        paid: remaining <= 0.01 && unpaidCount === 0,
        remaining,
        unpaidCount,
    };
}

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const {
            amount, paymentMethod, notes, transactionId,
        } = body;

        if (!amount || !paymentMethod) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const invoice = await prisma.invoice.findUnique({
            where: { id: params.id },
            include: {
                visit: {
                    include: {
                        // Per the consolidated visit cycle spec (R45), orders carry
                        // a subStatus. AwaitingPayment means invoice not yet paid
                        // (HIDDEN from dept dashboard); InProgress means paid and
                        // service is being performed (VISIBLE).
                        //
                        // We only need to load orders that are currently being
                        // performed (InProgress) — those are the ones we may need
                        // to coordinate with. AwaitingPayment orders will be
                        // transitioned to InProgress inside the same transaction
                        // when this payment makes the invoice Paid.
                        labOrders: {
                            where: { subStatus: "InProgress" }
                        },
                        radiologyOrders: {
                            where: { subStatus: "InProgress" }
                        },
                        prescriptions: {
                            where: { subStatus: "InProgress" }
                        }
                    }
                }
            }
        });

        if (!invoice) {
            return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        }

        const paymentAmount = parseFloat(amount);
        const newAmountPaid = invoice.amountPaid + paymentAmount;
        const newBalanceDue = invoice.totalAmount - newAmountPaid;

        let newStatus = "Partial";
        if (newBalanceDue <= 0) {
            // With the consolidated spec (R45), the FINAL- invoice is paid BEFORE
            // services are rendered — orders start in AwaitingPayment (hidden)
            // and transition to InProgress (visible) when this payment makes the
            // invoice Paid. So the legacy "block if pending orders" check no
            // longer applies. AwaitingPayment orders are EXPECTED at this point
            // and will be transitioned by `transitionInvoiceItemsToInProgress`
            // inside the same transaction.
            //
            // The only thing we still warn about: if there are InProgress orders
            // on a DIFFERENT invoice (rare, but possible if orders were created
            // before the FINAL- consolidation). In that case the cashier is
            // paying an old invoice while new orders are being processed — log
            // a notice but allow the payment.
            if (invoice.visit) {
                const hasInProgressLab = invoice.visit.labOrders.length > 0;
                const hasInProgressRad = invoice.visit.radiologyOrders.length > 0;
                const hasInProgressDrugs = invoice.visit.prescriptions.length > 0;
                if (hasInProgressLab || hasInProgressRad || hasInProgressDrugs) {
                    console.log(
                        `[Payments] Invoice ${invoice.invoiceNumber} closing while visit has InProgress orders — ` +
                        `(${invoice.visit.labOrders.length} lab, ${invoice.visit.radiologyOrders.length} rad, ${invoice.visit.prescriptions.length} rx).`
                    );
                }
            }
            newStatus = "Paid";
        }
        // --- Standard Cash / Mobile Money Logic ---
        if (newAmountPaid === 0) newStatus = "Unpaid";

        // Create payment, update invoice, and advance visit in a transaction
        const result = await prisma.$transaction(async (tx) => {
            const payment = await tx.payment.create({
                data: {
                    invoiceId: params.id,
                    amount: paymentAmount,
                    paymentMethod,
                    transactionId,
                    notes,
                    receivedById: session.user.id,
                }
            });

            const updatedInvoice = await tx.invoice.update({
                where: { id: params.id },
                data: {
                    amountPaid: newAmountPaid,
                    balanceDue: newBalanceDue,
                    status: newStatus
                }
            });

            // Consolidated spec (R45): when the invoice is fully paid, every
            // order item on it transitions AwaitingPayment → InProgress.
            // This is what makes them visible to the lab/rad/pharmacy
            // dashboards. If the invoice was a per-order invoice (legacy
            // pattern), this is still correct. If the invoice is Partial
            // (newStatus !== "Paid"), orders stay in AwaitingPayment until
            // the final payment lands.
            if (newStatus === "Paid") {
                const itemTransitions = await transitionInvoiceItemsToInProgress(tx, params.id);
                if (itemTransitions.labs + itemTransitions.rads + itemTransitions.rxs > 0) {
                    console.log(
                        `[Payments] Invoice ${params.id} (cash) closed — ` +
                        `transitioned ${itemTransitions.labs} lab, ${itemTransitions.rads} rad, ` +
                        `${itemTransitions.rxs} rx orders to InProgress`
                    );
                }
            }

            // If invoice is fully paid and linked to a visit, advance the visit to
            // the next stage based on which billing state it was in:
            //   ConsultationBilling → Triage      (consultation fee cleared, ready for triage)
            //   PendingOrders       → Completed    (when ALL visit invoices are paid AND
            //                                      all orders are terminal — per the user's rule:
            //                                      "the visit is completed unless there are
            //                                      pending invoices or pending lab or radiology
            //                                      orders; when all are completed the visit
            //                                      should be completed")
            //   FinalBilling        → Completed    (legacy path for visits that were
            //                                      routed through FinalBilling before the
            //                                      spec was simplified; same condition: all
            //                                      visit invoices must be paid)
            //
            // BUGFIX 2026-08-04: a visit has multiple invoices (Consultation +
            // Lab + Radiology + Pharmacy), so paying any ONE of them must NOT
            // close the visit. We only flip PendingOrders/FinalBilling → Completed
            // when every other invoice linked to this visit is also Paid.
            if (newStatus === "Paid" && invoice.visitId && invoice.visit) {
                const visitStatus = invoice.visit.status;
                if (visitStatus === "ConsultationBilling") {
                    await tx.visit.update({
                        where: { id: invoice.visitId },
                        data: { status: "Triage" }
                    });
                } else if (visitStatus === "PendingOrders" || visitStatus === "FinalBilling") {
                    const allPaid = await areAllVisitInvoicesPaid(
                        invoice.visitId,
                        invoice.id // exclude the invoice we just paid
                    );
                    if (allPaid.paid) {
                        // Per the revised spec: the visit goes to Completed when
                        // every order is terminal AND every invoice is paid.
                        // Check orders too so we don't close while a lab/rad
                        // result is still pending fulfillment.
                        const [openLab, openRad, openRx] = await Promise.all([
                            tx.labOrder.count({
                                where: { visitId: invoice.visitId,
                                         subStatus: { in: ['AwaitingPayment', 'InProgress'] } }
                            }),
                            tx.radiologyOrder.count({
                                where: { visitId: invoice.visitId,
                                         subStatus: { in: ['AwaitingPayment', 'InProgress'] } }
                            }),
                            tx.prescription.count({
                                where: { visitId: invoice.visitId,
                                         subStatus: { in: ['AwaitingPayment', 'InProgress'] } }
                            }),
                        ]);
                        if (openLab + openRad + openRx === 0) {
                            await tx.visit.update({
                                where: { id: invoice.visitId },
                                data: { status: "Completed", completedTime: new Date() }
                            });
                        } else {
                            console.log(
                                `[Payments] Visit ${invoice.visitId} all invoices paid but ` +
                                `${openLab} lab, ${openRad} rad, ${openRx} rx orders still open — staying in ${visitStatus}`
                            );
                        }
                    } else {
                        console.log(
                            `[Payments] Visit ${invoice.visitId} still has ${allPaid.unpaidCount} unpaid invoice(s) ` +
                            `(UGX ${allPaid.remaining.toFixed(2)} remaining) — staying in ${visitStatus}`
                        );
                    }
                }
            }

            return { payment, updatedInvoice };
        });

        // Automatically post to ledger
        try {
            await AccountingService.postPaymentToLedger(result.payment.id, session.user.id);
        } catch (postError) {
            console.error('Failed to post payment to ledger:', postError);
        }

        // Sync the related TaxInvoice (URA-compliant) payment status so the dual
        // invoice system doesn't drift. The TaxInvoice is a sub-bill for the
        // pharmacy portion of the same visit — its payment status should mirror
        // the legacy Invoice payment proportionally.
        try {
            const updatedInvoice = result.updatedInvoice as any;
            if (updatedInvoice?.visitId) {
                const taxInvoices = await prisma.taxInvoice.findMany({
                    where: {
                        patientId: updatedInvoice.patientId,
                        paymentStatus: { in: ['PENDING', 'PARTIAL'] },
                        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // last 7 days
                    },
                    orderBy: { createdAt: 'asc' },
                });

                let remainingPayment = result.payment.amount as number;
                for (const ti of taxInvoices) {
                    if (remainingPayment <= 0) break;
                    const stillDue = ti.balanceDue;
                    if (stillDue <= 0) continue;
                    const apply = Math.min(remainingPayment, stillDue);
                    const newPaid = ti.amountPaid + apply;
                    const newBalance = Math.max(0, ti.totalAmount - newPaid);
                    const newStatus = newBalance <= 0.01 ? 'PAID' : 'PARTIAL';
                    await prisma.taxInvoice.update({
                        where: { id: ti.id },
                        data: {
                            amountPaid: newPaid,
                            balanceDue: newBalance,
                            paymentStatus: newStatus,
                        },
                    });
                    remainingPayment -= apply;
                    console.log(`Synced TaxInvoice ${ti.invoiceNumber}: paid +${apply}, status=${newStatus}`);
                }
            }
        } catch (syncError) {
            console.error('Failed to sync TaxInvoice payment status:', syncError);
            // Non-critical — don't fail the whole payment
        }

        // Audit — fire-and-forget. `result` contains the created payment
        // and updated invoice. Log the new balance so the report shows
        // the trajectory.
        void recordAudit({
            userId: session.user.id,
            action: AUDIT_ACTION.INVOICE_PAYMENT,
            entityType: ENTITY.INVOICE,
            entityId: params.id,
            changes: {
                paymentId: result?.payment?.id,
                amount: paymentAmount,
                method: paymentMethod,
                transactionId,
                invoiceStatus: newStatus,
                balanceAfter: newBalanceDue,
            },
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error("Payment recording error:", error);
        return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
    }
}
