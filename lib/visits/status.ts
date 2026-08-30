/**
 * Visit Status State Machine — Consolidated Spec, 2026-08-04
 *
 * Primary visit-level statuses (8):
 *
 *   ConsultationBilling          ← visit created (initial consultation fee invoice)
 *     │ (consultation fee invoice paid, OR zero-fee auto-transition)
 *     ▼
 *   Triage                       ← in triage queue, awaiting vitals
 *     │ (triage form submitted)
 *     ▼
 *   InConsultation               ← doctor is in progress
 *     │ (doctor clicks "Finish Consultation")
 *     │  ┌─ pending orders OR unpaid invoices  → PendingOrders
 *     │  └─ nothing pending                     → Completed (TERMINAL)
 *     ▼
 *   PendingOrders                ← orders dispatched; each has its own SubStatus lifecycle
 *     │ (every order is Fulfilled/Unfulfilled AND every invoice is Paid/Cancelled)
 *     ▼
 *   Completed                    ← TERMINAL, archived
 *
 *   DirectServicePending          ← visit type = Lab/Rad/Prescription Only (no triage, no doctor)
 *     │ (service fulfilled)
 *     ▼
 *   FinalBilling                  ← bill generated on fulfillment
 *     │ (final invoice paid → visit becomes Completed)
 *     ▼
 *   Completed
 *
 *   Discontinued                  ← admin cancelled (TERMINAL, requires note)
 *
 * Sub-Status Flags (per-order, on LabOrder / RadiologyOrder / Prescription):
 *
 *   AwaitingPayment  ← invoice generated, not yet paid (HIDDEN from dept. dashboard)
 *   InProgress       ← paid, service can be performed (VISIBLE on dept. dashboard)
 *   Fulfilled        ← service completed, result submitted (visible briefly for review)
 *   Unfulfilled      ← 90-min write-off or service cancelled (HIDDEN, audit logged)
 *
 * Transition rules:
 *  - AwaitingPayment → InProgress:    on full payment of the line item's invoice
 *  - InProgress → Fulfilled:          on result submission (lab result, rad report, rx dispense)
 *  - AwaitingPayment → Unfulfilled:   after 90 min unpaid, auto-write-off, invoice destroyed
 *  - InProgress → Unfulfilled:        on explicit cancel (e.g. drug not in stock)
 *
 * Visit transition rules:
 *  - InConsultation → PendingOrders:  if 1+ orders OR unpaid invoices exist when doctor closes
 *  - InConsultation → Completed:      if nothing pending when doctor closes consultation
 *  - PendingOrders → Completed:       when ALL orders are terminal AND all invoices are paid
 *                                     (auto-completion; no intermediate FinalBilling stage)
 *  - [Any Active] → Discontinued:     admin action with mandatory note
 *
 * "ConsultationBilling" and "FinalBilling" remain distinct so the payment route
 * can tell the consultation-fee payment (→ Triage) apart from the final bill
 * payment (→ Completed) without a separate field on the visit.
 */

export const VISIT_STATUS = {
    // Pre-consultation fee (or zero-fee auto-transition)
    ConsultationBilling: "ConsultationBilling",

    // Triage flow
    Triage: "Triage",

    // Doctor consultation (active)
    InConsultation: "InConsultation",

    // Orders dispatched, each carries its own SubStatus
    PendingOrders: "PendingOrders",

    // Direct service path (no triage, no consultation)
    DirectServicePending: "DirectServicePending",

    // Post-orders final bill
    FinalBilling: "FinalBilling",

    // Inpatient — set when admin/reception fulfils an IpdRequest
    // (R62) or creates a direct-referral admission. The visit is
    // actively admitted to a ward; doctor/consultation work pauses
    // until discharge.
    Admitted: "Admitted",

    // Terminal states
    Completed: "Completed",
    Discontinued: "Discontinued",

    // Legacy aliases — kept for backward-compat with old visits
    Waiting: "Waiting",          // → treat as ConsultationBilling
    Triaged: "Triaged",          // → treat as Triage
    Consultation: "Consultation",// → treat as InConsultation
    Laboratory: "Laboratory",    // → treat as InConsultation
    Radiology: "Radiology",      // → treat as InConsultation
    Pharmacy: "Pharmacy",        // → treat as InConsultation
} as const;

