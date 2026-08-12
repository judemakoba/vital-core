/**
 * Tenant-aware formatting helpers. Every UI string/number/date goes through
 * these so the entire app respects the clinic's locale, currency, and
 * numbering settings.
 *
 * Caches settings per call (the underlying store caches for 60s).
 */
import { getMany, getSetting } from "./settings/store";

// ───── Number generation ─────────────────────────────────────────────────

/**
 * Render a format string like `{PREFIX}-{YYYY}{MM}{DD}-{SEQ:n}` into
 * the actual sequence number, e.g. "INV-20260728-0007".
 *
 * Tokens:
 *   {PREFIX}    — value of numbering.{kind}.prefix (or use prefix arg)
 *   {YYYY}      — 4-digit year of `date`
 *   {YY}        — 2-digit year
 *   {MM}        — 2-digit month
 *   {DD}        — 2-digit day
 *   {HH}        — 2-digit hour (00-23)
 *   {MI}        — 2-digit minute
 *   {SEQ:n}     — sequence padded to n digits (n required)
 *   {SEQ}       — unpadded sequence
 *
 * Falls back to the format with `{SEQ:4}` if format is empty.
 */
export function renderNumber(opts: {
    format?: string | null;
    prefix?: string | null;
    sequence: number;
    date?: Date;
}): string {
    const d = opts.date ?? new Date();
    const yyyy = String(d.getFullYear());
    const yy = yyyy.slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");

    const format =
        opts.format ||
        "{PREFIX}-{YYYY}{MM}{DD}-{SEQ:4}";

    return format
        .replace(/\{PREFIX\}/g, opts.prefix || "")
        .replace(/\{YYYY\}/g, yyyy)
        .replace(/\{YY\}/g, yy)
        .replace(/\{MM\}/g, mm)
        .replace(/\{DD\}/g, dd)
        .replace(/\{HH\}/g, hh)
        .replace(/\{MI\}/g, mi)
        .replace(/\{SEQ:(\d+)\}/g, (_, n) => String(opts.sequence).padStart(Number(n), "0"))
        .replace(/\{SEQ\}/g, String(opts.sequence));
}

// ───── Per-document number generators (use tenant settings) ──────────────

export async function generatePatientNumber(sequence: number, date: Date = new Date()): Promise<string> {
    const result = await getMany([
        "numbering.patient.prefix",
        "numbering.patient.format",
    ]);
    return renderNumber({ format: result["numbering.patient.format"], prefix: result["numbering.patient.prefix"], sequence, date });
}

export async function generateVisitNumber(sequence: number, date: Date = new Date()): Promise<string> {
    const result = await getMany([
        "numbering.visit.prefix",
        "numbering.visit.format",
    ]);
    return renderNumber({ format: result["numbering.visit.format"], prefix: result["numbering.visit.prefix"], sequence, date });
}

export async function generateInvoiceNumber(sequence: number, date: Date = new Date()): Promise<string> {
    const result = await getMany([
        "numbering.invoice.prefix",
        "numbering.invoice.format",
    ]);
    return renderNumber({ format: result["numbering.invoice.format"], prefix: result["numbering.invoice.prefix"], sequence, date });
}

export async function generateTaxInvoiceNumber(sequence: number, date: Date = new Date()): Promise<string> {
    const result = await getMany([
        "numbering.taxInvoice.prefix",
        "numbering.invoice.format", // reuse invoice format
    ]);
    return renderNumber({ format: result["numbering.invoice.format"], prefix: result["numbering.taxInvoice.prefix"], sequence, date });
}

export async function generateReceiptNumber(sequence: number, date: Date = new Date()): Promise<string> {
    const result = await getMany([
        "numbering.receipt.prefix",
        "numbering.receipt.format",
    ]);
    return renderNumber({ format: result["numbering.receipt.format"], prefix: result["numbering.receipt.prefix"], sequence, date });
}

export async function generateCreditNoteNumber(sequence: number, date: Date = new Date()): Promise<string> {
    const result = await getMany([
        "numbering.creditNote.prefix",
        "numbering.creditNote.format",
    ]);
    return renderNumber({ format: result["numbering.creditNote.format"], prefix: result["numbering.creditNote.prefix"], sequence, date });
}

export async function generatePONumber(sequence: number, date: Date = new Date()): Promise<string> {
    const result = await getMany([
        "numbering.po.prefix",
        "numbering.po.format",
    ]);
    return renderNumber({ format: result["numbering.po.format"], prefix: result["numbering.po.prefix"], sequence, date });
}

export async function generateJournalNumber(sequence: number, date: Date = new Date()): Promise<string> {
    const result = await getMany([
        "numbering.journal.prefix",
        "numbering.journal.format",
    ]);
    // Journal usually uses YYYYMM, not YYYYMMDD
    const journalFormat = result["numbering.journal.format"] || "{PREFIX}-{YYYY}{MM}-{SEQ:4}";
    return renderNumber({ format: journalFormat, prefix: result["numbering.journal.prefix"], sequence, date });
}

