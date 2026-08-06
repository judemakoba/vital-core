/**
 * Settings Registry — typed metadata for every configurable behavior in VitalCore.
 *
 * The TenantSetting model holds raw key-value pairs; this file is the source of
 * truth for what those keys mean, what types they hold, and what their defaults
 * are. UI uses this registry to auto-render inputs; services use it to validate
 * values on write.
 *
 * To add a new setting:
 *   1. Add it here with type, default, and category
 *   2. Add the default column on the Tenant model if appropriate
 *   3. Use `getSetting("key")` in services; never hardcode the value
 */
import { SettingCategory, SettingValueType } from "../generated-prisma";

export type SettingDef = {
    /** TenantSetting.key */
    key: string;
    /** Display name in UI */
    label: string;
    /** Help text shown under the field */
    description?: string;
    category: SettingCategory;
    valueType: SettingValueType;
    /** Default value (string-encoded) */
    defaultValue: string;
    /** For ENUM type: allowed values */
    enumOptions?: string[];
    /** Min for NUMBER (inclusive) */
    min?: number;
    /** Max for NUMBER (inclusive) */
    max?: number;
    /** Sensitive: don't return to client (passwords, etc.) */
    sensitive?: boolean;
    /** Group within the settings tab for layout */
    group?: string;
};

