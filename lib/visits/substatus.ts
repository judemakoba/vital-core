/**
 * Sub-status transition helpers for order items (LabOrder / RadiologyOrder /
 * Prescription) per the consolidated visit cycle spec (R45).
 *
 * Each order item carries a `subStatus` field that drives visibility on
 * department dashboards:
 *
 *   AwaitingPayment → invoice generated, not yet paid (HIDDEN)
 *   InProgress      → paid, service can be performed (VISIBLE)
 *   Fulfilled       → service done, result submitted
 *   Unfulfilled     → 90-min write-off or cancelled (HIDDEN, audit logged)
 *
 * Transitions:
 *   AwaitingPayment → InProgress   on full payment of the line item's invoice
 *   InProgress      → Fulfilled     on result submission
 *   AwaitingPayment → Unfulfilled   after 90 min unpaid (cron)
 *   InProgress      → Unfulfilled   on explicit cancel
 */
import { prisma } from "../prisma";
import { ITEM_SUB_STATUS, decideNextStatusForPendingVisit, VISIT_STATUS } from "./status";

export type OrderItemType = "LAB" | "RADIOLOGY" | "PRESCRIPTION";

/**
 * Transition an order item's sub-status. Validates the transition is legal
 * (only allows forward transitions, never reverses).
 *
 * @returns true if a write happened, false if the transition was a no-op.
 */
export async function transitionOrderSubStatus(
    tx: any,
    itemType: OrderItemType,
    itemId: string,
    target: string,
): Promise<boolean> {
    const modelName =
        itemType === "LAB" ? "labOrder" :
        itemType === "RADIOLOGY" ? "radiologyOrder" :
        "prescription";

    const validTransitions: Record<string, string[]> = {
        [ITEM_SUB_STATUS.AwaitingPayment]: [ITEM_SUB_STATUS.InProgress, ITEM_SUB_STATUS.Unfulfilled],
        [ITEM_SUB_STATUS.InProgress]:      [ITEM_SUB_STATUS.Fulfilled,   ITEM_SUB_STATUS.Unfulfilled],
        [ITEM_SUB_STATUS.Fulfilled]:       [], // terminal
        [ITEM_SUB_STATUS.Unfulfilled]:     [], // terminal
    };

    const current = await tx[modelName].findUnique({
        where: { id: itemId },
        select: { subStatus: true, visitId: true },
    });
    if (!current) return false;
    if (current.subStatus === target) return false; // already in target state
    if (!validTransitions[current.subStatus]?.includes(target)) {
        // Invalid transition — log but don't throw (we want to be defensive
        // in payment routes that touch many items at once)
        console.warn(
            `[substatus] Skipping illegal ${itemType} ${itemId} transition: ${current.subStatus} -> ${target}`
        );
        return false;
    }

    await tx[modelName].update({
        where: { id: itemId },
        data: { subStatus: target },
    });
    return true;
}

/**
 * Bulk-transition all order items linked to a given invoice from
 * AwaitingPayment → InProgress. Called from the payment route when an
 * invoice becomes fully paid.
 *
 * "Linked" means: invoice's items are tagged with orderId+orderType via
 * the JSON `metadata` column on InvoiceItem, OR via the order model's
 * direct invoiceId FK. We use the FK relationship for all three order types.
 */
export async function transitionInvoiceItemsToInProgress(
    tx: any,
    invoiceId: string,
): Promise<{ labs: number; rads: number; rxs: number; visitIds: Set<string> }> {
    const visitIds = new Set<string>();
    let labs = 0, rads = 0, rxs = 0;

    // LabOrder.invoiceId → invoiceId
    const labRows = await tx.labOrder.findMany({
        where: { invoiceId, subStatus: ITEM_SUB_STATUS.AwaitingPayment },
        select: { id: true, visitId: true },
    });
    for (const r of labRows) {
        await tx.labOrder.update({ where: { id: r.id }, data: { subStatus: ITEM_SUB_STATUS.InProgress } });
        visitIds.add(r.visitId);
        labs++;
    }

    // RadiologyOrder.invoiceId → invoiceId
    const radRows = await tx.radiologyOrder.findMany({
        where: { invoiceId, subStatus: ITEM_SUB_STATUS.AwaitingPayment },
        select: { id: true, visitId: true },
    });
    for (const r of radRows) {
        await tx.radiologyOrder.update({ where: { id: r.id }, data: { subStatus: ITEM_SUB_STATUS.InProgress } });
        visitIds.add(r.visitId);
        rads++;
    }

    // Prescription.pharmacyInvoiceId → invoiceId
    const rxRows = await tx.prescription.findMany({
        where: { pharmacyInvoiceId: invoiceId, subStatus: ITEM_SUB_STATUS.AwaitingPayment },
        select: { id: true, visitId: true },
    });
    for (const r of rxRows) {
        await tx.prescription.update({ where: { id: r.id }, data: { subStatus: ITEM_SUB_STATUS.InProgress } });
        visitIds.add(r.visitId);
        rxs++;
    }

    return { labs, rads, rxs, visitIds };
}

