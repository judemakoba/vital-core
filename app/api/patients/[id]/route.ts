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
  });

  if (!patient) {
    patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { patientNumber: id },
          { phone: id },
        ],
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

  return NextResponse.json({
    ...patient,
    gender: VALID_GENDER.has(normalizedGender) ? normalizedGender : patient.gender,
  });
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
    ...safeData
  } = data as any;

  // Convert date strings to Date objects
  if (safeData.dateOfBirth) {
    safeData.dateOfBirth = new Date(safeData.dateOfBirth);
  }

  // The whole update is wrapped in a transaction so partial failures
  // roll back cleanly.
  const result = await prisma.patient.update({
    where: { id },
    data: safeData,
  });

  return NextResponse.json(result);
});

export const DELETE = withAuth(async (request, params) => {
  const session = await getServerSession(authOptions);
  requireRole(session, ["SUPER_ADMIN", "ADMIN"]);

  const { id } = validateRequest(idParamSchema, params as any);

  // Count LIVE business history only. TaxInvoice, DispenseLog,
  // Admission, and RadiologyOrder also FK to Patient via RESTRICT,
  // so they're checked here too. If any are non-zero the patient
  // has live business data → soft-delete.
  const [
    visitCount,
    appointmentCount,
    labOrderCount,
    prescriptionCount,
    radiologyOrderCount,
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
    || taxInvoiceCount > 0
    || dispenseLogCount > 0
    || admissionCount > 0;

  if (hasLiveHistory) {
    // Soft delete - deactivate the patient. The patient row itself
    // stays so all FK references remain valid.
    await prisma.patient.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({
      success: true,
      message: "Patient has related records. Patient has been deactivated instead of deleted."
    });
  }

  // No live history. Wipe audit-only data that still holds a
  // RESTRICT FK on Patient (notifications + email messages), then
  // remove the patient row itself. Wrapped in a transaction so
  // partial failure leaves the world consistent.
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { patientId: id } }),
    prisma.emailMessage.deleteMany({ where: { patientId: id } }),
    prisma.patient.delete({ where: { id } }),
  ]);

  return NextResponse.json({
    success: true,
    message: notificationCount + emailMessageCount > 0
      ? "Patient permanently deleted (audit-only data wiped)."
      : "Patient deleted successfully."
  });
});
