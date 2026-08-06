import { prisma } from '../prisma';
import {
  InsuranceClaim,
  PatientInsurance,
  InsuranceCompany,
  InsuranceAuthorization,
  ServiceType,
  VerificationStatus,
  AuthStatus,
  ClaimStatus
} from '../generated-prisma';

/**
 * Service for scrubbing (validating) insurance claims before submission
 * Checks for common issues that would cause claim rejections
 */
export class ClaimScrubbingService {
  /**
   * Scrub a claim for common validation issues
   * @param claimData The claim data to validate
   * @returns Object with validation results and any issues found
   */
  static async scrubClaim(
    claimData: {
      insuranceId: string;
      patientId: string;
      visitId?: string | null;
      invoiceId?: string | null;
      totalAmount: number;
      eligibleAmount?: number;
      status?: ClaimStatus;
      notes?: string | null;
    }
  ): Promise<{
    isValid: boolean;
    score: number; // 0-100, higher is better
    issues: Array<{
      severity: 'error' | 'warning' | 'info';
      field: string;
      message: string;
      suggestion?: string;
    }>;
    recommendations: string[];
  }> {
    const issues: Array<{
      severity: 'error' | 'warning' | 'info';
      field: string;
      message: string;
      suggestion?: string;
    }> = [];
    const recommendations: string[] = [];
    let score = 100; // Start with perfect score, deduct for issues

    // 1. Validate patient exists and is active
    try {
      const patient = await prisma.patient.findUnique({
        where: { id: claimData.patientId },
        select: { id: true, isActive: true }
      });

      if (!patient) {
        issues.push({
          severity: 'error',
          field: 'patientId',
          message: 'Patient not found',
          suggestion: 'Verify the patient ID is correct and the patient exists in the system'
        });
        score -= 30;
      } else if (!patient.isActive) {
        issues.push({
          severity: 'error',
          field: 'patientId',
          message: 'Patient is not active',
          suggestion: 'Activate the patient record before submitting claims'
        });
        score -= 25;
      }
    } catch (error) {
      console.error('Error checking patient:', error);
      issues.push({
        severity: 'info',
        field: 'patientId',
        message: 'Unable to verify patient status'
      });
    }

    // 2. Validate insurance company exists and is active
    try {
      const insurance = await prisma.insuranceCompany.findUnique({
        where: { id: claimData.insuranceId },
        select: { id: true, isActive: true, name: true }
      });

      if (!insurance) {
        issues.push({
          severity: 'error',
          field: 'insuranceId',
          message: 'Insurance company not found',
          suggestion: 'Verify the insurance ID is correct'
        });
        score -= 30;
      } else if (!insurance.isActive) {
        issues.push({
          severity: 'error',
          field: 'insuranceId',
          message: 'Insurance company is not active',
          suggestion: 'Contact the insurance provider to verify their status'
        });
        score -= 25;
      }
    } catch (error) {
      console.error('Error checking insurance company:', error);
      issues.push({
        severity: 'info',
        field: 'insuranceId',
        message: 'Unable to verify insurance company status'
      });
    }

    // 3. Check if patient has active enrollment with this insurance
    try {
      const enrollment = await prisma.patientInsurance.findFirst({
        where: {
          patientId: claimData.patientId,
          insuranceId: claimData.insuranceId,
          isActive: true,
          status: VerificationStatus.VERIFIED
        },
        select: {
          id: true,
          coverageStart: true,
          coverageEnd: true,
          insurance: { select: { standardPatientCopay: true } }
        }
      });

      if (!enrollment) {
        issues.push({
          severity: 'error',
          field: 'patientId',
          message: 'Patient does not have active verified enrollment with this insurance',
          suggestion: 'Verify the patient is enrolled and eligible with this insurance provider'
        });
        score -= 20;
      } else {
        // Check coverage dates
        const now = new Date();
        if (enrollment.coverageStart > now) {
          issues.push({
            severity: 'error',
            field: 'patientId',
            message: 'Coverage has not yet started',
            suggestion: 'Verify the coverage effective date'
          });
          score -= 15;
        } else if (enrollment.coverageEnd && enrollment.coverageEnd < now) {
          issues.push({
            severity: 'error',
            field: 'patientId',
            message: 'Coverage has expired',
            suggestion: 'Renew the patient\'s insurance coverage'
          });
          score -= 15;
        }
      }
    } catch (error) {
      console.error('Error checking patient enrollment:', error);
      issues.push({
        severity: 'info',
        field: 'patientId',
        message: 'Unable to verify patient enrollment status'
      });
    }

    // 4. Check for duplicate claims (same patient, same service date range)
    // For now, we'll check for exact duplicates on visitId or invoiceId if provided
    try {
      const duplicateConditions: any[] = [];
      if (claimData.visitId) {
        duplicateConditions.push({ visitId: claimData.visitId });
      }
      if (claimData.invoiceId) {
        duplicateConditions.push({ invoiceId: claimData.invoiceId });
      }

      if (duplicateConditions.length > 0) {
        const existingClaim = await prisma.insuranceClaim.findFirst({
          where: {
            AND: [
              { patientId: claimData.patientId },
              { insuranceId: claimData.insuranceId },
              { OR: duplicateConditions }
            ]
          },
          select: { id: true, claimNumber: true, status: true }
        });

        if (existingClaim) {
          issues.push({
            severity: 'warning',
            field: claimData.visitId ? 'visitId' : 'invoiceId',
            message: `Potential duplicate claim exists (Claim #: ${existingClaim.claimNumber}, Status: ${existingClaim.status})`,
            suggestion: 'Review existing claim to avoid duplicate submission'
          });
          score -= 10;
        }
      }
    } catch (error) {
      console.error('Error checking for duplicate claims:', error);
      // Don't score duplicate check failures as they're not critical
    }

    // 5. Validate financial amounts
    if (claimData.totalAmount <= 0) {
      issues.push({
        severity: 'error',
        field: 'totalAmount',
        message: 'Total amount must be greater than zero',
        suggestion: 'Verify the claim amount is correct'
      });
      score -= 15;
    }

    if (claimData.eligibleAmount !== undefined) {
      if (claimData.eligibleAmount < 0) {
        issues.push({
          severity: 'error',
          field: 'eligibleAmount',
          message: 'Eligible amount cannot be negative',
          suggestion: 'Verify the eligible amount is correct'
        });
        score -= 10;
      } else if (claimData.eligibleAmount > claimData.totalAmount) {
        issues.push({
          severity: 'warning',
          field: 'eligibleAmount',
          message: 'Eligible amount exceeds total amount',
          suggestion: 'Verify the eligible amount does not exceed the total claim amount'
        });
        score -= 5;
      }
    }

    // 6. Check if we should recommend seeking authorization
    // This is a simplified check - in reality, you'd need to check specific service types
    try {
      const hasRecentAuth = await prisma.insuranceAuthorization.count({
        where: {
          patientInsurance: {
            patientId: claimData.patientId,
            insuranceId: claimData.insuranceId
          },
          status: AuthStatus.APPROVED,
          validFrom: { lte: new Date() },
          OR: [
            { validTo: { gte: new Date() } },
            { validTo: null }
          ]
        }
      });

      if (hasRecentAuth === 0) {
        recommendations.push('Consider verifying if prior authorization is required for this service type');
      }
    } catch (error) {
      console.error('Error checking authorizations:', error);
      // Non-critical
    }

    // Determine if the claim is valid (no errors)
    const isValid = !issues.some(issue => issue.severity === 'error');

    // Ensure score doesn't go below 0
    score = Math.max(0, Math.round(score));

    return {
      isValid,
      score,
      issues,
      recommendations
    };
  }
}