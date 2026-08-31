export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountingService } from '@/lib/finance/accounting-service';
import { logLedgerError } from '@/lib/finance/ledger-logger';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * POST /api/finance/backfill/invoice-journals
 *
 * One-shot backfill for invoices that never got an INVOICE-reference
 * journal entry on creation. This happens when the silent catch in
 * the invoice creation route swallowed an error (root cause investigated
 * separately — see the persistent `/tmp/ledger-errors.log` in the LXC).
 *
 * Behaviour:
 *   - Default: scans for every Invoice (legacy) and TaxInvoice that does
 *     NOT have a corresponding JournalEntry (referenceType='INVOICE'),
 *     and tries to post the journal. The result is per-invoice.
 *   - Idempotency: `AccountingService.postInvoiceToLedger` checks for
 *     an existing journal first, so re-running this is a no-op for any
 *     invoice that was already posted.
 *   - Safe to run multiple times.
 *   - Requires ADMIN or ACCOUNTANT session.
 *
 * The body accepts an optional `invoiceIds` array to limit the scope.
 * If provided, ONLY those ids are processed (useful for retry).
 *
 * Response shape:
 *   { processed: number, succeeded: number, failed: number, results: [...] }
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // Guard: only admin/accountant should be able to backfill.
        // Without this, any logged-in user could trigger a flood of
        // ledger writes via a one-liner curl.
        const role = (session.user as any)?.role;
        if (role !== 'ADMIN' && role !== 'ACCOUNTANT') {
            return NextResponse.json({ error: 'Forbidden — admin or accountant only' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const requestedIds: string[] | undefined = Array.isArray(body?.invoiceIds) ? body.invoiceIds : undefined;

        // 1) Find invoices missing INVOICE journals
        // Two passes — legacy Invoice and TaxInvoice — because they live in
        // separate tables. We union the result and dedupe by id+source.
        const [missingLegacy, missingTax] = await Promise.all([
            prisma.invoice.findMany({
                where: requestedIds
                    ? { id: { in: requestedIds } }
                    : {
                        NOT: {
                            id: { in: [] }, // placeholder — the actual filter uses a subquery
                        },
                    },
                select: { id: true, invoiceNumber: true, totalAmount: true },
            }),
            prisma.taxInvoice.findMany({
                where: requestedIds
                    ? { id: { in: requestedIds } }
                    : {},
                select: { id: true, invoiceNumber: true, totalAmount: true },
            }),
        ]);

        // Filter to only the ones that don't have an INVOICE-reference journal yet
        const existingRefs = await prisma.journalEntry.findMany({
            where: { referenceType: 'INVOICE', reference: { in: [...missingLegacy.map(i => i.id), ...missingTax.map(i => i.id)] } },
            select: { reference: true },
        });
        const existingSet = new Set(existingRefs.map(r => r.reference));

        const targets: { id: string; invoiceNumber: string; totalAmount: number; source: 'Invoice' | 'TaxInvoice' }[] = [];
        for (const i of missingLegacy) {
            if (!existingSet.has(i.id)) targets.push({ id: i.id, invoiceNumber: i.invoiceNumber, totalAmount: i.totalAmount, source: 'Invoice' });
        }
        for (const i of missingTax) {
            if (!existingSet.has(i.id)) targets.push({ id: i.id, invoiceNumber: i.invoiceNumber, totalAmount: i.totalAmount, source: 'TaxInvoice' });
        }

        // 2) Process each one. The service has its own idempotency check, so
        //    a re-run is safe; we still report per-id success/failure so the
        //    operator can see exactly what happened.
        const results: Array<{ id: string; invoiceNumber: string; source: string; status: 'posted' | 'skipped' | 'failed'; error?: string }> = [];
        let succeeded = 0;
        let failed = 0;

        for (const t of targets) {
            try {
                const journal = await AccountingService.postInvoiceToLedger(t.id, session.user.id);
                if (!journal) {
                    results.push({ id: t.id, invoiceNumber: t.invoiceNumber, source: t.source, status: 'failed', error: 'No journal returned (possibly zero-value invoice)' });
                    failed++;
                } else {
                    results.push({ id: t.id, invoiceNumber: t.invoiceNumber, source: t.source, status: 'posted' });
                    succeeded++;
                }
            } catch (err) {
                const structured = await logLedgerError(err, {
                    operation: 'backfillInvoiceJournals',
                    referenceId: t.id,
                    referenceLabel: t.invoiceNumber,
                    extra: { totalAmount: t.totalAmount, source: t.source },
                });
                results.push({ id: t.id, invoiceNumber: t.invoiceNumber, source: t.source, status: 'failed', error: structured.message });
                failed++;
            }
        }

        return NextResponse.json({
            processed: targets.length,
            succeeded,
            failed,
            results,
        });
    } catch (error) {
        console.error('Backfill error:', error);
        return NextResponse.json({ error: 'Failed to run backfill' }, { status: 500 });
    }
}