/**
 * After an item changes sub-status, re-evaluate the parent visit's status.
 * If the visit was in PendingOrders and ALL its orders are now terminal
 * (Fulfilled or Unfulfilled), advance it to FinalBilling.
 *
 * Called from:
 *   - lab result submission (InProgress → Fulfilled)
 *   - radiology report submission (InProgress → Fulfilled)
 *   - pharmacy dispense (InProgress → Fulfilled)
 *   - order cancel (InProgress → Unfulfilled)
 *   - 90-min write-off (AwaitingPayment → Unfulfilled)
 */
export async function maybeAdvanceVisitAfterItemStatusChange(
    tx: any,
    visitId: string,
): Promise<{ previousStatus: string; newStatus: string; advanced: boolean }> {
    const visit = await tx.visit.findUnique({
        where: { id: visitId },
        select: { id: true, status: true },
    });
    if (!visit) return { previousStatus: '?', newStatus: '?', advanced: false };

    const previousStatus = visit.status;
    let currentStatus = visit.status;

    // PendingOrders → Completed (or stay in PendingOrders) once every order
    // is terminal AND every visit invoice is paid. decideNextStatusForPendingVisit
    // now factors in invoices, so a single call decides the next state.
    if (currentStatus === VISIT_STATUS.PendingOrders) {
        const next = await decideNextStatusForPendingVisit(tx, visitId);
        if (next === VISIT_STATUS.Completed) {
            await tx.visit.update({
                where: { id: visitId },
                data: { status: VISIT_STATUS.Completed, completedTime: new Date() },
            });
            return { previousStatus, newStatus: VISIT_STATUS.Completed, advanced: true };
        }
        // else: still has pending items; stay in PendingOrders
    }

    // Legacy FinalBilling → Completed transition (for visits that were
    // routed through FinalBilling before the spec was simplified). Only
    // invoice payment drives this; order fulfillment no longer promotes
    // visits to FinalBilling.
    if (currentStatus === VISIT_STATUS.FinalBilling) {
        const invoices = await tx.invoice.findMany({
            where: { visitId },
            select: { id: true, status: true, balanceDue: true },
        });
        const remaining = invoices.reduce(
            (sum, inv) => sum + (Number(inv.balanceDue) || 0),
            0
        );
        const unpaidCount = invoices.filter(
            (inv) => inv.status === 'Unpaid' || inv.status === 'Partial'
        ).length;
        if (remaining <= 0.01 && unpaidCount === 0) {
            await tx.visit.update({
                where: { id: visitId },
                data: { status: VISIT_STATUS.Completed, completedTime: new Date() },
            });
            return { previousStatus, newStatus: VISIT_STATUS.Completed, advanced: true };
        }
    }

    return { previousStatus, newStatus: currentStatus, advanced: currentStatus !== previousStatus };
}

/**
 * Mark an order as Fulfilled and re-evaluate the parent visit status.
 * Used by lab result submission, rad report submission, pharmacy dispense.
 */
export async function markOrderFulfilled(
    tx: any,
    itemType: OrderItemType,
    itemId: string,
): Promise<{ transitioned: boolean; visitAdvanced: boolean; newVisitStatus?: string }> {
    const transitioned = await transitionOrderSubStatus(tx, itemType, itemId, ITEM_SUB_STATUS.Fulfilled);
    if (!transitioned) return { transitioned: false, visitAdvanced: false };

    // Find the visit for this order
    const modelName =
        itemType === "LAB" ? "labOrder" :
        itemType === "RADIOLOGY" ? "radiologyOrder" :
        "prescription";
    const order = await tx[modelName].findUnique({
        where: { id: itemId },
        select: { visitId: true },
    });
    if (!order) return { transitioned, visitAdvanced: false };

    const adv = await maybeAdvanceVisitAfterItemStatusChange(tx, order.visitId);
    return { transitioned, visitAdvanced: adv.advanced, newVisitStatus: adv.newStatus };
}

/**
 * Mark an order as Unfulfilled (cancel / write-off) and re-evaluate visit.
 * Also records an OrderWriteOff audit row when invoked through the write-off
 * path.
 */
export async function markOrderUnfulfilled(
    tx: any,
    itemType: OrderItemType,
    itemId: string,
    reason: string,
    audit: { scheduledAt?: Date; invoiceId?: string | null } = {},
): Promise<{ transitioned: boolean; visitAdvanced: boolean; newVisitStatus?: string }> {
    const modelName =
        itemType === "LAB" ? "labOrder" :
        itemType === "RADIOLOGY" ? "radiologyOrder" :
        "prescription";

    const order = await tx[modelName].findUnique({
        where: { id: itemId },
        select: { visitId: true, createdAt: true, subStatus: true },
    });
    if (!order) return { transitioned: false, visitAdvanced: false };

    const transitioned = await transitionOrderSubStatus(tx, itemType, itemId, ITEM_SUB_STATUS.Unfulfilled);
    if (!transitioned) return { transitioned: false, visitAdvanced: false };

    await tx.orderWriteOff.create({
        data: {
            visitId: order.visitId,
            itemType,
            itemId,
            invoiceId: audit.invoiceId ?? null,
            scheduledAt: audit.scheduledAt ?? order.createdAt,
            reason,
        },
    });

    const adv = await maybeAdvanceVisitAfterItemStatusChange(tx, order.visitId);
    return { transitioned, visitAdvanced: adv.advanced, newVisitStatus: adv.newStatus };
}
