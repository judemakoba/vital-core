import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, requireRole } from "@/lib/errors";
import { z } from "zod";
import { createPatientSchema, updatePatientSchema, paginationSchema, validateRequest } from "@/lib/validation";
import { ApiError } from "@/lib/errors";
import { recordAudit, AUDIT_ACTION, ENTITY } from "@/lib/audit";

export const runtime = "nodejs";

// Patients-directory-specific list query. Extends the shared pagination
// schema with a `status` filter (active / inactive / all) and a
// `withStats` flag that returns active/inactive counts for the stat
// cards. Keeping this local to the route means the shared schema stays
// untouched for the many other paginated endpoints that use it.
const patientListQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'inactive', 'all']).optional().default('all'),
  withStats: z.coerce.boolean().optional().default(false),
});

// GET /api/patients - List patients with pagination and search
export const GET = withAuth(async (request) => {
  const { searchParams } = new URL(request.url);
  const query = validateRequest(patientListQuerySchema, Object.fromEntries(searchParams.entries()));

  // Apply tenant-configured defaults for limit if not specified
  const { getSetting } = await import("@/lib/settings/store");
  const tenantDefaultLimit = await getSetting<number>("limits.defaultPageSize", 50);
  const tenantMaxLimit = await getSetting<number>("limits.maxPageSize", 500);
  const page = query.page || 1;
  const limit = Math.min(query.limit || tenantDefaultLimit, tenantMaxLimit);
  const { search, sortBy, sortOrder, status } = query;
  const skip = (page - 1) * limit;

  // Whitelist sortBy columns — never let a user-supplied value go
  // straight into orderBy (Prisma's `orderBy` is typed but the
  // `Record<string, unknown>` path in this code is loose).
  const ALLOWED_SORT = new Set(['createdAt', 'firstName', 'lastName', 'patientNumber']);
  const safeSortBy = sortBy && ALLOWED_SORT.has(sortBy) ? sortBy : undefined;

  // Build the where clause from search + status. Status is combined
  // into the same AND so a user can search within Active only.
  const statusFilter =
    status === 'active' ? { isActive: true } :
    status === 'inactive' ? { isActive: false } :
    {};

  const whereClause = {
    ...statusFilter,
    ...(search ? {
      OR: [
        { patientNumber: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };

  const orderBy: any = {};
  if (safeSortBy) {
    orderBy[safeSortBy] = sortOrder || "desc";
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
      },
      skip,
      take: limit,
      orderBy,
    }),
    prisma.patient.count({ where: whereClause }),
  ]);

  // When withStats is set, return the active/inactive/total
  // breakdown. These counts ignore the search/status filter so the
  // stats always reflect the whole directory (consistent with how
  // the billing page reports stats over the current view; the
  // directory is small enough that global is the meaningful unit).
  let stats: { total: number; active: number; inactive: number } | undefined;
  if (query.withStats) {
    const [activeCount, inactiveCount] = await Promise.all([
      prisma.patient.count({ where: { isActive: true } }),
      prisma.patient.count({ where: { isActive: false } }),
    ]);
    stats = { total: activeCount + inactiveCount, active: activeCount, inactive: inactiveCount };
  }

  return NextResponse.json({
    data: patients,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    ...(stats ? { stats } : {}),
  });
});

// POST /api/patients - Create new patient
export const POST = withAuth(async (request, _params, session) => {
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
  const patientFields = data;
  
  // Create patient + (optional) enrollment in a single transaction.
  // Either both succeed or neither does. The enrollment is "VERIFIED"
  // by default at creation time so the third-party verification can
  // run on demand per visit (the user can re-enroll with a different
  // status if needed).
  const patient = await prisma.$transaction(async (tx) => {
    const p = await tx.patient.create({
      data: {
        ...patientFields,
        patientNumber,
        dateOfBirth: new Date(patientFields.dateOfBirth),
      },
    });
    return p;
  });
  
  // Audit — fire-and-forget, never blocks the response
  void recordAudit({
    userId: session.user.id,
    action: AUDIT_ACTION.PATIENT_CREATE,
    entityType: ENTITY.PATIENT,
    entityId: patient.id,
    changes: {
      after: {
        patientNumber: patient.patientNumber,
        firstName:     patient.firstName,
        lastName:      patient.lastName,
        gender:        patient.gender,
        dateOfBirth:   patient.dateOfBirth,
        phone:         patient.phone,
        email:         patient.email,
      },
    },
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
