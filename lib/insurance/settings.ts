/**
 * Insurance feature flag — toggleable per clinic.
 *
 * Each clinic may or may not accept insurance. When the flag is OFF:
 *   - The "Insurance Enrollment" section is hidden on patient creation/edit
 *   - The Insurance card is hidden on the patient profile
 *   - The insurance validation panel is hidden on the visit creation modal
 *   - The visit creation API treats insurance patients as cash
 *   - Cashiers no longer need to validate per visit
 *
 * The flag is stored in the SystemSetting key-value table (single-
 * tenant model). It defaults to `true` so existing clinics continue
 * to work; admins can flip it from the /dashboard/admin/insurance
 * page to disable insurance entirely.
 *
 * 60s in-process cache (same pattern as the rest of the settings
 * store). Use `clearInsuranceFeatureFlagCache()` to bust after
 * admin updates it.
 */
import { prisma } from '../prisma';

const FLAG_KEY = 'insurance.enabled';
const CACHE_MS = 60_000;

// All caches on globalThis so HMR doesn't create per-route copies
const _G = globalThis as any;

function getCached(): { value: boolean; at: number } | null {
    const v = _G.__vital_insuranceEnabled;
    const at = _G.__vital_insuranceEnabledAt;
    if (typeof v === 'boolean' && at && Date.now() - at < CACHE_MS) {
        return { value: v, at };
    }
    return null;
}

function setCached(value: boolean) {
    _G.__vital_insuranceEnabled = value;
    _G.__vital_insuranceEnabledAt = Date.now();
}

export function clearInsuranceFeatureFlagCache() {
    _G.__vital_insuranceEnabled = undefined;
    _G.__vital_insuranceEnabledAt = 0;
}

/**
 * Read the current insurance feature flag. Defaults to `true`
 * (enabled) when no row exists — preserves the existing behavior
 * for clinics that haven't touched the toggle.
 */
export async function isInsuranceEnabled(): Promise<boolean> {
    const cached = getCached();
    if (cached) return cached.value;

    const row = await prisma.systemSetting.findUnique({
        where: { key: FLAG_KEY },
        select: { value: true },
    });
    // Default to `true` (enabled) when no row exists. The `row?.value
    // === 'true'` check is the WRONG default — it returns `false` for
    // both `null` (no row) AND `"false"`, conflating "explicitly off"
    // with "never set". Distinguish the two:
    //   - null  → default to enabled (backward compat)
    //   - "true" → enabled
    //   - anything else (including "false") → disabled
    let value: boolean;
    if (row === null) {
        value = true;
    } else {
        value = row.value === 'true';
    }
    setCached(value);
    return value;
}

/**
 * Admin-only: toggle the insurance feature flag. Pass the desired
 * state explicitly (no toggle-in-place to avoid double-writes).
 */
export async function setInsuranceEnabled(enabled: boolean): Promise<void> {
    await prisma.systemSetting.upsert({
        where: { key: FLAG_KEY },
        create: { key: FLAG_KEY, value: enabled ? 'true' : 'false' },
        update: { value: enabled ? 'true' : 'false' },
    });
    clearInsuranceFeatureFlagCache();
}
