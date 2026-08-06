export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AccountingService } from "@/lib/finance/accounting-service";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInsuranceEligibility } from "@/lib/insurance/eligibility";
import { transitionInvoiceItemsToInProgress } from "@/lib/visits/substatus";

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
            // Insurance waiver (when insured patient pays cash/MoMo instead of routing to insurer)
            waivedInsurance, insuranceId, waiverReason, insuranceSavedAmount,
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
        // If payment method is Insurance, auto-remit to claims
        if (paymentMethod === "Insurance") {
            // Use the shared eligibility helper to get a specific reason if the
            // patient isn't properly enrolled (expired, pending verification, etc.)
            const eligibility = await getInsuranceEligibility(invoice.patientId);
            if (!eligibility.eligible) {
                return NextResponse.json(
                    {
                        error: eligibility.reason,
                        code: 'INELIGIBLE_FOR_INSURANCE',
                        reason: eligibility.reason,
                    },
                    { status: 400 }
                );
            }
            const enrollment = await prisma.patientInsurance.findUnique({
                where: { id: eligibility.enrollment.id },
            });
            if (!enrollment) {
                return NextResponse.json({ error: "Enrollment record disappeared — try again" }, { status: 500 });
            }

            // Create claim and mark invoice Paid.
            // Use a random suffix in the claim number to avoid collisions on concurrent
            // submissions (the previous count+1 approach was racy).
            const today = new Date();
            const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
            const todayCount = await prisma.insuranceClaim.count({ where: { createdAt: { gte: todayStart } } });
            const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
            // Generate the prefix from settings, append random suffix to guarantee uniqueness
            const { getSetting } = await import("@/lib/settings/store");
            const prefix = await getSetting<string>("numbering.claim.prefix", "CLM");
            const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, "");
            const claimNumber = `${prefix}-${yyyymmdd}-${randomSuffix}`;

            await prisma.$transaction(async (tx) => {
                // The insurance payment is the insurer's share of the invoice.
                // The patient copay is whatever they paid before (or zero if this is
                // the only payment). Snapshot both for audit/reporting.
                const patientCopayAmount = Math.max(0, Number(invoice.totalAmount) - paymentAmount);

                await tx.insuranceClaim.create({
                    data: {
                        claimNumber,
                        insuranceId: enrollment.insuranceId,
                        patientId: invoice.patientId,
                        invoiceId: invoice.id,
                        visitId: invoice.visitId,
                        totalAmount: invoice.totalAmount,
                        eligibleAmount: paymentAmount,
                        patientCopayAmount,
                        insuranceNetAmount: paymentAmount,
                        status: "SUBMITTED"
                    }
                });

                await tx.invoice.update({
                    where: { id: params.id },
                    data: {
                        amountPaid: paymentAmount,
                        balanceDue: 0,
                        status: "Paid" // Treated as 'paid' from clinic perspective since claim is logged
                    }
                });

                // Consolidated spec (R45): when the invoice is fully paid, every
                // order item on it transitions AwaitingPayment → InProgress.
                // This is what makes them visible to the lab/rad/pharmacy
                // dashboards. If the invoice was a per-order invoice (legacy
                // pattern), this is still correct.
                const itemTransitions = await transitionInvoiceItemsToInProgress(tx, params.id);
                if (itemTransitions.labs + itemTransitions.rads + itemTransitions.rxs > 0) {
                    console.log(
                        `[Payments] Invoice ${params.id} (insurance) closed — ` +
                        `transitioned ${itemTransitions.labs} lab, ${itemTransitions.rads} rad, ` +
                        `${itemTransitions.rxs} rx orders to InProgress`
                    );
                }

                // Advance the visit state. Same rule as the cash path below:
                //   ConsultationBilling → Triage
                //   FinalBilling        → Completed  (only when ALL visit invoices are paid)
                // The insurance path always marks the invoice Paid (claim is
                // logged), so the visit transition is unconditional here. Each
                // insurance partner's differential consultation fee (set on
                // InsuranceCompany.consultationFee and applied at visit creation)
                // is already on the invoice at this point — this is purely the
                // state-machine advancement.
                //
                // BUGFIX 2026-08-04: a visit has multiple invoices (Consultation +
                // Lab + Radiology + Pharmacy), so paying any ONE of them must NOT
                // close the visit. We only flip FinalBilling → Completed when
                // every other invoice linked to this visit is also Paid.
                if (invoice.visitId && invoice.visit) {
                    const visitStatus = invoice.visit.status;
                    if (visitStatus === "ConsultationBilling") {
                        await tx.visit.update({
                            where: { id: invoice.visitId },
                            data: { status: "Triage" }
                        });
                    } else if (visitStatus === "FinalBilling") {
                        const allPaid = await areAllVisitInvoicesPaid(
                            invoice.visitId,
                            invoice.id // exclude the invoice we just paid
                        );
                        if (allPaid.paid) {
                            await tx.visit.update({
                                where: { id: invoice.visitId },
                                data: { status: "Completed" }
                            });
                        } else {
                            console.log(
                                `[Payments] Visit ${invoice.visitId} still has ${allPaid.unpaidCount} unpaid invoice(s) ` +
                                `(UGX ${allPaid.remaining.toFixed(2)} remaining) — staying in FinalBilling`
                            );
                        }
                    }
                }
            });

            return NextResponse.json({ message: "Claim submitted successfully", claimNumber });
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
                    // Insurance waiver tracking
                    ...(waivedInsurance && {
                        waivedInsurance: true,
                        insuranceId: insuranceId ?? null,
                        waiverReason: waiverReason ?? null,
                        insuranceSavedAmount: insuranceSavedAmount ?? null,
                    }),
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
            //   ConsultationBilling → Triage   (consultation fee cleared, ready for triage)
            //   FinalBilling        → Completed (only when ALL visit invoices are paid)
            //
            // BUGFIX 2026-08-04: a visit has multiple invoices (Consultation +
            // Lab + Radiology + Pharmacy), so paying any ONE of them must NOT
            // close the visit. We only flip FinalBilling → Completed when
            // every other invoice linked to this visit is also Paid.
            if (newStatus === "Paid" && invoice.visitId && invoice.visit) {
                const visitStatus = invoice.visit.status;
                if (visitStatus === "ConsultationBilling") {
                    await tx.visit.update({
                        where: { id: invoice.visitId },
                        data: { status: "Triage" }
                    });
                } else if (visitStatus === "FinalBilling") {
                    const allPaid = await areAllVisitInvoicesPaid(
                        invoice.visitId,
                        invoice.id // exclude the invoice we just paid
                    );
                    if (allPaid.paid) {
                        await tx.visit.update({
                            where: { id: invoice.visitId },
                            data: { status: "Completed" }
                        });
                    } else {
                        console.log(
                            `[Payments] Visit ${invoice.visitId} still has ${allPaid.unpaidCount} unpaid invoice(s) ` +
                            `(UGX ${allPaid.remaining.toFixed(2)} remaining) — staying in FinalBilling`
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

        return NextResponse.json(result);
    } catch (error) {
        console.error("Payment recording error:", error);
        return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
    }
}
