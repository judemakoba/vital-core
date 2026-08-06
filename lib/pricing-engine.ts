import { prisma } from '@/lib/prisma';
import { ServiceType, CopayType } from './generated-prisma';

/**
 * Standardized pricing result for any billable service.
 * - `originalPrice`  : the standard rate (what an uninsured patient pays)
 * - `negotiatedPrice`: the rate this insurer has negotiated
 * - `patientPayable` : what the patient owes out-of-pocket
 * - `insuranceNet`   : what the insurer owes (billed to claim)
 * - `copayType`      : which copay model was applied
 * - `breakdown`      : human-readable explanation of how we got here
 */
export interface PricingResult {
    originalPrice: number;
    negotiatedPrice: number;
    patientPayable: number;
    insuranceNet: number;
    copayType: CopayType;
    copayAmount: number;       // the flat component
    copayPercentage: number;   // the percentage component (0 if N/A)
    appliedRuleId?: string;
    breakdown: string;
}

/**
 * Look up the negotiated rate for a service and split it between patient
 * and insurer based on the company's copay configuration.
 *
 * Copay model summary:
 *  - FLAT                patient pays `standardPatientCopay` (fixed)
 *  - PERCENTAGE          patient pays `copayPercentage`% of negotiated price
 *  - COPAY_PLUS_PERCENT  patient pays flat + % of the remainder above flat
 *  - NO_COPAY            insurance pays 100%, patient pays 0
 *  - FULL                patient pays 100%, no insurance coverage
 */
export async function calculateInsurancePrice(
    insuranceId: string,
    serviceType: ServiceType,
    serviceId: string | null,
    standardRate: number,
    /**
     * Optional overrides — when omitted, the insurer's defaults are used.
     * Pass values explicitly when computing the price for a specific enrollment
     * whose policy differs from the company default.
     */
    overrides?: {
        standardPatientCopay?: number;
        copayPercentage?: number;
        copayDeductible?: number;
        copayType?: CopayType;
    }
): Promise<PricingResult> {
    try {
        // Load the insurer's copay config + the negotiated rate in parallel
        const [insurer, rule] = await Promise.all([
            prisma.insuranceCompany.findUnique({
                where: { id: insuranceId },
                select: {
                    copayType: true,
                    standardPatientCopay: true,
                    copayPercentage: true,
                    copayDeductible: true,
                },
            }),
            prisma.insurancePriceListItem.findFirst({
                where: {
                    insuranceId,
                    OR: [
                        { serviceId: serviceId ?? undefined },
                        { serviceType, serviceId: null },
                    ],
                },
            }),
        ]);

        if (!insurer) {
            // Caller passed an unknown insuranceId — return the standard rate
            return {
                originalPrice: standardRate,
                negotiatedPrice: standardRate,
                patientPayable: standardRate,
                insuranceNet: 0,
                copayType: 'FULL' as CopayType,
                copayAmount: 0,
                copayPercentage: 0,
                breakdown: 'Unknown insurer; patient pays full standard rate.',
            };
        }

        const copayType = overrides?.copayType ?? insurer.copayType;
        const copayAmount = overrides?.standardPatientCopay ?? insurer.standardPatientCopay ?? 0;
        const copayPercentage = overrides?.copayPercentage ?? insurer.copayPercentage ?? 0;
        const deductible = overrides?.copayDeductible ?? insurer.copayDeductible ?? 0;

        // No negotiated rate → patient pays full standard (no coverage)
        if (!rule) {
            return {
                originalPrice: standardRate,
                negotiatedPrice: standardRate,
                patientPayable: standardRate,
                insuranceNet: 0,
                copayType: 'FULL' as CopayType,
                copayAmount: 0,
                copayPercentage: 0,
                breakdown: 'No negotiated rate configured for this service — patient pays full standard rate.',
            };
        }

        const negotiatedPrice = rule.negotiatedPrice;
        // After deductible is met, the negotiated price is the basis for the
        // patient/insurer split. Until the deductible is met, the patient pays
        // everything (or the copay, whichever is more — see copay-spec.md).
        // For now, the deductible only matters for COPAY_PLUS_PERCENT with
        // a non-zero deductible; we keep it simple and just subtract it.
        const basis = Math.max(0, negotiatedPrice - deductible);

        const { patientPayable, insuranceNet, breakdown } = computeCopay({
            copayType,
            basis,
            copayAmount,
            copayPercentage,
        });

        return {
            originalPrice: standardRate,
            negotiatedPrice,
            patientPayable,
            insuranceNet,
            copayType,
            copayAmount,
            copayPercentage,
            appliedRuleId: rule.id,
            breakdown,
        };
    } catch (error) {
        console.error('PricingEngine Error:', error);
        return {
            originalPrice: standardRate,
            negotiatedPrice: standardRate,
            patientPayable: standardRate,
            insuranceNet: 0,
            copayType: 'FULL' as CopayType,
            copayAmount: 0,
            copayPercentage: 0,
            breakdown: 'Pricing engine error; defaulting to full standard rate.',
        };
    }
}

