/**
 * Settings Store — read/write TenantSetting rows with a 60s in-process cache.
 *
 * Single-tenant model: there's one Tenant row (singleton). The active tenant
 * is looked up on first use and cached. If the DB has no Tenant, the
 * `ensureDefaultTenant()` helper backfills a default.
 *
 * Usage:
 *   await getSetting("visit.consultationFee")            // typed value
 *   await getSetting("visit.consultationFee", 75000)     // with override
 *   await getMany(["money.currency", "locale.timezone"]) // batch
 *   await setSettings({ "money.currency": "KES" })       // write
 *   await getAllSettings()                              // full map
 */
import { prisma } from "../prisma";
import {
    SettingDef,
    SETTINGS_BY_KEY,
    SETTINGS_REGISTRY,
    defaultFor,
    parseSettingValue,
} from "./registry";

// ── Tenant resolution ────────────────────────────────────────────────────
//
// All caches live in globalThis. In Next.js dev mode each route can have
// its own module instance (HMR), so module-level `let` would create
// separate caches per route. Using globalThis everywhere means every
// module instance shares the same cache.
const _G = globalThis as any;
const TENANT_CACHE_MS = 30_000;

function getCachedTenantId(): { id: string; at: number } | null {
    const id = _G.__vital_tenantId;
    const at = _G.__vital_tenantIdAt;
    if (id && at && Date.now() - at < TENANT_CACHE_MS) return { id, at };
    return null;
}

function setCachedTenantId(id: string | null) {
    if (id) {
        _G.__vital_tenantId = id;
        _G.__vital_tenantIdAt = Date.now();
    } else {
        _G.__vital_tenantId = null;
        _G.__vital_tenantIdAt = 0;
    }
}

export async function getDefaultTenantId(): Promise<string> {
    const cached = getCachedTenantId();
    if (cached) return cached.id;
    let t = await prisma.tenant.findFirst({
        where: { code: "DEFAULT" },
        select: { id: true },
    });
    if (!t) {
        t = await ensureDefaultTenant();
    }
    setCachedTenantId(t.id);
    return t.id;
}

export function clearTenantCache() {
    setCachedTenantId(null);
}

export async function ensureDefaultTenant(): Promise<{ id: string; name: string }> {
    const existing = await prisma.tenant.findFirst({ where: { code: "DEFAULT" } });
    if (existing) return existing;

    // Backfill from any SystemSetting clinic name if present
    const clinicNameRow = await prisma.systemSetting.findUnique({
        where: { key: "clinicName" },
    });

    const t = await prisma.tenant.create({
        data: {
            code: "DEFAULT",
            name: clinicNameRow?.value || "VitalCore Clinic",
        },
    });
    return t;
}

// ── Settings cache ───────────────────────────────────────────────────────
//
// The settings table is small (one row per setting). A DB read on every
// settings access is fast enough. We don't cache in memory because:
//   1. Next.js dev mode creates separate module instances per route (HMR),
//      which breaks in-memory caching.
//   2. The settings table is rarely read in a hot loop.
//   3. The cost of always reading is ~1ms per call.
//
// The tenant ID IS cached (it never changes during the process lifetime).
type SettingsMap = Record<string, string>;

export async function loadSettingsCache(_force = false): Promise<{ tenantId: string; values: SettingsMap }> {
    const tenantId = await getDefaultTenantId();

    const [rows, tenant] = await Promise.all([
        prisma.tenantSetting.findMany({ where: { tenantId } }),
        prisma.tenant.findUnique({ where: { id: tenantId } }),
    ]);

    const values: SettingsMap = {};

    // Seed registry defaults
    for (const def of SETTINGS_REGISTRY) {
        values[def.key] = def.defaultValue;
    }

    // Tenant row-level defaults (the most authoritative)
    // Guard: a Tenant column may hold a legacy "plain text" default
    // (e.g. "PREFIX-YYYYMMDD-####" without {…} tokens). If a column value
    // for a *format* key lacks token markers, ignore it and keep the
    // registry's tokenized default — otherwise `renderNumber` would emit
    // the literal string and break every generated number.
    if (tenant) {
        for (const def of SETTINGS_REGISTRY) {
            const tenantValue = (tenant as any)[tenantKeyFor(def.key)];
            if (tenantValue === undefined || tenantValue === null) continue;
            const str = String(tenantValue);
            if (def.key.endsWith(".format") && !str.includes("{")) continue;
            values[def.key] = str;
        }
    }

    // DB-stored TenantSetting rows override everything
    for (const row of rows) {
        values[row.key] = row.value;
    }

    return { tenantId, values };
}

/** Which Tenant columns are numeric (Int or Float). */
const prismaIntColumns = new Set([
    "firstDayOfWeek",
    "decimalPlaces",
    "fiscalYearStartMonth",
    "consultationFee",
    "followUpWindowDays",
    "emergencyFee",
    "scheduledFee",
    "defaultAppointmentDuration",
    "appointmentBufferMinutes",
    "defaultReorderLevel",
    "defaultMaxStock",
    "expiryWarningDays",
    "expiryCriticalDays",
    "defaultTaxRate",
    "auditRetentionDays",
    "backdateLimitDays",
    "defaultPageSize",
]);

