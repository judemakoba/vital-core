/**
 * Denial categorization — maps CARC codes to a high-level category for analytics.
 * Used by the adjudication service to auto-tag denials and by the analytics dashboard.
 */
import { DenialReasonCode, DenialCategory } from '../generated-prisma';

/** Map each CARC code to a DenialCategory */
const CATEGORY_BY_CODE: Record<DenialReasonCode, DenialCategory> = {
    // Patient responsibility
    DEDUCTIBLE:              DenialCategory.PATIENT,
    COPAY:                   DenialCategory.PATIENT,
    COINSURANCE:             DenialCategory.PATIENT,
    NONCOVERED:              DenialCategory.TECHNICAL,
    NONCOVERED_SERVICE:      DenialCategory.COVERAGE,
    PRE_EXISTING:            DenialCategory.COVERAGE,
    OUTPATIENT:              DenialCategory.TECHNICAL,
    PATIENT_INELIGIBLE:      DenialCategory.FRAUD,

    // Coding / technical
    MISSING_INFO:            DenialCategory.TECHNICAL,
    INVALID_CODE:            DenialCategory.TECHNICAL,
    BUNDLED:                 DenialCategory.TECHNICAL,
    UNBUNDLED:               DenialCategory.COVERAGE,
    MODIFIER_MISSING:        DenialCategory.TECHNICAL,
    TIMELY_FILING:           DenialCategory.ADMINISTRATIVE,
    MISSING_DOCS:            DenialCategory.TECHNICAL,
    INVALID_REFERRAL:        DenialCategory.ADMINISTRATIVE,
    MODIFIER_MISSING:        DenialCategory.TECHNICAL,  // duplicate alias

    // Authorization
    NO_PREAUTH:              DenialCategory.AUTHORIZATION,
    PREAUTH_EXPIRED:         DenialCategory.AUTHORIZATION,
    PREAUTH_DENIED:          DenialCategory.AUTHORIZATION,
    PRIOR_AUTH_INCORRECT:    DenialCategory.AUTHORIZATION,

    // Coverage / policy
    NOT_COVERED_PLAN:        DenialCategory.COVERAGE,
    BENEFIT_EXHAUSTED:       DenialCategory.COVERAGE,
    OUT_OF_NETWORK:          DenialCategory.COVERAGE,
    POLICY_INACTIVE:         DenialCategory.COVERAGE,
    EXPERIMENTAL:            DenialCategory.CLINICAL,
    COSMETIC:                DenialCategory.CLINICAL,
    NOT_LICENSED_PROVIDER:   DenialCategory.ADMINISTRATIVE,
    CONTRACT_LIMIT:          DenialCategory.COVERAGE,
    OUTPATIENT_FREQUENCY:    DenialCategory.ADMINISTRATIVE,
    DUPLICATE_DAILY:         DenialCategory.FRAUD,

    // Administrative
    COORDINATION_OF_BENEFITS: DenialCategory.ADMINISTRATIVE,
    PATIENT_RESP:            DenialCategory.PATIENT,
    PENDING_INFO:            DenialCategory.ADMINISTRATIVE,
    RETRO_ELIGIBILITY:       DenialCategory.ADMINISTRATIVE,
    BUNDLE_EDIT:             DenialCategory.TECHNICAL,
    TIMELY_FILING_EXPIRED:   DenialCategory.ADMINISTRATIVE,
    DUPLICATE_HISTORY:        DenialCategory.FRAUD,

    // Clinical
    MEDICAL_NECESSITY:       DenialCategory.CLINICAL,

    // Generic
    OTHER:                   DenialCategory.OTHER,
    DUPLICATE_CLAIM:         DenialCategory.FRAUD,
    INSUFFICIENT_FUNDS:      DenialCategory.OTHER,
    FRAUD_SUSPECTED:         DenialCategory.FRAUD,
};

export function categorizeDenial(code: DenialReasonCode): DenialCategory {
    return CATEGORY_BY_CODE[code] ?? DenialCategory.OTHER;
}

