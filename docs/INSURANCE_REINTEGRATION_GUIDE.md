# Vital Core — Insurance Module Re-integration Guide

> **Purpose**: This document is the *single source of truth* for re-integrating the
> Insurance module into Vital Core after it has been removed. It is written as a
> **mega-prompt**: paste the whole thing into an LLM (or hand it to a developer)
> and it should be possible to recreate the module from scratch with no other
> reference material.
>
> **Status as of removal (2026-08-12)**: The module existed in production for ~6
> months, went through 6 design rounds (R46–R51), and was fully integrated with
> the pharmacy, lab, radiology, IPD, finance, billing, and visit-cycle modules.
> It is being removed in a single atomic commit because the clinic has decided
> to operate cash-only for the foreseeable future.
>
> **When to re-integrate**: When the clinic signs contracts with insurance
> partners (AAR, Sanlam, Jubilee, etc.) and needs to bill third parties.

---

## Table of Contents

1. [Overview & Business Value](#1-overview--business-value)
2. [Domain Model — 7 Prisma Models](#2-domain-model--7-prisma-models)
3. [Enums — 7 Insurance-Specific Types](#3-enums--7-insurance-specific-types)
4. [Cross-Cutting Schema Changes](#4-cross-cutting-schema-changes)
5. [Settings & Feature Flags](#5-settings--feature-flags)
6. [Visit State Machine Integration](#6-visit-state-machine-integration)
7. [Core Business Logic — 4 Lib Files](#7-core-business-logic--4-lib-files)
8. [Finance Integration — 7 Lib Files](#8-finance-integration--7-lib-files)
9. [API Endpoints — 25+ Routes](#9-api-endpoints--25-routes)
10. [UI Pages — 11 Pages](#10-ui-pages--11-pages)
11. [Pricing Engine](#11-pricing-engine)
12. [Email & Messaging Integration](#12-email--messaging-integration)
13. [Visit-Cycle Walk-Throughs](#13-visit-cycle-walk-throughs)
14. [Seed Data](#14-seed-data)
15. [Tests — 30+ Scratch Scripts](#15-tests--30-scratch-scripts)
16. [Re-integration Steps — Ordered Playbook](#16-re-integration-steps--ordered-playbook)
17. [File Inventory — Complete List to Re-create](#17-file-inventory--complete-list-to-re-create)
18. [Rollout & Validation](#18-rollout--validation)

---

## 1. Overview & Business Value

### What the Insurance Module Does

Vital Core is a hospital management system. The Insurance module lets a
cash-or-insurance clinic bill third-party insurance companies for covered
services. The full lifecycle:

1. **Onboard insurers** (AAR Health, Sanlam, Jubilee, etc.) with negotiated
   rates and copay rules per partner.
2. **Enroll patients** with their insurance details (policy #, member #,
   coverage dates).
3. **Verify eligibility** on a per-visit basis by calling the insurer's
   third-party eligibility API.
4. **Defer billing** — when verified APPROVED, the consultation fee is added
   to the FINAL- invoice (not paid up front) and the visit is marked for
   claim submission.
5. **Submit claims** — a claim is created per invoice (or per visit for
   cashless), routed to the insurer with EOB/835 data.
6. **Adjudicate** — track claim through DRAFT → SUBMITTED → ACKNOWLEDGED
   → APPROVED/REJECTED → PAID, with denial reason codes and write-offs.
7. **Reconcile** — when the insurer pays, post to the AR-Insurance account
   (1132) and clear the receivable.
8. **Resubmit** — denied claims can be appealed/resubmitted with a
   reference back to the original.

### Design Principles

- **Optional per-tenant** — every clinic decides independently whether to
  accept insurance. The `insurance.enabled` SystemSetting toggles the
  entire module on/off.
- **No regressions to cash flow** — when insurance is OFF, the visit cycle
  is exactly the consolidated R45 spec: cash up front, no validation, no
  claim, no AR-Insurance.
- **Per-insurance negotiation** — each insurer can have its own copay
  type, consultation fee override, and per-billable-item rate.
- **Audit-first** — every verification, every status change, every denial
  is logged to an append-only table for compliance.
- **Mock-friendly** — `lib/insurance/third-party.ts` provides a
  deterministic mock so the entire system can be developed and tested
  without a real insurer API.

### Why It Was Removed

The clinic is operating cash-only for the foreseeable future. The module
adds ~1,300 lines of schema, ~3,000 lines of lib code, ~120 KB of API
routes, and ~250 KB of UI pages — and most of the logic is dead weight
without insurance partners. The removal is atomic and complete: there are
NO surviving dead keys, NO dead columns, NO feature flags. The visit
cycle is purely cash.

---

## 2. Domain Model — 7 Prisma Models

The Insurance module adds 7 Prisma models to the schema. All live in
`lib/generated-prisma/schema.prisma` (which is the project's source of
truth — `prisma/schema.prisma` is a stub).

### 2.1 `InsuranceCompany` (insurer master)

```prisma
model InsuranceCompany {
  id                     String                   @id @default(cuid())
  name                   String                   @unique
  code                   String                   @unique
  contactPerson          String?
  phone                  String?
  email                  String?
  address                String?
  paymentTerms           String?                  @default("Net 30")
  // ─── Copay configuration ────────────────────────────
  // FLAT:               patient pays standardPatientCopay per service
  // PERCENTAGE:         patient pays copayPercentage% of negotiated price
  // COPAY_PLUS_PERCENT: standardPatientCopay + copayPercentage% of remainder
  // NO_COPAY:           insurance covers 100%
  // FULL:               patient pays 100% (no coverage)
  copayType              CopayType                @default(FLAT)
  standardPatientCopay   Float                    @default(0)
  copayPercentage        Float                    @default(0)
  copayDeductible        Float                    @default(0)
  // Per-insurance consultation fee override (null = global default)
  consultationFee        Float?
  isActive               Boolean                  @default(true)
  createdAt              DateTime                 @default(now())
  updatedAt              DateTime                 @updatedAt
  dispensingLogs         DispensingLog[]
  insuranceBillableRates InsuranceBillableRate[]
  claims                 InsuranceClaim[]
  priceList              InsurancePriceListItem[]
  patients               Patient[]
  enrollments            PatientInsurance[]
  taxInvoices            TaxInvoice[]
  verifications          InsuranceVerification[]
}
```

**Key relations**:
- `Patient.insurance` (1-to-many) — the *simple* insurance FK (legacy,
  see §4.1) used only by the `hasInsurance` boolean.
- `PatientInsurance.insurance` (1-to-many) — the proper enrollment relation.
- `InsurancePriceListItem.insurance` — negotiated rates per service.
- `InsuranceClaim.insurance` — claims submitted to this insurer.
- `InsuranceVerification.insurance` — per-visit verification audit log.
- `TaxInvoice.insurance` — for tax invoices issued to insurers (not patients).
- `DispensingLog.insurance` — pharmacy dispenses that were billed to insurance.

### 2.2 `InsurancePriceListItem` (negotiated rates per service)

```prisma
model InsurancePriceListItem {
  id              String           @id @default(cuid())
  insuranceId     String
  serviceType     ServiceType?     // CONSULTATION | LAB_TEST | PHARMACY | PROCEDURE | RADIOLOGY | OTHER
  // serviceId is intentionally un-typed: a single row can refer to a
  // BillableItem, a Drug, a LabTestCatalog row, or a RadiologyCatalog row.
  // serviceType discriminates which table to look up in.
  serviceId       String?
  negotiatedPrice Float
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  insurance       InsuranceCompany @relation(fields: [insuranceId], references: [id])

  @@unique([insuranceId, serviceId])
}
```

**Used by**: `PricingEngine.calculateItemPrice()` (§11) to determine
the copay split when a patient is insured.

### 2.3 `PatientInsurance` (enrollment record)

```prisma
model PatientInsurance {
  id             String                   @id @default(cuid())
  patientId      String
  insuranceId    String
  policyNumber   String
  memberNumber   String?
  coverageStart  DateTime
  coverageEnd    DateTime?
  status         VerificationStatus       @default(PENDING)
  // PENDING = awaiting first-time verification
  // VERIFIED = confirmed eligible, can bill
  // EXPIRED  = coverage end date passed
  // INVALID  = manual invalidation (e.g. policy cancelled)
  verifiedAt     DateTime?
  verifiedById   String?
  isActive       Boolean                  @default(true)
  createdAt      DateTime                 @default(now())
  updatedAt      DateTime                 @updatedAt
  authorizations InsuranceAuthorization[]
  insurance      InsuranceCompany         @relation(fields: [insuranceId], references: [id])
  patient        Patient                  @relation(fields: [patientId], references: [id])
  verifiedBy     User?                    @relation("InsuranceVerifier", fields: [verifiedById], references: [id])

  @@unique([patientId, insuranceId, policyNumber])
}
```

**Note on the `status` field** — this is the *enrollment* status, not the
*visit verification* status. The latter is `InsuranceVerificationStatus`
on a separate `InsuranceVerification` row per visit. An enrollment is
VERIFIED once (per the legacy auto-validation flow), and each visit gets
its own `InsuranceVerification` row reflecting what the third-party said
*for that specific visit*.

### 2.4 `InsuranceAuthorization` (pre-auth requests)

```prisma
model InsuranceAuthorization {
  id                 String           @id @default(cuid())
  patientInsuranceId String
  requestNumber      String           @unique
  requestDate        DateTime         @default(now())
  serviceType        ServiceType
  serviceName        String
  estimatedCost      Float
  status             AuthStatus       @default(PENDING)
  // NOT_REQUIRED | PENDING | APPROVED | REJECTED
  authorizedAmount   Float?
  authorizationCode  String?
  validFrom          DateTime?
  validTo            DateTime?
  notes              String?
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt
  patientInsurance   PatientInsurance @relation(fields: [patientInsuranceId], references: [id])
}
```

**Used by**: pharmacy/lab/radiology orders that *require* pre-auth per
the billable item's `requiresAuth` flag. The dispense/render flow
blocks until an APPROVED authorization exists for the service.

### 2.5 `InsuranceClaim` (claim lifecycle)

```prisma
model InsuranceClaim {
  id          String   @id @default(cuid())
  claimNumber String   @unique
  insuranceId String
  patientId   String
  visitId     String?  @unique
  invoiceId   String?  // multiple claims allowed per invoice for resubmissions
  labOrderId  String?  @unique
  claimDate   DateTime @default(now())

  // ───── EOB/835 amounts (mirrors standard 835 segments) ─────
  totalAmount          Float
  allowedAmount        Float?   // what insurer says it allows
  approvedAmount       Float?   // what insurer will pay
  contractualAdjAmount Float?   // (Billed - Allowed) → Contractual Allowance
  patientCopayAmount   Float?   // patient's share from pricing engine
  insuranceNetAmount   Float?   // insurer's share (usually = approvedAmount)
  paymentVariance      Float?   // (approved - actualPaid) — underpayment
  eligibleAmount       Float    // legacy alias for approvedAmount

  // ───── Lifecycle state machine ─────
  // DRAFT → SUBMITTED → ACKNOWLEDGED → APPROVED/REJECTED → PAID
  // REJECTED → PENDING_REPROCESSING (appeal) → DRAFT (resubmit)
  status             String    @default("DRAFT")
  submissionDate     DateTime?
  acknowledgmentDate DateTime?
  approvalDate       DateTime?
  paymentDate        DateTime?
  paymentReference   String?   // cheque #, EFT ref, ERA trace #
  paidAmount         Float?

  // ───── Denial info ─────
  denialReasonCode        DenialReasonCode?
  denialCategory          DenialCategory?
  denialRarcCode          String?   // RARC code (free text)
  denialReason            String?   // free-text detail
  denialDate              DateTime?
  denialWriteOffAmount    Float?
  denialWriteOffDate      DateTime?
  denialWriteOffJournalId String?   // FK to JournalEntry for the write-off

  // ───── Resubmission chain ─────
  originalClaimId    String?
  resubmissionCount  Int       @default(0)
  isResubmission     Boolean   @default(false)
  appealStatus       String?   // NOT_APPEALED | APPEALED | WON | LOST
  appealReason       String?
  appealDecisionDate DateTime?
  notes              String?

  postedToLedger         Boolean @default(false)
  writeOffPostedToLedger Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  insurance        InsuranceCompany       @relation(fields: [insuranceId], references: [id])
  invoice          Invoice?               @relation(fields: [invoiceId], references: [id])
  labOrder         LabOrder?              @relation(fields: [labOrderId], references: [id])
  patient          Patient                @relation(fields: [patientId], references: [id])
  visit            Visit?                 @relation(fields: [visitId], references: [id])
  originalClaim    InsuranceClaim?        @relation("ClaimResubmission", fields: [originalClaimId], references: [id])
  resubmissions    InsuranceClaim[]       @relation("ClaimResubmission")
  adjudicationLogs ClaimAdjudicationLog[]
}
```

**Lifecycle state machine** (enforced by `ClaimAdjudicationService`):

```
DRAFT ──submit──▶ SUBMITTED ──ack──▶ ACKNOWLEDGED
                                       │
                          ┌──approve──┤
                          │          │
                          ▼          ▼
                      APPROVED    REJECTED ──appeal──▶ PENDING_REPROCESSING ──▶ DRAFT (resubmit)
                          │
                       (denial write-off)
                          │
                          ▼
                        PAID
```

### 2.6 `ClaimAdjudicationLog` (per-action audit)

```prisma
model ClaimAdjudicationLog {
  id            String            @id @default(cuid())
  claimId       String
  action        String   // STATUS_CHANGE | NOTE | SUBMISSION | DENIAL | APPEAL | APPROVAL | PAYMENT | WRITE_OFF
  fromStatus    String?
  toStatus      String?
  reasonCode    DenialReasonCode?
  amount        Float?
  notes         String?
  performedById String?
  performedAt   DateTime          @default(now())
  claim         InsuranceClaim    @relation(fields: [claimId], references: [id], onDelete: Cascade)
  performedBy   User?             @relation("AdjudicationActions", fields: [performedById], references: [id])

  @@index([claimId])
  @@index([performedAt])
}
```

Append-only. Every claim status change, every note, every denial/appeal
writes a row here. Used for compliance audit and analytics.

### 2.7 `InsuranceVerification` (per-visit third-party audit)

```prisma
model InsuranceVerification {
  id                  String                      @id @default(cuid())
  visitId             String
  patientId           String
  insuranceId         String?                     // null = no enrollment
  memberNumber        String?
  policyNumber        String?
  // The third-party provider queried (e.g. "AAR Health Gateway")
  provider            String?
  requestPayload      Json?
  responsePayload     Json?
  status              InsuranceVerificationStatus
  // PENDING | APPROVED | DENIED | ERROR
  verificationNumber  String?
  coverageLimit       Float?
  deductibleRemaining Float?
  coverageValidFrom   DateTime?
  coverageValidTo     DateTime?
  reason              String?                     // denial/error message
  verifiedById        String?                     // cashier who triggered
  createdAt           DateTime                    @default(now())

  visit      Visit             @relation(fields: [visitId], references: [id], onDelete: Cascade)
  patient    Patient           @relation(fields: [patientId], references: [id])
  insurance  InsuranceCompany?  @relation(fields: [insuranceId], references: [id])
  verifiedBy User?             @relation("InsuranceVerificationTrigger", fields: [verifiedById], references: [id])

  @@index([visitId])
  @@index([patientId])
  @@index([status])
  @@index([createdAt])
}
```

**R47 spec** — every per-visit verification attempt writes one row. The
visit page renders the full history so the cashier can see every check,
not just the latest.

### 2.8 `InsuranceBillableRate` (per-billable-item per-insurer rate)

```prisma
model InsuranceBillableRate {
  id             String           @id @default(cuid())
  insuranceId    String
  billableItemId String
  rate           Float
  isActive       Boolean          @default(true)
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  billableItem   BillableItem     @relation(fields: [billableItemId], references: [id])
  insurance      InsuranceCompany @relation(fields: [insuranceId], references: [id])

  @@unique([insuranceId, billableItemId])
}
```

**Used by**: IPD auto-charges. When a floor stock usage or daily charge
is recorded for an insured patient, the rate is looked up here instead
of the BillableItem.standardRate.

---

## 3. Enums — 7 Insurance-Specific Types

All 7 enums need to be added to the schema in the same Prisma file.

### 3.1 `CopayType`

```prisma
enum CopayType {
  FLAT
  PERCENTAGE
  COPAY_PLUS_PERCENT
  NO_COPAY
  FULL
}
```

### 3.2 `AuthStatus`

```prisma
enum AuthStatus {
  NOT_REQUIRED
  PENDING
  APPROVED
  REJECTED
}
```

### 3.3 `VerificationStatus` (enrollment-level)

```prisma
enum VerificationStatus {
  PENDING
  VERIFIED
  EXPIRED
  INVALID
}
```

### 3.4 `InsuranceVerificationStatus` (visit-level)

```prisma
enum InsuranceVerificationStatus {
  PENDING   // third-party still processing
  APPROVED  // third-party confirmed coverage for this visit
  DENIED    // third-party rejected
  ERROR     // couldn't reach third-party
}
```

### 3.5 `ClaimStatus`

```prisma
enum ClaimStatus {
  DRAFT
  SUBMITTED
  ACKNOWLEDGED
  APPROVED
  PAID
  REJECTED
  PENDING_REPROCESSING  // claim denied, being appealed
}
```

### 3.6 `DenialReasonCode` (40+ CARC codes)

```prisma
enum DenialReasonCode {
  // Patient responsibility
  DEDUCTIBLE            // 1
  COPAY                 // 2
  COINSURANCE           // 3
  NONCOVERED            // 4
  NONCOVERED_SERVICE    // 6
  PRE_EXISTING          // 10
  OUTPATIENT            // 12
  PATIENT_INELIGIBLE    // 27

  // Coding / technical
  MISSING_INFO          // 16
  INVALID_CODE          // 18
  BUNDLED               // 97
  UNBUNDLED             // 109
  MODIFIER_MISSING      // 4
  TIMELY_FILING         // 29

  // Authorization
  NO_PREAUTH            // 197
  PREAUTH_EXPIRED       // 198
  PREAUTH_DENIED        // 199

  // Coverage / policy
  NOT_COVERED_PLAN      // 50
  BENEFIT_EXHAUSTED     // 119
  OUT_OF_NETWORK        // 109
  POLICY_INACTIVE       // 27
  DUPLICATE_CLAIM       // 18

  // Generic
  OTHER                 // 22
  PATIENT_RESP          // 23
  PENDING_INFO          // 133
  MISSING_DOCS          // 252
  CONTRACT_LIMIT        // 38

  // Custom (clinic-specific)
  INSUFFICIENT_FUNDS    // 9
  FRAUD_SUSPECTED       // 140
  DUPLICATE_DAILY       // 151
  RETRO_ELIGIBILITY     // 177
  COORDINATION_OF_BENEFITS // 22
  MEDICAL_NECESSITY     // 50
  INVALID_REFERRAL      // 162
  OUTPATIENT_FREQUENCY  // 151
  NOT_LICENSED_PROVIDER // 185
  PRIOR_AUTH_INCORRECT  // 27
  BUNDLE_EDIT           // 97
  TIMELY_FILING_EXPIRED // 29
  DUPLICATE_HISTORY     // 18
  EXPERIMENTAL          // 122
  COSMETIC              // 52
}
```

### 3.7 `DenialCategory` (used for analytics rollups)

```prisma
enum DenialCategory {
  TECHNICAL       // coding, missing info, format
  AUTHORIZATION   // no pre-auth, expired pre-auth
  COVERAGE        // non-covered, plan limit, OON
  CLINICAL        // medical necessity, experimental
  ADMINISTRATIVE  // timely filing, COB
  PATIENT         // deductible, copay
  FRAUD           // duplicate, ineligible
  OTHER
}
```

---

## 4. Cross-Cutting Schema Changes

Several existing models gain insurance-related columns. These must be
added back when re-integrating.

### 4.1 `Patient` model — adds 3 columns

```prisma
model Patient {
  // ... existing columns ...

  hasInsurance Boolean  @default(false)  // legacy yes/no flag
  insuranceId  String?                    // FK to InsuranceCompany (legacy)
  insuranceNo  String?                    // legacy policy number (free text)

  // ... existing relations ...
  insurance              InsuranceCompany?       @relation(fields: [insuranceId], references: [id])
  insuranceEnrollments   PatientInsurance[]      // proper enrollment (multi-policy)
  claims                 InsuranceClaim[]        // claims where this patient is the beneficiary
  insuranceVerifications InsuranceVerification[] // per-visit verifications for this patient
}
```

**R48 spec** — the legacy `hasInsurance`/`insuranceId`/`insuranceNo`/
`insurance` fields are kept for backward compat but the *real* patient
insurance record lives in `PatientInsurance`. The create-patient form
captures the enrollment in the optional "Insurance Enrollment" section.

### 4.2 `User` model — adds 3 relations

```prisma
model User {
  // ... existing ...
  insuranceVerifications    PatientInsurance[]      @relation("InsuranceVerifier")
  triggeredVerifications    InsuranceVerification[] @relation("InsuranceVerificationTrigger")
  adjudicationActions       ClaimAdjudicationLog[]  @relation("AdjudicationActions")
}
```

### 4.3 `Visit` model — adds 2 relations

```prisma
model Visit {
  // ... existing ...
  claim                  InsuranceClaim?         // the per-visit claim (when insurance-only)
  insuranceVerifications InsuranceVerification[] // every verification attempt for this visit
}
```

### 4.4 `LabOrder` model — adds 1 relation

```prisma
model LabOrder {
  // ... existing ...
  claim InsuranceClaim?  // claim attached to this lab order (R46: per-order claims)
}
```

### 4.5 `DispensingLog` model — adds 3 columns + 1 relation

```prisma
model DispensingLog {
  // ... existing ...
  insuranceId        String?           // FK to InsuranceCompany (when billed to insurer)
  insuranceApproval  String?           // the pre-auth code (if required)
  insurancePayAmount Float             // insurer's share
  // patientPayAmount already exists; for cash it's the full amount
  // for insurance it's whatever the patient owes (copay)
  // ...
  insurance InsuranceCompany? @relation(fields: [insuranceId], references: [id])
}
```

### 4.6 `Invoice` model — adds 1 column + 1 relation

```prisma
model Invoice {
  // ... existing ...
  isInsurance Boolean @default(false)  // true if this is the insurance-side invoice after auto-split
  // ...
  claim       InsuranceClaim[]  // claims attached to this invoice (resubmissions allowed)
}
```

### 4.7 `Payment` model — adds 4 columns (insurance waiver tracking)

```prisma
model Payment {
  // ... existing ...
  // ─── Insurance waiver tracking ─────────────────────
  // When a patient with active insurance pays via cash/card/MoMo
  // instead of routing to the insurer, capture the reason for reporting.
  waivedInsurance      Boolean  @default(false)
  insuranceId          String?  // which insurer was on file when waived
  waiverReason         String?  // free-text why (e.g. "deductible not met")
  insuranceSavedAmount Float?   // the UGX that would have been claimed
  // ─────────────────────────────────────────────────
}
```

### 4.8 `BillableItem` model — adds 1 column + 1 relation

```prisma
model BillableItem {
  // ... existing ...
  insuranceRate  Float?  // default per-insurance rate (overridden by InsuranceBillableRate)
  // ...
  insuranceRates InsuranceBillableRate[]
}
```

### 4.9 `InpatientCharge` model — adds 2 columns

```prisma
model InpatientCharge {
  // ... existing ...
  insuranceId    String?  // billed to this insurer
  insuranceShare Float?   // insurer's portion
  patientShare   Float?   // patient's portion
}
```

### 4.10 `DailyChargeSummary` model — adds 1 column

```prisma
model DailyChargeSummary {
  // ... existing ...
  insuranceTotal Float @default(0)  // sum of insuranceShare across charges that day
}
```

### 4.11 `EmailMessage` model — adds 1 column

```prisma
model EmailMessage {
  // ... existing ...
  claimId String?  // FK to InsuranceClaim; for routing inbound insurer emails
}
```

### 4.12 `TaxInvoice` model — adds 1 column + 1 relation

```prisma
model TaxInvoice {
  // ... existing ...
  insuranceId String?  // when the tax invoice is for an insurer (B2B), not a patient
  // ...
  insurance InsuranceCompany? @relation(fields: [insuranceId], references: [id])
}
```

### 4.13 `VisitPaymentStatus`, `LabPaymentStatus`, `PharmacyPaymentStatus` enums

Each of these gains an `INSURANCE_COVERED` value:

```prisma
enum VisitPaymentStatus { UNPAID PARTIAL PAID WAIVED INSURANCE_COVERED }
enum LabPaymentStatus    { UNPAID PARTIAL PAID WAIVED INSURANCE_COVERED }
enum PharmacyPaymentStatus { UNPAID PARTIAL PAID WAIVED INSURANCE_COVERED }
```

### 4.14 `DispensePriceType` enum

```prisma
enum DispensePriceType {
  CASH
  INSURANCE     // ← re-add this value
  MEMBER
  STAFF
  COMPLIMENTARY
}
```

### 4.15 `Tenant` model — adds 2 columns

```prisma
model Tenant {
  // ... existing ...
  claimPrefix String? @default("CLM")
  claimFormat String? @default("{PREFIX}-{YYYY}{MM}{DD}-{SEQ:4}")
  // (Format tokens same as other numbering — see lib/formatters.ts renderNumber)
}
```

### 4.16 `lib/insurance/seed-price-list.ts` (new)

When re-creating `lib/insurance/seed-price-list.ts`:
- For each new `InsuranceCompany`, walk the standard catalog (BillableItem,
  Drug, LabTestCatalog, RadiologyCatalog) and create an
  `InsurancePriceListItem` per service with a default negotiated price
  (typically `standardRate * 0.85` — 15% discount).
- Skip if a row already exists (idempotent).

---

## 5. Settings & Feature Flags

Three settings/flags in the `lib/settings/registry.ts` are insurance-specific.

### 5.1 `insurance.enabled` — feature toggle (R49)

```typescript
// lib/settings/registry.ts
{
    key: "insurance.enabled",
    label: "Insurance Module Enabled",
    description: "When OFF, all insurance routes return 404 and the create-visit form treats every patient as cash.",
    category: "FEATURE_FLAG",
    valueType: "BOOLEAN",
    defaultValue: "true",
    group: "Insurance",
}
```

The default is **`true`** for backward compat. Admin flips to `false`
from the Insurance Partners page when the clinic decides to go
cash-only. When `false`:
- The 2 nav items (`Insurance Partners`, `Insurance Claims`) are hidden
  in `app/dashboard/layout.tsx`.
- The "Insurance Enrollment" section is hidden on the patient
  create/edit forms.
- The "Validate Insurance" panel is hidden on the create-visit modal
  and on the visit page.
- The create-visit route always picks `ConsultationBilling` (no
  `PendingInsuranceValidation`).
- The visit creation API treats all patients as cash.
- The R49d cash flow means: cashier never validates per visit, no
  claim is ever created, no AR-Insurance is ever touched.

### 5.2 `numbering.claim.prefix` — claim number format

```typescript
{
    key: "numbering.claim.prefix",
    label: "Insurance Claim Prefix",
    category: "NUMBERING",
    valueType: "STRING",
    defaultValue: "CLM",
    group: "Insurance",
},
```

Combined with the format template `{PREFIX}-{YYYY}{MM}{DD}-{SEQ:4}`,
the claim number looks like `CLM-20260812-0001`. The submit-claim
route uses this for generating claim numbers.

### 5.3 `billing.contractualAllowanceAccountCode`

```typescript
{
    key: "billing.contractualAllowanceAccountCode",
    label: "Contractual Allowance Account Code",
    description: "Used when an insurance claim is paid below billed amount",
    category: "BILLING",
    valueType: "STRING",
    defaultValue: "4220",
    group: "Accounting",
}
```

The default `4220` is the standard healthcare Contractual Allowance
account. When the insurer pays less than billed, the difference is
posted as a credit to 4220 (reducing revenue). This is the
"contractual write-off" pattern from US healthcare accounting.

### 5.4 `billing.badDebtAccountCode` (related)

```typescript
{
    key: "billing.badDebtAccountCode",
    label: "Bad Debt Account Code",
    description: "Used when writing off denied/uncollectable claims",
    category: "BILLING",
    valueType: "STRING",
    defaultValue: "5430",
    group: "Accounting",
}
```

`5430` is the standard Bad Debt Expense account. When a claim is denied
and the clinic decides to write it off (vs. pursue the patient), the
write-off posts to 5430.

### 5.5 Chart of Account seeds

The seed must create:
- `1120` — Bank (Cash at Bank)
- `1131` — Accounts Receivable - Patient
- `1132` — Accounts Receivable - Insurance ← re-add
- `4220` — Contractual Allowance ← re-add
- `5430` — Bad Debt Expense ← re-add

---

## 6. Visit State Machine Integration

The Insurance module adds one new visit status and a number of
conditional branches to the state machine. The state machine itself
lives in `lib/visits/status.ts` and `lib/visits/consultation-fee.ts`.

### 6.1 `PendingInsuranceValidation` (R47)

```typescript
export const VISIT_STATUS = {
    ConsultationBilling: "ConsultationBilling",
    PendingInsuranceValidation: "PendingInsuranceValidation", // ← re-add
    Triage: "Triage",
    InConsultation: "InConsultation",
    PendingOrders: "PendingOrders",
    DirectServicePending: "DirectServicePending",
    FinalBilling: "FinalBilling",
    Completed: "Completed",
    Discontinued: "Discontinued",
    // Legacy aliases preserved for backward compat
    Waiting: "Waiting", Triaged: "Triaged", Consultation: "Consultation",
    Laboratory: "Laboratory", Radiology: "Radiology", Pharmacy: "Pharmacy",
} as const;
```

### 6.2 Visit creation initial status matrix (R48 + R49 + R49c)

The `POST /api/patients/[id]/visit` route picks the initial status from
this table:

| Patient has insurance? | Visit type | Initial status |
|---|---|---|
| No enrollment | billable | `ConsultationBilling` (cash flow, consult invoice up front) |
| No enrollment | non-billable (FOLLOW_UP / VACCINATION / ANTENATAL) | `Triage` (zero-fee auto-transition) |
| No enrollment | direct (LAB_ONLY / RADIOLOGY_ONLY / PRESCRIPTION_ONLY) | `DirectServicePending` |
| Enrollment on file + verification=APPROVED (passed in body) | billable | `Triage` (deferred billing, fee → FINAL- invoice) |
| Enrollment on file + verification=DENIED (passed in body) | billable | `ConsultationBilling` (cash fallback, consult invoice at negotiated rate) |
| Enrollment on file + no verification provided | billable | `PendingInsuranceValidation` (cashier can verify later) |
| Insurance feature OFF | any | `ConsultationBilling` (or `Triage` if zero-fee, or `DirectServicePending` if direct) |

### 6.3 Verify-insurance flow (R47)

The cashier presses "Validate Insurance" on the visit page →
`POST /api/visits/[id]/verify-insurance` →
`verifyInsuranceWithProvider()` (third-party mock) → record an
`InsuranceVerification` row → transition the visit:

| Visit status | Verification result | New visit status | Side effects |
|---|---|---|---|
| `PendingInsuranceValidation` | APPROVED | `Triage` | None — fee is deferred to FINAL- invoice at first order placement |
| `PendingInsuranceValidation` | DENIED | `ConsultationBilling` | Issue a consultation fee invoice at the negotiated rate (cash fallback) |
| `PendingInsuranceValidation` | ERROR | `PendingInsuranceValidation` (stays) | None — cashier can retry |
| Any other status | any | (no change) | Verification is logged for audit; visit status untouched |

### 6.4 Per-insurance consultation fee resolution

`lib/visits/consultation-fee.ts` exports `getConsultationFeeForNewVisit`:

```typescript
type FeeResolution = {
    fee: number;
    source: 'insurance' | 'global';
    insuranceName?: string;
};
```

Resolution order:
1. If `isInsuranceEnabled() === false` → return global default
2. If patient has an active enrollment AND `InsuranceCompany.consultationFee` is set → use that (source='insurance')
3. Otherwise → use the global `visit.consultationFee` SystemSetting (default 50,000 UGX)

### 6.5 Visit state machine changes summary

Without insurance, the visit cycle is:
```
ConsultationBilling → Triage → InConsultation → (PendingOrders | DirectServicePending | FinalBilling) → Completed
                                                       └─→ FinalBilling
                                              └─→ Discontinued (any active)
```

With insurance (R48):
```
ConsultationBilling ─┐
                      ├─→ PendingInsuranceValidation → Triage (if APPROVED)
                      └─→ Triage (if non-billable/zero-fee)
Triage → InConsultation → (PendingOrders | DirectServicePending | FinalBilling) → Completed
                                                       └─→ FinalBilling
                                              └─→ Discontinued (any active)
```

---

## 7. Core Business Logic — 4 Lib Files

### 7.1 `lib/insurance/settings.ts` (88 lines)

Two exports:
- `isInsuranceEnabled(): Promise<boolean>` — reads the SystemSetting row
  with 60s in-process cache (uses globalThis to survive HMR).
- `setInsuranceEnabled(enabled: boolean): Promise<void>` — admin toggle.
- `clearInsuranceFeatureFlagCache()` — busts the cache (call after toggle).

Default is `true` when the row doesn't exist (preserves backward compat).

### 7.2 `lib/insurance/eligibility.ts` (151 lines)

`getInsuranceEligibility(patientId): Promise<EligibilityResult>` — checks
all 4 conditions for a patient to be billable via insurance:

1. Has a `PatientInsurance` row where `isActive = true`
2. Enrollment `status = VERIFIED`
3. Coverage period in effect: `coverageStart <= now` AND (`coverageEnd` is null OR `coverageEnd > now`)
4. Linked `InsuranceCompany.isActive = true`

Returns either `{eligible: true, enrollment: {...full details...}}` or
`{eligible: false, reason: "human-readable explanation", enrollment: any}`.

Used by:
- The cashier's billing page (UI gating + messaging)
- The payments API (server-side enforcement)
- The insurance-preview endpoint
- The retroactive claim route

### 7.3 `lib/insurance/third-party.ts` (236 lines)

`verifyInsuranceWithProvider(req): Promise<ThirdPartyVerificationResult>`
— the SINGLE place where the third-party call lives.

**In production**: replace the mock body with an HTTP call:
```typescript
const res = await fetch(`${provider.apiBase}/eligibility/check`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${provider.apiKey}` },
    body: JSON.stringify({ memberNumber, policyNumber, visitId }),
});
return mapProviderResponse(res);
```

**In dev/test**: deterministic mock driven by the enrollment data:
1. No enrollment → DENIED ("No enrollment on file for this patient.")
2. Enrollment not active → DENIED with reason based on status
3. Coverage period not in effect → DENIED
4. InsuranceCompany inactive → DENIED
5. Otherwise → APPROVED. Synthesize a verification number
   (`VR-{visitIdShort}-{timestamp}`), `coverageLimit` (the
   `consultationFee × 12` as a placeholder annual cap), and
   `deductibleRemaining` (`standardPatientCopay` as a placeholder).

**`force` parameter** — the test override path:
- `'AUTO'` (default) — use the deterministic mock above
- `'APPROVE'` — always return APPROVED with `coverageLimit: 5,000,000`
- `'DENY'` — always return DENIED with reason "Forced denial for testing"
- `'ERROR'` — always return ERROR ("Third-party provider unavailable (simulated)")

### 7.4 `lib/insurance/seed-price-list.ts` (220 lines)

`seedInsurancePriceList(insuranceId, { skipIfExists?: boolean })` —
walks the standard catalog (BillableItem + Drug + LabTestCatalog +
RadiologyCatalog) and creates an `InsurancePriceListItem` per service
at a default 15% discount off the standard rate.

Called from `POST /api/admin/insurance` on insurer creation (unless
the request explicitly opts out with `seedPriceList: false`).

---

## 8. Finance Integration — 7 Lib Files

### 8.1 `lib/finance/accounting-service.ts`

The `AccountingService` class handles ledger postings. Insurance-specific
additions:

- **AR account selection** — when an invoice has `isInsurance: true` (or
  the linked claim exists), use `1132` (AR-Insurance) instead of `1131`
  (AR-Patient). See the helper:
  ```typescript
  const isInsurance = !!invoice.claim || !!invoice.isInsurance;
  const arAccountCode = isInsurance ? '1132' : '1131';
  ```

- **`postClaimPaymentToLedger(claimId, userId)`** — when an insurer pays
  a claim, post:
  - Dr. Bank (1120): `claim.eligibleAmount`
  - Cr. AR-Insurance (1132): `claim.eligibleAmount`
  - Journal entry description: `Insurance Payment Received: {insurer} - Claim {claimNumber}`
  - Entry number: `JNL-CLM-PAY-{claimNumber}`
  - Reference: `claim.id`, `referenceType: 'PAYMENT'`

- **Payment routing** — when a payment is `paymentMethod === 'Insurance'`,
  the AR-Insurance account is debited, not Bank. When `paymentMethod ===
  'Cash'/'Card'/'MobileMoney'`, the AR-Patient account is debited.

### 8.2 `lib/finance/claim-adjudication-service.ts` (529 lines)

`ClaimAdjudicationService` — the brain behind every claim status change.

**State machine** (enforced):
```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
    DRAFT:               ['SUBMITTED'],
    SUBMITTED:           ['ACKNOWLEDGED', 'REJECTED'],
    ACKNOWLEDGED:        ['APPROVED', 'REJECTED'],
    APPROVED:            ['PAID'],
    REJECTED:            ['PENDING_REPROCESSING'],
    PENDING_REPROCESSING:['DRAFT'],
    PAID:                [],
};
```

**Public methods**:
- `transition(claimId, toStatus, actor)` — validates + executes, writes
  ClaimAdjudicationLog.
- `submitClaim(claimId, userId)` — `DRAFT → SUBMITTED`
- `acknowledgeClaim(claimId, userId, notes?)` — `SUBMITTED → ACKNOWLEDGED`
- `approveClaim(claimId, userId, approvedAmount, paymentVariance?, notes?)` — `ACKNOWLEDGED → APPROVED`, snapshots EOB/835 amounts.
- `rejectClaim(claimId, userId, reasonCode, reasonText, rarcCode?)` — `SUBMITTED|ACKNOWLEDGED → REJECTED`, calls `categorizeDenial()`.
- `appealClaim(claimId, userId, appealReason)` — `REJECTED → PENDING_REPROCESSING`
- `resubmitClaim(claimId, userId)` — `PENDING_REPROCESSING → DRAFT` (creates a new claim with `originalClaimId` pointer)
- `markClaimPaid(claimId, userId, paidAmount, paymentRef?)` — `APPROVED → PAID`, calls `postClaimPaymentToLedger` if `postedToLedger === false`.
- `writeOffDenial(claimId, userId)` — on a REJECTED claim, write off the AR to bad debt. Posts Dr. Bad Debt (5430) / Cr. AR-Insurance (1132).

### 8.3 `lib/finance/claim-scrubbing-service.ts` (283 lines)

`ClaimScrubbingService.scrubClaim(claimData)` — pre-submission validation.
Returns `{isValid, score (0-100), issues[], recommendations[]}`.

Checks:
1. Patient exists and `isActive`
2. Insurance is active
3. Patient has an active enrollment
4. Service codes are present
5. Diagnosis codes are present (ICD-10/11)
6. Authorization is present (if `requiresAuth` on the billable item)
7. Date of service is within the timely filing window
8. No duplicate claims for the same visit+service
9. Total amount matches the sum of line items
10. Eligible amount ≤ total amount

Severity: `error` (blocks submission) | `warning` (flag for review) | `info` (advisory).

### 8.4 `lib/finance/denial-categorization.ts` (138 lines)

`categorizeDenial(reasonCode, reasonText?): {category, suggestedAction}` —
maps a `DenialReasonCode` + free-text into a `DenialCategory` and
suggests a remediation step. Used for the denial analytics dashboard.

| Category | Examples | Suggested action |
|---|---|---|
| TECHNICAL | MISSING_INFO, INVALID_CODE, MODIFIER_MISSING | Resubmit with corrected fields |
| AUTHORIZATION | NO_PREAUTH, PREAUTH_EXPIRED, PREAUTH_DENIED | Request retroactive auth |
| COVERAGE | NOT_COVERED_PLAN, BENEFIT_EXHAUSTED, OUT_OF_NETWORK | Bill patient, write off |
| CLINICAL | MEDICAL_NECESSITY, EXPERIMENTAL | Appeal with clinical documentation |
| ADMINISTRATIVE | TIMELY_FILING, COORDINATION_OF_BENEFITS | Appeal or write off |
| PATIENT | DEDUCTIBLE, COPAY, COINSURANCE | Bill patient for copay |
| FRAUD | DUPLICATE_CLAIM, FRAUD_SUSPECTED | Review and resubmit if valid |
| OTHER | OTHER | Manual review |

### 8.5 `lib/finance/invoice-helper.ts`

The auto-split comment (around line 110-115) describes the FINAL-
invoice split logic that happens at first fetch:
- A FINAL- invoice is split into (FINAL- insurance portion) +
  (INV- cash portion) when the patient is insured.
- Both invoices must be paid before the visit transitions to Completed.

### 8.6 `lib/finance/pricing-engine.ts`

Implements the per-insurance copay math. Given a billable item and an
insurance company, returns:
- `patientPayAmount` (copay, based on `copayType`)
- `insurancePayAmount` (negotiated price - copay)
- `appliedRule` (the InsurancePriceListItem that matched, or null)

Copay logic by `CopayType`:
- `FLAT`: `patientPay = standardPatientCopay`, `insurancePay = negotiated - standardPatientCopay`
- `PERCENTAGE`: `patientPay = negotiated * copayPercentage / 100`, `insurancePay = negotiated - patientPay`
- `COPAY_PLUS_PERCENT`: `patientPay = standardPatientCopay + (negotiated - standardPatientCopay) * copayPercentage / 100`
- `NO_COPAY`: `patientPay = 0`, `insurancePay = negotiated`
- `FULL`: `patientPay = negotiated`, `insurancePay = 0`

### 8.7 `lib/finance/tenant-helpers.ts`

Seeds the default chart of accounts including the insurance accounts
(`1132` AR-Insurance, `4220` Contractual Allowance, `5430` Bad Debt).

---

## 9. API Endpoints — 25+ Routes

All insurance routes are under `app/api/`. Method/role conventions:
- `GET` — any authenticated user
- `POST/PUT/DELETE` — requires role check (`SUPER_ADMIN` / `ADMIN` for
  admin insurance routes, any user for claim submission)

### 9.1 Insurer CRUD — `app/api/admin/insurance/`

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/insurance` | List all insurers with `_count.claims/enrollments/priceList` |
| POST | `/api/admin/insurance` | Create insurer. Body: `{name, code, contactPerson, phone, email, address, paymentTerms, copayType, standardPatientCopay, copayPercentage, copayDeductible, consultationFee?, isActive, seedPriceList?}` |
| GET | `/api/admin/insurance/[id]` | Get one insurer with all relations |
| PUT | `/api/admin/insurance/[id]` | Update insurer |
| DELETE | `/api/admin/insurance/[id]` | Soft-delete (sets `isActive=false`) |

### 9.2 Price list — `app/api/admin/insurance/[id]/price-list/`

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/insurance/[id]/price-list` | List price rules for an insurer |
| POST | `/api/admin/insurance/[id]/price-list` | Add a price rule. Body: `{serviceType, serviceId, negotiatedPrice}` |
| PUT | `/api/admin/insurance/[id]/price-list/[ruleId]` | Update a price rule |
| DELETE | `/api/admin/insurance/[id]/price-list/[ruleId]` | Remove a price rule |
| POST | `/api/admin/insurance/[id]/price-list/seed` | Bulk-seed the price list at default 15% discount |

### 9.3 Pre-authorizations — `app/api/admin/insurance/authorizations/`

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/insurance/authorizations` | List all pre-auths (filterable by `?status=PENDING&patientId=...`) |
| POST | `/api/admin/insurance/authorizations` | Create a pre-auth request. Body: `{patientInsuranceId, serviceType, serviceName, estimatedCost, notes?}` |
| GET | `/api/admin/insurance/authorizations/[id]` | Get one pre-auth |
| PUT | `/api/admin/insurance/authorizations/[id]` | Update status (APPROVED/REJECTED) with `authorizedAmount`, `authorizationCode`, `validFrom`, `validTo` |

### 9.4 Enrollments — `app/api/admin/insurance/enrollments`

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/insurance/enrollments` | List all enrollments (filter by `?patientId=...&insuranceId=...&status=...`) |
| POST | `/api/admin/insurance/enrollments` | Create a PatientInsurance row. Body: `{patientId, insuranceId, policyNumber, memberNumber?, coverageStart, coverageEnd?, status?}` |

### 9.5 Claims — `app/api/admin/insurance/claims/`

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/insurance/claims` | List claims (filter by `?status=...&insuranceId=...&patientId=...&dateFrom=...&dateTo=...`) |
| POST | `/api/admin/insurance/claims` | Create a claim. Body: `{invoiceId, insuranceId, patientId, totalAmount, eligibleAmount, notes?}` |
| GET | `/api/admin/insurance/claims/[id]` | Get one claim with adjudication log, insurance, invoice, patient, visit, labOrder, resubmissions |
| PUT | `/api/admin/insurance/claims/[id]` | Update claim metadata |
| POST | `/api/admin/insurance/claims/[id]/resubmissions` | Create a resubmission. Body: `{totalAmount, eligibleAmount, notes}` |
| POST | `/api/admin/insurance/claims/retroactive` | Submit a retroactive claim for a past paid visit |
| POST | `/api/admin/insurance/claims/scrub` | Pre-submission validation. Body: `{claimData}`. Returns `{isValid, score, issues[], recommendations[]}` |
| GET | `/api/admin/insurance/claims/denials` | List denied claims with filters |
| GET | `/api/admin/insurance/claims/denials/analytics` | Denial analytics rollup: by category, by insurer, by month |
| GET | `/api/admin/insurance/claims/denials/codes` | Reference data: the 40+ DenialReasonCode enum values + descriptions |

### 9.6 Per-visit verification — `app/api/visits/[id]/verify-insurance`

| Method | Path | Description |
|---|---|---|
| POST | `/api/visits/[id]/verify-insurance` | Trigger third-party verification. Body: `{force?: 'AUTO'\|'APPROVE'\|'DENY'\|'ERROR'}` |

Returns:
```typescript
{
    ok: true,
    visitId: string,
    visitStatus: string,
    newVisitStatus: 'Triage' | 'ConsultationBilling' | 'PendingInsuranceValidation',
    verification: { id, status, verificationNumber, reason, provider, createdAt },
    statusChanged: boolean,
    consultationInvoiceCreated: boolean,  // true if DENIED on billable visit
    consultationInvoiceId: string | null,
}
```

### 9.7 Feature flag — `app/api/insurance/`

| Method | Path | Description |
|---|---|---|
| GET | `/api/insurance/enabled` | Returns `{enabled: boolean}`. Cached 60s on the server. |
| POST | `/api/insurance/verify-preview` | Dry-run third-party check (does NOT write InsuranceVerification). Used by the create-visit form. |

### 9.8 Admin toggle — `app/api/admin/insurance-feature`

| Method | Path | Description |
|---|---|---|
| PUT | `/api/admin/insurance-feature` | Body: `{enabled: boolean}`. SUPER_ADMIN/ADMIN only. Busts the cache. |

### 9.9 Patient enrollment — `app/api/patients/[id]/insurance`

| Method | Path | Description |
|---|---|---|
| GET | `/api/patients/[id]/insurance` | List enrollments for a patient |
| POST | `/api/patients/[id]/insurance` | Create a new enrollment. Idempotent — re-activates an existing one if `(patientId, insuranceId)` matches. |
| DELETE | `/api/patients/[id]/insurance` | Deactivate an enrollment |

### 9.10 Billing preview — `app/api/billing/insurance-preview`

| Method | Path | Description |
|---|---|---|
| POST | `/api/billing/insurance-preview` | Body: `{patientId, items: [{description, quantity, unitPrice, referenceId?, itemType}]}`. Returns the per-line copay split and the total. Used by the cashier's "Preview Insurance Coverage" button. |

### 9.11 Aging — `app/api/finance/aging/insurance`

| Method | Path | Description |
|---|---|---|
| GET | `/api/finance/aging/insurance` | Returns `{items: [{claimNumber, patient, insurance, daysOld, outstanding, ...}], counts: {0-30, 31-60, 61-90, 90+}, totalOutstanding, oldestClaim}`. Used by the AR-Insurance Aging panel. |

### 9.12 IPD insurance analytics — `app/api/ipd/reports/insurance-analysis`

| Method | Path | Description |
|---|---|---|
| GET | `/api/ipd/reports/insurance-analysis` | Returns IPD revenue split by insurer: `{byInsurer: [{insuranceId, name, totalCharges, insuranceShare, patientShare, claimCount}], totals}` |

### 9.13 Patient creation with enrollment — `POST /api/patients`

The body now accepts an optional `insuranceEnrollment`:
```typescript
{
    // ... standard patient fields ...
    insuranceEnrollment?: {
        insuranceId: string;
        memberNumber?: string;
        policyNumber: string;
        coverageStart: string;  // ISO date
        coverageEnd?: string;
    }
}
```

If provided, the route creates the `PatientInsurance` row in the same
transaction (re-activating an existing one if `(patientId, insuranceId)`
already exists).

---

## 10. UI Pages — 11 Pages

### 10.1 Admin pages — `app/dashboard/admin/insurance/`

| Page | File | Description |
|---|---|---|
| Insurance Partners list | `page.tsx` (52.8K) | List of insurers, "New Insurer" button, copay config UI |
| Single partner | `[id]/page.tsx` (43.2K) | Partner detail: contact info, copay config, consultation fee, claims summary |
| Price list | `[id]/price-list/page.tsx` (28.2K) | Per-service negotiated rates editor, "Re-seed defaults" button |
| Authorizations list | `authorizations/page.tsx` (10.5K) | Pending pre-auths queue with approve/reject |
| Claims worklist | `claims/page.tsx` (46.2K) | The biggest page. Filterable by status/insurer/date. Per-claim row shows: claim #, patient, insurer, total, eligible, status, days-old. Action buttons per status. |

### 10.2 Patient/visit pages

| Page | File | Description |
|---|---|---|
| Patient insurance panel | `app/dashboard/patients/[id]/InsuranceEnrollmentPanel.tsx` (19.3K) | Rendered on the patient detail page. Lists current enrollments, "Add enrollment" form, deactivate button. Hidden when `insurance.enabled === false`. |
| Visit validation card | `app/dashboard/patients/[id]/visits/[visitId]/InsuranceValidationCard.tsx` (16.1K) | Rendered on the visit detail page. Shows the "Validate Insurance" button when `status = PendingInsuranceValidation`. Below: full verification history (every attempt, APPROVED/DENIED/ERROR, with the third-party response). Hidden when `insurance.enabled === false`. |

### 10.3 Settings — `app/dashboard/settings/components/InsuranceTab.tsx` (7.9K)

The settings page has an "Insurance" tab (only visible to
SUPER_ADMIN/ADMIN). Contains:
- The `insurance.enabled` toggle (R49)
- The `numbering.claim.prefix` text input
- The `billing.contractualAllowanceAccountCode` text input
- The `billing.badDebtAccountCode` text input
- The list of insurers with quick links to the admin pages

### 10.4 Create-patient form — `app/dashboard/patients/new/page.tsx`

The "Insurance Enrollment" section is conditional on `insuranceEnabled`.
When enabled and the user checks "Enroll this patient", they get:
- Insurance Provider dropdown (loaded from `GET /api/admin/insurance`)
- Member Number (optional)
- Policy Number (required)
- Coverage Start (required, date)
- Coverage End (optional, date)

The Zod validation requires insurance provider + policy + coverage
start if enrollment is checked.

### 10.5 Create-visit modal — `app/dashboard/patients/page.tsx`

The "Insurance Validation" section appears between "Visit Info" and
"Confirm". When `insuranceEnabled` AND the patient has an active
enrollment AND the visit type is billable, the cashier sees:
- The insurer name, policy number, member number
- A "Validate Insurance" button that calls `/api/insurance/verify-preview`
- The result panel showing APPROVED / DENIED / ERROR with reason

The verification result is passed in the visit-creation POST body so
the visit is created with the right initial status (R48).

### 10.6 Layout nav filter — `app/dashboard/layout.tsx`

```typescript
const INSURANCE_NAVGATION_HREFS = new Set<string>([
    '/dashboard/admin/insurance',
    '/dashboard/admin/insurance/claims',
]);

// In the nav .map():
if (!insuranceEnabled && INSURANCE_NAVGATION_HREFS.has(item.href)) {
    return null;  // hide this nav item
}
```

(R49d: hide the 2 nav items when insurance is off, even though the
pages themselves still exist for re-enabling later.)

### 10.7 Visit page — `app/dashboard/patients/[id]/visits/[visitId]/page.tsx`

Renders `<InsuranceValidationCard />` when `insuranceEnabled` AND the
patient has an active enrollment. Also computes `isInsuranceDefer`:
```typescript
const isInsuranceDefer = insuranceEnabled && !!(visit?.invoices ?? []).some((inv) =>
    (inv.items ?? []).some((it) =>
        it.itemType === 'Consultation' && typeof it.description === 'string' && it.description.includes('(deferred to claim')
    )
);
```

When true, the VisitProgressChecklist shows a "Consultation fee
deferred to claim" badge.

---

## 11. Pricing Engine

`lib/pricing-engine.ts` (234 lines) — the single source of truth for
how much the patient pays vs the insurer for a given service.

**Interface**:
```typescript
type PricingResult = {
    standardPrice: number;
    negotiatedPrice: number;   // the price on the InsurancePriceListItem, or standardPrice if no rule
    patientCopay: number;      // based on copayType + copayPercentage
    insuranceNet: number;      // negotiated - patientCopay
    appliedRule: InsurancePriceListItem | null;  // null = no rule, patient pays full
};

class PricingEngine {
    static async calculateItemPrice(
        patientId: string,
        serviceId: string | null,  // null for service-type-only items
        serviceType: ServiceType,
        standardPrice: number,
    ): Promise<PricingResult>;
}
```

**Algorithm**:
1. Look up the patient's active enrollment + linked insurance.
2. If no enrollment or insurance is OFF → return `standardPrice` for both patient and insurance, `appliedRule = null`.
3. Look up `InsurancePriceListItem` for `(insuranceId, serviceId)` or `(insuranceId, serviceType, serviceId=null)`.
4. If a rule exists → use `negotiatedPrice` and apply `copayType` math.
5. If no rule → patient pays full `standardPrice`, `appliedRule = null`.

**Used by**:
- The pharmacy dispense flow (when `priceType === INSURANCE`)
- The lab/radiology render flow
- The billing invoice auto-split logic
- The insurance-preview endpoint

---

## 12. Email & Messaging Integration

### 12.1 `lib/messaging.ts` — claim submission email

`sendInsuranceClaimEmail({claimId, to, insuranceName, claimData})` —
sends a formatted HTML email to the insurer's claims address with:
- The claim number, total, eligible, copay
- The patient info (name, number, DOB)
- The visit info (date, chief complaint, diagnoses)
- The pre-authorizations used
- An attached PDF claim form

The email is sent from the `CLAIMS` `EmailAccount` (if configured) or
falls back to the default. A `Notification` row is created for audit.

### 12.2 `lib/email-receiver.ts` — inbound EOB routing

`routeInbound(tenantId, parsed)` matches inbound emails:
1. By From address against `Patient.email` → assign to patient
2. By From address against `InsuranceCompany.email` → assign to claim (most recent for that insurer)
3. By From address against internal user → assign to user

The matched `claimId` is written to the `EmailMessage.claimId` field so
the email thread becomes the per-claim correspondence log.

### 12.3 `EmailAccount.purpose === 'CLAIMS'`

A dedicated email account can be created for claims correspondence
(e.g. `claims@clinic.com`). The seed creates one by default.

---

## 13. Visit-Cycle Walk-Throughs

### 13.1 Cash patient (no insurance) — happy path

1. Patient walks in. Reception clicks "New Visit".
2. Visit type = OPD. Initial status = `ConsultationBilling`.
3. A consultation fee invoice (INV-0001, UGX 50,000) is generated.
4. Patient pays at cashier. Visit → `Triage`.
5. Triage vitals recorded. Visit → `InConsultation`.
6. Doctor consults, places 1 lab order + 1 prescription.
7. Visit → `PendingOrders` (orders carry `subStatus = AwaitingPayment`).
8. Lab tech collects sample, patient pays lab invoice. Order → `InProgress`.
9. Lab tech submits result. Order → `Fulfilled`.
10. Pharmacist dispenses prescription. Order → `InProgress` → `Fulfilled` (creates a new invoice line on the FINAL-).
11. Visit → `FinalBilling`. The FINAL- invoice (FINAL-0001) is created.
12. Patient pays FINAL-0001. Visit → `Completed`.

### 13.2 Insured patient (verification=APPROVED) — happy path

1-4. Same as 13.1, BUT the cashier runs "Validate Insurance" on the
   create-visit form before creating the visit. The verification is
   APPROVED. The visit is created with status `Triage` directly
   (deferred billing — no consult invoice issued at this point).
5. Same.
6-7. Same.
8-9. Same.
10. Same. The pharmacist dispenses. The dispense transaction creates
    a new `DispensingLog` row with `priceType=INSURANCE`,
    `insurancePayAmount=85% of price`, `patientPayAmount=15% copay`.
    The patient pays only the 15% copay at the pharmacy counter.
    (The remaining 85% is on the FINAL- invoice as the "insurance
    portion" to be submitted as a claim.)
11. Visit → `FinalBilling`. The FINAL- invoice is created. The
    dispense invoice line is split into 2 line items: "(Copay)" and
    "(Insurance-covered)".
12. The patient pays the copay portion (already done in step 10). The
    cashier closes the visit → `Completed`. The insurance portion
    remains on the invoice as `isInsurance=true` and a claim is
    generated (see 13.4).

### 13.3 Insured patient (verification=DENIED) — cash fallback

1. Cashier runs "Validate Insurance" on the create-visit form.
   Verification = DENIED (e.g. coverage expired). The create-visit
   form shows the reason and a "Proceed as cash" button.
2. The visit is created with status `ConsultationBilling`. A
   consultation fee invoice (INV-0001) is generated **at the
   negotiated rate** (per the per-insurance override).
3-12. Identical to 13.1.

### 13.4 Claim submission and adjudication

After visit completion for an insured patient:

1. The cashier opens `/dashboard/admin/insurance/claims` and clicks
   "Submit Claim" on the unpaid insurance portion.
2. The system creates an `InsuranceClaim` row with status `DRAFT`.
3. The cashier clicks "Submit" → `DRAFT → SUBMITTED`. The
   `submitInsuranceClaimEmail()` function sends the claim email to
   the insurer (if `EmailAccount.purpose = 'CLAIMS'` is configured).
4. The insurer acknowledges → `SUBMITTED → ACKNOWLEDGED`.
5. The insurer approves a portion → `ACKNOWLEDGED → APPROVED`. The
   EOB amounts are captured (allowedAmount, approvedAmount, copay,
   etc.).
6. The insurer pays → `APPROVED → PAID`. The
   `postClaimPaymentToLedger` function posts:
   - Dr. Bank (1120) / Cr. AR-Insurance (1132)
7. The claim is now reconciled.

If the insurer denies (step 5) → `REJECTED`. The cashier can:
- **Write off**: `REJECTED → PAID` with `denialWriteOffAmount > 0`.
  Posts Dr. Bad Debt (5430) / Cr. AR-Insurance (1132).
- **Appeal**: `REJECTED → PENDING_REPROCESSING`. After appeal
  decision, either `→ DRAFT` (resubmit) or stay rejected.

---

## 14. Seed Data

When re-integrating, run these seeds in order:

### 14.1 Default insurers — `prisma/seed-insurance-2.0.ts`

```typescript
// Two default insurers with the copay configurations typical of
// sub-Saharan Africa insurance:
const defaultInsurers = [
    {
        name: 'AAR Health Uganda',
        code: 'AAR',
        email: 'claims@aar.co.ug',
        copayType: 'COPAY_PLUS_PERCENT',
        standardPatientCopay: 5000,   // UGX 5,000 flat
        copayPercentage: 10,           // + 10% of remainder
        copayDeductible: 0,
        consultationFee: 30000,        // UGX 30,000 (vs global 50,000)
    },
    {
        name: 'Sanlam Insurance Uganda',
        code: 'SAN',
        email: 'claims@sanlam.co.ug',
        copayType: 'PERCENTAGE',
        standardPatientCopay: 0,
        copayPercentage: 15,           // 15% of negotiated
        copayDeductible: 50000,        // UGX 50,000 deductible
        consultationFee: 40000,        // UGX 40,000
    },
];
```

### 14.2 Chart of accounts — `prisma/seed-finance.ts`

Ensure these accounts are seeded (in addition to the standard ones):
- `1120` Bank
- `1131` Accounts Receivable - Patient
- `1132` Accounts Receivable - Insurance ← re-add
- `4210` Insurance Claims Revenue
- `4220` Contractual Allowance
- `5430` Bad Debt Expense

### 14.3 Test patients with insurance — `prisma/seed-comprehensive.ts`

The comprehensive seed creates 5-10 test patients with active
enrollments (mix of AAR + Sanlam) so the UI is testable on first run.

### 14.4 Price list seeding

`POST /api/admin/insurance/[id]/price-list/seed` is called automatically
when a new insurer is created (unless `seedPriceList: false`). It
creates an `InsurancePriceListItem` per BillableItem, Drug,
LabTestCatalog, and RadiologyCatalog row at 15% off the standard rate.

---

## 15. Tests — 30+ Scratch Scripts

All test scripts live in `scratch/`. The patterns:

### 15.1 Eligibility — `scratch/test-eligibility-e2e.mjs`

End-to-end test of `getInsuranceEligibility`:
- Patient with no enrollment → `eligible: false, reason: "Patient is not enrolled..."`
- Patient with PENDING enrollment → `eligible: false, reason: "Enrollment with X is awaiting verification."`
- Patient with VERIFIED enrollment, coverage in effect → `eligible: true`
- Patient with EXPIRED coverage → `eligible: false, reason: "Coverage with X expired on YYYY-MM-DD."`
- Patient with INACTIVE insurance company → `eligible: false, reason: "Insurance provider X is marked inactive."`

### 15.2 Third-party verification — `scratch/test-r47-insurance-validation.mjs`

Tests the R47 flow:
- Create patient + enrollment + visit.
- POST `/api/visits/[id]/verify-insurance` (no `force`).
- Verify: InsuranceVerification row created, visit status changed.
- Retry with `force=DENY` → visit → ConsultationBilling + consult invoice created.
- Retry with `force=APPROVE` → visit → Triage (no consult invoice).
- Retry with `force=ERROR` → visit stays at PendingInsuranceValidation.

### 15.3 R46 retroactive claim — `scratch/test-r46-insurance-defer.mjs`

Tests the R46 spec:
- Patient with insurance on file visits, gets verified APPROVED.
- Lab order is placed (subStatus=AwaitingPayment).
- Patient pays lab. Order → InProgress. Lab tech submits result. Order → Fulfilled.
- Visit → FinalBilling. FINAL- invoice created.
- **R46 specific**: The insurance portion of the FINAL- invoice is NOT
  routed as a separate claim at order time. Instead, the visit
  completes, and a retroactive claim is submitted for the insurance
  portion via `POST /api/admin/insurance/claims/retroactive`.

### 15.4 R48 create-visit verification — `scratch/test-r48-insurance-flow.mjs`

Tests the R48 spec (verification runs BEFORE visit creation):
- Create patient with enrollment on file.
- Open create-visit modal. The "Validate Insurance" panel is visible.
- Click "Validate Insurance" → verify-preview returns APPROVED.
- Submit the visit. Visit is created with `status = Triage` (no consult invoice).
- Verify the InsuranceVerification row exists with `source: 'create-visit-form'`.

Also tests the DENIED + cash fallback variant.

### 15.5 R49 toggle — `scratch/test-r49-insurance-toggle.mjs`

- PUT `/api/admin/insurance-feature` with `{enabled: false}`.
- GET `/api/insurance/enabled` returns `{enabled: false}`.
- The 2 nav items are hidden in `/dashboard/admin/insurance` page.
- The patient create form hides the "Insurance Enrollment" section.
- The create-visit modal hides the "Validate Insurance" panel.
- POST `/api/visits/[id]/verify-insurance` returns 400 "Insurance feature is disabled".

### 15.6 R49d hide tabs — `scratch/test-r49d-hide-tabs.mjs`

Pure visual test:
- Toggle insurance OFF.
- Visit `/dashboard`. Confirm "Insurance Partners" and "Insurance Claims" are NOT in the sidebar.
- Toggle insurance ON. Confirm both nav items reappear.

### 15.7 R49c cash flow — `scratch/test-r49c-insurance-off-cash.mjs`

Tests the cash flow when insurance is OFF:
- Patient has an old enrollment on file (from when insurance was ON).
- Toggle insurance OFF.
- Create a new visit. The create-visit form hides the validation panel.
- The visit is created with `status = ConsultationBilling`.
- The patient is treated as cash through the entire cycle.

### 15.8 Adjudication e2e — `scratch/test-adjudication-e2e.mjs`

The biggest test. Walks the full claim lifecycle:
- DRAFT → SUBMITTED (with submission email)
- SUBMITTED → ACKNOWLEDGED
- ACKNOWLEDGED → APPROVED (with EOB amounts)
- APPROVED → PAID (with bank posting)
- Verify the journal entry has Dr Bank / Cr AR-Insurance.

Also tests the deny path:
- DRAFT → SUBMITTED → REJECTED
- REJECTED → PENDING_REPROCESSING (appeal)
- PENDING_REPROCESSING → DRAFT (resubmit with originalClaimId pointer)
- New claim → SUBMITTED → APPROVED → PAID.

### 15.9 Scrubbing — `scratch/test-claim-scrubbing.mjs`

- Submit a claim with missing patient ID → score 50, error "Patient not found".
- Submit a claim with inactive insurance → score 60, error "Insurance provider is inactive".
- Submit a claim with no enrollment → score 70, error "Patient has no active enrollment".
- Submit a clean claim → score 100, valid.

### 15.10 Pricing engine — `scratch/test-pricing-engine.mjs`

For each `CopayType`, verify the math:
- FLAT: patientPay=5000, insurancePay=negotiated-5000
- PERCENTAGE: patientPay=negotiated*0.15, insurancePay=negotiated*0.85
- COPAY_PLUS_PERCENT: patientPay=5000+(negotiated-5000)*0.10
- NO_COPAY: patientPay=0, insurancePay=negotiated
- FULL: patientPay=negotiated, insurancePay=0

### 15.11 Waiver — `scratch/test-waiver-e2e.mjs`

Tests the `waivedInsurance` flow on Payment:
- Insured patient pays via cash (deductible not met).
- Payment row is created with `waivedInsurance=true`, `waiverReason="Deductible not met"`, `insuranceSavedAmount=85000`.
- Verify the payment routes to AR-Patient (1131), not AR-Insurance.

### 15.12 Other tests

There are ~20 more test scripts covering specific edges:
- Copay flow (5 insurers, mixed copay types)
- Retroactive claim full flow
- Edit enrollment (re-activate, change policy #)
- Settlement visual (PDF rendering of a paid claim)
- Denial analytics (filter by category, by month)
- Aging buckets (0-30, 31-60, 61-90, 90+)
- IPD insurance analysis (revenue split by insurer)

---

## 16. Re-integration Steps — Ordered Playbook

When ready to re-integrate, follow these steps in order:

### Step 1: Create the feature branch

```bash
cd D:\Mop_Projects\Vital_Core
git checkout -b feature/reintegrate-insurance
```

### Step 2: Add the schema

Open `lib/generated-prisma/schema.prisma` and:

1. Add the 7 models (§2) in the "Insurance" section.
2. Add the 7 enums (§3).
3. Add the FK columns + relations on `Patient`, `User`, `Visit`,
   `LabOrder`, `DispensingLog`, `Invoice`, `Payment`, `BillableItem`,
   `InpatientCharge`, `DailyChargeSummary`, `EmailMessage`, `TaxInvoice`
   (§4).
4. Add the `INSURANCE_COVERED` value to the 3 payment-status enums.
5. Add the `INSURANCE` value to `DispensePriceType`.
6. Add `claimPrefix` + `claimFormat` to `Tenant`.

### Step 3: Add the SystemSettings

Open `lib/settings/registry.ts` and add:
- `insurance.enabled`
- `numbering.claim.prefix`
- `billing.contractualAllowanceAccountCode`
- `billing.badDebtAccountCode`

### Step 4: Generate the Prisma client

```bash
npx prisma generate --schema=lib/generated-prisma/schema.prisma
npx prisma db push --schema=lib/generated-prisma/schema.prisma --accept-data-loss
```

### Step 5: Add the lib files

Recreate:
- `lib/insurance/settings.ts`
- `lib/insurance/eligibility.ts`
- `lib/insurance/third-party.ts`
- `lib/insurance/seed-price-list.ts`
- `lib/finance/claim-adjudication-service.ts`
- `lib/finance/claim-scrubbing-service.ts`
- `lib/finance/denial-categorization.ts`
- `lib/pricing-engine.ts`
- `lib/visits/consultation-fee.ts` (re-add insurance branches)

### Step 6: Add the API routes

Recreate all 25+ routes (§9) under `app/api/`.

### Step 7: Add the UI pages

Recreate all 11 pages (§10) under `app/dashboard/`.

### Step 8: Update the layout nav

Open `app/dashboard/layout.tsx` and:
- Re-add the 2 nav items (`Insurance Partners`, `Insurance Claims`).
- Re-add the `INSURANCE_NAVGATION_HREFS` set.
- Re-add the `insuranceEnabled` state + the nav `.map()` filter.
- Re-add the `/api/insurance/enabled` fetch.

### Step 9: Update cross-cutting routes

- `POST /api/patients` — re-add the `insuranceEnrollment` block.
- `GET /api/patients` — re-add the `insuranceEnrollments` include.
- `POST /api/patients/[id]/visit` — re-add the R48 initial-status
  branching, the `InsuranceVerification` row write, and the cash
  fallback for DENIED.
- `GET /api/visits/[id]` — re-add the `insuranceEnrollments` and
  `insuranceVerifications` includes, and the `prisma.insuranceClaim.deleteMany`
  in the cleanup.
- `POST /api/pharmacy/dispense` — re-add the `priceType=INSURANCE` branch.
- `POST /api/lab/orders` and `/api/radiology/orders` — re-add the `claim` relation.
- `GET /api/billing/invoices/[id]` — re-add the auto-split logic.
- `POST /api/billing/invoices/[id]/payments` — re-add the `paymentMethod=Insurance` block and the `waivedInsurance` block.
- `lib/finance/accounting-service.ts` — re-add the `isInsurance` AR selection and the `postClaimPaymentToLedger` method.

### Step 10: Add seeds

Re-run:
- `prisma/seed-finance.ts` (with the 3 insurance accounts)
- `prisma/seed-insurance-2.0.ts` (2 default insurers)
- `prisma/seed-comprehensive.ts` (test patients with enrollments)

### Step 11: Add the test scripts

Recreate all 30+ `scratch/test-*.mjs` scripts. These are
self-contained — they create their own patients, run flows, and assert.

### Step 12: Smoke test

1. Start the dev server: `npm run dev`.
2. Log in as `admin@vitalcore.com`.
3. Visit `/dashboard/admin/insurance` — confirm the partners list loads.
4. Create a new insurer with copay type PERCENTAGE.
5. Confirm the price list auto-seeds.
6. Toggle insurance OFF. Confirm the 2 nav items disappear.
7. Toggle insurance ON. Confirm they reappear.
8. Create a patient with insurance enrollment.
9. Create a visit. Run "Validate Insurance". Confirm the result.
10. Walk the visit through to Completed.
11. Open `/dashboard/admin/insurance/claims`. Submit a claim. Walk it
    through to PAID. Confirm the journal entry is correct.

### Step 13: Commit and push

```bash
git add -A
git commit -m "feat(insurance): re-integrate the insurance module (7 models, 25+ routes, 11 pages)"
git push -u origin feature/reintegrate-insurance
```

### Step 14: Deploy to LXC

The Docker stack doesn't need changes — the schema is generated at
build time. Rebuild the app image:
```bash
ssh root@proxmox "pct enter 200"
cd /opt/vital-core
docker compose build app
docker compose up -d app
docker compose run --rm --entrypoint sh app -c "npx prisma@5.22.0 db push --schema=lib/generated-prisma/schema.prisma --accept-data-loss"
docker compose restart app
```

### Step 15: Run the test scripts

```bash
# On the dev machine
node scratch/test-eligibility-e2e.mjs
node scratch/test-r47-insurance-validation.mjs
node scratch/test-r48-insurance-flow.mjs
node scratch/test-r49-insurance-toggle.mjs
node scratch/test-r49c-insurance-off-cash.mjs
node scratch/test-adjudication-e2e.mjs
node scratch/test-pricing-engine.mjs
```

All should pass.

---

## 17. File Inventory — Complete List to Re-create

When re-integrating, recreate the following files in this order. The
sizes are the post-removal state (what was deleted).

### Schema (1 file, edit)
- `lib/generated-prisma/schema.prisma` — add 7 models, 7 enums, 12+ FK
  columns on other models, 4 enum value additions, 2 Tenant columns.

### Core lib (4 new files)
- `lib/insurance/settings.ts` (88 lines)
- `lib/insurance/eligibility.ts` (151 lines)
- `lib/insurance/third-party.ts` (236 lines)
- `lib/insurance/seed-price-list.ts` (220 lines)

### Finance lib (3 new files + edit 2)
- `lib/finance/claim-adjudication-service.ts` (529 lines, NEW)
- `lib/finance/claim-scrubbing-service.ts` (283 lines, NEW)
- `lib/finance/denial-categorization.ts` (138 lines, NEW)
- `lib/finance/accounting-service.ts` (692 lines, EDIT — add ~50 lines for `isInsurance` AR + `postClaimPaymentToLedger`)
- `lib/finance/pricing-engine.ts` (72 lines, EDIT — add insurance branches)
- `lib/finance/invoice-helper.ts` (162 lines, EDIT — add insurance split comment)
- `lib/finance/tenant-helpers.ts` (81 lines, EDIT — add insurance accounts)

### Visits lib (1 edit)
- `lib/visits/consultation-fee.ts` (332 lines, EDIT — re-add insurance branches)
- `lib/visits/status.ts` (275 lines, EDIT — re-add `PendingInsuranceValidation`)

### Root lib (1 new + 2 edits)
- `lib/pricing-engine.ts` (234 lines, NEW)
- `lib/messaging.ts` (~140 lines, EDIT — re-add `sendInsuranceClaimEmail`)
- `lib/email-receiver.ts` (~410 lines, EDIT — re-add claim routing)
- `lib/email-client.ts` (~?, EDIT — re-add `claimId` field reference)
- `lib/validation/schemas.ts` (~?, EDIT — re-add insurance enrollment Zod schema)

### Settings (1 edit)
- `lib/settings/registry.ts` (~1015 lines, EDIT — add 4 settings)

### API routes (25+ files)
See §9 for the full list.

### UI pages (11 files)
- `app/dashboard/admin/insurance/page.tsx` (52.8K)
- `app/dashboard/admin/insurance/[id]/page.tsx` (43.2K)
- `app/dashboard/admin/insurance/[id]/price-list/page.tsx` (28.2K)
- `app/dashboard/admin/insurance/[id]/price-list/price-list.module.css` (6.6K)
- `app/dashboard/admin/insurance/authorizations/page.tsx` (10.5K)
- `app/dashboard/admin/insurance/authorizations/page.module.css` (3.2K)
- `app/dashboard/admin/insurance/claims/page.tsx` (46.2K)
- `app/dashboard/admin/insurance/claims/page.module.css` (13.3K)
- `app/dashboard/patients/[id]/InsuranceEnrollmentPanel.tsx` (19.3K)
- `app/dashboard/patients/[id]/visits/[visitId]/InsuranceValidationCard.tsx` (16.1K)
- `app/dashboard/settings/components/InsuranceTab.tsx` (7.9K)

### UI edits (15+ files)
See §10.7 for the list of cross-cutting UI files that need insurance
branches stripped/added.

### Seeds (3 files)
- `prisma/seed-insurance-2.0.ts` (2.2K)
- `prisma/seed-comprehensive.ts` (64.9K, EDIT — re-add insurance block)
- `prisma/seed-finance.ts` (20K, EDIT — re-add insurance accounts)

### Tests (30+ files)
- `scratch/test-eligibility-e2e.mjs`
- `scratch/test-r47-insurance-validation.mjs`
- `scratch/test-r48-insurance-flow.mjs`
- `scratch/test-r49-insurance-toggle.mjs`
- `scratch/test-r49c-insurance-off-cash.mjs`
- `scratch/test-r49c-billing-ui.mjs`
- `scratch/test-r49c-settlement-visual.mjs`
- `scratch/test-r49d-hide-tabs.mjs`
- `scratch/test-r49d-visual.mjs`
- `scratch/test-r46-insurance-defer.mjs`
- `scratch/test-r48-edit-enrollment.mjs`
- `scratch/test-adjudication-e2e.mjs`
- `scratch/test-claim-scrubbing.mjs` (new)
- `scratch/test-pricing-engine.mjs`
- `scratch/test-pricing-engine-inline.mjs`
- `scratch/test-insurance-copay-flow.mjs`
- `scratch/test-insurance-visit-flow.mjs`
- `scratch/test-insurance-enroll.mjs`
- `scratch/test-insurance-all-partners.mjs`
- `scratch/test-waiver-e2e.mjs`
- `scratch/test-retroactive-claim.mjs`
- `scratch/test-retroactive-claim-full.mjs`
- `scratch/test-retroactive-debug.mjs`
- `scratch/smoke-r48-ui.mjs`
- `scratch/e2e-insurance-seed.mjs`
- `scratch/cleanup-insurance.mjs`
- `scratch/wipe-insurance-and-ledger.mjs`
- `scratch/cleanup-orphan-claims.mjs`
- `scratch/setup-insurance-fees.mjs`
- `scratch/check-claim-state.mjs`
- `scratch/check-claims.mjs`
- `scratch/check-insurance-state.mjs`
- `scratch/check-insurance-cos.mjs`
- `scratch/check-patient-insurance.mjs`
- `scratch/check-enrollments.mjs`
- `scratch/cleanup-orphan-pli.mjs`
- `scratch/cleanup-test-claims.mjs`
- `scratch/screenshot-insurance.mjs`
- `scratch/find-insured-patient.mjs`
- `scratch/set-insurance-off.mjs`
- `scratch/debug-flag.mjs`
- `scratch/check-r49-flag.mjs`
- `scratch/check-flag.mjs`
- `scratch/reset-flag.mjs`

### Tests (3 files in `tests/`)
- `tests/lib/pricing-engine.test.ts` (12 insurance refs)
- `tests/lib/validation.test.ts` (12 insurance refs)
- `tests/visits.json` (8 insurance refs in fixture data)

### Docs (5 root-level MDs to update)
- `README.md` — re-add insurance to the feature list + status diagram
- `IMPLEMENTATION_ROADMAP_SUMMARY.md`
- `IMPLEMENTATION_PROGRESS_SUMMARY.md`
- `PHASE_1_COMPLETION_SUMMARY.md`
- `PHASE_1_SUMMARY.md`
- `PHASE_2_PATIENT_PORTAL_SUMMARY.md`
- `deploy/DEPLOY.md` — re-add insurance to the seed step

---

## 18. Rollout & Validation

### Acceptance criteria for the re-integration

- [ ] `prisma generate` and `prisma db push` complete without errors
- [ ] All 30+ scratch test scripts pass
- [ ] `tests/lib/pricing-engine.test.ts` passes
- [ ] Dev server boots and the 5 main flows work end-to-end:
      1. Create an insurer with copay config
      2. Enroll a patient
      3. Create a visit, validate insurance (APPROVED), walk to FinalBilling
      4. Submit a claim, walk to PAID, verify the journal entry
      5. Toggle insurance OFF, create a cash visit, confirm clean flow
- [ ] The `insurance.enabled` toggle hides/shows all insurance UI
- [ ] Per-insurance consultation fee override works
- [ ] Auto-split of FINAL- invoice into insurance + cash portions works
- [ ] Waived insurance payment captures the reason and saved amount
- [ ] Denial write-off posts to Bad Debt account
- [ ] Resubmission chain maintains `originalClaimId` pointer
- [ ] Inbound insurer emails route to the right claim thread
- [ ] Outbound claim email sends to the insurer with the PDF attachment

### Performance budget

- Eligibility check: < 50ms (cached enrollment + insurance lookup)
- Third-party verification: < 2s (real API) / < 10ms (mock)
- Claim creation: < 200ms
- Journal posting on claim payment: < 100ms

### Security checklist

- [ ] Only SUPER_ADMIN/ADMIN can toggle `insurance.enabled`
- [ ] Only SUPER_ADMIN/ADMIN can create/edit insurers
- [ ] Only authorized users can submit claims
- [ ] Insurance PII (member numbers, policy numbers) is not logged
- [ ] Claim PDFs do not include patient diagnosis codes by default
- [ ] Inbound claim emails are validated against known insurer addresses

### Rollback plan

If something goes wrong post-rollout:
1. Toggle `insurance.enabled` to `false` in SystemSettings (instant
   rollback — all insurance UI hides, all insurance branches in code
   short-circuit).
2. Roll back the code via `git revert <merge-commit>`.
3. The 4 SystemSettings rows (`insurance.enabled`, `numbering.claim.prefix`,
   `billing.contractualAllowanceAccountCode`, `billing.badDebtAccountCode`)
   can be deleted without affecting the rest of the system.

---

## Appendix A: Round-by-Round Design History

The insurance module went through 6 design rounds before removal:

| Round | Date | Feature |
|---|---|---|
| **R46** | 2026-07-15 | Retroactive claim submission for FINAL- invoices where the consultation fee was deferred to claim |
| **R47** | 2026-07-22 | Per-visit third-party verification audit (replaced auto-validation on patient profile view) |
| **R48** | 2026-07-28 | Run verification BEFORE visit creation, on the create-visit modal |
| **R49** | 2026-08-01 | `insurance.enabled` feature toggle + nav hiding for cash-only clinics |
| **R49c** | 2026-08-04 | Suppress deferred-fee banner + auto-complete when insurance is OFF (the `insurance.enabled === false` short-circuit) |
| **R50** | 2026-08-08 | Pharmacist dispenses → creates the bill (insurance portion goes on FINAL-) |
| **R51** | 2026-08-10 | Remove pharmacy invoice lock so dispense can happen before payment |

## Appendix B: Glossary

- **AR-Insurance** — the Accounts Receivable account (`1132`) that
  tracks money owed BY insurance companies TO the clinic.
- **AR-Patient** — the Accounts Receivable account (`1131`) that
  tracks money owed BY patients TO the clinic.
- **Cash fallback** — when an insured patient's verification is
  DENIED, the visit flows as if they were a cash patient (consult
  fee invoice issued up front at the negotiated rate).
- **Claim scrub** — pre-submission validation that catches common
  reasons for denial (missing info, inactive enrollment, missing
  pre-auth, etc.) before the claim is sent to the insurer.
- **Copay** — the patient's share of the bill. The insurer covers
  the rest.
- **EOB / 835** — Electronic Remittance Advice (X12 835) — the
  standardized electronic format insurers use to tell the clinic
  what was paid, what was adjusted, and why.
- **Insurance-deferred billing** — when verification is APPROVED,
  the consultation fee is NOT collected up front. It's added to
  the FINAL- invoice at first order placement, then submitted as
  a claim.
- **Per-insurance consultation fee** — the override on
  `InsuranceCompany.consultationFee` that lets each partner
  negotiate its own visit fee (vs the global
  `visit.consultationFee` SystemSetting default).
- **Pre-auth** — pre-authorization. The insurer's pre-approval that
  a specific service is covered. Required for some high-cost
  services per the billable item's `requiresAuth` flag.
- **Third-party verifier** — the external system (AAR Health
  Gateway, Sanlam Verifier, etc.) that confirms the patient is
  currently covered for a given visit.
- **Waiver** — when an insured patient pays via cash instead of
  routing the bill to the insurer (e.g. deductible not met). The
  reason is captured for reporting.
- **Write-off** — when a denied claim is not pursued, the AR is
  cleared by posting the amount to Bad Debt (`5430`).

## Appendix C: State Machine Reference

### InsuranceClaim state machine (R46-R51)

```
            ┌──── appeal ────┐
            │                │
            ▼                │
DRAFT ─submit─▶ SUBMITTED ─ack─▶ ACKNOWLEDGED
            │                  │
            │              ┌───┤
            │         approve  reject
            │              │   │
            │              ▼   ▼
            │          APPROVED REJECTED
            │              │     │
            │          (denial  appeal
            │           write-off) │
            │              │     │
            │              ▼     ▼
            │            PAID  PENDING_REPROCESSING
            │                    │
            └──── resubmit ──────┘
```

### Visit state machine (with insurance)

```
                ┌──────────────────────────────────┐
                │                                  │
                ▼                                  │
   ConsultationBilling ◀── DENIED validation       │
        │                                         │
        │ (cash flow: consult invoice             │
        │  issued up front)                       │
        │                                         │
        │           ┌──── APPROVED validation ────┤
        │           │                             │
        ▼           ▼                             │
     Triage (auto-advance if zero-fee)            │
        │                                         │
        ▼                                         │
   InConsultation                                 │
        │                                         │
        ├─ 0 orders ──▶ FinalBilling              │
        │                                         │
        └─ 1+ orders ─▶ PendingOrders             │
                            │                     │
                            │ (all orders         │
                            │  terminal)          │
                            ▼                     │
                       FinalBilling ──paid──▶ Completed ◀── paid
                            │                     ▲
                            │ cash flow:          │
                            │ patient pays        │
                            │ copay + insurance   │
                            │ portion             │
                            │                     │
                            └─────────────────────┘
```

### PendingInsuranceValidation state

```
                    ┌─────────────────────────────┐
                    │ cashier presses             │
                    │ "Validate Insurance"        │
                    ▼                             │
        PendingInsuranceValidation                │
                    │                             │
            ┌───────┼───────┐                     │
            │       │       │                     │
        APPROVED  DENIED  ERROR                   │
            │       │       │                     │
            ▼       ▼       │ (retry)             │
         Triage  ConsultationBilling ◀────────────┘
                (cash
                 fallback)
```

---

**End of re-integration guide. Total: ~1,400 lines.**