/**
 * Pure function — splits a price based on the copay model.
 * Exposed for unit testing and to support policy-overrides on the
 * PatientInsurance table without re-querying.
 */
export function computeCopay(input: {
    copayType: CopayType | string;
    basis: number;            // price after deductible
    copayAmount: number;     // flat amount (UGX)
    copayPercentage: number; // percent (0-100)
}): { patientPayable: number; insuranceNet: number; breakdown: string } {
    const { copayType, basis, copayAmount, copayPercentage } = input;

    switch (copayType) {
        case 'FLAT': {
            // Legacy: patient pays the flat amount (capped at the negotiated price
            // so the insurer never goes negative)
            const patient = Math.min(copayAmount, basis);
            const insurerNet = Math.max(0, basis - patient);
            return {
                patientPayable: round2(patient),
                insuranceNet: round2(insurerNet),
                breakdown: `Flat copay: patient pays UGX ${patient.toLocaleString()}, insurer pays UGX ${insurerNet.toLocaleString()}.`,
            };
        }
        case 'PERCENTAGE': {
            // Patient pays X% of the negotiated price
            const pct = clampPct(copayPercentage);
            const patient = (basis * pct) / 100;
            const insurerNet = basis - patient;
            return {
                patientPayable: round2(patient),
                insuranceNet: round2(insurerNet),
                breakdown: `${pct}% coinsurance: patient pays UGX ${patient.toLocaleString()}, insurer pays UGX ${insurerNet.toLocaleString()}.`,
            };
        }
        case 'COPAY_PLUS_PERCENT': {
            // Patient pays flat + X% of the remainder above the flat
            // (e.g. "UGX 5,000 + 10% of the negotiated price" — common real-world model)
            const pct = clampPct(copayPercentage);
            const patient = copayAmount + Math.max(0, basis - copayAmount) * (pct / 100);
            const insurerNet = Math.max(0, basis - patient);
            return {
                patientPayable: round2(patient),
                insuranceNet: round2(insurerNet),
                breakdown: `UGX ${copayAmount.toLocaleString()} + ${pct}% of remainder: patient pays UGX ${patient.toLocaleString()}, insurer pays UGX ${insurerNet.toLocaleString()}.`,
            };
        }
        case 'NO_COPAY': {
            // Insurance covers 100% (patient owes nothing)
            return {
                patientPayable: 0,
                insuranceNet: basis,
                breakdown: 'No copay — insurer pays full negotiated price.',
            };
        }
        case 'FULL': {
            // Patient pays 100% (no insurance coverage at all)
            return {
                patientPayable: basis,
                insuranceNet: 0,
                breakdown: 'No coverage configured — patient pays full negotiated price.',
            };
        }
        default: {
            // Unknown type — safest default is the full price to the patient
            return {
                patientPayable: basis,
                insuranceNet: 0,
                breakdown: `Unknown copay type '${copayType}' — defaulting to full price for patient.`,
            };
        }
    }
}

function clampPct(pct: number): number {
    if (!Number.isFinite(pct)) return 0;
    if (pct < 0) return 0;
    if (pct > 100) return 100;
    return pct;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