export type VisitStatus = (typeof VISIT_STATUS)[keyof typeof VISIT_STATUS];

/**
 * Sub-status for individual order items (LabOrder, RadiologyOrder, Prescription).
 * Drives payment-before-service visibility on department dashboards.
 */
export const ITEM_SUB_STATUS = {
    AwaitingPayment: "AwaitingPayment",  // hidden from dept. dashboard
    InProgress: "InProgress",            // visible — service can be performed
    Fulfilled: "Fulfilled",              // service done, result submitted
    Unfulfilled: "Unfulfilled",          // hidden — 90-min write-off or cancelled
} as const;

export type ItemSubStatus = (typeof ITEM_SUB_STATUS)[keyof typeof ITEM_SUB_STATUS];

/**
 * Statuses that count as "active" — patient is still in the clinic.
 * Excludes Completed and Discontinued (terminal) only.
 */
export const ACTIVE_VISIT_STATUSES: string[] = [
    VISIT_STATUS.Waiting,
    VISIT_STATUS.ConsultationBilling,
    VISIT_STATUS.Triage,
    VISIT_STATUS.Triaged,
    VISIT_STATUS.InConsultation,
    VISIT_STATUS.Consultation,
    VISIT_STATUS.PendingOrders,
    VISIT_STATUS.DirectServicePending,
    VISIT_STATUS.FinalBilling,
    VISIT_STATUS.Laboratory,
    VISIT_STATUS.Radiology,
    VISIT_STATUS.Pharmacy,
];

/**
 * Doctor dashboard filter — patients the doctor should see.
 * Excludes ConsultationBilling/FinalBilling/Triage (front-desk stages) and
 * DirectServicePending (no consultation involved) and Discontinued (terminal).
 */
export const DOCTOR_VISIBLE_STATUSES: string[] = [
    VISIT_STATUS.Triaged,
    VISIT_STATUS.InConsultation,
    VISIT_STATUS.Consultation,
    VISIT_STATUS.PendingOrders,
    VISIT_STATUS.Laboratory,
    VISIT_STATUS.Radiology,
    VISIT_STATUS.Pharmacy,
];

/**
 * Map legacy visit statuses to the new normalized status. Used when
 * reading old visits that pre-date the consolidated spec.
 */
export function normalizeVisitStatus(raw: string | null | undefined): VisitStatus {
    if (!raw) return VISIT_STATUS.Waiting;
    const map: Record<string, VisitStatus> = {
        Waiting: VISIT_STATUS.ConsultationBilling,
        Triaged: VISIT_STATUS.Triage,
        Consultation: VISIT_STATUS.InConsultation,
        Laboratory: VISIT_STATUS.InConsultation,
        Radiology: VISIT_STATUS.InConsultation,
        Pharmacy: VISIT_STATUS.InConsultation,
    };
    return (map[raw] ?? raw) as VisitStatus;
}

/**
 * Decide the next visit status when a doctor finishes their consultation.
 *
 * Per the user's revised rule: the visit goes directly to Completed
 * (terminal) when nothing is pending, otherwise it stays non-terminal
 * in PendingOrders until the last order is fulfilled and the last
 * invoice is paid. The intermediate FinalBilling stage is removed.
 *
 *   - 1+ pending items (orders OR unpaid invoices) → PendingOrders
 *   - 0 pending items                                → Completed
 *
 * "Pending orders" = lab/radiology/prescription rows whose subStatus is
 * not yet Fulfilled or Unfulfilled (i.e. AwaitingPayment, InProgress,
 * or any other non-terminal sub-status).
 *
 * "Pending invoices" = invoices for this visit whose status is not Paid
 * or Cancelled (typically Unpaid or Partial) and whose balanceDue > 0.
 *
 * IMPORTANT: only called DOWNSTREAM from InConsultation. If the visit is
 * currently in PendingOrders (came back for results review), don't
 * override the status — let decideNextStatusForPendingVisit drive the
 * transition to Completed when everything is done.
 */
