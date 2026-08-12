// Shared invoice helper used by lab/radiology/pharmacy routes.
//
// Rule: every new transaction must be posted to an invoice that is:
//   1. Open (status Unpaid or Partial)
//   2. Belonging to the same visit
//   3. Already containing items ONLY of the same category as the new line
//      (e.g. a Lab line goes to a Lab-only invoice — never into a Pharmacy invoice)
//   4. If no matching open invoice exists, create a fresh one
//
// Why this matters:
//   • A closed (Paid/Cancelled) invoice must NEVER be re-opened. New transactions
//     after a closure must start a new invoice — that's the user's rule.
//   • Mixing categories (Drug lines on a Lab invoice) makes reconciliation,
//     sub-bill tracking, and per-category reporting noisy. Each category
//     gets its own invoice.
import { prisma } from '@/lib/prisma';

export interface FindOrCreateInvoiceInput {
    visitId: string;
    patientId: string;
    issuedById: string;
    /** The category of the new line being added (e.g. "Pharmacy", "Lab", "Radiology"). */
    category: 'Pharmacy' | 'Lab' | 'Radiology' | 'Consultation' | 'Service';
    /** The itemType tag on the existing items (e.g. "Drug", "Lab", "Radiology"). */
    itemType: string;
    /** Optional invoice-number prefix. Defaults to "INV". */
    numberPrefix?: string;
}

export async function findOrCreateInvoiceForTransaction(input: FindOrCreateInvoiceInput) {
    const { visitId, patientId, issuedById, category, itemType, numberPrefix = 'INV' } = input;

    // 1. Find an open invoice for this visit that is exclusively for this category.
    //    Strategy: any Unpaid/Partial invoice whose items are ALL the same itemType
    //    as the incoming line is eligible. If items are mixed (e.g. one Lab + one Drug),
    //    skip — don't bundle, that invoice is owned by a different category.
    // Edge case: a brand-new invoice with zero items is eligible for any category
    // (the first item to land claims it).
    const candidates = await prisma.invoice.findMany({
        where: { visitId, status: { in: ['Unpaid', 'Partial'] } },
        include: { items: true },
        orderBy: { createdAt: 'asc' },
    });

    const reusable = candidates.find((inv) => {
        // Empty invoice: only reuse if its number prefix matches the category of
        // the incoming line. This prevents a fresh-empty Lab invoice from getting
        // captured by the first Drug line that comes along (which would mix
        // categories on the same invoice).
        if (inv.items.length === 0) {
            return inv.invoiceNumber.toUpperCase().startsWith(numberPrefix.toUpperCase());
        }
        // Non-empty: only reuse if every existing item is the same itemType.
        return inv.items.every((it) => it.itemType === itemType);
    });

    if (reusable) return reusable;

    // 2. None of the open invoices match. Create a fresh one. This honors the rule:
    //    "Every new transaction warrants creation of a new invoice" (after closure or
    //    when no same-category open invoice is available).
    const invoiceCount = await prisma.invoice.count();
    const padded = String(invoiceCount + 1).padStart(5, '0');
    const number = `${numberPrefix}-${padded}`;

    return prisma.invoice.create({
        data: {
            invoiceNumber: number,
            patientId,
            visitId,
            issuedById,
            totalAmount: 0,
            amountPaid: 0,
            balanceDue: 0,
            status: 'Unpaid',
        },
    });
}

/**
 * Find or create the consolidated "Final Bill" invoice for a visit.
 *
 * Unlike `findOrCreateInvoiceForTransaction` (which keeps a SEPARATE
 * invoice per service category — Lab / Radiology / Pharmacy), this helper
 * always reuses or creates a single `FINAL-` invoice per visit that holds
 * every non-consultation charge.
 *
 * Why this exists:
 *   The previous per-category model produced 3-4 separate invoices per visit
 *   (Consultation fee + Lab + Radiology + Pharmacy). The cashier had to
 *   pay them one at a time, and the `FinalBilling → Completed` visit
 *   transition would fire prematurely when ANY ONE of them was paid
 *   (see FinalBilling-Completed bug fix). Consolidating into a single
 *   final bill makes the cashier flow obvious (one bill to pay) and the
 *   visit transition deterministic.
 *
 * Behaviour:
 *   - The consultation fee invoice is NEVER touched here — it stays
 *     separate (paid at visit creation, transitions visit ConsultationBilling
 *     → Triage). The final bill only covers post-consultation services.
 *   - If the visit has a `FINAL-` invoice in Unpaid/Partial status, it's
 *     reused. Closed (Paid/Cancelled) invoices are NEVER re-opened.
 *   - If no eligible final bill exists, a new one is created with prefix
 *     "FINAL-".
 *   - Legacy per-category invoices (e.g. `LABINV-`, `RADINV-`, `PHARMINV-`)
 *     are LEFT ALONE — they remain payable in the cashier UI but the new
 *     helper does not add to them. The `areAllVisitInvoicesPaid` helper
 *     in the payments route still accounts for them so the visit won't
 *     close until every outstanding invoice is paid.
 *
 * Used by the dispense and lab/radiology render flows to find the open
 * FINAL- invoice for a visit, creating one if none exists.
 */
export async function findOrCreateFinalBillInvoice(opts: {
    visitId: string;
    patientId: string;
    issuedById: string;
}) {
    const { visitId, patientId, issuedById } = opts;
    const FINAL_PREFIX = 'FINAL';

    // 1. Look for an existing open final bill on this visit.
    const existing = await prisma.invoice.findFirst({
        where: {
            visitId,
            status: { in: ['Unpaid', 'Partial'] },
            // Prefix match is the simplest way to distinguish a final bill
            // from the consultation fee invoice (default "INV-" prefix) or
            // legacy per-category invoices. Done in JS rather than as a
            // Prisma `startsWith` so we don't depend on the DB collation.
            invoiceNumber: { startsWith: `${FINAL_PREFIX}-` },
        },
        orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;

    // 2. None exists. Create a fresh one. We pad the sequence from the
    //    number of EXISTING final-bill invoices (across all visits) to
    //    keep the numbers monotonic. The exact number doesn't matter much
    //    for correctness — collisions are caught by the @unique index.
    const existingCount = await prisma.invoice.count({
        where: { invoiceNumber: { startsWith: `${FINAL_PREFIX}-` } },
    });
    const padded = String(existingCount + 1).padStart(5, '0');
    const invoiceNumber = `${FINAL_PREFIX}-${padded}`;

    return prisma.invoice.create({
        data: {
            invoiceNumber,
            patientId,
            visitId,
            issuedById,
            totalAmount: 0,
            amountPaid: 0,
            balanceDue: 0,
            status: 'Unpaid',
        },
    });
}
