/**
 * Persistent logger for ledger-posting failures.
 *
 * Why this exists: invoice creation and payment routes wrap
 * `AccountingService.postInvoiceToLedger` / `postPaymentToLedger` in a
 * `try { ... } catch { console.error(...) }` and keep going — so a single
 * failed auto-post never blocks the user flow. That trade-off was fine when
 * the failures were rare, but we now have a hard case where 100% of invoice
 * auto-posts are silently failing (12 invoices, 0 INVOICE-reference journals
 * in the LXC DB).
 *
 * `console.error` is the only output Next.js gives us, and inside the
 * production container stdout isn't being captured (verified via
 * `docker logs vitalcore-app` returning only the entrypoint banner).
 *
 * `logLedgerError` writes the failure to a file inside the container so it
 * survives across restarts. The file path is overridable via the env var
 * `LEDGER_LOG_FILE`; the default `/tmp/ledger-errors.log` works in the
 * current LXC build. For a long-running production setup you'd mount a
 * volume at that path or set the env var to a real disk location.
 *
 * The shape of the log line is `ISO_TIMESTAMP | CONTEXT | ERROR` — the same
 * format `tail -f` shows, so an operator can `pct exec 200 -- cat
 * /tmp/ledger-errors.log` to see everything in one go.
 */

import { appendFile } from 'fs/promises';
import { join } from 'path';

const DEFAULT_LOG_PATH = process.env.LEDGER_LOG_FILE || '/tmp/ledger-errors.log';

interface LedgerErrorContext {
    /** Which function failed (e.g. "postInvoiceToLedger", "postPaymentToLedger") */
    operation: string;
    /** The invoice/payment/etc. id we were processing */
    referenceId: string;
    /** Optional invoice number for human-readable context */
    referenceLabel?: string;
    /** Any other debugging data — e.g. account codes we tried to find */
    extra?: Record<string, unknown>;
}

export class LedgerPostError extends Error {
    context: LedgerErrorContext;
    cause?: unknown;
    constructor(message: string, context: LedgerErrorContext, cause?: unknown) {
        super(message);
        this.name = 'LedgerPostError';
        this.context = context;
        this.cause = cause;
    }
}

/**
 * Persist a ledger error to disk and `console.error` it as a fallback.
 * Returns the structured `LedgerPostError` so callers can re-throw or surface it.
 */
export async function logLedgerError(
    err: unknown,
    context: LedgerErrorContext
): Promise<LedgerPostError> {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const wrapped = new LedgerPostError(message, context, err);

    // Always log to stdout — visible to `docker logs` and to dev console
    console.error(`[LEDGER] ${context.operation} failed for ${context.referenceId} (${context.referenceLabel ?? 'no-label'}): ${message}`);
    if (stack) console.error(stack);
    if (context.extra) console.error(`[LEDGER] extra:`, context.extra);

    // Best-effort write to the persistent log file
    try {
        const line = [
            new Date().toISOString(),
            context.operation,
            context.referenceId,
            context.referenceLabel ?? '',
            JSON.stringify(context.extra ?? {}),
            message,
        ].join(' | ') + '\n';
        await appendFile(DEFAULT_LOG_PATH, line, 'utf8');
    } catch (writeErr) {
        // Don't let a log-write failure mask the original error
        console.error(`[LEDGER] additionally failed to write log to ${DEFAULT_LOG_PATH}:`, writeErr);
    }

    return wrapped;
}
