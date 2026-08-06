// Shared API types - used by both client and server
import { 
  Patient, 
  User, 
  Visit, 
  Appointment, 
  Prescription, 
  Drug, 
  DrugBatch,
  InsuranceCompany,
  InsurancePlan,
  Admission,
  Invoice,
  JournalEntry,
  TaxInvoice,
  Payment
} from '@/lib/generated-prisma'

// Pagination
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// API Error response
export interface ApiErrorResponse {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

// Success response wrapper
export interface ApiSuccessResponse<T> {
  data: T
  meta?: Record<string, unknown>
}

// Patient types
export interface PatientListItem {
  id: string
  patientNumber: string
  firstName: string
  lastName: string
  gender: string
  dateOfBirth: string
  phone: string
  hasInsurance: boolean
  isActive: boolean
  createdAt: string
}

export type PatientCreateInput = Omit<Patient, 'id' | 'createdAt' | 'updatedAt' | 'patientNumber'>
export type PatientUpdateInput = Partial<PatientCreateInput>

// Visit types
export type VisitWithRelations = Visit & {
  patient: Patient
  doctor: User | null
  diagnoses: any[]
  prescriptions: any[]
  labOrders: any[]
}

export interface VisitCreateInput {
  patientId: string
  type: string
  chiefComplaint?: string
  bloodPressure?: string
  heartRate?: string
  temperature?: string
  weight?: number
  height?: number
  priority?: string
  assignedDoctorId?: string
}

// Appointment types
export interface AppointmentCreateInput {
  patientId: string
  doctorId: string
  date: string // ISO datetime
  duration: number
  reason: string
  notesForStaff?: string
}

// Prescription types
export interface PrescriptionCreateInput {
  visitId: string
  patientId: string
  doctorId: string
  medicationName: string
  dosage: string
  frequency: string
  durationDays: number
  quantity: number
  instructions?: string
  refills?: number
  drugId?: string
}

// Pharmacy types
export interface DispenseInput {
  prescriptionId: string
  manualDrugId?: string
  manualBatchId?: string
}

export interface PharmacySummary {
  totalDrugs: number
  lowStockCount: number
  nearExpiryCount: number
  dispensedToday: number
  pendingDispensing: number
  recentMovements: any[]
}

// Insurance types
export interface InsurancePreviewInput {
  patientId: string
  items: Array<{
    serviceType: string
    serviceId: string | null
    basePrice: number
  }>
}

export interface InsurancePreviewResult {
  items: Array<{
    serviceId: string | null
    basePrice: number
    finalPrice: number
    insuranceShare: number
    patientShare: number
    appliedRule: string | null
  }>
  total: {
    base: number
    final: number
    insurance: number
    patient: number
  }
}

// Finance types
export interface JournalEntryCreateInput {
  entryDate: string
  postingDate: string
  description: string
  reference?: string
  referenceType: 'INVOICE' | 'PAYMENT' | 'EXPENSE' | 'PURCHASE' | 'ADJUSTMENT' | 'CREDIT_NOTE' | 'DEBIT_NOTE'
  totalDebit: number
  totalCredit: number
  requiresApproval?: boolean
  lines: Array<{
    accountId: string
    debitAmount: number
    creditAmount: number
    description?: string
  }>
}

// IPD types
export interface AdmissionCreateInput {
  patientId: string
  visitId?: string
  wardId?: string
  bedId?: string
  type: string
  initialDeposit?: number
}

// Health check
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded'
  timestamp: string
  latencyMs: number
  checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; error?: string }>
}

// Session user extension
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: string
    }
  }
  
  interface User {
    id: string
    email: string
    name: string
    role: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
  }
}
