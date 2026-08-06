/**
 * Visit Consultation Fee Logic
 *
 * Centralized rules for whether a new visit triggers the auto-consultation-fee
 * at creation time, and how much that fee should be.
 *
 * Settings (read from TenantSetting on each call, with fallback defaults):
 *   - visit.consultationFee: amount charged for billable visit types
 *   - visit.emergencyFee / visit.scheduledFee: per-type overrides
 *   - visit.followUpWindowDays: how recent a prior visit must be to default to FOLLOW_UP
 *   - visit.billableTypes: comma-separated VisitType values that get charged
 *
 * Non-billable types by default: FOLLOW_UP, LAB_REVIEW, VACCINATION, ANTENATAL
 * (configured by `visit.billableTypes`).
 */
import { prisma } from '../prisma';
import { VisitType } from '../generated-prisma';
import { getSetting, getMany, clearSettingsCache } from '../settings/store';
import { isInsuranceEnabled } from '../insurance/settings';

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
 * Pick the right consultation fee for a given visit type.
 * EMERGENCY uses emergencyFee, SCHEDULED uses scheduledFee, anything else uses consultationFee.
 */
export async function getConsultationFeeForType(type: VisitType | string | null | undefined): Promise<number> {
    const t = String(type || '').toUpperCase();
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
 * Resolve the consultation fee for a NEW visit, taking per-insurance override into account.
 * If the patient is enrolled with an active insurance company that has a custom consultationFee,
 * that fee is used. Otherwise the global setting (per visit type) is used.
 */
export async function getConsultationFeeForNewVisit(
    prismaClient: any,
    patientId: string,
    visitType: VisitType | string
): Promise<{ fee: number; source: 'insurance' | 'global'; insuranceName?: string }> {
    const eligibility = await getVisitInsuranceStatus(patientId);
    if (eligibility.verified && eligibility.insurance) {
        const ins = await prismaClient.insuranceCompany.findUnique({
            where: { id: eligibility.insurance.id },
            select: { consultationFee: true, name: true }
        });
        if (ins?.consultationFee != null && Number(ins.consultationFee) > 0) {
            return { fee: Number(ins.consultationFee), source: 'insurance', insuranceName: ins.name };
        }
    }
    const fee = await getConsultationFeeForType(visitType);
    return { fee, source: 'global' };
}

/**
 * Per the consolidated visit cycle spec (R45), the visit creation flow needs
 * to do insurance validation up-front. If the patient is verified, the
 * consultation fee is DEFERRED to the FINAL- invoice (which the cashier
 * submits as a claim at end of visit). If not, the patient is treated as
 * cash and the existing consultation fee invoice is issued at check-in.
 *
 * This helper is a thin wrapper over the existing `getInsuranceEligibility`
 * that flattens the result into a quick-to-destructure shape for the
 * visit route. We import the eligibility helper lazily to avoid a
 * server-only ↔ client-only import boundary issue.
 */
export type InsuranceVerificationForVisit =
    | { verified: true; insurance: { id: string; name: string; code: string; consultationFee: number | null } }
    | { verified: false; reason: string };

export async function getVisitInsuranceStatus(patientId: string): Promise<InsuranceVerificationForVisit> {
    // R49c: when the insurance feature is disabled for this clinic,
    // every patient is treated as cash. Even if the patient has an
    // active enrollment on file, the visit cycle should never apply
    // the per-insurance negotiated fee or defer the consultation
    // fee. Returning verified:false here means:
    //   - `getConsultationFeeForNewVisit` falls back to the global
    //     consultation fee (per-visit-type)
    //   - any downstream `shouldDeferConsultationFeeToClaim` call
    //     also short-circuits (we add an explicit guard there too)
    // Without this guard, an old APPROVED InsuranceVerification row
    // from before the toggle was flipped would still trigger the
    // insurance path even though the clinic has insurance OFF.
    if (!await isInsuranceEnabled()) {
        return { verified: false, reason: 'Insurance feature is disabled for this clinic.' };
    }

    const { getInsuranceEligibility } = await import('../insurance/eligibility');
    const result = await getInsuranceEligibility(patientId);
    if (!result.eligible || !result.enrollment) {
        return { verified: false, reason: result.reason };
    }
    // Look up the negotiated consultation fee on the insurance record.
    // We do it here (instead of in getConsultationFeeForNewVisit) so the
    // visit route gets the fee + the insurance details in one round-trip.
    const ins = await prisma.insuranceCompany.findUnique({
        where: { id: result.enrollment.insuranceId },
        select: { id: true, name: true, code: true, consultationFee: true },
    });
    if (!ins) {
        return { verified: false, reason: 'Insurance provider record not found.' };
    }
    return {
        verified: true,
        insurance: { id: ins.id, name: ins.name, code: ins.code, consultationFee: ins.consultationFee },
    };
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
 * Determine whether a visit's consultation fee should be DEFERRED to the
 * FINAL- invoice (instead of being issued as a separate invoice at visit
 * creation). R47: this now checks the InsuranceVerification table for
 * an APPROVED entry for this visit. If the visit has been verified
 * (APPROVED) by the third-party system, the fee is deferred. If the
 * verification was denied or hasn't happened yet, no deferral.
 *
 * Logic:
 *   - Look up the visit. If it has any invoice item with itemType
 *     "Consultation" already, the consultation fee is settled (cash
 *     path already paid, or insurance path already invoiced). No
 *     deferral needed.
 *   - Look up the most recent InsuranceVerification for this visit.
 *     If status is APPROVED, defer. Otherwise no deferral.
 *   - Non-billable visit types and direct-service types have no
 *     consultation fee to defer.
 *
 * The caller is responsible for actually adding the line item. This
 * helper just decides if/when.
 */
export type DeferredConsultationFee =
    | { defer: true; fee: number; insuranceName: string; visitType: VisitType | string }
    | { defer: false; reason: string };

export async function shouldDeferConsultationFeeToClaim(
    prismaClient: any,
    visitId: string
): Promise<DeferredConsultationFee> {
    // R49c: when insurance is disabled globally, never defer. Even
    // an old APPROVED InsuranceVerification row from before the
    // toggle was flipped should not cause the consultation fee to
    // be added as a "deferred to claim" line item — the clinic has
    // opted out of insurance, the patient is cash for the whole
    // visit. Without this check, the order-placement routes would
    // happily add a "(deferred to claim — AAR Insurance)" line item
    // and the cashier would have to manually remove it before
    // payment. Better to short-circuit here.
    if (!await isInsuranceEnabled()) {
        return { defer: false, reason: 'Insurance feature is disabled for this clinic.' };
    }

    const visit = await prismaClient.visit.findUnique({
        where: { id: visitId },
        select: { id: true, type: true, patientId: true },
    });
    if (!visit) return { defer: false, reason: 'Visit not found.' };

    // Already have a consultation item on some invoice? Then the fee
    // was already settled (cash) or already invoiced (insurance
    // approved but invoiced separately — shouldn't normally happen).
    const existingConsultItem = await prismaClient.invoiceItem.findFirst({
        where: {
            itemType: 'Consultation',
            invoice: { visitId },
        },
        select: { id: true, invoiceId: true },
    });
    if (existingConsultItem) {
        return { defer: false, reason: 'Consultation fee already settled on a separate invoice.' };
    }

    // Non-billable visit type (FOLLOW_UP, VACCINATION, ANTENATAL,
    // LAB_REVIEW, direct service)? Then there's no consultation fee
    // to defer in the first place.
    if (!isBillableVisitType(visit.type)) {
        return { defer: false, reason: `Visit type ${visit.type} is not billable for consultation fee.` };
    }
    if (isDirectServiceVisitType(visit.type)) {
        return { defer: false, reason: `Visit type ${visit.type} skips consultation entirely.` };
    }

    // R47: require an APPROVED InsuranceVerification row for this visit.
    const lastVerification = await prismaClient.insuranceVerification.findFirst({
        where: { visitId },
        orderBy: { createdAt: 'desc' },
        select: { status: true, insurance: { select: { name: true } } },
    });
    if (!lastVerification || lastVerification.status !== 'APPROVED') {
        return {
            defer: false,
            reason: lastVerification
                ? `Last verification was ${lastVerification.status} — insurance not approved for this visit.`
                : 'No insurance verification recorded for this visit. Cashier must validate insurance first.',
        };
    }

    // Resolve the negotiated fee (per-insurance override) so the
    // claim line matches the same amount the cash patient would have
    // been invoiced.
    const feeResolution = await getConsultationFeeForNewVisit(
        prismaClient,
        visit.patientId,
        visit.type,
    );
    if (feeResolution.fee <= 0) {
        return { defer: false, reason: 'Negotiated consultation fee is zero — nothing to defer.' };
    }

    return {
        defer: true,
        fee: feeResolution.fee,
        insuranceName: feeResolution.insuranceName || lastVerification.insurance?.name || 'Unknown',
        visitType: visit.type,
    };
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
