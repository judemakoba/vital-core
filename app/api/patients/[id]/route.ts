import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withAuth, requireRole } from "@/lib/errors";
import { updatePatientSchema, idParamSchema, validateRequest } from "@/lib/validation";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = withAuth(async (request, params) => {
  const { id } = validateRequest(idParamSchema, params as any);
  
  let patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      insurance: true,
      insuranceEnrollments: {
        include: {
          insurance: true,
        },
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  
  if (!patient) {
    patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { patientNumber: id },
          { phone: id },
        ],
      },
      include: {
        insurance: true,
        insuranceEnrollments: {
          include: {
            insurance: true,
          },
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  }
  
  if (!patient) {
    throw ApiError.notFound("Patient not found");
  }

  // Normalize legacy gender casing so consumers (forms, exports, printouts)
  // always get the canonical enum values: MALE / FEMALE / OTHER. Older rows
  // may still have "Male" / "Female" — a one-time migration cleaned the DB
  // but we defend at the API edge so any stragglers don't break the UI.
  const VALID_GENDER = new Set(["MALE", "FEMALE", "OTHER"]);
  const normalizedGender = (patient.gender || "").toUpperCase();

  // R48: Insurance is no longer a "first-class" set of patient fields.
  // The legacy `hasInsurance` / `insuranceId` / `insuranceNo` /
  // `insurance` fields on the Patient model are leftover from before
  // we moved to the `insuranceEnrollments` table. We strip them from
  // the API response so the patient profile doesn't accidentally
  // surface them. The schema still has them for backward compat with
  // any code that references them; a future migration can drop the
  // columns entirely.
  const {
    hasInsurance: _legacyHas,
    insuranceId: _legacyInsId,
    insuranceNo: _legacyInsNo,
    insurance: _legacyIns,
    ...patientFields
  } = patient as any;

  const safePatient = {
    ...patientFields,
    gender: VALID_GENDER.has(normalizedGender) ? normalizedGender : patient.gender,
  };

  return NextResponse.json(safePatient);
});

export const PATCH = withAuth(async (request, params) => {
  const { id } = validateRequest(idParamSchema, params as any);
  const body = await request.json();
  const data = validateRequest(updatePatientSchema, body);

  // Prevent updating sensitive fields. R48 also strips the legacy
  // `hasInsurance` / `insuranceId` / `insuranceNo` / `insurance`
  // fields — insurance is now managed exclusively via the
  // `insuranceEnrollments` table, and the patient-edit form no longer
  // surfaces these fields.
  const {
    patientNumber,
    createdAt,
    updatedAt,
    hasInsurance: _legacyHas,
    insuranceId: _legacyInsId,
    insuranceNo: _legacyInsNo,
    insuranceEnrollment, // pulled out, handled separately below
    ...safeData
  } = data as any;

  // Convert date strings to Date objects
  if (safeData.dateOfBirth) {
    safeData.dateOfBirth = new Date(safeData.dateOfBirth);
  }

  // R48: the patient edit form lets the cashier update insurance
  // enrollment alongside the patient info. We support two cases:
  //   - `insuranceEnrollment.id` present → update the existing
  //     enrollment row
  //   - `insuranceEnrollment.id` absent → create a new enrollment
  //     (deactivating any existing same-insurer enrollment, to keep
  //     the "one active enrollment per insurer per patient" rule)
  // The whole update is wrapped in a transaction so partial failures
  // roll back cleanly.
  const result = await prisma.$transaction(async (tx) => {
    const updatedPatient = await tx.patient.update({
      where: { id },
      data: safeData,
    });

    if (insuranceEnrollment && insuranceEnrollment.insuranceId) {
      // Verify the insurance company exists before we touch any
      // enrollment rows.
      const company = await tx.insuranceCompany.findUnique({
        where: { id: insuranceEnrollment.insuranceId },
        select: { id: true },
      });
      if (!company) {
        throw ApiError.badRequest(`Insurance company ${insuranceEnrollment.insuranceId} not found.`);
      }

      if (insuranceEnrollment.id) {
        // Update the existing enrollment. We also deactivate any
        // OTHER active enrollments for this patient — typically a
        // patient has ONE active insurance at a time, and updating
        // the row means the cashier chose this one.
        await tx.patientInsurance.updateMany({
          where: {
            patientId: id,
            isActive: true,
            id: { not: insuranceEnrollment.id },
          },
          data: { isActive: false },
        });
        await tx.patientInsurance.update({
          where: { id: insuranceEnrollment.id, patientId: id },
          data: {
            insuranceId: insuranceEnrollment.insuranceId,
            memberNumber: insuranceEnrollment.memberNumber || null,
            policyNumber: insuranceEnrollment.policyNumber,
            coverageStart: new Date(insuranceEnrollment.coverageStart),
            coverageEnd: insuranceEnrollment.coverageEnd ? new Date(insuranceEnrollment.coverageEnd) : null,
            isActive: true,
            status: 'VERIFIED',
          },
        });
      } else {
        // Create a new enrollment. Deactivate any existing active
        // enrollment for this patient (typical "switch insurance"
        // flow). The enrollments table still keeps the old row for
        // audit; we just flip `isActive = false`.
        await tx.patientInsurance.updateMany({
          where: { patientId: id, isActive: true },
          data: { isActive: false },
        });
        await tx.patientInsurance.create({
          data: {
            patientId: id,
            insuranceId: insuranceEnrollment.insuranceId,
            memberNumber: insuranceEnrollment.memberNumber || null,
            policyNumber: insuranceEnrollment.policyNumber,
            coverageStart: new Date(insuranceEnrollment.coverageStart),
            coverageEnd: insuranceEnrollment.coverageEnd ? new Date(insuranceEnrollment.coverageEnd) : null,
            status: 'VERIFIED',
            isActive: true,
          },
        });
      }
    }

    return updatedPatient;
  });

  return NextResponse.json(result);
});

export const DELETE = withAuth(async (request, params) => {
  const session = await getServerSession(authOptions);
  requireRole(session, ["SUPER_ADMIN", "ADMIN"]);

  const { id } = validateRequest(idParamSchema, params as any);

  // R49 + R49b: count LIVE business history only. Inactive
  // enrollments are audit-trail byproducts of a prior soft-delete
  // (they have isActive=false) and don't count as "real" history —
  // otherwise a patient that was already soft-deleted (e.g. test
  // data) is permanently stuck because the inactive enrollment row
  // still holds a RESTRICT FK on Patient.
  //
  // We split enrollment counts:
  //   - activeEnrollmentCount → drives the soft-delete decision
  //   - inactiveEnrollmentCount → wiped in the hard-delete path
  //     so the Patient row can actually be removed
  //
  // TaxInvoice, InsuranceClaim, InsuranceVerification, DispenseLog,
  // Admission, and RadiologyOrder also FK to Patient via RESTRICT,
  // so they're checked here too. If any are non-zero the patient
  // has live business data → soft-delete.
  const [
    visitCount,
    appointmentCount,
    labOrderCount,
    prescriptionCount,
    radiologyOrderCount,
    activeEnrollmentCount,
    inactiveEnrollmentCount,
    verificationCount,
    claimCount,
    taxInvoiceCount,
    dispenseLogCount,
    admissionCount,
    notificationCount,
    emailMessageCount,
  ] = await Promise.all([
    prisma.visit.count({ where: { patientId: id } }),
    prisma.appointment.count({ where: { patientId: id } }),
    prisma.labOrder.count({ where: { patientId: id } }),
    prisma.prescription.count({ where: { patientId: id } }),
    prisma.radiologyOrder.count({ where: { patientId: id } }),
    prisma.patientInsurance.count({ where: { patientId: id, isActive: true } }),
    prisma.patientInsurance.count({ where: { patientId: id, isActive: false } }),
    prisma.insuranceVerification.count({ where: { patientId: id } }),
    prisma.insuranceClaim.count({ where: { patientId: id } }),
    prisma.taxInvoice.count({ where: { patientId: id } }),
    prisma.dispensingLog.count({ where: { patientId: id } }),
    prisma.admission.count({ where: { patientId: id } }),
    prisma.notification.count({ where: { patientId: id } }),
    prisma.emailMessage.count({ where: { patientId: id } }),
  ]);

  const hasLiveHistory = visitCount > 0
    || appointmentCount > 0
    || labOrderCount > 0
    || prescriptionCount > 0
    || radiologyOrderCount > 0
    || activeEnrollmentCount > 0
    || verificationCount > 0
    || claimCount > 0
    || taxInvoiceCount > 0
    || dispenseLogCount > 0
    || admissionCount > 0;

  if (hasLiveHistory) {
    // Soft delete - deactivate the patient AND any active insurance
    // enrollments (deactivated enrollments stay in the table for
    // audit). The patient row itself stays so all FK references
    // remain valid.
    await prisma.$transaction([
      prisma.patient.update({
        where: { id },
        data: { isActive: false },
      }),
      prisma.patientInsurance.updateMany({
        where: { patientId: id, isActive: true },
        data: { isActive: false },
      }),
    ]);
    return NextResponse.json({
      success: true,
      message: "Patient has related records. Patient has been deactivated (and active insurance enrollments too) instead of deleted."
    });
  }

  // No live history. Wipe audit-only data that still holds a
  // RESTRICT FK on Patient (inactive enrollments from prior
  // soft-delete + notifications + email messages), then remove
  // the patient row itself. Wrapped in a transaction so partial
  // failure leaves the world consistent.
  await prisma.$transaction([
    prisma.patientInsurance.deleteMany({ where: { patientId: id } }),
    prisma.notification.deleteMany({ where: { patientId: id } }),
    prisma.emailMessage.deleteMany({ where: { patientId: id } }),
    prisma.patient.delete({ where: { id } }),
  ]);

  return NextResponse.json({
    success: true,
    message: inactiveEnrollmentCount + notificationCount + emailMessageCount > 0
      ? "Patient permanently deleted (audit-only data wiped)."
      : "Patient deleted successfully."
  });
});