/** Human-readable description of each CARC code (for the UI dropdown / tooltips) */
export const CARC_DESCRIPTIONS: Record<DenialReasonCode, { code: string; title: string; description: string }> = {
    DEDUCTIBLE:           { code: '1',   title: 'Deductible',                  description: 'Amount applied to patient deductible before insurance pays' },
    COPAY:                { code: '2',   title: 'Co-payment',                   description: 'Patient flat co-payment amount' },
    COINSURANCE:          { code: '3',   title: 'Coinsurance',                  description: 'Patient percentage share of allowed amount' },
    NONCOVERED:           { code: '4',   title: 'Procedure/modifier mismatch',  description: 'The procedure code is inconsistent with the modifier used' },
    NONCOVERED_SERVICE:   { code: '6',   title: 'Code/gender mismatch',         description: 'The procedure code is inconsistent with the patient\'s gender' },
    PRE_EXISTING:         { code: '10',  title: 'Diagnosis/gender mismatch',    description: 'The diagnosis is inconsistent with the patient\'s gender' },
    OUTPATIENT:           { code: '12',  title: 'Provider type mismatch',       description: 'The diagnosis is inconsistent with the provider type' },
    PATIENT_INELIGIBLE:   { code: '27',  title: 'Coverage terminated',          description: 'Expenses incurred after coverage terminated' },
    MISSING_INFO:         { code: '16',  title: 'Missing information',          description: 'Claim/service lacks information needed for adjudication' },
    INVALID_CODE:         { code: '18',  title: 'Duplicate claim',              description: 'Exact duplicate claim/service' },
    BUNDLED:              { code: '97',  title: 'Bundled service',              description: 'The benefit is included in another service/procedure' },
    UNBUNDLED:            { code: '109', title: 'Not covered by payer',         description: 'Service not covered by this payer/contractor' },
    MODIFIER_MISSING:     { code: '4',   title: 'Modifier missing/invalid',     description: 'The procedure code is inconsistent with the modifier used' },
    TIMELY_FILING:        { code: '29',  title: 'Filing deadline passed',       description: 'The time limit for filing has expired' },
    NO_PREAUTH:           { code: '197', title: 'No pre-authorization',         description: 'Pre-authorization is required but was not obtained' },
    PREAUTH_EXPIRED:      { code: '198', title: 'Pre-authorization expired',    description: 'The pre-authorization was valid but has since expired' },
    PREAUTH_DENIED:       { code: '199', title: 'Pre-authorization denied',     description: 'The pre-authorization was denied' },
    NOT_COVERED_PLAN:     { code: '50',  title: 'Not covered by plan',          description: 'These are non-covered services because not on the plan benefit list' },
    BENEFIT_EXHAUSTED:    { code: '119', title: 'Benefit maximum reached',      description: 'Benefit maximum for this time period has been reached' },
    OUT_OF_NETWORK:       { code: '109', title: 'Out of network',               description: 'Provider is not in the patient\'s network' },
    POLICY_INACTIVE:      { code: '27',  title: 'Policy inactive',              description: 'Policy was not active on the date of service' },
    DUPLICATE_CLAIM:      { code: '18',  title: 'Duplicate claim',              description: 'A duplicate claim has already been submitted and paid' },
    OTHER:                { code: '22',  title: 'Other',                        description: 'This care may be covered by another payer per coordination of benefits' },
    PATIENT_RESP:         { code: '23',  title: 'Prior payer adjustment',       description: 'The impact of prior payer(s) adjudication' },
    PENDING_INFO:         { code: '133', title: 'Pending related info',         description: 'The disposition of the related Property and Casualty claim has not yet been received' },
    MISSING_DOCS:         { code: '252', title: 'Missing provider ID',          description: 'Missing/incomplete/invalid provider billing number/identifier' },
    CONTRACT_LIMIT:       { code: '38',  title: 'Service not covered',          description: 'Services not provided or emergencies not covered' },
    INSUFFICIENT_FUNDS:   { code: '9',   title: 'Diagnosis/provider mismatch',  description: 'The diagnosis is inconsistent with the provider type' },
    FRAUD_SUSPECTED:      { code: '140', title: 'Patient ID not found',         description: 'Patient/insured health identification number not found' },
    DUPLICATE_DAILY:      { code: '151', title: 'Frequency exceeded',           description: 'Frequency of service exceeds the industry standard' },
    RETRO_ELIGIBILITY:    { code: '177', title: 'Eligibility not met',          description: 'Patient has not met the required eligibility requirements' },
    COORDINATION_OF_BENEFITS: { code: '22', title: 'COB — other payer primary',  description: 'This care may be covered by another payer per coordination of benefits' },
    MEDICAL_NECESSITY:    { code: '50',  title: 'Not medically necessary',      description: 'These are non-covered services because the primary reason was not medical necessity' },
    INVALID_REFERRAL:     { code: '162', title: 'Entity not eligible',          description: 'Entity not eligible for benefits for dates of service' },
    OUTPATIENT_FREQUENCY: { code: '151', title: 'Frequency exceeded',           description: 'Outpatient frequency exceeds industry standard' },
    NOT_LICENSED_PROVIDER:{ code: '185', title: 'Provider not eligible',        description: 'The provider is not eligible to render this service' },
    PRIOR_AUTH_INCORRECT: { code: '27',  title: 'Prior auth not obtained',      description: 'Prior authorization not obtained for the service' },
    BUNDLE_EDIT:          { code: '97',  title: 'Bundle edit',                  description: 'The benefit is included in another service' },
    TIMELY_FILING_EXPIRED:{ code: '29',  title: 'Timely filing expired',        description: 'Filing deadline passed' },
    DUPLICATE_HISTORY:    { code: '18',  title: 'Duplicate in history',         description: 'Exact duplicate claim found in history' },
    EXPERIMENTAL:         { code: '122', title: 'Experimental/investigational', description: 'This service is experimental/investigational' },
    COSMETIC:             { code: '52',  title: 'Cosmetic',                     description: 'Service is cosmetic and not medically necessary' },
};

/** Display label for a category (used in dashboards) */
export const CATEGORY_LABELS: Record<DenialCategory, string> = {
    TECHNICAL:      'Technical / Coding',
    AUTHORIZATION:  'Authorization',
    COVERAGE:       'Coverage / Policy',
    CLINICAL:       'Clinical / Medical',
    ADMINISTRATIVE: 'Administrative',
    PATIENT:        'Patient Responsibility',
    FRAUD:          'Fraud / Eligibility',
    OTHER:          'Other',
};

export const CATEGORY_COLORS: Record<DenialCategory, string> = {
    TECHNICAL:      '#6366f1',  // indigo
    AUTHORIZATION:  '#f59e0b',  // amber
    COVERAGE:       '#3b82f6',  // blue
    CLINICAL:       '#ef4444',  // red
    ADMINISTRATIVE: '#8b5cf6',  // violet
    PATIENT:        '#10b981',  // emerald
    FRAUD:          '#dc2626',  // dark red
    OTHER:          '#64748b',  // slate
};
