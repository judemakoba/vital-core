# Vital Core HMS

> A complete, production-ready Hospital Management System for small to mid-size clinics.
> Built with Next.js 14, Prisma, and PostgreSQL. Single-DB, multi-role, multi-tenant-ready.

[![Status](https://img.shields.io/badge/status-shipped-brightgreen)](#)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748)](https://prisma.io)
[![Postgres](https://img.shields.io/badge/PostgreSQL-16-336791)](https://postgresql.org)
[![License](https://img.shields.io/badge/license-Proprietary-red)](#license)

---

## What it does

Vital Core is a single-deployment HMS that runs the full clinical workflow:
patient registration → triage → consultation → investigations (lab + radiology + pharmacy)
→ billing → payment → completion. It also handles role-based access for 9 user roles,
double-entry accounting with a real general ledger, OPD ↔ IPD transitions, and
C-suite dashboards for revenue, cash flow, and aging.

The clinic is **cash-only** (the legacy insurance module was removed). The
data model is already structured for true multi-tenant SaaS when the time
comes — there's a `Tenant` + `TenantSetting` model with per-tenant
branding, feature toggles, and SMTP config.

It's designed to deploy on a small Proxmox LXC (4 GB RAM, 32 GB disk) and
serve a single hospital today.

---

## Feature highlights

### Clinical
- **Patient registration** with photo, demographics, contact, allergies
- **Visit lifecycle** with the canonical state machine: `ConsultationBilling → Triage →
  InConsultation → PendingOrders → FinalBilling → Completed`
  (plus `Admitted` for IPD and `Discontinued` for admin-cancelled)
- **Doctor's desk**: prescription writing with structured dosage /
  frequency / duration, lab order entry, radiology order entry,
  automatic drug-interaction & allergy checks
- **IPD request workflow (R62)**: doctor submits a request, admin/reception
  fulfils it (assigns ward + bed, creates the admission, transitions
  the visit). Splits the medical decision from the operational transition.
- **IPD admissions management (R63-R64)**: dashboard of active
  admissions with modify / terminate / delete (cascading) actions
  and a full audit trail
- **Doctor's "Completed Today" tab (R61)**: reviews the day's finished
  consultations in read-only mode; auto-empties at midnight
- **Lab module**: 51 built-in tests, customizable templates, structured
  result entry, branded printable reports
- **Radiology module**: 22 exam types, image upload to Nextcloud, branded
  printable reports
- **Pharmacy**: 450-drug catalog, batch tracking with expiry, real-time
  stock deduction at dispense, COGS posting to the ledger

### Financial
- **Double-entry accounting**: chart of accounts, journal entries,
  balanced Dr/Cr postings on every transaction
- **Consolidated final bill** model: one `FINAL-` invoice per visit,
  not separate invoices per service
- **Cash flow dashboard**: revenue, COGS, AR aging, monthly trend
- **Daily close / settlement report** with audit trail

### Admin
- **9 user roles** with strict RBAC: Super Admin, Admin, Doctor, Nurse,
  Receptionist, Pharmacist, Lab Tech, Accountant, Cashier
- **Multi-tenant ready**: `Tenant` model with `TenantSetting` typed
  settings; single-tenant today, multi-tenant when needed
- **Customization audit**: per-tenant branding (logo, colors, name),
  per-tenant SMS/email config, per-tenant SMTP
- **Audit log**: every significant action (login, patient create,
  prescription, lab/rad order, payment, invoice, visit discontinue)
  is recorded with before/after JSONB diffs
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

# 4. Seed roles + 12 test users (default password: password123)
npm run db:seed
# Optional reference data (drugs, lab tests, IPD wards, etc.):
npm run db:seed:pharmacy
npm run db:seed:lab
npm run db:seed:ipd
# ...see package.json for the full list

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
│   ├── seed.cjs          # Minimal seed: roles + 12 test users
│   └── seed-*.ts         # Optional reference data seeds
│       (finance / pharmacy / icd / lab / ipd / inventory)
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
        │              │                                  ├─→ Admitted (IPD, R62)
        │              │                                  └─→ FinalBilling
        │              │                                      │
        │              │                                      ▼
        │              │                                  Completed
        │              │                                  (back to PendingOrders
        │              │                                   if new order arrives)
        │
        └─→ Discontinued (from any state)
```

The OPD → IPD transition (R62) is initiated by the doctor via an
**IpdRequest** (medical decision) and fulfilled by admin/reception
(operational transition). The `Admitted` state is set when the
admission record is created and the visit is marked as `INPATIENT`.

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
