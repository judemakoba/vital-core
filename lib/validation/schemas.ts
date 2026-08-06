import { z } from 'zod'
import { ApiError } from '@/lib/errors'

// Common reusable schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})

// Accepts CUID (SQLite) and UUID (PostgreSQL) — replace all .cuid() usages with this
const idString = () => z.string().min(1, 'ID is required')

/** Validates a single ID value (string). Use for route params that are just an ID. */
export const idValueSchema = idString();

/** Validates an object containing an `id` field. Use for bodies that include an id. */
export const idParamSchema = z.object({
  id: idString(),
})

/**
 * R48: Insurance enrollment is no longer auto-validated from the patient
 * profile, and is no longer a "first-class" set of patient fields. Instead,
 * the patient is created with just personal info, and an optional nested
 * `insuranceEnrollment` object is accepted to also create or update a
 * `PatientInsurance` row in the same transaction.
 *
 * Behavior:
 *  - `id` present → update existing enrollment
 *  - `id` absent → create new enrollment (deactivating any existing
 *    same-insurer enrollment)
 *
 * Validation is now per-visit (handled in the visit creation form, not
 * here). The enrollment row is just a "hint" that the patient has
 * insurance on file — the cashier runs the third-party check per visit.
 */
export const insuranceEnrollmentInputSchema = z.object({
  id: z.string().optional().or(z.literal('')), // present = update, absent = create
  insuranceId: z.string().min(1, 'Insurance provider is required'),
  memberNumber: z.string().max(50).optional().or(z.literal('')),
  policyNumber: z.string().min(1, 'Policy number is required').max(50),
  coverageStart: z.string().min(1, 'Coverage start date is required'),
  coverageEnd: z.string().optional().or(z.literal('')),
}).strict()

export const createPatientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().datetime(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  phone: z.string().min(10).max(20),
  alternativePhone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  emergencyContactName: z.string().max(100).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  emergencyContactRel: z.string().max(50).optional(),
  nextOfKinName: z.string().max(100).optional(),
  nextOfKinPhone: z.string().max(20).optional(),
  nextOfKinEmail: z.string().email().optional().or(z.literal('')),
  nextOfKinAddress: z.string().max(500).optional(),
  nextOfKinRel: z.string().max(50).optional(),
  bloodGroup: z.string().max(10).optional(),
  maritalStatus: z.string().max(50).optional(),
  occupation: z.string().max(100).optional(),
  allergies: z.string().max(1000).optional(),
  chronicConditions: z.string().max(1000).optional(),
  currentMedications: z.string().max(1000).optional(),
  // R48: nested enrollment (optional). When present, the route creates
  // a PatientInsurance row in the same transaction. When absent, no
  // enrollment is created and the patient is treated as cash.
  // The legacy `hasInsurance` / `insuranceId` / `insuranceNo` fields
  // on the Patient model are no longer accepted here — insurance
  // enrollment is exclusively through `insuranceEnrollment`.
  insuranceEnrollment: insuranceEnrollmentInputSchema.optional(),
})

export const updatePatientSchema = createPatientSchema.partial()

// User/Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine(data => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
})

// Appointment schemas
export const createAppointmentSchema = z.object({
  patientId: idString(),
  doctorId: idString(),
  date: z.string().datetime(),
  duration: z.number().int().positive().max(480).default(30), // max 8 hours
  reason: z.string().min(1).max(500),
  notesForStaff: z.string().max(1000).optional(),
})

// Prescription schemas
export const createPrescriptionSchema = z.object({
  visitId: idString(),
  patientId: idString(),
  doctorId: idString(),
  medicationName: z.string().min(1).max(200),
  dosage: z.string().min(1).max(100),
  frequency: z.string().min(1).max(100),
  durationDays: z.number().int().positive().max(365),
  quantity: z.number().int().positive(),
  instructions: z.string().max(1000).optional(),
  refills: z.number().int().min(0).max(12).default(0),
})

// Pharmacy schemas
export const createDrugSchema = z.object({
  drugCode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  genericName: z.string().min(1).max(200),
  categoryId: idString(),
  drugClass: z.string().max(100).optional(),
  schedule: z.enum(['OTC', 'PRESCRIPTION', 'CONTROLLED', 'NARCOTIC', 'RESTRICTED']),
  dosageForm: z.enum(['TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'INJECTION', 'IV_FLUID', 'CREAM', 'OINTMENT', 'GEL', 'DROPS', 'INHALER', 'SUPPOSITORY', 'PATCH', 'POWDER', 'OTHER']),
  strength: z.string().min(1).max(50),
  strengthValue: z.number().positive().optional(),
  strengthUnit: z.string().max(20).optional(),
  packageSize: z.number().int().positive(),
  packageUnit: z.string().min(1).max(20),
  manufacturer: z.string().max(200).optional(),
  countryOfOrigin: z.string().max(100).optional(),
  indications: z.string().max(2000).optional(),
  contraindications: z.string().max(2000).optional(),
  sideEffects: z.string().max(2000).optional(),
  storage: z.enum(['ROOM_TEMP', 'REFRIGERATED', 'FROZEN', 'CONTROLLED']),
  shelfLifeMonths: z.number().int().positive().optional(),
  isRestricted: z.boolean().default(false),
})

// Insurance schemas
export const createInsuranceCompanySchema = z.object({
  companyCode: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  contactPerson: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  tin: z.string().max(50).optional(),
})

// Finance schemas
export const createJournalEntrySchema = z.object({
  entryDate: z.string().datetime(),
  postingDate: z.string().datetime(),
  description: z.string().min(1).max(500),
  reference: z.string().max(100).optional(),
  referenceType: z.enum(['INVOICE', 'PAYMENT', 'EXPENSE', 'PURCHASE', 'ADJUSTMENT', 'CREDIT_NOTE', 'DEBIT_NOTE']),
  totalDebit: z.number().positive(),
  totalCredit: z.number().positive(),
  requiresApproval: z.boolean().default(false),
  lines: z.array(z.object({
    accountId: idString(),
    debitAmount: z.number().min(0),
    creditAmount: z.number().min(0),
    description: z.string().max(500).optional(),
  })).min(2, 'At least 2 lines required (debit and credit)'),
}).refine(data => Math.abs(data.totalDebit - data.totalCredit) < 0.01, {
  message: 'Total debits must equal total credits',
  path: ['totalCredit'],
})

// Validation helper — throws ApiError so withAuth catch block returns the right status
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw ApiError.badRequest('Validation failed', result.error.flatten().fieldErrors)
  }
  return result.data
}

// Query params validator
export function validateQuery<T>(schema: z.ZodSchema<T>, searchParams: URLSearchParams): T {
  const data = Object.fromEntries(searchParams.entries())
  return validateRequest(schema, data)
}
