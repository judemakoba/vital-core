/**
 * Finance helpers — tenant-configured accounting defaults.
 */
import { getSetting, getMany } from "../settings/store";

/** First month of fiscal year (1=Jan ... 12=Dec). Default: 7 (July, EAC). */
export async function getFiscalYearStartMonth(): Promise<number> {
    const v = await getSetting<number>("finance.fiscalYearStartMonth", 7);
    return Math.max(1, Math.min(12, Number(v) || 7));
}

/** COGS account code (Dr 5110 when inventory is dispensed). */
export async function getCogsAccountCode(): Promise<string> {
    return getSetting<string>("billing.cogsAccountCode", "5110");
}

/** Contractual allowance account code (Dr 4220 for underpayments). */
export async function getContractualAllowanceAccountCode(): Promise<string> {
    return getSetting<string>("billing.contractualAllowanceAccountCode", "4220");
}

/** Bad debt account code (Dr 5430 for write-offs). */
export async function getBadDebtAccountCode(): Promise<string> {
    return getSetting<string>("billing.badDebtAccountCode", "5430");
}

/** Auto-write-off threshold (outstanding balances below this are written off immediately). */
export async function getAutoWriteoffThreshold(): Promise<number> {
    return getSetting<number>("billing.autoWriteoffThreshold", 5000);
}

/** Default tax rate (%). */
export async function getDefaultTaxRate(): Promise<number> {
    const v = await getSetting<number>("finance.defaultTaxRate", 0);
    return Math.max(0, Math.min(100, Number(v) || 0));
}

/** Accounting decimal places (typically 2 even for UGX, for GL posting). */
export async function getAccountingDecimals(): Promise<number> {
    return getSetting<number>("finance.decimalPlaces", 2);
}

/** Backdate limit (days). 0 = unlimited. */
export async function getBackdateLimitDays(): Promise<number> {
    return getSetting<number>("finance.backdateLimitDays", 7);
}

/** Returns the start date of the fiscal year containing the given date. */
export async function getFiscalYearStart(date: Date = new Date()): Promise<Date> {
    const startMonth = await getFiscalYearStartMonth();
    const y = date.getFullYear();
    const m = date.getMonth() + 1; // 1-based
    const fyStartYear = m >= startMonth ? y : y - 1;
    return new Date(fyStartYear, startMonth - 1, 1, 0, 0, 0, 0);
}

/** Returns the end date of the fiscal year containing the given date. */
export async function getFiscalYearEnd(date: Date = new Date()): Promise<Date> {
    const start = await getFiscalYearStart(date);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    end.setMilliseconds(-1);
    return end;
}

/** Throws if `date` is older than the backdate limit. */
export async function assertNotBackdated(date: Date | string): Promise<void> {
    const limit = await getBackdateLimitDays();
    if (limit <= 0) return;
    const d = typeof date === "string" ? new Date(date) : date;
    const days = (Date.now() - d.getTime()) / 86400000;
    if (days > limit) {
        throw new Error(`Backdate limit exceeded: ${Math.floor(days)} days old, max ${limit} days`);
    }
}

/** Allowed payment methods (comma-separated PaymentMethod values). */
export async function getAllowedPaymentMethods(): Promise<string[]> {
    const raw = await getSetting<string>("billing.allowedPaymentMethods", "CASH,MOBILE_MONEY,CARD,BANK_TRANSFER,CHEQUE");
    return raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
}