/** Maps a registry key to the corresponding column on Tenant (if any). */
function tenantKeyFor(key: string): string | null {
    const map: Record<string, string> = {
        "money.currency": "currency",
        "money.currencyPosition": "currencyPosition",
        "money.decimalPlaces": "decimalPlaces",
        "locale.timezone": "timezone",
        "locale.dateFormat": "dateFormat",
        "locale.timeFormat": "timeFormat",
        "locale.firstDayOfWeek": "firstDayOfWeek",
        "visit.consultationFee": "consultationFee",
        "visit.followUpWindowDays": "followUpWindowDays",
        "visit.emergencyFee": "emergencyFee",
        "visit.scheduledFee": "scheduledFee",
        "numbering.patient.prefix": "patientNumberPrefix",
        "numbering.visit.prefix": "visitNumberPrefix",
        "numbering.invoice.prefix": "invoicePrefix",
        "numbering.receipt.prefix": "receiptPrefix",
        "numbering.creditNote.prefix": "creditNotePrefix",
        "numbering.po.prefix": "poPrefix",
        "numbering.journal.prefix": "journalPrefix",
        "numbering.claim.prefix": "claimPrefix",
        "pharmacy.defaultReorderLevel": "defaultReorderLevel",
        "pharmacy.defaultMaxStock": "defaultMaxStock",
        "pharmacy.expiryWarningDays": "expiryWarningDays",
        "pharmacy.expiryCriticalDays": "expiryCriticalDays",
        "finance.fiscalYearStartMonth": "fiscalYearStartMonth",
        "finance.defaultTaxRate": "defaultTaxRate",
        "appointment.defaultDuration": "defaultAppointmentDuration",
        "appointment.bufferMinutes": "appointmentBufferMinutes",
        "appointment.workingHoursStart": "workingHoursStart",
        "appointment.workingHoursEnd": "workingHoursEnd",
        "clinic.primaryColor": "primaryColor",
        "clinic.accentColor": "accentColor",
        "clinic.reportFont": "reportFont",
        "limits.defaultPageSize": "defaultPageSize",
        "security.auditRetentionDays": "auditRetentionDays",
        "clinic.taxId": "taxId",
        "clinic.registrationNumber": "registrationNumber",
    };
    return map[key] || null;
}

export function clearSettingsCache() {
    // No-op: settings are now read directly from DB on each call.
    // Kept for API compat with existing call sites.
}

// ── Public read API ──────────────────────────────────────────────────────

/**
 * Get a typed setting value. Falls back to registry default if not in DB.
 * If `override` is provided, it's returned as-is (used for tests / one-off lookups).
 */
export async function getSetting<T = any>(key: string, override?: T): Promise<T> {
    if (override !== undefined) return override;
    const def = SETTINGS_BY_KEY.get(key);
    if (!def) {
        const { values } = await loadSettingsCache();
        return values[key] as any;
    }
    const { values } = await loadSettingsCache();
    return parseSettingValue(def, values[key]) as T;
}

/** Get several settings at once, returning a plain object keyed by setting key. */
export async function getMany<K extends string>(keys: K[]): Promise<Record<K, any>> {
    const { values } = await loadSettingsCache();
    const out: any = {};
    for (const key of keys) {
        const def = SETTINGS_BY_KEY.get(key);
        out[key] = parseSettingValue(def, values[key]);
    }
    return out;
}

/** Get all settings, grouped by category. Sensitive values are masked. */
export async function getAllSettings(opts: { includeSensitive?: boolean } = {}): Promise<{
    tenant: Record<string, any>;
    settings: Record<string, any>;
    byCategory: Record<string, Record<string, any>>;
}> {
    const tenantId = await getDefaultTenantId();
    const { values } = await loadSettingsCache();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    const out: Record<string, any> = {};
    const byCategory: Record<string, Record<string, any>> = {};

    for (const def of SETTINGS_REGISTRY) {
        if (def.sensitive && !opts.includeSensitive) {
            out[def.key] = values[def.key] ? "********" : "";
        } else {
            out[def.key] = parseSettingValue(def, values[def.key]);
        }
        if (!byCategory[def.category]) byCategory[def.category] = {};
        byCategory[def.category][def.key] = out[def.key];
    }

    return { tenant: tenant || {}, settings: out, byCategory };
}

/** Get the full Tenant row (for branding/identity). */
export async function getTenant() {
    const tenantId = await getDefaultTenantId();
    return prisma.tenant.findUnique({ where: { id: tenantId } });
}

// ── Public write API ─────────────────────────────────────────────────────

export type SettingWrite = { key: string; value: string };

/**
 * Validate + persist a batch of settings. Throws on invalid values.
 * Busts the in-process cache on success.
 */
