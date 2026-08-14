import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findOrCreateInvoiceForTransaction } from "@/lib/finance/invoice-helper";
import { decideNextStatusAfterConsultation, VISIT_STATUS } from "@/lib/visits/status";

// Find or create the visit's per-section lab invoice (LABINV- prefix).
// Per-section model: each lab order's line item lands on a lab-only invoice
// (never bundled with radiology or pharmacy). The cashier settles each
// section's invoice independently; the visit auto-completes when all
// visit invoices (consultation + lab + radiology + pharmacy) are paid.
async function getOrCreateLabInvoice(opts: {
    visitId: string;
    patientId: string;
    issuedById: string;
}) {
    return findOrCreateInvoiceForTransaction({
        visitId: opts.visitId,
        patientId: opts.patientId,
        issuedById: opts.issuedById,
        category: 'Lab',
        itemType: 'Lab',
        numberPrefix: 'LABINV',
    });
}

// Create Lab Order and Add to Billing
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        const allowedRoles = ["DOCTOR", "SUPER_ADMIN", "ADMIN"];
        if (!session || !allowedRoles.includes(user?.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { visitId, patientId, testName, testCategory, priority, specialInstructions } =
            await request.json();

        // 1. Check if the test is already ordered for this visit (case-insensitive)
        const existingOrder = await prisma.labOrder.findFirst({
            where: {
                visitId,
                testName: { equals: testName, mode: "insensitive" },
            },
        });

        if (existingOrder) {
            return NextResponse.json(
                { error: "This lab test has already been requested for this consultation." },
                { status: 400 }
            );
        }

        // 2. Create Lab Order
        const labOrder = await prisma.labOrder.create({
            data: {
                visitId,
                patientId,
                doctorId: user?.id,
                testName,
                testCategory,
                priority: priority || "Routine",
                specialInstructions,
                status: "Ordered",
            },
        });

        // Consolidated visit cycle spec (R45): when the doctor places an
        // order, the visit moves into PendingOrders (was Laboratory).
        // PendingOrders means "1+ orders queued, each carries its own
        // SubStatus". When all orders are Fulfilled/Unfulfilled, the visit
        // advances to FinalBilling.
        const newVisitStatus = await decideNextStatusAfterConsultation(prisma, visitId);
        await prisma.visit.update({
            where: { id: visitId },
            data: { status: newVisitStatus },
        });

        // Billing is non-critical — fire-and-forget
        (async () => {
            try {
                const testInCatalog = await prisma.labTestCatalog.findFirst({
                    where: { name: testName },
                });

                if (!testInCatalog) return;

                // The invoice line item always carries the catalog price (what the
                // service actually costs). The patient's copay is NOT subtracted
                // from the line — it's tracked separately on the InsuranceClaim
                // and applied at settlement time. (Previously the route did
                // `price - standardPatientCopay` and clamped to 0, which made the
                // invoice show 0 whenever the copay exceeded the test price —
                // e.g. AAR Insurance with a 100000 copay on a 15000 CBC test.)
                const finalUnitPrice = testInCatalog.price;

                const invoice = await getOrCreateLabInvoice({
                    visitId,
                    patientId,
                    issuedById: user?.id,
                });

                await prisma.invoiceItem.create({
                    data: {
                        invoiceId: invoice.id,
                        description: `Lab Test: ${testName}`,
                        quantity: 1,
                        unitPrice: finalUnitPrice,
                        totalPrice: finalUnitPrice,
                        itemType: "Lab",
                        referenceId: labOrder.id,
                    },
                });

                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: {
                        totalAmount: { increment: finalUnitPrice },
                        balanceDue: { increment: finalUnitPrice },
                    },
                });

                // Consolidated spec (R45) — insurance-deferred consultation
                // fee. If this visit is the insurance-validated path (no
                // consultation fee invoice was issued at visit creation),
                // add the consultation fee as a line item on the FINAL-
                // invoice now. The cashier will submit the whole invoice
                // as a single claim at end of visit.
                // Consolidated spec (R45): the lab order's invoiceId FK must
                // point at the FINAL- invoice so the payment route can
                // transition AwaitingPayment → InProgress via
                // transitionInvoiceItemsToInProgress. Without this FK, the
                // order stays in AwaitingPayment even after the invoice is
                // fully paid, and the lab dashboard never sees the order.
                await prisma.labOrder.update({
                    where: { id: labOrder.id },
                    data: { invoiceId: invoice.id },
                });
            } catch (billingError) {
                console.error("Lab billing step failed (non-critical):", billingError);
            }
        })();

        return NextResponse.json(labOrder, { status: 201 });
    } catch (error) {
        console.error("Lab order creation error:", error);
        return NextResponse.json({ error: "Failed to create lab order" }, { status: 500 });
    }
}
