# Vital Core HMS

> **Note (2026-08):** The insurance module was removed in a single atomic
> commit (`feat: remove insurance module`). The clinic is now cash-only.
> Re-integration guide at [`docs/INSURANCE_REINTEGRATION_GUIDE.md`](docs/INSURANCE_REINTEGRATION_GUIDE.md)
> (2,150 lines, mega-prompt format).

> A complete, production-ready Hospital Management System for small to mid-size clinics.
> Built with Next.js 14, Prisma, and PostgreSQL. Single-DB, multi-role, multi-tenant-ready.

[![Status](https://img.shields.io/badge/status-active_development-yellow)](#)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748)](https://prisma.io)
[![Postgres](https://img.shields.io/badge/PostgreSQL-16-336791)](https://postgresql.org)
[![License](https://img.shields.io/badge/license-Proprietary-red)](#license)

---

## What it does

Vital Core is a single-deployment HMS that runs the full clinical workflow:
patient registration → triage → consultation → investigations (lab + radiology + pharmacy)
→ billing → payment → completion. It also handles insurance adjudication, role-based
access for 8+ user roles, double-entry accounting with a real general ledger, and
C-suite dashboards for revenue, cash flow, and aging.

It's designed to deploy on a small Proxmox LXC (4 GB RAM, 32 GB disk) and
serve a single hospital — with the data model already structured for true
multi-tenant SaaS when the time comes.

---

## Feature highlights

### Clinical
- **Patient registration** with photo, insurance, demographics, contact
- **Visit lifecycle** with 9-state machine: `ConsultationBilling → Triage →
  InConsultation → PendingOrders → FinalBilling → Completed`
  (plus `PendingInsuranceValidation` and `Discontinued`)
- **Doctor's desk**: prescription writing with structured dosage /
  frequency / duration, lab order entry, radiology order entry,
  automatic drug-interaction & allergy checks
- **Lab module**: 51 built-in tests, customizable templates, structured
  result entry, branded printable reports
- **Radiology module**: 22 exam types, image upload to Nextcloud, branded
  printable reports
- **Pharmacy**: 450-drug catalog, batch tracking with expiry, real-time
  stock deduction at dispense, COGS posting to the ledger
- **Insurance**: per-patient enrollment, per-insurer price lists,
  per-visit consultation fees, full claim adjudication lifecycle
  (Draft → Submitted → Acknowledged → Approved/Paid)

### Financial
- **Double-entry accounting**: chart of accounts, journal entries,
  balanced Dr/Cr postings on every transaction
- **Consolidated final bill** model: one `FINAL-` invoice per visit,
  not separate invoices per service
- **Cash flow dashboard**: revenue, COGS, AR aging, monthly trend
- **Insurance claims analytics**: submission → approval → payment
  funnel, denial reasons, top-paying insurers
- **Daily close / settlement report** with audit trail

### Admin
- **8 user roles** with strict RBAC: Admin, Doctor, Nurse, Lab Tech,
  Radiologist, Pharmacist, Cashier, Reception
- **Multi-tenant ready**: `Tenant` model with `TenantSetting` typed
  settings; single-tenant today, multi-tenant when needed
- **Customization audit**: per-tenant branding (logo, colors, name),
  per-tenant SMS/email config, per-tenant SMTP
- **Feature toggles**: insurance on/off, multi-tenant on/off
- **GDPR-friendly**: soft-delete with retention, anonymization export

### Technical
- **Next.js 14** App Router, server actions, streaming
- **Prisma 5** ORM with a custom schema path
- **PostgreSQL 16** for relational data + JSONB for flexible metadata
- **NextAuth.js** for sessions (credentials + JWT)
- **Tailscale + Caddy** for secure HTTPS without public exposure
- **Multi-stage Docker build**, **~150 MB prod image**
- **Type-safe** end-to-end (TypeScript strict-ish, Zod for validation)

---

## Quick start (development)

```bash
# 1. Install dependencies
npm install

# 2. Set up the database
cp .env.example .env
# Edit .env: set DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

# 3. Generate Prisma client + push schema
npx prisma generate --schema=lib/generated-prisma/schema.prisma
npx prisma db push --schema=lib/generated-prisma/schema.prisma --accept-data-loss

# 4. Seed reference data (drugs, lab tests, etc.)
npx prisma db seed --schema=lib/generated-prisma/schema.prisma

# 5. Start dev server
npm run dev
# → http://localhost:3000
# Login: admin@vitalcore.com / password123
```

---

## Production deployment (Docker)

Full walkthrough in [`deploy/DEPLOY.md`](./deploy/DEPLOY.md). Short version:

```bash
# On your Proxmox LXC
cd /opt/vital-core
cp deploy/env.production.example .env.production
$EDITOR .env.production        # set POSTGRES_PASSWORD, NEXTAUTH_SECRET, TS_AUTHKEY

docker compose --env-file .env.production up -d --build

# Then visit https://vitalcore from any Tailscale device
```

The stack includes 4 services — Postgres, Next.js, Tailscale sidecar, Caddy —
all on a private Docker network with no public database exposure.

Day-to-day operations: [`deploy/README.md`](./deploy/README.md)

---

## Architecture

```
┌──────────────────┐    ┌────────────────────┐    ┌──────────────┐
│ Tailscale        │───▶│ Caddy (host net)   │───▶│ Next.js app  │
│ sidecar          │    │ :80, :443          │    │ :3000        │
│ - join tailnet   │    │ Tailscale cert     │    │              │
│ - generate cert  │    │ + internal CA      │    │              │
└──────────────────┘    └────────────────────┘    └──────┬───────┘
                                                         │
                                                         ▼
                                                  ┌──────────────┐
                                                  │  Postgres 16 │
                                                  │  (internal)  │
                                                  └──────────────┘
```

All persistent data lives in named Docker volumes. Backups via
`scripts/backup.sh` (cron-friendly, auto-prunes old dumps).

---

## Project layout

```
.
├── app/                  # Next.js App Router pages + API routes
│   ├── api/              # REST endpoints
│   ├── dashboard/        # Authenticated app UI
│   ├── login/            # Auth pages
│   └── ...
├── components/           # Shared React components
│   ├── finance/          # Invoices, payments, reports
│   ├── pharmacy/         # Drug catalog, dispensing
│   └── ...
├── lib/                  # Domain logic (the "model")
│   ├── finance/          # Invoicing, payments, accounting
│   ├── insurance/        # Adjudication, verification
│   ├── pharmacy/         # Stock, COGS, batch mgmt
│   ├── visits/           # State machine, status helpers
│   ├── settings/         # SystemSetting registry
│   └── generated-prisma/ # Prisma client (regenerated on build)
├── prisma/
│   ├── schema.prisma     # Legacy (incomplete) schema — DON'T USE
│   ├── migrations/       # Migration history
│   └── seed-*.ts         # Reference data seeds
├── deploy/               # Production deployment docs + templates
│   ├── DEPLOY.md         # Step-by-step LXC walkthrough
│   ├── README.md         # Day-2 ops + troubleshooting
│   └── env.production.example
├── scripts/              # Shell + Node scripts (backup, restore, prep)
├── caddy/                # Caddyfile variants
├── Dockerfile            # Multi-stage prod build
├── docker-compose.yml    # 4-service stack
└── package.json
```

---

## Visit lifecycle (canonical state machine)

```
                        ┌─ DirectServicePending (LAB_ONLY, RADIOLOGY_ONLY, etc.)
                        │
ConsultationBilling ───┼─→ Triage ──→ InConsultation ──→ PendingOrders
        │              │                                  │
        │              │                                  ├─→ DirectServicePending
        │              │                                  └─→ FinalBilling
        │              └─→ PendingInsuranceValidation          │
        │                     │                               │
        │                     │ (verified)                    ▼
        │                     └───────────────────────→ FinalBilling
        │                                                  │
        │                                                  ▼
        │                                              Completed
        │                                              (back to PendingOrders
        │                                               if new order arrives)
        │
        └─→ Discontinued (from any state)
```

**Insurance is a parallel axis**: the `PendingInsuranceValidation` state
gates triage when the patient is on insurance but the eligibility check
hasn't completed yet. R49 introduces a feature toggle to disable insurance
entirely for cash-only clinics.

---

## Visit/Order invariants

- A visit has at most one consultation invoice (auto-issued on creation)
- A visit has at most one `FINAL-` invoice (consolidates all post-consultation services)
- Multiple historical `FINAL-` invoices can exist (one per "round" of prescriptions)
- A `FINAL-` invoice is **never reopened** once Paid/Cancelled — a new one is created
- All visit invoices must be Paid before the visit auto-transitions to `Completed`
- Prescription sub-status walks: `AwaitingPayment → InProgress → Fulfilled` (no skipping)

---

## License

This project is **proprietary / source-available** to the customer only.
See [`LICENSE`](./LICENSE) for the full terms.

---

## Contact

- **Maintainer**: Jude M.
- **Email**: judemakoba@gmail.com
