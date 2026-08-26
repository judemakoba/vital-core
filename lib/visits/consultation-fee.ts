/**
 * Visit Consultation Fee Logic
 *
 * Centralized rules for whether a new visit triggers the auto-consultation-fee
 * at creation time, and how much that fee should be.
 *
 * Primary source: `ConsultationFeeCategory` rows (multi-tier pricing).
 *   - Each tier has a name, fee, comma-separated visitTypes, and a
 *     `isDefault` flag (at most one default per (tenant, visitType) bucket).
 *   - Tenant-scoped tiers override global (tenantId=null) tiers.
 *   - When picking a fee for a visit type, the system prefers the
 *     tier explicitly chosen by the caller (via `categoryId` on the
 *     visit), or falls back to the default tier for that type.
 *
 * Fallback: legacy `visit.consultationFee` / `visit.emergencyFee` /
 * `visit.scheduledFee` settings on the Tenant row, used when no
 * `ConsultationFeeCategory` row matches.
 *
 * Other settings (TenantSetting):
 *   - visit.followUpWindowDays: how recent a prior visit must be to default to FOLLOW_UP
 *   - visit.billableTypes: comma-separated VisitType values that get charged
 *
 * Non-billable types by default: FOLLOW_UP, LAB_REVIEW, VACCINATION, ANTENATAL
 * (configured by `visit.billableTypes`).
 *
 * Note: the insurance module was removed in 2026-08. The previous
 * `getVisitInsuranceStatus()` and `shouldDeferConsultationFeeToClaim()`
 * (per-insurance negotiated fee, deferred-to-claim flow) are gone.
 * All patients are cash-only.
 */
import { prisma } from '../prisma';
import { VisitType } from '../generated-prisma';
import { getSetting, getMany, clearSettingsCache } from '../settings/store';

const DEFAULT_BILLABLE_TYPES = ['OPD', 'EMERGENCY', 'SCHEDULED', 'OTHER'];

/**
 * Read the current consultation fee and follow-up window from TenantSetting,
 * with hard-coded fallbacks and a 60s in-process cache (managed by store.ts).
 */
export async function getVisitSettings(): Promise<{ consultationFee: number; followUpWindowDays: number }> {
    const { fee, window } = await getMany(['visit.consultationFee', 'visit.followUpWindowDays']);
    return {
        consultationFee: Number(fee) || 50000,
        followUpWindowDays: Number(window) || 14,
    };
}

/**
 * Resolve the fee to charge for a visit, given:
 *   - the visit type
 *   - an optional categoryId (caller's explicit pick from the admin UI)
 *   - the tenantId (so we pick the right scope)
 *
 * Resolution order:
 *   1. Explicit categoryId if provided and matches the visit type
 *   2. The default tier for (tenantId, visitType) if exactly one
 *   3. The first matching tier (any isDefault=false is also fine if
 *      the caller has been explicit)
 *   4. The legacy per-type setting (visit.emergencyFee / scheduledFee)
 *   5. The legacy base setting (visit.consultationFee, default 50000)
 */
export async function getConsultationFeeForType(
    type: VisitType | string | null | undefined,
    opts?: { tenantId?: string | null; categoryId?: string | null }
): Promise<number> {
    const t = String(type || '').toUpperCase();
    const tenantId = opts?.tenantId ?? null;
    const explicitCategoryId = opts?.categoryId ?? null;

    // 1. Explicit categoryId
    if (explicitCategoryId) {
        const tier = await prisma.consultationFeeCategory.findUnique({ where: { id: explicitCategoryId } });
        if (tier && tier.isActive && tierMatchesType(tier, t)) {
            return tier.fee;
        }
        // Fall through if the explicit tier is missing/inactive/wrong-type
    }

    // 2-3. Pick a tier by visit type for the tenant
    if (t) {
        const tiers = await prisma.consultationFeeCategory.findMany({
            where: {
                isActive: true,
                visitTypes: { contains: t },
                OR: [{ tenantId: tenantId ?? null }, ...(tenantId ? [{ tenantId: null }] : [])],
            },
            orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { fee: "asc" }],
            take: 1,
        });
        if (tiers.length > 0) return tiers[0].fee;
    }

    // 4-5. Legacy settings
    const settings = await getMany(['visit.consultationFee', 'visit.emergencyFee', 'visit.scheduledFee']);
    const base = Number(settings['visit.consultationFee']) || 50000;
    if (t === 'EMERGENCY' && settings['visit.emergencyFee']) {
        return Number(settings['visit.emergencyFee']) || base;
    }
    if (t === 'SCHEDULED' && settings['visit.scheduledFee']) {
        return Number(settings['visit.scheduledFee']) || base;
    }
    return base;
}

/**
 * Helper: does the tier's visitTypes CSV include the given type?
 */
export function tierMatchesType(tier: { visitTypes: string }, type: string): boolean {
    if (!tier.visitTypes || !type) return false;
    return tier.visitTypes
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .includes(type);
}

/**
 * List the active fee tiers that apply to a given visit type, in the
 * order the UI should display them. Tenant-scoped first, then global.
 * Returns an empty array if the tenant has no tiers configured.
 */
export async function listConsultationFeeTiers(
    tenantId: string | null | undefined,
    visitType?: string
): Promise<
    Array<{
        id: string;
        name: string;
        fee: number;
        visitTypes: string;
        description: string | null;
        isDefault: boolean;
        isActive: boolean;
        sortOrder: number;
    }>