export const SETTINGS_REGISTRY: SettingDef[] = [
    // ───── Clinic identity & branding ─────
    {
        key: "clinic.tagline",
        label: "Tagline",
        description: "Short marketing slogan shown under clinic name",
        category: "CLINIC",
        valueType: "STRING",
        defaultValue: "",
        group: "Identity",
    },
    {
        key: "clinic.taxId",
        label: "Tax Registration (TIN)",
        description: "Taxpayer Identification Number — required on every tax invoice",
        category: "CLINIC",
        valueType: "STRING",
        defaultValue: "",
        group: "Identity",
    },
    {
        key: "clinic.registrationNumber",
        label: "Hospital/Clinic License #",
        description: "Registration # issued by the health regulatory authority",
        category: "CLINIC",
        valueType: "STRING",
        defaultValue: "",
        group: "Identity",
    },
    {
        key: "clinic.licenseExpiry",
        label: "License Expiry",
        description: "Operating license expiry date",
        category: "CLINIC",
        valueType: "STRING",
        defaultValue: "",
        group: "Identity",
    },
    {
        key: "clinic.regulatoryText",
        label: "Regulatory Disclosure",
        description: "Mandatory footer text on invoices/receipts (e.g. 'This is a URA-compliant tax invoice')",
        category: "CLINIC",
        valueType: "STRING",
        defaultValue: "",
        group: "Identity",
    },
    {
        key: "clinic.primaryColor",
        label: "Brand Primary Color",
        description: "Used for buttons, headers, and the PWA theme",
        category: "CLINIC",
        valueType: "STRING",
        defaultValue: "#6366f1",
        group: "Branding",
    },
    {
        key: "clinic.accentColor",
        label: "Brand Accent Color",
        description: "Used for success states and positive KPIs",
        category: "CLINIC",
        valueType: "STRING",
        defaultValue: "#10b981",
        group: "Branding",
    },
    {
        key: "clinic.faviconUrl",
        label: "Favicon URL",
        category: "CLINIC",
        valueType: "STRING",
        defaultValue: "",
        group: "Branding",
    },
    {
        key: "clinic.reportFont",
        label: "Report Font",
        description: "Font used in lab/radiology PDF reports",
        category: "CLINIC",
        valueType: "ENUM",
        enumOptions: ["Times New Roman", "Georgia", "Arial", "Helvetica", "Calibri"],
        defaultValue: "Times New Roman",
        group: "Branding",
    },

    // ───── Locale ─────
    {
        key: "locale.timezone",
        label: "Timezone",
        description: "IANA timezone (e.g. Africa/Kampala, Africa/Nairobi)",
        category: "LOCALE",
        valueType: "ENUM",
        enumOptions: [
            "Africa/Kampala",
            "Africa/Nairobi",
            "Africa/Dar_es_Salaam",
            "Africa/Kigali",
            "Africa/Addis_Ababa",
            "Africa/Johannesburg",
            "Africa/Cairo",
            "Africa/Lagos",
            "Africa/Accra",
            "Europe/London",
            "UTC",
        ],
        defaultValue: "Africa/Kampala",
        group: "Time",
    },
    {
        key: "locale.dateFormat",
        label: "Date Format",
        category: "LOCALE",
        valueType: "ENUM",
        enumOptions: ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MMM-YYYY"],
        defaultValue: "DD/MM/YYYY",
        group: "Time",
    },
    {
        key: "locale.timeFormat",
        label: "Time Format",
        category: "LOCALE",
        valueType: "ENUM",
        enumOptions: ["24h", "12h"],
        defaultValue: "24h",
        group: "Time",
    },
    {
        key: "locale.firstDayOfWeek",
        label: "First Day of Week",
        description: "Used by calendar views",
        category: "LOCALE",
        valueType: "ENUM",
        enumOptions: ["0", "1", "6"],
        defaultValue: "1",
        group: "Time",
    },
    {
        key: "locale.language",
        label: "Default Language",
        description: "BCP-47 tag (en-GB, en-US, sw-KE, fr-FR, ...)",
        category: "LOCALE",
        valueType: "ENUM",
        enumOptions: ["en-GB", "en-US", "sw-KE", "sw-TZ", "fr-FR", "am-ET", "ar"],
        defaultValue: "en-GB",
        group: "Language",
    },

    // ───── Money ─────
    {
        key: "money.currency",
        label: "Currency Code",
        category: "MONEY",
        valueType: "ENUM",
        enumOptions: ["UGX", "KES", "TZS", "RWF", "ETB", "ZAR", "USD", "EUR", "GBP", "NGN", "GHS"],
        defaultValue: "UGX",
        group: "Currency",
    },
    {
        key: "money.currencySymbol",
        label: "Currency Symbol",
        category: "MONEY",
        valueType: "STRING",
        defaultValue: "UGX",
        group: "Currency",
    },
    {
        key: "money.currencyPosition",
        label: "Symbol Position",
        category: "MONEY",
        valueType: "ENUM",
        enumOptions: ["prefix", "suffix"],
        defaultValue: "prefix",
        group: "Currency",
    },
    {
        key: "money.decimalPlaces",
        label: "Decimal Places",
        description: "Most UGX amounts use 0; KES/USD use 2",
        category: "MONEY",
        valueType: "NUMBER",
        defaultValue: "0",
        min: 0,
        max: 4,
        group: "Currency",
    },
    {
        key: "money.thousandsSeparator",
        label: "Thousands Separator",
        category: "MONEY",
        valueType: "ENUM",
        enumOptions: [",", ".", " ", "'"],
        defaultValue: ",",
        group: "Currency",
    },

    // ───── Numbering ─────
    {
        key: "numbering.patient.prefix",
        label: "Patient # Prefix",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "PAT",
        group: "Patient",
    },
    {
        key: "numbering.patient.format",
        label: "Patient # Format",
        description: "Tokens: {PREFIX} {YYYY} {YY} {MM} {DD} {SEQ:n} (n=padding)",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "{PREFIX}-{YYYY}{MM}{DD}-{SEQ:4}",
        group: "Patient",
    },
    {
        key: "numbering.patient.padding",
        label: "Patient Sequence Padding",
        category: "NUMBERING",
        valueType: "NUMBER",
        defaultValue: "4",
        min: 2,
        max: 10,
        group: "Patient",
    },
    {
        key: "numbering.visit.prefix",
        label: "Visit # Prefix",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "VST",
        group: "Visit",
    },
    {
        key: "numbering.visit.format",
        label: "Visit # Format",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "{PREFIX}-{YYYY}{MM}{DD}-{SEQ:4}",
        group: "Visit",
    },
    {
        key: "numbering.invoice.prefix",
        label: "Invoice # Prefix",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "INV",
        group: "Invoice",
    },
    {
        key: "numbering.invoice.format",
        label: "Invoice # Format",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "{PREFIX}-{YYYY}{MM}{DD}-{SEQ:4}",
        group: "Invoice",
    },
    {
        key: "numbering.taxInvoice.prefix",
        label: "Tax Invoice Prefix",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "TAX",
        group: "Invoice",
    },
    {
        key: "numbering.receipt.prefix",
        label: "Receipt Prefix",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "RCP",
        group: "Invoice",
    },
    {
        key: "numbering.creditNote.prefix",
        label: "Credit Note Prefix",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "CN",
        group: "Invoice",
    },
    {
        key: "numbering.po.prefix",
        label: "Purchase Order Prefix",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "PO",
        group: "Purchase",
    },
    {
        key: "numbering.journal.prefix",
        label: "Journal Entry Prefix",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "JNL",
        group: "Finance",
    },
    {
        key: "numbering.claim.prefix",
        label: "Insurance Claim Prefix",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "CLM",
        group: "Insurance",
    },
    {
        key: "numbering.settlement.prefix",
        label: "Settlement Invoice Prefix",
        category: "NUMBERING",
        valueType: "STRING",
        defaultValue: "SETTLE",
        group: "Finance",
    },

    // ───── Visit / consultation ─────
    {
        key: "visit.consultationFee",
        label: "Default Consultation Fee",
        description: "Charged for billable visit types (OPD, Emergency, Scheduled)",
        category: "VISIT",
        valueType: "NUMBER",
        defaultValue: "50000",
        min: 0,
        group: "Fees",
    },
    {
        key: "visit.emergencyFee",
        label: "Emergency Visit Fee",
        description: "If set, overrides the default fee for EMERGENCY type",
        category: "VISIT",
        valueType: "NUMBER",
        defaultValue: "0",
        min: 0,
        group: "Fees",
    },
    {
        key: "visit.scheduledFee",
        label: "Scheduled Visit Fee",
        description: "If set, overrides the default fee for SCHEDULED type",
        category: "VISIT",
        valueType: "NUMBER",
        defaultValue: "0",
        min: 0,
        group: "Fees",
    },
    {
        key: "visit.followUpWindowDays",
        label: "Follow-up Window (days)",
        description: "If a patient was seen within this many days, the new visit auto-defaults to FOLLOW_UP and is fee-waived. 0 disables.",
        category: "VISIT",
        valueType: "NUMBER",
        defaultValue: "14",
        min: 0,
        group: "Follow-up",
    },
    {
        key: "visit.billableTypes",
        label: "Billable Visit Types",
        description: "Comma-separated VisitType values that get charged",
        category: "VISIT",
        valueType: "STRING",
        defaultValue: "OPD,EMERGENCY,SCHEDULED,OTHER",
        group: "Follow-up",
    },

    // ───── Appointment ─────
    {
        key: "appointment.defaultDuration",
        label: "Default Duration (min)",
        category: "APPOINTMENT",
        valueType: "NUMBER",
        defaultValue: "30",
        min: 5,
        max: 480,
        group: "Scheduling",
    },
    {
        key: "appointment.bufferMinutes",
        label: "Buffer Between Appointments (min)",
        category: "APPOINTMENT",
        valueType: "NUMBER",
        defaultValue: "0",
        min: 0,
        max: 60,
        group: "Scheduling",
    },
    {
        key: "appointment.workingHoursStart",
        label: "Working Hours Start (HH:MM)",
        category: "APPOINTMENT",
        valueType: "STRING",
        defaultValue: "08:00",
        group: "Working Hours",
    },
    {
        key: "appointment.workingHoursEnd",
        label: "Working Hours End (HH:MM)",
        category: "APPOINTMENT",
        valueType: "STRING",
        defaultValue: "17:00",
        group: "Working Hours",
    },
    {
        key: "appointment.allowWeekends",
        label: "Allow Weekend Appointments",
        category: "APPOINTMENT",
        valueType: "BOOLEAN",
        defaultValue: "false",
        group: "Working Hours",
    },

    // ───── Pharmacy ─────
    {
        key: "pharmacy.defaultReorderLevel",
        label: "Default Reorder Level",
        description: "Used when a new drug is created without an explicit reorder level",
        category: "PHARMACY",
        valueType: "NUMBER",
        defaultValue: "10",
        min: 0,
        group: "Stock",
    },
    {
        key: "pharmacy.defaultMaxStock",
        label: "Default Max Stock",
        category: "PHARMACY",
        valueType: "NUMBER",
        defaultValue: "100",
        min: 0,
        group: "Stock",
    },
    {
        key: "pharmacy.expiryWarningDays",
        label: "Expiry Warning (days)",
        description: "Show 'Expiring Soon' badge when daysUntilExpiry <= this",
        category: "PHARMACY",
        valueType: "NUMBER",
        defaultValue: "90",
        min: 0,
        group: "Expiry",
    },
    {
        key: "pharmacy.expiryCriticalDays",
        label: "Expiry Critical (days)",
        description: "Show 'Expiring Very Soon' when daysUntilExpiry <= this",
        category: "PHARMACY",
        valueType: "NUMBER",
        defaultValue: "30",
        min: 0,
        group: "Expiry",
    },
    {
        key: "pharmacy.drugMarkupPercent",
        label: "Default Drug Markup (%)",
        description: "Markup applied to cost when auto-calculating selling price at procurement",
        category: "PHARMACY",
        valueType: "NUMBER",
        defaultValue: "0",
        min: 0,
        max: 500,
        group: "Pricing",
    },
    {
        key: "pharmacy.useFEFO",
        label: "Use FEFO (First-Expiry-First-Out) by default",
        description: "When true, dispense the batch nearest to expiry first",
        category: "PHARMACY",
        valueType: "BOOLEAN",
        defaultValue: "true",
        group: "Dispensing",
    },
    {
        key: "pharmacy.coldChainMaxTempC",
        label: "Cold-chain Max Temp (°C)",
        description: "Alert if fridge temperature exceeds this",
        category: "PHARMACY",
        valueType: "NUMBER",
        defaultValue: "8",
        group: "Cold Chain",
    },
    {
        key: "pharmacy.coldChainMinTempC",
        label: "Cold-chain Min Temp (°C)",
        description: "Alert if fridge temperature drops below this",
        category: "PHARMACY",
        valueType: "NUMBER",
        defaultValue: "2",
        group: "Cold Chain",
    },

    // ───── Lab ─────
    {
        key: "lab.defaultTemplateHeader",
        label: "Default Report Header HTML",
        description: "Used when a test has no specific template. Leave empty to use the built-in GMC-style header.",
        category: "LAB",
        valueType: "STRING",
        defaultValue: "",
        group: "Templates",
    },
    {
        key: "lab.defaultTemplateFooter",
        label: "Default Report Footer HTML",
        category: "LAB",
        valueType: "STRING",
        defaultValue: "",
        group: "Templates",
    },
    {
        key: "lab.criticalNotifySms",
        label: "SMS Doctor on Critical Result",
        description: "Send SMS to ordering doctor when a critical result is verified",
        category: "LAB",
        valueType: "BOOLEAN",
        defaultValue: "false",
        group: "Critical",
    },
    {
        key: "lab.statTatMinutes",
        label: "STAT Turnaround Target (min)",
        category: "LAB",
        valueType: "NUMBER",
        defaultValue: "60",
        group: "TAT",
    },
    {
        key: "lab.routineTatMinutes",
        label: "Routine TAT Target (min)",
        category: "LAB",
        valueType: "NUMBER",
        defaultValue: "240",
        group: "TAT",
    },

    // ───── Radiology ─────
    {
        key: "radiology.defaultTemplateHeader",
        label: "Default Report Header HTML",
        category: "RADIOLOGY",
        valueType: "STRING",
        defaultValue: "",
        group: "Templates",
    },
    {
        key: "radiology.defaultTemplateFooter",
        label: "Default Report Footer HTML",
        category: "RADIOLOGY",
        valueType: "STRING",
        defaultValue: "",
        group: "Templates",
    },
    {
        key: "radiology.imageRetentionYears",
        label: "Image Retention (years)",
        description: "Regulatory minimum: usually 5–10 years",
        category: "RADIOLOGY",
        valueType: "NUMBER",
        defaultValue: "7",
        min: 1,
        max: 30,
        group: "Storage",
    },
    {
        key: "radiology.requireSecondRead",
        label: "Require Second-Read for CT/MRI",
        category: "RADIOLOGY",
        valueType: "BOOLEAN",
        defaultValue: "false",
        group: "Workflow",
    },

    // ───── Billing / Insurance ─────
    {
        key: "billing.agingBuckets",
        label: "AR Aging Bucket Days",
        description: "Comma-separated day thresholds (e.g. 0,30,60,90 = 0-30, 31-60, 61-90, 90+)",
        category: "BILLING",
        valueType: "STRING",
        defaultValue: "0,30,60,90",
        group: "Aging",
    },
    {
        key: "billing.cogsAccountCode",
        label: "Default COGS Account Code",
        description: "GL account posted when inventory is dispensed",
        category: "BILLING",
        valueType: "STRING",
        defaultValue: "5110",
        group: "Accounting",
    },
    {
        key: "billing.contractualAllowanceAccountCode",
        label: "Contractual Allowance Account Code",
        description: "Used when an insurance claim is paid below billed amount",
        category: "BILLING",
        valueType: "STRING",
        defaultValue: "4220",
        group: "Accounting",
    },
    {
        key: "billing.badDebtAccountCode",
        label: "Bad Debt Account Code",
        description: "Used when writing off denied/uncollectable claims",
        category: "BILLING",
        valueType: "STRING",
        defaultValue: "5430",
        group: "Accounting",
    },
    {
        key: "billing.autoWriteoffThreshold",
        label: "Auto-Writeoff Threshold",
        description: "Claims denied below this amount are auto-written-off instead of tracked",
        category: "BILLING",
        valueType: "NUMBER",
        defaultValue: "5000",
        min: 0,
        group: "Aging",
    },
    {
        key: "billing.allowedPaymentMethods",
        label: "Allowed Payment Methods",
        description: "Comma-separated (CASH,MOBILE_MONEY,CARD,BANK_TRANSFER,INSURANCE,CHEQUE)",
        category: "BILLING",
        valueType: "STRING",
        defaultValue: "CASH,MOBILE_MONEY,CARD,BANK_TRANSFER,INSURANCE,CHEQUE",
        group: "Payments",
    },

    // ───── Finance ─────
    {
        key: "finance.fiscalYearStartMonth",
        label: "Fiscal Year Start Month",
        description: "1=Jan, 7=Jul (EAC default)",
        category: "FINANCE",
        valueType: "NUMBER",
        defaultValue: "7",
        min: 1,
        max: 12,
        group: "Periods",
    },
    {
        key: "finance.defaultTaxRate",
        label: "Default Tax Rate (%)",
        description: "Applied to new tax-invoice lines that don't specify one",
        category: "FINANCE",
        valueType: "NUMBER",
        defaultValue: "0",
        min: 0,
        max: 100,
        group: "Tax",
    },
    {
        key: "finance.decimalPlaces",
        label: "Accounting Decimal Places",
        category: "FINANCE",
        valueType: "NUMBER",
        defaultValue: "2",
        min: 0,
        max: 4,
        group: "Accounting",
    },
    {
        key: "finance.journalNumberingByMonth",
        label: "Reset Journal # Monthly",
        description: "If true, journal #s reset each month (JNL-202607-####)",
        category: "FINANCE",
        valueType: "BOOLEAN",
        defaultValue: "true",
        group: "Numbering",
    },
    {
        key: "finance.backdateLimitDays",
        label: "Backdate Limit (days)",
        description: "0 = unlimited; otherwise forbids posting older than this",
        category: "FINANCE",
        valueType: "NUMBER",
        defaultValue: "7",
        min: 0,
        group: "Audit",
    },

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

    // ───── Security ─────
    {
        key: "security.passwordMinLength",
        label: "Password Min Length",
        category: "SECURITY",
        valueType: "NUMBER",
        defaultValue: "8",
        min: 4,
        max: 32,
        group: "Passwords",
    },
    {
        key: "security.passwordRequireSpecial",
        label: "Require Special Character",
        category: "SECURITY",
        valueType: "BOOLEAN",
        defaultValue: "false",
        group: "Passwords",
    },
    {
        key: "security.passwordExpiryDays",
        label: "Password Expiry (days)",
        description: "0 = never expire",
        category: "SECURITY",
        valueType: "NUMBER",
        defaultValue: "0",
        min: 0,
        group: "Passwords",
    },
    {
        key: "security.sessionTimeoutHours",
        label: "Session Timeout (hours)",
        category: "SECURITY",
        valueType: "NUMBER",
        defaultValue: "12",
        min: 1,
        max: 720,
        group: "Sessions",
    },
    {
        key: "security.maxLoginAttempts",
        label: "Max Login Attempts",
        description: "Lock account after this many failed logins",
        category: "SECURITY",
        valueType: "NUMBER",
        defaultValue: "5",
        min: 1,
        max: 50,
        group: "Lockout",
    },
    {
        key: "security.lockoutMinutes",
        label: "Lockout Duration (min)",
        category: "SECURITY",
        valueType: "NUMBER",
        defaultValue: "15",
        min: 1,
        max: 1440,
        group: "Lockout",
    },
    {
        key: "security.require2FA",
        label: "Require 2FA for Admins",
        category: "SECURITY",
        valueType: "BOOLEAN",
        defaultValue: "false",
        group: "2FA",
    },
    {
        key: "security.auditRetentionDays",
        label: "Audit Log Retention (days)",
        description: "0 = keep forever",
        category: "SECURITY",
        valueType: "NUMBER",
        defaultValue: "2555",
        min: 0,
        group: "Audit",
    },

    // ───── System limits ─────
    {
        key: "limits.defaultPageSize",
        label: "Default Page Size",
        category: "LIMITS",
        valueType: "NUMBER",
        defaultValue: "50",
        min: 10,
        max: 500,
        group: "Lists",
    },
    {
        key: "limits.maxPageSize",
        label: "Max Page Size",
        category: "LIMITS",
        valueType: "NUMBER",
        defaultValue: "500",
        min: 50,
        max: 5000,
        group: "Lists",
    },
    {
        key: "limits.settingsCacheTtlMs",
        label: "Settings Cache TTL (ms)",
        description: "How long to cache settings in process memory",
        category: "LIMITS",
        valueType: "NUMBER",
        defaultValue: "60000",
        min: 1000,
        group: "Performance",
    },
    {
        key: "limits.backupRetentionDays",
        label: "Backup Retention (days)",
        category: "LIMITS",
        valueType: "NUMBER",
        defaultValue: "30",
        min: 1,
        group: "Backups",
    },

    // ───── Integration ─────
    {
        key: "integration.nextcloudEnabled",
        label: "Nextcloud Image Storage Enabled",
        category: "INTEGRATION",
        valueType: "BOOLEAN",
        defaultValue: "true",
        group: "Nextcloud",
    },
    {
        key: "integration.nextcloudBaseUrl",
        label: "Nextcloud Base URL",
        category: "INTEGRATION",
        valueType: "STRING",
        defaultValue: "",
        group: "Nextcloud",
    },
    {
        key: "integration.nextcloudUsername",
        label: "Nextcloud Username",
        category: "INTEGRATION",
        valueType: "STRING",
        defaultValue: "",
        group: "Nextcloud",
    },
    {
        key: "integration.nextcloudPassword",
        label: "Nextcloud App Password",
        category: "INTEGRATION",
        valueType: "STRING",
        defaultValue: "",
        sensitive: true,
        group: "Nextcloud",
    },
    {
        key: "integration.nextcloudShareExpiryDays",
        label: "Image Share Expiry (days)",
        description: "0 = no expiry",
        category: "INTEGRATION",
        valueType: "NUMBER",
        defaultValue: "0",
        min: 0,
        group: "Nextcloud",
    },

    // ───── SMTP (kept from old EmailSettingsTab) ─────
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
];

/** Build a quick-lookup map keyed by `key`. */
export const SETTINGS_BY_KEY = new Map(SETTINGS_REGISTRY.map((s) => [s.key, s]));

/** Returns the default for a key (string-encoded as stored in DB). */
export function defaultFor(key: string): string {
    return SETTINGS_BY_KEY.get(key)?.defaultValue ?? "";
}

/** Parse a stored string value to its typed JS value. */
export function parseSettingValue(def: SettingDef | undefined, raw: string | undefined | null): any {
    if (raw == null || raw === "") {
        if (!def) return raw;
        raw = def.defaultValue;
    }
    if (!def) return raw;
    switch (def.valueType) {
        case "BOOLEAN":
            return raw === "true" || raw === "1";
        case "NUMBER":
            return Number(raw);
        case "JSON":
            try {
                return JSON.parse(raw);
            } catch {
                return null;
            }
        case "STRING":
        case "ENUM":
        default:
            return raw;
    }
}