export async function setSettings(writes: SettingWrite[]): Promise<{ updated: number; errors: string[] }> {
    const tenantId = await getDefaultTenantId();
    const errors: string[] = [];

    for (const { key, value } of writes) {
        const def = SETTINGS_BY_KEY.get(key);
        if (!def) {
            errors.push(`Unknown setting: ${key}`);
            continue;
        }
        const err = validateSetting(def, value);
        if (err) {
            errors.push(`${key}: ${err}`);
        }
    }
    if (errors.length > 0) {
        return { updated: 0, errors };
    }

    // Split: Tenant-column writes vs TenantSetting-row writes
    const tenantUpdates: Record<string, any> = {};
    const rowWrites: SettingWrite[] = [];

    for (const { key, value } of writes) {
        const col = tenantKeyFor(key);
        if (col) {
            const def = SETTINGS_BY_KEY.get(key)!;
            // Convert value to the correct type for the Tenant column.
            // For ENUM we need to coerce the string to the column's underlying type.
            if (def.valueType === "NUMBER") {
                tenantUpdates[col] = Number(value);
            } else if (def.valueType === "BOOLEAN") {
                tenantUpdates[col] = value === "true" || value === "1";
            } else {
                // ENUM or STRING — try to coerce to Int/Number for known numeric columns,
                // otherwise keep as string.
                const tSchema = prismaIntColumns.has(col) ? Number(value) : value;
                tenantUpdates[col] = tSchema;
            }
        } else {
            rowWrites.push({ key, value });
        }
    }

    if (Object.keys(tenantUpdates).length > 0) {
        await prisma.tenant.update({ where: { id: tenantId }, data: tenantUpdates });
    }

    if (rowWrites.length > 0) {
        for (const w of rowWrites) {
            const def = SETTINGS_BY_KEY.get(w.key)!;
            await prisma.tenantSetting.upsert({
                where: { tenantId_key: { tenantId, key: w.key } },
                update: { value: w.value, valueType: def.valueType, category: def.category },
                create: {
                    tenantId,
                    key: w.key,
                    value: w.value,
                    valueType: def.valueType,
                    category: def.category,
                    description: def.description,
                },
            });
        }
    }

    clearSettingsCache();
    clearTenantCache();
    return { updated: writes.length - errors.length, errors: [] };
}

/** Update identity fields on the Tenant row directly. */
export async function updateTenant(data: Record<string, any>) {
    const tenantId = await getDefaultTenantId();
    const allowed = [
        "name", "shortName", "address", "city", "region", "country",
        "phone", "email", "website", "taxId", "registrationNumber",
        "licenseExpiry", "logoUrl", "faviconUrl",
        "primaryColor", "accentColor", "reportFont",
        "timezone", "dateFormat", "timeFormat", "locale", "firstDayOfWeek",
        "currency", "currencyPosition", "decimalPlaces",
        "fiscalYearStartMonth", "cogsAccountCode", "defaultTaxRate",
        "patientNumberPrefix", "patientNumberFormat",
        "visitNumberPrefix", "visitNumberFormat",
        "invoicePrefix", "invoiceFormat",
        "receiptPrefix", "receiptFormat",
        "creditNotePrefix", "creditNoteFormat",
        "poPrefix", "poFormat",
        "journalPrefix", "journalFormat",
        "claimPrefix", "claimFormat",
        "agingBuckets",
        "consultationFee", "followUpWindowDays", "emergencyFee", "scheduledFee",
        "defaultAppointmentDuration", "appointmentBufferMinutes",
        "workingHoursStart", "workingHoursEnd",
        "defaultReorderLevel", "defaultMaxStock", "expiryWarningDays", "expiryCriticalDays",
        "drugMarkupPercent",
        "autoWriteoffThreshold", "auditRetentionDays",
        "backdateLimitDays", "defaultPageSize",
    ];
    const clean: Record<string, any> = {};
    for (const k of Object.keys(data)) {
        if (allowed.includes(k)) clean[k] = data[k];
    }
    if (Object.keys(clean).length === 0) return null;
    const updated = await prisma.tenant.update({ where: { id: tenantId }, data: clean });
    clearSettingsCache();
    return updated;
}

// ── Validation ───────────────────────────────────────────────────────────

export function validateSetting(def: SettingDef, raw: string): string | null {
    if (def.valueType === "BOOLEAN") {
        if (raw !== "true" && raw !== "false" && raw !== "1" && raw !== "0") {
            return "must be 'true' or 'false'";
        }
    } else if (def.valueType === "NUMBER") {
        const n = Number(raw);
        if (!Number.isFinite(n)) return "must be a number";
        if (def.min !== undefined && n < def.min) return `must be ≥ ${def.min}`;
        if (def.max !== undefined && n > def.max) return `must be ≤ ${def.max}`;
    } else if (def.valueType === "ENUM") {
        if (def.enumOptions && !def.enumOptions.includes(raw)) {
            return `must be one of: ${def.enumOptions.join(", ")}`;
        }
    } else if (def.valueType === "JSON") {
        try {
            JSON.parse(raw);
        } catch {
            return "must be valid JSON";
        }
    }
    return null;
}