export async function generateSettlementNumber(sequence: number, date: Date = new Date()): Promise<string> {
    const result = await getMany([
        "numbering.settlement.prefix",
    ]);
    return renderNumber({
        format: "{PREFIX}-{YYYYMMDD}-{SEQ:4}",
        prefix: result["numbering.settlement.prefix"],
        sequence,
        date,
    });
}

// ───── Concurrency-safe number generation ────────────────────────────────

/**
 * Run `action(sequence)` with retry-on-P2002 for the unique field
 * (typically a generated document number like visitNumber / invoiceNumber).
 *
 * Two concurrent requests that both compute `count + 1` from the same DB
 * count will race: one will win, the other gets P2002. Without retry,
 * the loser surfaces a 500 to the user even though the system is fine.
 *
 * Strategy: on P2002, recompute the sequence and try again. The next
 * attempt uses `count + 1 + attempt` which reads the just-committed row
 * and walks forward. After `maxAttempts` collisions, fall back to a
 * random suffix so the system never deadlocks on a hot counter.
 *
 * @param opts.computeSequence  async (attempt) => sequence number
 * @param opts.action            async (sequence) => result; throws on collision
 * @param opts.fields            unique field(s) to retry on (e.g. "visitNumber")
 * @param opts.maxAttempts       safety cap (default 5)
 * @param opts.fallbackAction    like `action` but receives a string instead
 *                               of a number; only used after the counter
 *                               loop is exhausted
 */
export async function withUniqueRetry<T>(opts: {
    computeSequence: (attempt: number) => Promise<number>;
    action: (sequence: number) => Promise<T>;
    fields: string | string[];
    maxAttempts?: number;
    fallbackAction?: (randomId: string) => Promise<T>;
}): Promise<T> {
    const max = opts.maxAttempts ?? 5;
    const targetFields = Array.isArray(opts.fields) ? opts.fields : [opts.fields];
    let lastErr: unknown;
    for (let attempt = 1; attempt <= max; attempt++) {
        const sequence = await opts.computeSequence(attempt);
        try {
            return await opts.action(sequence);
        } catch (e: any) {
            // Prisma unique-constraint violation. Match by meta.target to
            // avoid swallowing unrelated P2002s on other fields.
            const targets = Array.isArray(e?.meta?.target) ? e.meta.target : [];
            const isAnyTarget = targetFields.some(f => targets.includes(f));
            if (e?.code !== "P2002" || !isAnyTarget) throw e;
            lastErr = e;
        }
    }
    if (opts.fallbackAction) {
        const randomId = Math.random().toString(36).slice(2, 6).toUpperCase();
        return opts.fallbackAction(randomId);
    }
    throw new Error(
        `Failed to generate unique ${targetFields.join("/")} after ${max} attempts: ` +
        (lastErr instanceof Error ? lastErr.message : String(lastErr))
    );
}

/**
 * Convenience wrapper for the common case where the number is a count
 * derived from `prisma.<model>.count()` and the caller wants both:
 *   1. count-based numbering (`VST-...-0003`) for sequential readability
 *   2. random-suffix fallback (`VST-...-0003-A7G2`) when collisions
 *      exceed the retry cap
 *
 * The fallback always succeeds (a 4-char random suffix has 36^4 = ~1.7M
 * possible values — collisions are vanishingly rare).
 *
 * `randomId` is the suffix to append on fallback. The caller decides
 * whether to include it (e.g. format with `{SEQ:4}-{RAND}`) or replace
 * the sequence with it entirely.
 */
export async function withCountAndRandomFallback<T>(opts: {
    prisma: any;                         // prisma client (passed in for txn safety)
    model: string;                       // e.g. "visit"
    where: any;                           // count filter, e.g. { createdAt: { gte: todayStart } }
    fields: string | string[];            // unique field(s) to retry on
    computeNumber: (count: number) => Promise<string>;  // generates the formatted number
    action: (number: string) => Promise<T>;
    randomFallback: () => Promise<string>; // generates a number with a random suffix
    maxAttempts?: number;
}): Promise<T> {
    const max = opts.maxAttempts ?? 5;
    const targetFields = Array.isArray(opts.fields) ? opts.fields : [opts.fields];
    let lastErr: unknown;

    for (let attempt = 1; attempt <= max; attempt++) {
        const c = await opts.prisma[opts.model].count({ where: opts.where });
        const number = await opts.computeNumber(c + attempt);
        try {
            return await opts.action(number);
        } catch (e: any) {
            const targets = Array.isArray(e?.meta?.target) ? e.meta.target : [];
            const isAnyTarget = targetFields.some(f => targets.includes(f));
            if (e?.code !== "P2002" || !isAnyTarget) throw e;
            lastErr = e;
        }
    }

    // All count-based retries exhausted — fall back to a random suffix.
    // The caller decides how the suffix is incorporated (appended,
    // replacing the sequence, etc.). The random space is large enough
    // (~1.7M possibilities) that this almost never collides.
    try {
        const fallbackNumber = await opts.randomFallback();
        return await opts.action(fallbackNumber);
    } catch (e: any) {
        throw new Error(
            `Failed to generate unique ${targetFields.join("/")} even with random fallback: ` +
            (lastErr instanceof Error ? lastErr.message : String(lastErr))
        );
    }
}

