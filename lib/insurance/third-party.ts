/**
 * Third-Party Insurance Verifier
 *
 * R47 spec: insurance validation is no longer auto-validated on the
 * patient profile or at visit creation. The cashier triggers a fresh
 * validation per visit by pressing the "Validate Insurance" button,
 * which calls this module to cross-check the visit against the
 * insurer's eligibility system.
 *
 * This module is the SINGLE place where the third-party call lives.
 * In production, `verifyInsuranceWithProvider` would call the actual
 * insurer API (AAR Health Gateway, Sanlam Verifier, etc.). For now
 * it is a deterministic mock driven by the enrollment data in our DB
 * so the rest of the system can be developed and tested end-to-end.
 *
 * To swap in a real provider later, replace the body of
 * `verifyInsuranceWithProvider` with an HTTP call. The contract is
 * stable: same input shape, same output shape, same audit semantics.
 */
import { prisma } from '../prisma';

export type ThirdPartyVerificationRequest = {
    /** Internal visit id (for audit only — never sent to insurer) */
    visitId: string;
    /** Internal patient id (audit only) */
    patientId: string;
    /**
     * Insurer record id (InsuranceCompany.id) from our DB. Used to
     * identify the provider in the response. The actual enrollment
     * lookup uses `enrollmentId`.
     */
    insuranceId: string | null;
    /**
     * PatientInsurance row id. This is the source of truth for
     * "is the patient enrolled?" — the mock pulls the full
     * enrollment record (including coverage dates + status) from this.
     * Null when the patient has no enrollment but the cashier still
     * wants to attempt a verification (the mock will DENY).
     */
    enrollmentId?: string | null;
    /** Insurer-assigned member number. */
    memberNumber: string | null;
    /** Insurer-assigned policy number. */
    policyNumber: string | null;
    /** Optional override for the cashier to force a particular result
     *  (used in tests). 'AUTO' lets the mock decide. */
    force?: 'AUTO' | 'APPROVE' | 'DENY' | 'ERROR';
};

export type ThirdPartyVerificationResult =
    | {
          status: 'APPROVED';
          verificationNumber: string;
          coverageLimit: number;
          deductibleRemaining: number;
          coverageValidFrom: Date;
          coverageValidTo: Date;
          provider: string;
          rawResponse: any;
      }
    | {
          status: 'DENIED';
          reason: string;
          provider: string;
          rawResponse: any;
      }
    | {
          status: 'ERROR';
          error: string;
          provider: string;
      };

/**
 * Cross-check the visit with the insurance provider.
 *
 * Mock logic (deterministic — same input → same output):
 *
 *   1. If the patient has no enrollment on file (insuranceId is null) →
 *      DENIED ("No enrollment on file for this patient.")
 *
 *   2. If the enrollment is not active → DENIED with a reason based on
 *      the enrollment's status (PENDING / EXPIRED / INVALID).
 *
 *   3. If the coverage period is not in effect (coverageEnd in the past
 *      or coverageStart in the future) → DENIED.
 *
 *   4. If the linked InsuranceCompany is inactive → DENIED.
 *
 *   5. Otherwise → APPROVED. We synthesize a verification number
 *      (VR-{visitIdShort}-{timestamp}), coverageLimit (the
 *      InsuranceCompany.consultationFee × 12 as a placeholder annual
 *      cap), deductibleRemaining (InsuranceCompany.standardPatientCopay
 *      as a placeholder), and coverage dates from the enrollment.
 *
 * The optional `force` parameter lets a test bypass the deterministic
 * logic to inject APPROVED / DENIED / ERROR for any enrollment, which
 * is what the R47 e2e test uses.
 *
 * In production this would be:
 *   const res = await fetch(`${provider.apiBase}/eligibility/check`, {
 *     method: 'POST',
 *     headers: { 'Authorization': `Bearer ${provider.apiKey}` },
 *     body: JSON.stringify({ memberNumber, policyNumber, visitId })
 *   });
 *   return mapProviderResponse(res);
 */
