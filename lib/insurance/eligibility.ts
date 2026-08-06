/**
 * Insurance Eligibility Helper
 *
 * Centralizes the logic for determining whether a patient can be billed
 * via insurance at the payment desk. Used by:
 *   - The cashier's billing page (UI gating + messaging)
 *   - The payments API (server-side enforcement)
 *   - The insurance-preview endpoint (preview accuracy)
 *   - The retroactive claim route (must check before creating a claim)
 *
 * A patient is eligible for insurance billing when ALL of these are true:
 *   1. They have a PatientInsurance row
 *   2. isActive = true (not paused)
 *   3. status = VERIFIED (passed the eligibility check)
 *   4. The coverage period is in effect:
 *      - coverageStart <= now
 *      - coverageEnd IS NULL (open-ended) OR coverageEnd > now
 *   5. The linked insurance company itself is active
 *
 * If any check fails, the helper returns `null` plus a `reason` string
 * suitable for surfacing to the cashier (e.g. "Coverage expired on 2026-06-30").
 */
import { prisma } from '../prisma';

export type EligibilityResult =
    | {
          eligible: true;
          enrollment: {
              id: string;
              insuranceId: string;
              memberNumber: string;
              policyNumber: string;
              copayType: string;
              standardPatientCopay: number | null;
              copayPercentage: number | null;
              copayDeductible: number | null;
              coverageStart: Date | null;
              coverageEnd: Date | null;
              status: string;
              insurance: { id: string; name: string; code: string; isActive: boolean };
          };
      }
    | {
          eligible: false;
          reason: string;
          enrollment: any | null; // partial — what we found, even if ineligible
      };

export async function getInsuranceEligibility(patientId: string): Promise<EligibilityResult> {
    // Get the patient's most recent active enrollment
    const enrollment = await prisma.patientInsurance.findFirst({
        where: { patientId, isActive: true },
        orderBy: { createdAt: 'desc' },
        include: {
            insurance: {
                select: { id: true, name: true, code: true, isActive: true },
            },
        },
    });

    if (!enrollment) {
        // Check if there are any enrollments at all (expired, pending, etc.) to give a more useful message
        const anyEnrollment = await prisma.patientInsurance.findFirst({
            where: { patientId },
            orderBy: { createdAt: 'desc' },
            include: {
                insurance: { select: { name: true } },
            },
        });

        if (anyEnrollment) {
            return {
                eligible: false,
                reason: anyEnrollment.status === 'EXPIRED'
                    ? `Insurance coverage with ${anyEnrollment.insurance.name} has expired. Renew enrollment to use insurance billing.`
                    : anyEnrollment.status === 'PENDING'
                    ? `Insurance enrollment with ${anyEnrollment.insurance.name} is still PENDING verification.`
                    : anyEnrollment.status === 'INVALID'
                    ? `Insurance enrollment with ${anyEnrollment.insurance.name} is marked INVALID. Re-verify with the insurer.`
                    : `Insurance enrollment with ${anyEnrollment.insurance.name} is not active.`,
                enrollment: anyEnrollment,
            };
        }

        return {
            eligible: false,
            reason: 'Patient is not enrolled with any insurance provider. Add an enrollment to use insurance billing.',
            enrollment: null,
        };
    }

    // Check verification status
    if (enrollment.status !== 'VERIFIED') {
        return {
            eligible: false,
            reason: enrollment.status === 'PENDING'
                ? `Enrollment with ${enrollment.insurance.name} is awaiting verification.`
                : enrollment.status === 'EXPIRED'
                ? `Enrollment with ${enrollment.insurance.name} is expired.`
                : enrollment.status === 'INVALID'
                ? `Enrollment with ${enrollment.insurance.name} is invalid.`
                : `Enrollment with ${enrollment.insurance.name} is in ${enrollment.status} state.`,
            enrollment,
        };
    }

    // Check coverage dates
    const now = new Date();
    if (enrollment.coverageStart && new Date(enrollment.coverageStart) > now) {
        return {
            eligible: false,
            reason: `Coverage with ${enrollment.insurance.name} starts on ${new Date(enrollment.coverageStart).toLocaleDateString()}.`,
            enrollment,
        };
    }
    if (enrollment.coverageEnd && new Date(enrollment.coverageEnd) < now) {
        return {
            eligible: false,
            reason: `Coverage with ${enrollment.insurance.name} expired on ${new Date(enrollment.coverageEnd).toLocaleDateString()}.`,
            enrollment,
        };
    }

    // Check that the insurance company itself is active
    if (!enrollment.insurance.isActive) {
        return {
            eligible: false,
            reason: `Insurance provider ${enrollment.insurance.name} is marked inactive in our system.`,
            enrollment,
        };
    }

    // All clear
    return {
        eligible: true,
        enrollment: {
            id: enrollment.id,
            insuranceId: enrollment.insuranceId,
            memberNumber: enrollment.memberNumber,
            policyNumber: enrollment.policyNumber,
            copayType: enrollment.insurance.copayType ?? 'FLAT',
            standardPatientCopay: enrollment.insurance.standardPatientCopay ?? null,
            copayPercentage: enrollment.insurance.copayPercentage ?? null,
            copayDeductible: enrollment.insurance.copayDeductible ?? null,
            coverageStart: enrollment.coverageStart,
            coverageEnd: enrollment.coverageEnd,
            status: enrollment.status,
            insurance: enrollment.insurance,
        },
    };
}
