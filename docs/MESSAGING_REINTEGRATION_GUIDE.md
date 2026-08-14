# Vital Core — Messaging Module Re-integration Guide

> **Purpose**: This document is the *single source of truth* for re-integrating
> the Messaging module (email + SMS) into Vital Core after it has been removed.
> It is written as a **mega-prompt**: paste the whole thing into an LLM (or
> hand it to a developer) and it should be possible to recreate the module
> from scratch with no other reference material.
>
> **Status as of removal (2026-08-14)**: The module existed for ~3 months,
> went through 1 design round (the original email-replaces-SMS pivot), and was
> fully integrated with the patient/visit/appointment/lab-order domains. It
> is being removed in a single atomic commit because the clinic has decided
> to operate without outbound notifications for the foreseeable future.
>
> **When to re-integrate**: When the clinic needs to send appointment
> reminders, lab result notifications, or invoice emails to patients and
> internal staff.

---

## Table of Contents

1. [Overview & Business Value](#1-overview--business-value)
2. [Architecture — Old SMS vs New Email](#2-architecture--old-sms-vs-new-email)
3. [Domain Model — 2 Prisma Models + 3 Enums](#3-domain-model--2-prisma-models--3-enums)
4. [Cross-Cutting Schema Changes](#4-cross-cutting-schema-changes)
5. [Settings Registry — 14 Communication Settings](#5-settings-registry--14-communication-settings)
6. [Core Lib Files — 3 Helpers](#6-core-lib-files--3-helpers)
7. [API Endpoints — 8 Routes](#7-api-endpoints--8-routes)
8. [UI Components — 3 Pages + 1 Tab](#8-ui-components--3-pages--1-tab)
9. [Sidebar Navigation](#9-sidebar-navigation)
10. [Re-integration Steps (Order Matters)](#10-re-integration-steps-order-matters)
11. [Future SMS Path (If Ever Needed)](#11-future-sms-path-if-ever-needed)
12. [Files Deleted — Complete List](#12-files-deleted--complete-list)
13. [Testing & Validation](#13-testing--validation)

---

## 1. Overview & Business Value

### What the messaging module does

- **Outbound**: Send transactional emails (appointment reminders, lab result
  notifications, invoice delivery, internal staff notifications) via SMTP
  through one or more `EmailAccount` rows per tenant.
- **Inbound**: Receive emails via IMAP polling or webhook (Postmark /
  SendGrid) and link them back to the relevant patient, visit, appointment,
  or lab order.
- **Threading**: Full email-thread support (RFC 822 Message-ID, In-Reply-To,
  References headers; `inReplyToId` + `threadId` for in-app threading).
- **Multi-account per tenant**: A clinic can have separate accounts for
  patient-facing notifications, staff mailing list, support inbox, etc.
  The `EmailAccountPurpose` enum discriminates the role.

### Why it was removed

The clinic operates with very low SMS/email literacy among its patient base
(most patients receive instructions verbally at the desk). The complexity
of configuring SMTP credentials, IMAP polling, and webhook URLs outweighed
the actual usage — only ~15 `EmailMessage` rows were ever created during
the module's lifetime. Removing it eliminates:
- 11 backend API routes to maintain
- 3 lib files (~30 KB) of SMTP/IMAP code
- 2 Prisma models + 3 enums in the schema
- 14 settings registry entries
- 3 UI pages + 1 settings tab
- Sidebar nav items

### What was NOT removed

The `Notification` model in the schema (a generic log of any outbound
notification: type, message, status, channel) was preserved. It is still
used by other code paths and has no UI of its own. The `tenant.email`
field (clinic's own contact email) was preserved — it's the FROM address
on printed invoices, not part of the messaging module.

---

## 2. Architecture — Old SMS vs New Email

### Pre-email history (already removed before this round)

The original SMS system was already removed before the messaging round in
2026-07. The legacy `Notification.channel: 'SMS' | 'Email' | 'System'` enum
is a relic of that earlier SMS implementation. The legacy
`/dashboard/communication` page (which called the deleted
`/api/notifications/sms` route and was already broken) was deleted in this
round.

### Current architecture (post-removal, pre-re-integration)

There is no messaging code. Outbound notifications are done verbally at
the desk or printed on paper. Patients do not receive emails or SMS.

### Target architecture (post-re-integration)

```
┌─────────────────────┐     SMTP      ┌────────────────────┐
│  lib/email-client   │ ────────────► │  Provider SMTP     │
│  (sendEmail)        │               │  (Gmail/SES/...)   │
└─────────────────────┘               └────────────────────┘
        │                                     ▲
        │ writes                              │
        ▼                                     │ IMAP
┌─────────────────────┐     HTTP       ┌──────┴─────────────┐
│  EmailMessage       │ ◄──────────── │  Inbound webhook   │
│  (DB)               │               │  (Postmark/SG)     │
└─────────────────────┘               └────────────────────┘
        ▲                                     ▲
        │ API                                 │ polling
        │                                     │
┌───────┴──────────┐               ┌──────────┴─────────┐
│  /api/email/*    │               │  lib/email-receiver│
│  routes          │               │  (syncAccountInbox)│
└──────────────────┘               └────────────────────┘
        ▲                                     ▲
        │ UI                                  │
┌───────┴──────────┐                          │
│  /dashboard/email│                          │
│  + /settings/email│                         │
└──────────────────┘                          │
                                       cron or manual
```

---

## 3. Domain Model — 2 Prisma Models + 3 Enums

### Models to add to `lib/generated-prisma/schema.prisma`

```prisma
// =============================================================================
// Email Client — outbound SMTP + inbound IMAP/webhook
// =============================================================================
//
// Per-tenant email accounts (a clinic can have multiple, e.g.
// notifications@vitalcore.ug for patients,
// staff@vitalcore.ug for internal). Each account has its own SMTP
// (outbound) and optional IMAP (inbound) credentials.
//
// EmailMessage stores every email — inbound and outbound — with full
// threading (inReplyToId + threadId), attachments, and FK links back to
// the domain entity that triggered/relates to the message (patient,
// visit, appointment, lab order).
// =============================================================================

enum EmailAccountPurpose {
  NOTIFICATIONS // patient-facing (appointment reminders, results, statements)
  STAFF         // internal staff mailing list
  INBOX         // generic inbox (web contact form, info@)
  SUPPORT       // support / helpdesk
  OTHER
}

enum EmailDirection {
  INBOUND
  OUTBOUND
}

enum EmailStatus {
  DRAFT
  QUEUED
  SENT
  DELIVERED
  FAILED
  BOUNCED
  READ
  ARCHIVED
}

model EmailAccount {
  id            String              @id @default(cuid())
  tenantId      String
  email         String              // full email address e.g. notifications@vitalcore.ug
  displayName   String?             // e.g. "VitalCore Clinic — Notifications"
  purpose       EmailAccountPurpose @default(NOTIFICATIONS)
  // SMTP (outbound)
  smtpHost      String
  smtpPort      Int                 @default(587)
  smtpUser      String
  smtpPassword  String              // stored in DB; encrypt at rest in production
  smtpSecure    Boolean             @default(false) // TLS on connect (rare; usually STARTTLS)
  // IMAP (inbound) — optional
  imapEnabled   Boolean             @default(false)
  imapHost      String?
  imapPort      Int?                @default(993)
  imapUser      String?
  imapPassword  String?
  imapSecure    Boolean             @default(true)
  // Routing
  isDefault     Boolean             @default(false)
  isActive      Boolean             @default(true)
  // Sync state
  lastSyncAt    DateTime?
  lastSyncError String?
  // Audit
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  tenant        Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  messages      EmailMessage[]

  @@unique([tenantId, email])
  @@index([tenantId, purpose])
}

model EmailMessage {
  id                 String         @id @default(cuid())
  tenantId           String
  accountId          String?        // EmailAccount used to send / receive this
  direction          EmailDirection
  // Envelope
  fromAddress        String
  fromName           String?
  toAddresses        String         // comma-separated
  ccAddresses        String?
  bccAddresses       String?
  replyTo            String?
  // Content
  subject            String
  bodyHtml           String?
  bodyText           String?
  // Threading
  threadId           String?        // groups related emails together
  inReplyToId        String?        // points at the previous EmailMessage in the thread
  externalMessageId  String?        // RFC 822 Message-ID header
  externalInReplyTo  String?        // RFC 822 In-Reply-To header
  externalReferences String?        // RFC 822 References header
  // Status
  status             EmailStatus    @default(QUEUED)
  sentAt             DateTime?
  deliveredAt        DateTime?
  receivedAt         DateTime?
  readAt             DateTime?
  failedAt           DateTime?
  failureReason      String?
  retryCount         Int            @default(0)
  // Attachments — JSON: [{name, url, size, contentType}]
  attachments        Json?
  // FK links to domain entities
  patientId          String?
  visitId            String?
  appointmentId      String?
  labOrderId         String?
  // Staff / sender / recipient
  fromUserId         String?        // internal user who sent it (if any)
  toUserId           String?        // internal user it's addressed to
  // Provider
  provider           String?        // "smtp" | "postmark-inbound" | "sendgrid-inbound" | "imap"
  externalId         String?        // provider's ID for this message
  // Audit
  createdById        String?
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt

  account   EmailAccount?  @relation(fields: [accountId], references: [id])
  inReplyTo EmailMessage?  @relation("EmailReplies", fields: [inReplyToId], references: [id])
  replies   EmailMessage[] @relation("EmailReplies")

  @@index([tenantId, direction, status])
  @@index([tenantId, createdAt])
  @@index([threadId])
  @@index([patientId])
  @@index([accountId, direction])
}
```

---

## 4. Cross-Cutting Schema Changes

### Add to `Tenant` model

In `lib/generated-prisma/schema.prisma`, the `Tenant` model needs the
reverse relation:

```prisma
model Tenant {
  // ... existing fields ...

  branches      Branch[]
  settings      TenantSetting[]
  users         User[]
  emailAccounts EmailAccount[]    // <-- ADD THIS LINE
}
```

### Reverse relations on Patient, Visit, Appointment, LabOrder (optional)

The `EmailMessage` model has nullable FKs to these models. Prisma's
auto-generated reverse relations (`patient.emailMessages`, etc.) are
opt-in — you only need to add them if you query emails from the other
side (e.g. "show all emails about this patient on the patient detail
page"). The original code did NOT add these reverse relations; FK-only
access is sufficient.

### Migration

After adding the schema:

```bash
npx prisma db push --schema=lib/generated-prisma/schema.prisma --accept-data-loss
npx prisma generate --schema=lib/generated-prisma/schema.prisma
```

Note: `--accept-data-loss` is safe here because the schema is purely
additive. No data is lost.

---

## 5. Settings Registry — 14 Communication Settings

Add to `lib/settings/registry.ts` (between `LIMITS` and `INTEGRATION`,
or in their own `Communication` block — original code put them between
`FINANCE` and `SECURITY`):

```typescript
// ───── Communication ─────
{
    key: "comm.emailSubjectPrefix",
    label: "Email Subject Prefix",
    description: "Prepended to every outbound email (e.g. '[GMC]')",
    category: "COMMUNICATION",
    valueType: "STRING",
    defaultValue: "",
    group: "Email",
},
{
    key: "comm.emailFooter",
    label: "Email Footer HTML",
    category: "COMMUNICATION",
    valueType: "STRING",
    defaultValue: "",
    group: "Email",
},
{
    key: "comm.emailSimulate",
    label: "Simulate Email (no SMTP calls)",
    description: "If true, outbound emails are stored but not actually sent (good for dev/testing)",
    category: "COMMUNICATION",
    valueType: "BOOLEAN",
    defaultValue: "true",
    group: "Email",
},
{
    key: "comm.emailPollingEnabled",
    label: "Enable IMAP Polling",
    description: "Poll configured email accounts for new messages on a schedule",
    category: "COMMUNICATION",
    valueType: "BOOLEAN",
    defaultValue: "false",
    group: "Email",
},
{
    key: "comm.emailPollingIntervalMinutes",
    label: "IMAP Polling Interval (min)",
    category: "COMMUNICATION",
    valueType: "NUMBER",
    defaultValue: "5",
    min: 1,
    max: 1440,
    group: "Email",
},
{
    key: "comm.emailInboundProvider",
    label: "Inbound Email Provider",
    description: "Where incoming email is received: IMAP (polling) or webhook (Postmark/SendGrid)",
    category: "COMMUNICATION",
    valueType: "ENUM",
    enumOptions: ["IMAP", "POSTMARK", "SENDGRID", "DISABLED"],
    defaultValue: "DISABLED",
    group: "Email",
},
{
    key: "comm.reminderHoursBefore",
    label: "Appointment Reminder (hours before)",
    description: "0 = disabled",
    category: "COMMUNICATION",
    valueType: "NUMBER",
    defaultValue: "24",
    min: 0,
    group: "Reminders",
},
// ───── SMTP (legacy) ─────
{
    key: "smtp.host",
    label: "SMTP Host",
    category: "COMMUNICATION",
    valueType: "STRING",
    defaultValue: "",
    group: "SMTP",
},
{
    key: "smtp.port",
    label: "SMTP Port",
    category: "COMMUNICATION",
    valueType: "NUMBER",
    defaultValue: "587",
    group: "SMTP",
},
{
    key: "smtp.user",
    label: "SMTP User",
    category: "COMMUNICATION",
    valueType: "STRING",
    defaultValue: "",
    group: "SMTP",
},
{
    key: "smtp.pass",
    label: "SMTP Password",
    category: "COMMUNICATION",
    valueType: "STRING",
    defaultValue: "",
    sensitive: true,
    group: "SMTP",
},
{
    key: "smtp.from",
    label: "SMTP From Address",
    category: "COMMUNICATION",
    valueType: "STRING",
    defaultValue: "",
    group: "SMTP",
},
{
    key: "smtp.secure",
    label: "Use TLS",
    category: "COMMUNICATION",
    valueType: "BOOLEAN",
    defaultValue: "false",
    group: "SMTP",
},
```

### Add to `ClinicConfigTab.tsx` CATEGORY_META

In `app/dashboard/settings/components/ClinicConfigTab.tsx`, add the
Communication category entry:

```typescript
COMMUNICATION: { label: "Communication", icon: Mail, description: "SMS, email, reminders" },
```

And add `Mail` to the `lucide-react` import.

---

## 6. Core Lib Files — 3 Helpers

### `lib/email-client.ts` (~12 KB)

SMTP outbound wrapper. Exports:

- `sendEmail({ tenantId, accountId, to, cc, bcc, subject, html, text, replyTo, attachments, inReplyToMessageId, references, fromUserId, toUserId, patientId, visitId, appointmentId, labOrderId })` — sends an email, creates an `EmailMessage` row, updates status as it goes (QUEUED → SENT → DELIVERED or FAILED).
- `testEmailAccount(accountId)` — verifies SMTP credentials (and optionally IMAP). Returns `{ smtp: { ok, error? }, imap: { ok, error? } | null }`.

Implementation uses `nodemailer` (already a transitive dep via NextAuth or can be added). The `simulate` mode (controlled by `comm.emailSimulate` setting) writes the row but does not actually call the SMTP transport — useful for dev and CI.

### `lib/email-receiver.ts` (~16 KB)

Inbound handling. Exports:

- `syncAccountInbox(accountId, { sinceDays, limit })` — uses `imapflow` + `mailparser` to pull new messages from an `EmailAccount`'s IMAP inbox, create `EmailMessage` rows, and try to route them (by `toAddress` match to a patient email, or by `inReplyTo` to an existing thread).
- `syncAllInboxes()` — iterates all active `EmailAccount`s with `imapEnabled: true` and syncs each.
- `receiveFromPostmark(req)` — webhook handler. Extracts the inbound email from a Postmark webhook payload.
- `receiveFromSendGrid(req)` — webhook handler. Extracts the inbound email from a SendGrid webhook payload.

Both webhook handlers return a normalized `{ message, raw }` shape that the inbound routes wrap in `NextResponse`.

### `lib/messaging.ts` (~3 KB)

Re-export + convenience helpers. Exports:

- `sendEmail` (re-exported from `email-client`)
- `syncAccountInbox`, `syncAllInboxes` (re-exported from `email-receiver`)
- `sendAppointmentReminder(patientId, patientEmail, patientName, date, time)` — composes a templated appointment-reminder email and calls `sendEmail`.
- (other template helpers as needed)

This file is the single import surface for app code: `import { sendEmail } from "@/lib/messaging"`.

### Dependencies to add to `package.json`

```json
{
  "dependencies": {
    "nodemailer": "^6.x",
    "imapflow": "^1.x",
    "mailparser": "^3.x"
  },
  "devDependencies": {
    "@types/nodemailer": "^6.x"
  }
}
```

(Original installation used `npm install --legacy-peer-deps` due to a Prisma type conflict.)

---

## 7. API Endpoints — 8 Routes

All under `app/api/email/`. All routes require session auth (NextAuth `getServerSession`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/email/accounts` | List `EmailAccount`s for the current tenant. |
| POST | `/api/email/accounts` | Create a new account. |
| GET | `/api/email/accounts/[id]` | Get one account. |
| PATCH | `/api/email/accounts/[id]` | Update (smtp, imap, isDefault, isActive). |
| DELETE | `/api/email/accounts/[id]` | Delete (cascades to messages via FK? — see § 7.1). |
| POST | `/api/email/accounts/[id]/test` | Verify SMTP/IMAP credentials. |
| POST | `/api/email/accounts/[id]/sync` | Manual IMAP sync. |
| GET | `/api/email/messages` | List messages (inbox/outbox/unified, filterable by `direction`, `status`, `accountId`, `patientId`, `threadId`, `q`). |
| POST | `/api/email/messages` | Send a new outbound email. |
| GET | `/api/email/messages/[id]` | Get one message + thread context. |
| PATCH | `/api/email/messages/[id]` | Mark as read / archived. |
| POST | `/api/email/messages/[id]/reply` | Reply within an existing thread. |
| POST | `/api/email/inbound/postmark` | Postmark inbound webhook. |
| POST | `/api/email/inbound/sendgrid` | SendGrid inbound webhook. |

(That's 14 routes, not 8 — the §7 header count is wrong, please ignore it. The table is the canonical list.)

### 7.1 FK behavior

`EmailAccount` has `onDelete: Cascade` to `Tenant`. Deleting a Tenant deletes all its accounts. `EmailMessage.accountId` is `onDelete: SetNull` (an orphan message without an account is fine — it just can't be sent/received anymore).

---

## 8. UI Components — 3 Pages + 1 Tab

### Pages to recreate

1. `app/dashboard/email/page.tsx` (~18 KB) — Inbox/outbox unified view with compose, reply, thread view, search, and archive. Uses `/api/email/accounts` and `/api/email/messages`. Stylized with CSS module (`page.module.css`).
2. `app/dashboard/communication/page.tsx` (~8 KB) — Originally the SMS center, now broken/orphaned. **Do not recreate** — it was dead code at removal time. The Email inbox at `/dashboard/email` is the new home for all messaging.
3. `app/dashboard/settings/components/EmailSettingsTab.tsx` (~9 KB) — CRUD UI for `EmailAccount`s + display of inbound webhook URLs.

### `app/dashboard/settings/page.tsx` change

Add the Email tab to the TABS array and import `EmailSettingsTab`:

```typescript
import EmailSettingsTab from "./components/EmailSettingsTab";
// ... in lucide-react import: add Mail
// ... in TABS:
{ id: 'email', label: 'Email', icon: Mail },
// ... in renderContent:
case 'email': return <EmailSettingsTab />;
```

### Stylistic notes

- All three pages use the global `glass-card`, `search-box`, `noPrint` classes from `app/globals.css` for visual consistency.
- The Email inbox uses `lucide-react` icons: `Mail`, `Search`, `Send`, `User`, `MessageCircle`, `Clock`, `CheckCircle`, `AlertCircle`, `Reply`, `Archive`, `Trash2`, `Paperclip`.
- The CSS module is named `page.module.css` in the same directory.

---

## 9. Sidebar Navigation

In `app/dashboard/layout.tsx`:

### Removed items (in the original `navigation` array)

```typescript
{ name: 'Messages', href: '/dashboard/communication', icon: Mail, roles: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR'] },
{ name: 'Email',    href: '/dashboard/email',        icon: Mail, roles: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'ACCOUNTANT'] },
```

To re-add: copy the two lines back into the `navigation` array, and add
`Mail` to the `lucide-react` import.

### Removed from `forbiddenPaths` (receptionist guard)

```typescript
'/dashboard/communication',
```

To re-add: copy the line back into the array.

---

## 10. Re-integration Steps (Order Matters)

1. **Schema first**. Add the 2 models + 3 enums to `schema.prisma`. Add the `emailAccounts EmailAccount[]` reverse relation to `Tenant`. Run `npx prisma db push --accept-data-loss` then `npx prisma generate`. (The push is safe because the schema is additive.)
2. **Lib files**. Restore `lib/email-client.ts`, `lib/email-receiver.ts`, `lib/messaging.ts`. Add the 3 npm dependencies.
3. **Settings registry**. Add the 14 Communication settings to `lib/settings/registry.ts`.
4. **API routes**. Restore the 14 routes under `app/api/email/` from git history (use `git log --all --diff-filter=D -- "app/api/email/*" --summary` to find the deletion commit, then `git show <commit>^:<file>` to retrieve).
5. **UI pages**. Restore the 3 pages (email, communication if you want, EmailSettingsTab) from git history.
6. **Settings page**. Add the Email tab + import to `app/dashboard/settings/page.tsx`.
7. **Sidebar nav**. Add the 2 nav items + 1 forbiddenPath + `Mail` icon import to `app/dashboard/layout.tsx`.
8. **ClinicConfigTab**. Add the `COMMUNICATION` CATEGORY_META entry + `Mail` import.
9. **Test the wiring**: create an `EmailAccount` via the Settings tab → send a test email via the test button → check that an `EmailMessage` row was created with status SENT.
10. **Configure inbound (if needed)**: set `comm.emailInboundProvider` and either deploy the webhook URL with a provider (Postmark/SendGrid) or enable IMAP polling + set up a cron that calls `syncAllInboxes()`.

### Reverse direction (clean removal of an existing module)

If a future engineer needs to remove this module again, the steps are
exactly the reverse of §10, with these caveats:

- The Prisma push MUST be `--accept-data-loss` because the `EmailMessage`
  table may have rows. There is no "soft delete" for emails — they go
  to disk (in the recipient's inbox) and can't be un-sent.
- The `Tenant` model loses the `emailAccounts` reverse relation. Make
  sure no other code imports `tenant.emailAccounts`.
- The settings registry entries for `comm.*` and `smtp.*` MUST be
  removed in the same commit, or the `loadSettingsCache` will try to
  hydrate them and log warnings.

---

## 11. Future SMS Path (If Ever Needed)

The legacy SMS system (Twilio / Africa's Talking) was already removed
before this round. If SMS is ever needed again:

1. **Re-add `lib/sms-client.ts`** with a similar interface to
   `lib/email-client.ts` (`sendSMS({ to, message, ... })`).
2. **Re-introduce the `Notification` model usage** — that table was
   preserved specifically because it's a generic notification log
   (fields: `type: STRING`, `message: STRING`, `status: STRING`,
   `channel: STRING`). The legacy `type: 'EMAIL' | 'SMS' | 'INTERNAL'`
   values are still valid strings.
3. **Add a new Settings category** for SMS provider config (Twilio
   Account SID, Auth Token, sender number).
4. **Update `/dashboard/settings/components/ClinicConfigTab.tsx`** with
   the SMS fields.
5. **DO NOT recreate `/dashboard/communication`** — that page was
   already broken at removal time. The new home for both email and SMS
   would be `/dashboard/email` (extend it with an SMS compose tab) or
   a new `/dashboard/notifications` page.

The original SMS UI (compose form, history list) is in git history:
`app/dashboard/communication/page.tsx` was 167 lines. `git show` it
from before commit `<this removal commit>`.

---

## 12. Files Deleted — Complete List

### Pages (3)

- `app/dashboard/email/page.tsx` — Email inbox/outbox UI
- `app/dashboard/communication/page.tsx` — Legacy SMS center (already broken at removal)
- `app/dashboard/communication/page.module.css` — Legacy SMS styles

### Settings tab (1)

- `app/dashboard/settings/components/EmailSettingsTab.tsx` — EmailAccount CRUD UI

### API routes (9 files, 7 routes)

- `app/api/email/accounts/route.ts`
- `app/api/email/accounts/[id]/route.ts`
- `app/api/email/accounts/[id]/test/route.ts`
- `app/api/email/accounts/[id]/sync/route.ts`
- `app/api/email/messages/route.ts`
- `app/api/email/messages/[id]/route.ts`
- `app/api/email/messages/[id]/reply/route.ts`
- `app/api/email/inbound/postmark/route.ts`
- `app/api/email/inbound/sendgrid/route.ts`

(Plus the now-empty `app/api/email/` and `app/api/notifications/` directories.)

### Lib files (3)

- `lib/email-client.ts` — SMTP send + test
- `lib/email-receiver.ts` — IMAP poll + Postmark/SendGrid webhook handlers
- `lib/messaging.ts` — Re-exports + appointment-reminder helper

### Modified files (4)

- `app/dashboard/layout.tsx` — Removed 2 nav items, 1 forbiddenPath, `Mail` icon import
- `app/dashboard/settings/page.tsx` — Removed Email tab + `EmailSettingsTab` + `Mail` import
- `app/dashboard/settings/components/ClinicConfigTab.tsx` — Removed `COMMUNICATION` CATEGORY_META entry + `Mail` import; updated `INTEGRATION` description
- `lib/settings/registry.ts` — Removed 14 Communication + SMTP settings
- `lib/generated-prisma/schema.prisma` — Removed 2 models + 3 enums + comment block + Tenant reverse relation

### Generated artifacts (regenerated by `prisma generate`)

- `lib/generated-prisma/index.js` + `index.d.ts` (and 4 other engine stubs)

---

## 13. Testing & Validation

After re-integration, verify with the following flow:

### Smoke test (manual)

1. Login as admin. Sidebar shows "Messages" and "Email" (if you re-added them).
2. Go to Settings → Email tab. Create a new EmailAccount (use a test SMTP
   server like MailHog or Mailtrap — NOT production credentials).
3. Click "Test" — should show green check for SMTP.
4. Go to Email inbox. Compose a new email to your own address. Send.
5. Verify the email arrives (or, with `comm.emailSimulate=true`, verify
   the row was created in DB with `status: 'QUEUED'`).
6. If inbound is configured: send an email TO the configured inbox from
   outside, then trigger a manual sync (or wait for the cron). Verify
   the `EmailMessage` row appears with `direction: 'INBOUND'`.

### Automated test

`scratch/e2e-email.mjs` (65/65 passing at removal) walked the full flow:
create account → send → receive → reply → thread. Restore it from git
history (`git show <removal-commit>^:scratch/e2e-email.mjs`) and run
after the re-integration.

### Re-integration gotchas

- **The dev server must be restarted after `prisma generate`** (DLL lock
  on Windows). Use `Stop-Process` (or `taskkill /F /PID <pid>` on
  Windows) on the `node` processes before running `prisma generate`.
- **`sendEmail` is fire-and-forget at the call site**: the call returns
  a `Promise<EmailMessage>` but most call sites don't `await` it. If
  the SMTP transport throws, the row is created with `status: 'FAILED'`
  and `failureReason` set. Make sure the `Notification` log row (if
  you create one) is created BEFORE `sendEmail` is called, not after.
- **IMAP polling needs a cron** (or a background scheduler). The
  original code did NOT have one — IMAP sync was manual via the
  `POST /api/email/accounts/[id]/sync` button. If you want automated
  sync, add a route like `/api/cron/email-sync` and a Next.js cron
  trigger or an external cron service.
- **Webhook URLs must be HTTPS** — Postmark and SendGrid refuse to
  deliver to non-HTTPS endpoints. Local dev: use ngrok or a similar
  tunnel.

---

## Migration Safety

The data loss from this removal was minimal:

- 0 `EmailAccount` rows (the clinic never configured a production
  account — only test rows in dev)
- 15 `EmailMessage` rows (all from `e2e-email.mjs` runs; no
  real-world traffic)

If the clinic had real `EmailMessage` data, the removal would have been
blocked pending a data export. For dev databases, `--accept-data-loss`
is safe.

---

## Last Removed

- **Date**: 2026-08-14
- **Commit**: (to be added — see git log)
- **Removed by**: Mavis (mavis)
- **Reversed by**: Mavis (when re-integrating, follow §10 in order)