export async function verifyInsuranceWithProvider(
    req: ThirdPartyVerificationRequest
): Promise<ThirdPartyVerificationResult> {
    // 1. Pull the enrollment + insurance company. The enrollmentId
    //    is the source of truth (PatientInsurance.id) — we look up
    //    the row directly. If absent, fall back to finding the most
    //    recent active enrollment for this patient + insuranceId.
    let enrollment = req.enrollmentId
        ? await prisma.patientInsurance.findUnique({
              where: { id: req.enrollmentId },
              include: {
                  insurance: {
                      select: { name: true, code: true, isActive: true, consultationFee: true, standardPatientCopay: true },
                  },
              },
          })
        : null;
    if (!enrollment && req.insuranceId) {
        enrollment = await prisma.patientInsurance.findFirst({
            where: { patientId: req.patientId, insuranceId: req.insuranceId, isActive: true },
            orderBy: { createdAt: 'desc' },
            include: {
                insurance: {
                    select: { name: true, code: true, isActive: true, consultationFee: true, standardPatientCopay: true },
                },
            },
        });
    }

    const force = req.force ?? 'AUTO';

    // 2. Test override path
    if (force === 'ERROR') {
        return {
            status: 'ERROR',
            error: 'Third-party provider unavailable (simulated)',
            provider: 'mock-provider',
        };
    }
    if (force === 'APPROVE') {
        const ver = `VR-${req.visitId.slice(-6).toUpperCase()}-${Date.now().toString().slice(-6)}`;
        return {
            status: 'APPROVED',
            verificationNumber: ver,
            coverageLimit: 5_000_000,
            deductibleRemaining: 0,
            coverageValidFrom: new Date(),
            coverageValidTo: new Date(Date.now() + 365 * 86400 * 1000),
            provider: enrollment?.insurance.name ?? 'mock-provider',
            rawResponse: { forced: 'APPROVE' },
        };
    }
    if (force === 'DENY') {
        return {
            status: 'DENIED',
            reason: 'Forced denial for testing',
            provider: enrollment?.insurance.name ?? 'mock-provider',
            rawResponse: { forced: 'DENY' },
        };
    }

    // 3. Deterministic mock based on enrollment data
    if (!enrollment) {
        return {
            status: 'DENIED',
            reason: 'No enrollment on file for this patient.',
            provider: 'mock-provider',
            rawResponse: { code: 'NO_ENROLLMENT' },
        };
    }
    if (!enrollment.isActive) {
        return {
            status: 'DENIED',
            reason: `Enrollment with ${enrollment.insurance.name} is not active.`,
            provider: enrollment.insurance.name,
            rawResponse: { code: 'INACTIVE' },
        };
    }
    if (enrollment.status !== 'VERIFIED') {
        const reason =
            enrollment.status === 'PENDING' ? 'awaiting verification'
            : enrollment.status === 'EXPIRED' ? 'expired'
            : enrollment.status === 'INVALID' ? 'invalid'
            : `in ${enrollment.status} state`;
        return {
            status: 'DENIED',
            reason: `Enrollment with ${enrollment.insurance.name} is ${reason}.`,
            provider: enrollment.insurance.name,
            rawResponse: { code: 'ENROLLMENT_NOT_VERIFIED' },
        };
    }
    if (!enrollment.insurance.isActive) {
        return {
            status: 'DENIED',
            reason: `Insurance provider ${enrollment.insurance.name} is marked inactive in our system.`,
            provider: enrollment.insurance.name,
            rawResponse: { code: 'PROVIDER_INACTIVE' },
        };
    }
    const now = new Date();
    if (enrollment.coverageStart && new Date(enrollment.coverageStart) > now) {
        return {
            status: 'DENIED',
            reason: `Coverage with ${enrollment.insurance.name} starts on ${new Date(enrollment.coverageStart).toLocaleDateString()}.`,
            provider: enrollment.insurance.name,
            rawResponse: { code: 'COVERAGE_NOT_STARTED' },
        };
    }
    if (enrollment.coverageEnd && new Date(enrollment.coverageEnd) < now) {
        return {
            status: 'DENIED',
            reason: `Coverage with ${enrollment.insurance.name} expired on ${new Date(enrollment.coverageEnd).toLocaleDateString()}.`,
            provider: enrollment.insurance.name,
            rawResponse: { code: 'COVERAGE_EXPIRED' },
        };
    }

    // All clear — approve
    const ver = `VR-${req.visitId.slice(-6).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    return {
        status: 'APPROVED',
        verificationNumber: ver,
        coverageLimit: (enrollment.insurance.consultationFee ?? 0) * 12, // placeholder annual cap
        deductibleRemaining: enrollment.insurance.standardPatientCopay ?? 0,
        coverageValidFrom: enrollment.coverageStart ?? now,
        coverageValidTo: enrollment.coverageEnd ?? new Date(now.getTime() + 365 * 86400 * 1000),
        provider: enrollment.insurance.name,
        rawResponse: { code: 'APPROVED' },
    };
}
