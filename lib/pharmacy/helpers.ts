/**
 * Pharmacy helpers — shared across inventory, dispensing, and reporting.
 * Reads from tenant settings; uses 60s in-process cache.
 */
import { getSetting, getMany } from "../settings/store";

/** Default reorder level for drugs that don't have one explicitly set. */
export async function getDefaultReorderLevel(): Promise<number> {
    return getSetting<number>("pharmacy.defaultReorderLevel", 10);
}

/** Default max stock for new drug batches. */
export async function getDefaultMaxStock(): Promise<number> {
    return getSetting<number>("pharmacy.defaultMaxStock", 100);
}

/** Days-before-expiry to flag as "Expiring Soon" (yellow). */
export async function getExpiryWarningDays(): Promise<number> {
    return getSetting<number>("pharmacy.expiryWarningDays", 90);
}

/** Days-before-expiry to flag as "Critical" (red). */
export async function getExpiryCriticalDays(): Promise<number> {
    return getSetting<number>("pharmacy.expiryCriticalDays", 30);
}

/** Drug markup percent to apply to cost when auto-calculating selling price. */
export async function getDrugMarkupPercent(): Promise<number> {
    return getSetting<number>("pharmacy.drugMarkupPercent", 0);
}

/** Cold chain max temperature (°C). */
export async function getColdChainMaxTemp(): Promise<number> {
    return getSetting<number>("pharmacy.coldChainMaxTempC", 8);
}

/** Cold chain min temperature (°C). */
export async function getColdChainMinTemp(): Promise<number> {
    return getSetting<number>("pharmacy.coldChainMinTempC", 2);
}

/** Whether to use FEFO (First-Expiry-First-Out) by default. */
export async function getUseFEFO(): Promise<boolean> {
    return getSetting<boolean>("pharmacy.useFEFO", true);
}

/** Compute a selling price from cost using the configured markup %. */
export async function applyDrugMarkup(cost: number): Promise<number> {
    const markup = await getDrugMarkupPercent();
    if (!markup) return Math.round(cost);
    return Math.round(cost * (1 + markup / 100));
}

/** Classify a batch's expiry status for UI badges. */
export async function classifyExpiry(expiryDate: Date | string): Promise<"expired" | "critical" | "warning" | "ok"> {
    const now = Date.now();
    const exp = new Date(expiryDate).getTime();
    const daysLeft = Math.ceil((exp - now) / 86400000);
    if (daysLeft <= 0) return "expired";
    const critical = await getExpiryCriticalDays();
    if (daysLeft <= critical) return "critical";
    const warning = await getExpiryWarningDays();
    if (daysLeft <= warning) return "warning";
    return "ok";
}

/** Resolve reorder level for a drug — explicit value or default. */
export async function resolveReorderLevel(explicit?: number | null): Promise<number> {
    if (explicit != null && explicit > 0) return explicit;
    return getDefaultReorderLevel();
}

/** Resolve max stock for a drug. */
export async function resolveMaxStock(explicit?: number | null): Promise<number> {
    if (explicit != null && explicit > 0) return explicit;
    return getDefaultMaxStock();
}

/** Get all pharmacy settings as a single object (for use in scripts / API responses). */
export async function getPharmacyConfig() {
    return getMany([
        "pharmacy.defaultReorderLevel",
        "pharmacy.defaultMaxStock",
        "pharmacy.expiryWarningDays",
        "pharmacy.expiryCriticalDays",
        "pharmacy.drugMarkupPercent",
        "pharmacy.useFEFO",
        "pharmacy.coldChainMaxTempC",
        "pharmacy.coldChainMinTempC",
    ]);
}