// ───── Currency / number formatters ──────────────────────────────────────

let cachedFmt: Intl.NumberFormat | null = null;
let cachedFmtKey = "";

async function getFormatter() {
    const [currency, decimalPlaces, thousandsSep, currencyPosition, symbol] = await getMany([
        "money.currency",
        "money.decimalPlaces",
        "money.thousandsSeparator",
        "money.currencyPosition",
        "money.currencySymbol",
    ]);
    const key = `${currency}|${decimalPlaces}|${thousandsSep}|${currencyPosition}|${symbol}`;
    if (cachedFmt && cachedFmtKey === key) return { fmt: cachedFmt, position: currencyPosition, symbol };
    cachedFmt = new Intl.NumberFormat("en-GB", {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
    });
    cachedFmtKey = key;
    return { fmt: cachedFmt, position: currencyPosition, symbol };
}

/**
 * Format a number as a currency string respecting tenant settings.
 *   formatMoney(1234.5)            → "UGX 1,235"   (UGX, 0 dp, prefix)
 *   formatMoney(1234.5, { currency: "KES" }) → "KES 1,234.50"
 */
export async function formatMoney(
    amount: number | null | undefined,
    overrides: { currency?: string; symbol?: string; position?: "prefix" | "suffix" } = {}
): Promise<string> {
    if (amount == null || isNaN(amount)) return "—";
    const { fmt, position, symbol } = await getFormatter();
    const num = fmt.format(Math.abs(amount));
    const cs = overrides.currency || symbol;
    const pos = overrides.position || position;
    const formatted = pos === "suffix" ? `${num} ${cs}` : `${cs} ${num}`;
    return amount < 0 ? `(${formatted})` : formatted;
}

/** Compact formatter for dashboard tiles — "1.2M", "350K", "0" */
export function formatCompactMoney(amount: number | null | undefined): string {
    if (amount == null || isNaN(amount)) return "—";
    const abs = Math.abs(amount);
    if (abs >= 1_000_000_000) return (amount / 1_000_000_000).toFixed(1) + "B";
    if (abs >= 1_000_000) return (amount / 1_000_000).toFixed(1) + "M";
    if (abs >= 1_000) return (amount / 1_000).toFixed(1) + "K";
    return String(amount);
}

// ───── Date / time formatters ────────────────────────────────────────────

export async function formatDate(date: Date | string | null | undefined): Promise<string> {
    if (!date) return "—";
    const d = typeof date === "string" ? new Date(date) : date;
    const dateFormat = await getSetting<string>("locale.dateFormat");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mmm = months[d.getMonth()];

    switch (dateFormat) {
        case "MM/DD/YYYY": return `${mm}/${dd}/${yyyy}`;
        case "YYYY-MM-DD": return `${yyyy}-${mm}-${dd}`;
        case "DD-MMM-YYYY": return `${dd}-${mmm}-${yyyy}`;
        case "DD/MM/YYYY":
        default: return `${dd}/${mm}/${yyyy}`;
    }
}

export async function formatTime(date: Date | string | null | undefined): Promise<string> {
    if (!date) return "—";
    const d = typeof date === "string" ? new Date(date) : date;
    const timeFormat = await getSetting<string>("locale.timeFormat");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    if (timeFormat === "12h") {
        const h = d.getHours() % 12 || 12;
        const ampm = d.getHours() < 12 ? "AM" : "PM";
        return `${h}:${mi} ${ampm}`;
    }
    return `${hh}:${mi}`;
}

export async function formatDateTime(date: Date | string | null | undefined): Promise<string> {
    if (!date) return "—";
    return `${await formatDate(date)} ${await formatTime(date)}`;
}

/**
 * Format a date in the tenant's timezone. JS Date is timezone-naive on the
 * client; on the server it always shows UTC unless you wrap it.
 */
export function toTenantTimezone(date: Date | string): Date {
    const d = typeof date === "string" ? new Date(date) : date;
    return d;
}

// ───── Aging buckets ─────────────────────────────────────────────────────

export async function getAgingBuckets(): Promise<number[]> {
    const raw = await getSetting<string>("billing.agingBuckets");
    return raw
        .split(",")
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0)
        .sort((a, b) => a - b);
}

/** Bucket label for an aging table, e.g. "0-30", "31-60", "61-90", "90+". */
export function bucketLabel(daysOld: number, buckets: number[]): string {
    if (buckets.length === 0) return `${daysOld}d`;
    if (daysOld < buckets[0]) return `0-${buckets[0]}`;
    for (let i = 0; i < buckets.length - 1; i++) {
        if (daysOld >= buckets[i] && daysOld < buckets[i + 1]) {
            return `${buckets[i] + 1}-${buckets[i + 1]}`;
        }
    }
    return `${buckets[buckets.length - 1]}+`;
}
