import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, requireRole } from "@/lib/errors";
import { createPatientSchema, updatePatientSchema, paginationSchema, validateRequest } from "@/lib/validation";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";

// GET /api/patients - List patients with pagination and search
export const GET = withAuth(async (request) => {
  const { searchParams } = new URL(request.url);
  const query = validateRequest(paginationSchema, Object.fromEntries(searchParams.entries()));

  // Apply tenant-configured defaults for limit if not specified
  const { getSetting } = await import("@/lib/settings/store");
  const tenantDefaultLimit = await getSetting<number>("limits.defaultPageSize", 50);
  const tenantMaxLimit = await getSetting<number>("limits.maxPageSize", 500);
  const page = query.page || 1;
  const limit = Math.min(query.limit || tenantDefaultLimit, tenantMaxLimit);
  const { search, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;
  
  const whereClause = search ? {
    OR: [
      { patientNumber: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ],
  } : {};
  
  const orderBy: any = {};
  if (sortBy) {
    orderBy[sortBy] = sortOrder || "desc";
  } else {
    orderBy.createdAt = "desc";
  }
  
  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where: whereClause,
      select: {
        id: true,
        patientNumber: true,
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        phone: true,
        isActive: true,
        createdAt: true,
        // R48: include the most-recent active enrollment so the visit
        // creation modal can show the "Validate Insurance" button only
        // for patients with insurance on file. The full enrollment list
        // is available via the patient detail API.
        // The legacy `hasInsurance` / `insuranceId` / `insuranceNo` /
        // `insurance` fields are intentionally NOT selected — insurance
        // is now managed exclusively via the `insuranceEnrollments`
        // table.
        insuranceEnrollments: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            policyNumber: true,
            memberNumber: true,
            coverageStart: true,
            coverageEnd: true,
            status: true,
            insurance: { select: { id: true, name: true, code: true, consultationFee: true } },
          },
        },
      },
      skip,
      take: limit,
      orderBy,
    }),
    prisma.patient.count({ where: whereClause }),
  ]);
  
  return NextResponse.json({ 
    data: patients, 
    total, 
    page, 
    limit, 
    totalPages: Math.ceil(total / limit) 
  });
});

// POST /api/patients - Create new patient (+ optional insurance enrollment, R48)
export const POST = withAuth(async (request) => {
  const body = await request.json();
  const data = validateRequest(createPatientSchema, body);
  
  // Check if patient number already exists (if provided)
  if (data.patientNumber) {
    const existing = await prisma.patient.findUnique({ where: { patientNumber: data.patientNumber } });
    if (existing) {
      throw ApiError.conflict("Patient number already exists");
    }
  }
  
  // Generate patient number if not provided
  const patientNumber = data.patientNumber || await generatePatientNumber();
  
  // R48: extract the optional enrollment. Insurance fields are no longer
  // first-class patient fields — the visit is what triggers validation,
  // not the patient profile. The enrollment is just a "hint" that the
  // patient has insurance on file.
  const { insuranceEnrollment, ...patientFields } = data as any;
  
  // Verify the insurance company exists before attempting to create
  // the enrollment. We don't FK-validate it in the schema because
  // the patient is created first and the enrollment is optional.
  if (insuranceEnrollment?.insuranceId) {
    const company = await prisma.insuranceCompany.findUnique({
      where: { id: insuranceEnrollment.insuranceId },
      select: { id: true, isActive: true },
    });
    if (!company) {
      throw ApiError.badRequest(`Insurance company ${insuranceEnrollment.insuranceId} not found.`);
    }
  }
  
  // Create patient + (optional) enrollment in a single transaction.
  // Either both succeed or neither does. The enrollment is "VERIFIED"
  // by default at creation time so the third-party verification can
  // run on demand per visit (the user can re-enroll with a different
  // status if needed). We use a unique constraint on (patientId, insuranceId)
  // to prevent duplicate enrollments.
  const patient = await prisma.$transaction(async (tx) => {
    const p = await tx.patient.create({
      data: {
        ...patientFields,
        patientNumber,
        dateOfBirth: new Date(patientFields.dateOfBirth),
      },
    });
    
    if (insuranceEnrollment?.insuranceId) {
      // Check for an existing enrollment (any state — re-activating a
      // prior enrollment is fine if the patient was previously enrolled
      // and then deactivated).
      const existing = await tx.patientInsurance.findFirst({
        where: { patientId: p.id, insuranceId: insuranceEnrollment.insuranceId },
      });
      if (existing) {
        // Reactivate + update policy numbers / dates
        await tx.patientInsurance.update({
          where: { id: existing.id },
          data: {
            policyNumber: insuranceEnrollment.policyNumber,
            memberNumber: insuranceEnrollment.memberNumber || null,
            coverageStart: new Date(insuranceEnrollment.coverageStart),
            coverageEnd: insuranceEnrollment.coverageEnd ? new Date(insuranceEnrollment.coverageEnd) : null,
            isActive: true,
            status: 'VERIFIED',
          },
        });
      } else {
        await tx.patientInsurance.create({
          data: {
            patientId: p.id,
            insuranceId: insuranceEnrollment.insuranceId,
            policyNumber: insuranceEnrollment.policyNumber,
            memberNumber: insuranceEnrollment.memberNumber || null,
            coverageStart: new Date(insuranceEnrollment.coverageStart),
            coverageEnd: insuranceEnrollment.coverageEnd ? new Date(insuranceEnrollment.coverageEnd) : null,
            status: 'VERIFIED',
            isActive: true,
          },
        });
      }
    }
    
    return p;
  });
  
  return NextResponse.json(patient, { status: 201 });
});

async function generatePatientNumber(): Promise<string> {
  const today = new Date();
  const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
  const count = await prisma.patient.count({
    where: { createdAt: { gte: todayStart } },
  });
  const { generatePatientNumber: gen } = await import("@/lib/formatters");
  return gen(count + 1, today);
}
