export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { VISIT_STATUS, ACTIVE_VISIT_STATUSES } from "@/lib/visits/status";
import { markOrderUnfulfilled } from "@/lib/visits/substatus";

/**
 * Discontinue a visit (admin / super admin only).
 *
 * Per the consolidated visit cycle spec (R45):
 *   - Discontinuation is reserved for ADMIN / SUPER_ADMIN
 *   - The `note` field is MANDATORY (no empty / whitespace-only notes)
 *   - The visit transitions to terminal state "Discontinued"
 *   - All open order items (subStatus in AwaitingPayment / InProgress) are
 *     transitioned to Unfulfilled and audited via OrderWriteOff
 *   - Open invoices linked to the visit are marked Cancelled (or
 *     partially-paid amounts are recorded for accounting reconciliation)
 *
 * This is irreversible. There is no "un-discontinue" path.
 */
export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const isAdmin = session.user?.role === "ADMIN" || session.user?.role === "SUPER_ADMIN";
        if (!isAdmin) {
            return NextResponse.json(
                { error: "Discontinuation requires ADMIN or SUPER_ADMIN role." },
                { status: 403 }
            );
        }

        const body = await request.json();
        const noteRaw: string = (body?.note ?? "").toString();
        const note = noteRaw.trim();
        if (note.length === 0) {
            return NextResponse.json(
                { error: "A non-empty `note` is required to discontinue a visit (record the reason)." },
                { status: 400 }
            );
        }
        if (note.length > 1000) {
            return NextResponse.json(
                { error: "Note must be 1000 characters or fewer." },
                { status: 400 }
            );
        }

        const visit = await prisma.visit.findUnique({
            where: { id: params.id },
            select: {
                id: true,
                status: true,
                visitNumber: true,
                invoices: { select: { id: true, status: true, balanceDue: true, totalAmount: true, amountPaid: true } },
                labOrders: { where: { subStatus: { in: ["AwaitingPayment", "InProgress"] } }, select: { id: true, createdAt: true, invoiceId: true } },
                radiologyOrders: { where: { subStatus: { in: ["AwaitingPayment", "InProgress"] } }, select: { id: true, createdAt: true, invoiceId: true } },
                prescriptions: { where: { subStatus: { in: ["AwaitingPayment", "InProgress"] } }, select: { id: true, createdAt: true, pharmacyInvoiceId: true } },
            },
        });

        if (!visit) {
            return NextResponse.json({ error: `Visit ${params.id} not found.` }, { status: 404 });
        }

        if (!ACTIVE_VISIT_STATUSES.includes(visit.status)) {
            return NextResponse.json(
                { error: `Visit ${visit.visitNumber} is in status "${visit.status}" — only active visits can be discontinued.` },
                { status: 400 }
            );
        }

        // Run the discontinuation in a transaction:
        //   1) Mark the visit Discontinued with the note + admin id + timestamp
        //   2) Cancel each open invoice (or note partial payments)
        //   3) Mark each open order Unfulfilled with an audit row
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update the visit itself
            const updatedVisit = await tx.visit.update({
                where: { id: visit.id },
                data: {
                    status: VISIT_STATUS.Discontinued,
                    discontinuationNote: note,
                    discontinuationDate: new Date(),
                    discontinuationById: session.user.id,
                },
            });

            // 2. Cancel open invoices. If any amount was paid, we leave the
            //    amountPaid untouched and rely on the same `Cancelled` status
            //    — the cashier can issue a refund separately if needed.
            for (const inv of visit.invoices) {
                if (inv.status === "Paid" || inv.status === "Cancelled") continue;
                await tx.invoice.update({
                    where: { id: inv.id },
                    data: { status: "Cancelled" },
                });
            }

            // 3. Mark each open order Unfulfilled with an OrderWriteOff audit row
            const writeOffs: { type: string; orderId: string; visitId: string }[] = [];

            for (const o of visit.labOrders) {
                await markOrderUnfulfilled(tx, "LAB", o.id, `Visit discontinued: ${note}`, {
                    scheduledAt: o.createdAt,
                    invoiceId: o.invoiceId,
                });
                writeOffs.push({ type: "LAB", orderId: o.id, visitId: visit.id });
            }
            for (const o of visit.radiologyOrders) {
                await markOrderUnfulfilled(tx, "RADIOLOGY", o.id, `Visit discontinued: ${note}`, {
                    scheduledAt: o.createdAt,
                    invoiceId: o.invoiceId,
                });
                writeOffs.push({ type: "RADIOLOGY", orderId: o.id, visitId: visit.id });
            }
            for (const o of visit.prescriptions) {
                await markOrderUnfulfilled(tx, "PRESCRIPTION", o.id, `Visit discontinued: ${note}`, {
                    scheduledAt: o.createdAt,
                    invoiceId: o.pharmacyInvoiceId,
                });
                writeOffs.push({ type: "PRESCRIPTION", orderId: o.id, visitId: visit.id });
            }

            return { updatedVisit, writeOffs };
        });

        console.log(
            `[Discontinue] Visit ${visit.visitNumber} (${visit.id}) discontinued by ${session.user.email || session.user.id} — ` +
            `note: "${note}", orders written off: ${result.writeOffs.length}`
        );

        return NextResponse.json({
            ok: true,
            visitId: visit.id,
            visitNumber: visit.visitNumber,
            status: VISIT_STATUS.Discontinued,
            note,
            discontinuedAt: result.updatedVisit.discontinuationDate,
            ordersWrittenOff: result.writeOffs.length,
        });
    } catch (error: any) {
        console.error("Discontinue error:", error);
        return NextResponse.json(
            { error: "Failed to discontinue visit", details: error.message || "Unknown error" },
            { status: 500 }
        );
    }
}
