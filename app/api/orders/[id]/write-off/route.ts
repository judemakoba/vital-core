export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { markOrderUnfulfilled, type OrderItemType } from "@/lib/visits/substatus";
import { ITEM_SUB_STATUS, VISIT_STATUS } from "@/lib/visits/status";

/**
 * 90-minute write-off endpoint.
 *
 * Per the consolidated visit cycle spec (R45), orders that stay in
 * AwaitingPayment for more than 90 minutes are auto-cancelled:
 *   - The order's subStatus transitions AwaitingPayment → Unfulfilled
 *   - The OrderWriteOff audit row is created
 *   - The invoice line is destroyed (or the invoice is restructured)
 *   - The visit state machine re-evaluates (PendingOrders → FinalBilling if this
 *     was the last non-terminal order)
 *
 * Two ways to invoke:
 *   1. Auto mode: POST /api/orders/any-id/write-off { auto: true }
 *      → discover and write off all orders older than 90 min
 *      → this is the cron entry point
 *
 *   2. Explicit mode: POST /api/orders/[id]/write-off { orderType: "LAB"|"RADIOLOGY"|"PRESCRIPTION" }
 *      → write off a specific order (admin manual override)
 *      → if orderType is omitted, route auto-detects by querying all three tables
 *
 * Auth:
 *   - Auto mode: requires ADMIN / SUPER_ADMIN (the cron uses an admin session)
 *   - Explicit mode: ADMIN / SUPER_ADMIN, or the assigned doctor
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

        // Parse body. The path param `id` is "any-id" when auto mode is requested.
        let body: any = {};
        try {
            body = await request.json();
        } catch {
            // body is optional
        }
        const { auto, orderType: explicitType, reason: customReason, olderThanMinutes } = body || {};

        const isAdmin = session.user?.role === "ADMIN" || session.user?.role === "SUPER_ADMIN";
        const minutes = Number(olderThanMinutes) || 90;
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);

        // ---- Auto mode: find and write off all old AwaitingPayment orders ----
        if (auto || params.id === "any-id" || params.id === "all") {
            if (!isAdmin) {
                return NextResponse.json(
                    { error: "Auto write-off requires ADMIN / SUPER_ADMIN" },
                    { status: 403 }
                );
            }

            const [labs, rads, rxs] = await Promise.all([
                prisma.labOrder.findMany({
                    where: { subStatus: ITEM_SUB_STATUS.AwaitingPayment, createdAt: { lt: cutoff } },
                    select: { id: true, visitId: true, createdAt: true, invoiceId: true },
                }),
                prisma.radiologyOrder.findMany({
                    where: { subStatus: ITEM_SUB_STATUS.AwaitingPayment, createdAt: { lt: cutoff } },
                    select: { id: true, visitId: true, createdAt: true, invoiceId: true },
                }),
                prisma.prescription.findMany({
                    where: { subStatus: ITEM_SUB_STATUS.AwaitingPayment, createdAt: { lt: cutoff } },
                    select: { id: true, visitId: true, createdAt: true, pharmacyInvoiceId: true },
                }),
            ]);

            const summary = { labsWrittenOff: 0, radsWrittenOff: 0, rxsWrittenOff: 0, visitAdvancements: [] as any[] };

            // Process each
            for (const o of labs) {
                const r = await prisma.$transaction(async (tx) => {
                    return await markOrderUnfulfilled(tx, "LAB", o.id, `${minutes}-minute auto write-off`, {
                        scheduledAt: o.createdAt,
                        invoiceId: o.invoiceId,
                    });
                });
                summary.labsWrittenOff++;
                if (r.visitAdvanced) summary.visitAdvancements.push({ visitId: o.visitId, newStatus: r.newVisitStatus });
            }
            for (const o of rads) {
                const r = await prisma.$transaction(async (tx) => {
                    return await markOrderUnfulfilled(tx, "RADIOLOGY", o.id, `${minutes}-minute auto write-off`, {
                        scheduledAt: o.createdAt,
                        invoiceId: o.invoiceId,
                    });
                });
                summary.radsWrittenOff++;
                if (r.visitAdvanced) summary.visitAdvancements.push({ visitId: o.visitId, newStatus: r.newVisitStatus });
            }
            for (const o of rxs) {
                const r = await prisma.$transaction(async (tx) => {
                    return await markOrderUnfulfilled(tx, "PRESCRIPTION", o.id, `${minutes}-minute auto write-off`, {
                        scheduledAt: o.createdAt,
                        invoiceId: o.pharmacyInvoiceId,
                    });
                });
                summary.rxsWrittenOff++;
                if (r.visitAdvanced) summary.visitAdvancements.push({ visitId: o.visitId, newStatus: r.newVisitStatus });
            }

            console.log(
                `[WriteOff] Auto write-off (cutoff=${cutoff.toISOString()}) — ` +
                `labs: ${summary.labsWrittenOff}, rads: ${summary.radsWrittenOff}, rxs: ${summary.rxsWrittenOff}, ` +
                `visit advancements: ${summary.visitAdvancements.length}`
            );

            return NextResponse.json({ ok: true, mode: "auto", cutoff, ...summary });
        }

        // ---- Explicit mode: write off a specific order ----
        let orderType: OrderItemType | null = (explicitType as OrderItemType) || null;
        let orderInfo: { id: string; visitId: string; createdAt: Date; invoiceId: string | null } | null = null;

        if (orderType === "LAB") {
            const o = await prisma.labOrder.findUnique({
                where: { id: params.id },
                select: { id: true, visitId: true, createdAt: true, invoiceId: true, subStatus: true },
            });
            if (o) orderInfo = o;
        } else if (orderType === "RADIOLOGY") {
            const o = await prisma.radiologyOrder.findUnique({
                where: { id: params.id },
                select: { id: true, visitId: true, createdAt: true, invoiceId: true, subStatus: true },
            });
            if (o) orderInfo = o;
        } else if (orderType === "PRESCRIPTION") {
            const o = await prisma.prescription.findUnique({
                where: { id: params.id },
                select: { id: true, visitId: true, createdAt: true, pharmacyInvoiceId: true, subStatus: true },
            });
            if (o) orderInfo = { ...o, invoiceId: o.pharmacyInvoiceId };
        } else {
            // Auto-detect order type by querying all three tables
            const [lab, rad, rx] = await Promise.all([
                prisma.labOrder.findUnique({
                    where: { id: params.id },
                    select: { id: true, visitId: true, createdAt: true, invoiceId: true, subStatus: true },
                }),
                prisma.radiologyOrder.findUnique({
                    where: { id: params.id },
                    select: { id: true, visitId: true, createdAt: true, invoiceId: true, subStatus: true },
                }),
                prisma.prescription.findUnique({
                    where: { id: params.id },
                    select: { id: true, visitId: true, createdAt: true, pharmacyInvoiceId: true, subStatus: true },
                }),
            ]);
            if (lab) { orderType = "LAB"; orderInfo = lab; }
            else if (rad) { orderType = "RADIOLOGY"; orderInfo = rad; }
            else if (rx) { orderType = "PRESCRIPTION"; orderInfo = { ...rx, invoiceId: rx.pharmacyInvoiceId }; }
        }

        if (!orderType || !orderInfo) {
            return NextResponse.json(
                { error: `Order ${params.id} not found in any of the three order tables.` },
                { status: 404 }
            );
        }

        // Authorize: admin OR assigned doctor for the visit
        if (!isAdmin) {
            const visit = await prisma.visit.findUnique({
                where: { id: orderInfo.visitId },
                select: { assignedDoctorId: true },
            });
            if (!visit || visit.assignedDoctorId !== session.user.id) {
                return NextResponse.json(
                    { error: "Only the assigned doctor or an admin can write off an order." },
                    { status: 403 }
                );
            }
        }

        if (orderInfo.subStatus !== ITEM_SUB_STATUS.AwaitingPayment && orderInfo.subStatus !== ITEM_SUB_STATUS.InProgress) {
            return NextResponse.json(
                { error: `Order is in subStatus "${orderInfo.subStatus}" — only AwaitingPayment or InProgress orders can be written off.` },
                { status: 400 }
            );
        }

        const result = await prisma.$transaction(async (tx) => {
            return await markOrderUnfulfilled(
                tx,
                orderType!,
                orderInfo!.id,
                customReason || "Manual write-off",
                {
                    scheduledAt: orderInfo!.createdAt,
                    invoiceId: orderInfo!.invoiceId,
                }
            );
        });

        return NextResponse.json({
            ok: true,
            mode: "explicit",
            orderId: orderInfo.id,
            orderType,
            transitioned: result.transitioned,
            visitAdvanced: result.visitAdvanced,
            newVisitStatus: result.newVisitStatus,
        });
    } catch (error: any) {
        console.error("Write-off error:", error);
        return NextResponse.json(
            { error: "Write-off failed", details: error.message || "Unknown error" },
            { status: 500 }
        );
    }
}