export async function decideNextStatusAfterConsultation(prisma: any, visitId: string): Promise<string> {
    const [pendingLab, pendingRad, pendingRx, pendingInvoices] = await Promise.all([
        prisma.labOrder.count({
            where: {
                visitId,
                subStatus: { in: ['AwaitingPayment', 'InProgress'] }
            }
        }),
        prisma.radiologyOrder.count({
            where: {
                visitId,
                subStatus: { in: ['AwaitingPayment', 'InProgress'] }
            }
        }),
        prisma.prescription.count({
            where: {
                visitId,
                subStatus: { in: ['AwaitingPayment', 'InProgress'] }
            }
        }),
        prisma.invoice.count({
            where: {
                visitId,
                status: { in: ['Unpaid', 'Partial', 'Open'] },
                balanceDue: { gt: 0 }
            }
        }),
    ]);

    if (pendingLab + pendingRad + pendingRx + pendingInvoices > 0) return VISIT_STATUS.PendingOrders;
    return VISIT_STATUS.Completed;
}

/**
 * Decide the next visit status when ANY order changes its sub-status.
 *
 * Per the user's revised rule: a visit in PendingOrders transitions
 * directly to Completed when every order is terminal (Fulfilled or
 * Unfulfilled) AND every visit invoice is paid/cancelled. If any
 * order is still AwaitingPayment or InProgress OR any invoice has a
 * balance, the visit stays in PendingOrders.
 *
 * Called from:
 *  - Lab result submission (Fulfilled)
 *  - Radiology report submission (Fulfilled)
 *  - Pharmacy dispense (Fulfilled)
 *  - 90-min write-off cron (Unfulfilled)
 *  - Explicit order cancel (Unfulfilled)
 */
export async function decideNextStatusForPendingVisit(prisma: any, visitId: string): Promise<string> {
    const [openLab, openRad, openRx, openInvoices] = await Promise.all([
        prisma.labOrder.count({
            where: {
                visitId,
                subStatus: { in: ['AwaitingPayment', 'InProgress'] }
            }
        }),
        prisma.radiologyOrder.count({
            where: {
                visitId,
                subStatus: { in: ['AwaitingPayment', 'InProgress'] }
            }
        }),
        prisma.prescription.count({
            where: {
                visitId,
                subStatus: { in: ['AwaitingPayment', 'InProgress'] }
            }
        }),
        prisma.invoice.count({
            where: {
                visitId,
                status: { in: ['Unpaid', 'Partial', 'Open'] },
                balanceDue: { gt: 0 }
            }
        }),
    ]);

    if (openLab + openRad + openRx + openInvoices > 0) return VISIT_STATUS.PendingOrders;
    return VISIT_STATUS.Completed;
}

/**
 * Map visit TYPE to the initial visit STATUS (Phase 2 spec).
 *
 *   OPD / Consultation       → ConsultationBilling (most common, paid first)
 *   FOLLOW_UP                → ConsultationBilling (only if fee applies; else auto Triage)
 *   VACCINATION              → ConsultationBilling (auto $0 most cases)
 *   ANTENATAL                → ConsultationBilling (auto $0 most cases)
 *   LAB_ONLY                 → DirectServicePending (skips triage + consultation)
 *   RADIOLOGY_ONLY           → DirectServicePending
 *   PRESCRIPTION_ONLY        → DirectServicePending
 *
 * The auto-$0 / auto-Triage logic runs AFTER this initial assignment —
 * the visit starts as ConsultationBilling, then the billing checkpoint
 * (Phase 2 spec) either keeps it (invoice generated) or advances it
 * to Triage (no fee, no co-pay).
 */
export function initialStatusForVisitType(visitType: string): VisitStatus {
    const lower = (visitType || '').toLowerCase();
    if (lower.includes('lab') || lower.includes('radiology') || lower.includes('prescription')) {
        return VISIT_STATUS.DirectServicePending;
    }
    return VISIT_STATUS.ConsultationBilling;
}