> {
    const t = visitType ? String(visitType).toUpperCase() : null;
    const tiers = await prisma.consultationFeeCategory.findMany({
        where: {
            isActive: true,
            OR: [{ tenantId: tenantId ?? null }, ...(tenantId ? [{ tenantId: null }] : [])],
            ...(t ? { visitTypes: { contains: t } } : {}),
        },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { fee: "asc" }],
    });
    return tiers;
}

/**
 * Resolve the consultation fee for a NEW visit.
 * Always uses the global setting (per visit type) — no per-insurance override.
 */
export async function getConsultationFeeForNewVisit(
    _prismaClient: any,
    _patientId: string,
    visitType: VisitType | string
): Promise<{ fee: number; source: 'global'; insuranceName?: undefined }> {
    const fee = await getConsultationFeeForType(visitType);
    return { fee, source: 'global' };
}

/** Force a re-read on the next call (delegated to settings store). */
export function clearVisitSettingsCache() {
    clearSettingsCache();
}

/** Backwards-compat: still exported as a constant for any old imports. */
export const CONSULTATION_FEE = 50000;

/**
 * Direct-service visit types per the consolidated spec (R45). These skip
 * triage + consultation entirely and go straight to DirectServicePending.
 * They are NEVER billable for a consultation fee.
 */
export const DIRECT_SERVICE_VISIT_TYPES: string[] = ['LAB_ONLY', 'RADIOLOGY_ONLY', 'PRESCRIPTION_ONLY'];

export function isDirectServiceVisitType(type: VisitType | string | null | undefined): boolean {
    if (!type) return false;
    return DIRECT_SERVICE_VISIT_TYPES.includes(String(type).toUpperCase());
}

export async function isBillableVisitType(type: VisitType | string | null | undefined): Promise<boolean> {
    if (!type) return true; // default: charge
    const t = String(type).toUpperCase();
    // Direct-service types are never billable for consultation (no consult happens)
    if (DIRECT_SERVICE_VISIT_TYPES.includes(t)) return false;
    // Read configured billable types (default: OPD, EMERGENCY, SCHEDULED, OTHER)
    const raw = await getSetting<string>('visit.billableTypes', DEFAULT_BILLABLE_TYPES.join(','));
    const billable = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (billable.length === 0) return DEFAULT_BILLABLE_TYPES.includes(t);
    return billable.includes(t);
}

export function getConsultationFeeDescription(type: VisitType | string | null | undefined): string {
    const t = type ? String(type).toUpperCase() : 'OPD';
    switch (t) {
        case 'SCHEDULED':  return 'Consultation Fee (Scheduled Visit)';
        case 'EMERGENCY':  return 'Consultation Fee (Emergency)';
        case 'FOLLOW_UP':  return 'Consultation Fee (Follow-up)';
        case 'LAB_REVIEW': return 'Consultation Fee (Lab Review)';
        case 'VACCINATION': return 'Consultation Fee (Vaccination)';
        case 'ANTENATAL':  return 'Consultation Fee (Antenatal)';
        case 'LAB_ONLY':          return 'Lab Test Service Charge';
        case 'RADIOLOGY_ONLY':    return 'Radiology Service Charge';
        case 'PRESCRIPTION_ONLY': return 'Prescription Dispensing Fee';
        case 'OTHER':      return 'Consultation Fee';
        case 'OPD':
        default:           return 'Consultation Fee (OPD)';
    }
}

/**
 * Look at a patient's recent visit history and suggest a VisitType.
 * - Last visit within `followUpWindowDays` (settings) → likely FOLLOW_UP
 * - Otherwise → OPD
 *
 * Returns the suggested type + a human-readable reason + the last visit (if any).
 */
export async function suggestVisitTypeForPatient(
    prismaClient: any,
    patientId: string
): Promise<{
    suggestedType: VisitType;
    reason: string;
    lastVisit: { id: string; visitNumber: string; createdAt: Date; type: string } | null;
    followUpWindowDays: number;
}> {
    const { followUpWindowDays } = await getVisitSettings();
    const lastVisit = await prismaClient.visit.findFirst({
        where: { patientId },
        orderBy: { checkInTime: 'desc' },
        select: { id: true, visitNumber: true, createdAt: true, checkInTime: true, type: true, chiefComplaint: true },
    });

    if (!lastVisit) {
        return { suggestedType: 'OPD', reason: 'No previous visits on record', lastVisit: null, followUpWindowDays };
    }

    const refDate = lastVisit.checkInTime || lastVisit.createdAt;
    const daysAgo = Math.floor((Date.now() - new Date(refDate).getTime()) / 86400000);

    if (followUpWindowDays > 0 && daysAgo <= followUpWindowDays) {
        return {
            suggestedType: 'FOLLOW_UP',
            reason: `Last visit was ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago (${lastVisit.visitNumber}) — likely a follow-up. No consult fee will be charged.`,
            lastVisit: { ...lastVisit, type: lastVisit.type },
            followUpWindowDays,
        };
    }

    return {
        suggestedType: 'OPD',
        reason: `Last visit was ${daysAgo} days ago — over the ${followUpWindowDays}-day follow-up window. Defaulting to new consultation.`,
        lastVisit: { ...lastVisit, type: lastVisit.type },
        followUpWindowDays,
    };
}
