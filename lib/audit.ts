/**
 * lib/audit.ts
 *
 * Centralized audit-log writer. Hooks at every high-value business
 * action and at the auth boundary. The AuditLog table is the single
 * source of truth for "who did what, when" — used by the
 * /dashboard/admin/audit report and by the SUPER_ADMIN compliance
 * flow.
 *
 * Design notes:
 * - recordAudit() is **fire-and-forget**: it never throws into the
 *   caller. A bad audit write must not block a real business action.
 *   The Prisma call is awaited but wrapped in a try/catch.
 * - Sensitive fields (passwords, tokens, refresh tokens) are stripped
 *   from the `changes` object before write. Pattern-match by key
 *   name, NOT by value, so PII like a patient's email stays in the
 *   log (it's not a secret; the value matters for "who edited
 *   whom").
 * - The AuditLog table is the existing Prisma model. We do NOT add
 *   a new column; the schema is the source of truth.
 *
 * Usage:
 *   import { recordAudit, AUDIT_ACTION, ENTITY } from "@/lib/audit";
 *
 *   await recordAudit({
 *       userId: session.user.id,
 *       action: AUDIT_ACTION.PATIENT_CREATE,
 *       entityType: ENTITY.PATIENT,
 *       entityId: created.id,
 *       changes: { after: { firstName, lastName, patientNumber } },
 *   });
 */
import { prisma } from "@/lib/prisma";

/** Canonical action names. Use these instead of free-text strings. */
export const AUDIT_ACTION = {
    // Auth
    LOGIN_SUCCESS: "LOGIN_SUCCESS",
    LOGIN_FAIL:    "LOGIN_FAIL",
    LOGOUT:        "LOGOUT",

    // Patient
    PATIENT_CREATE: "PATIENT_CREATE",
    PATIENT_UPDATE: "PATIENT_UPDATE",

    // Visit
    VISIT_CREATE:    "VISIT_CREATE",
    VISIT_DISCONTINUE: "VISIT_DISCONTINUE",

    // Billing
    INVOICE_PAYMENT: "INVOICE_PAYMENT",
    INVOICE_CREATE:  "INVOICE_CREATE",

    // Pharmacy
    DISPENSE: "DISPENSE",

    // Lab / Radiology
    LAB_RESULT_SUBMIT:  "LAB_RESULT_SUBMIT",
    RAD_RESULT_SUBMIT:  "RAD_RESULT_SUBMIT",

    // Admin / RBAC
    USER_CREATE:  "USER_CREATE",
    USER_UPDATE:  "USER_UPDATE",
    USER_DELETE:  "USER_DELETE",  // hard delete with tombstone; the audit row IS the user's last footprint
    ROLE_CHANGE:  "ROLE_CHANGE",
    PERMISSION_CHANGE: "PERMISSION_CHANGE",
} as const;
export type AuditAction = typeof AUDIT_ACTION[keyof typeof AUDIT_ACTION];

/** Canonical entity type names. Matches the Prisma model name verbatim. */
export const ENTITY = {
    USER:       "User",
    PATIENT:    "Patient",
    VISIT:      "Visit",
    INVOICE:    "Invoice",
    PAYMENT:    "Payment",
    DISPENSE:   "DispensingLog",
    LAB_ORDER:  "LabOrder",
    RAD_ORDER:  "RadiologyOrder",
    PRESCRIPTION: "Prescription",
    ROLE:       "Role",
    PERMISSION: "Permission",
    SESSION:    "Session",
} as const;
export type EntityType = typeof ENTITY[keyof typeof ENTITY];

export interface RecordAuditInput {
    userId: string;
    action: AuditAction | string;
    entityType: EntityType | string;
    entityId: string;
    /** Optional diff/snapshot. Free shape — usually { before, after } or { snapshot }. */
    changes?: Record<string, unknown> | null;
}

/** Field names whose VALUES must never be persisted to audit. */
const REDACTED_FIELDS = new Set([
    "password",
    "passwordHash",
    "hashedPassword",
    "token",
    "accessToken",
    "refreshToken",
    "sessionToken",
    "csrfToken",
    "apiKey",
    "secret",
    "smtpPassword",
    "imapPassword",
]);

/**
 * Recursively walks an object and replaces the VALUE of any
 * key in REDACTED_FIELDS with the literal string "[REDACTED]".
 * Does NOT mutate the input — returns a shallow copy tree.
 */
function redactPII<T>(input: T): T {
    if (input === null || input === undefined) return input;
    if (Array.isArray(input)) {
        return input.map((v) => redactPII(v)) as unknown as T;
    }
    if (typeof input === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
            if (REDACTED_FIELDS.has(k)) {
                out[k] = "[REDACTED]";
            } else {
                out[k] = redactPII(v);
            }
        }
        return out as unknown as T;
    }
    return input;
}

/**
 * Fire-and-forget audit write. Never throws.
 *
 * Logs an error to stderr if the DB write fails (so dev sees it),
 * but does not propagate — the business action that called this
 * should succeed even if audit is down.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                userId:     input.userId,
                action:     input.action,
                entityType: input.entityType,
                entityId:   input.entityId,
                changes:    input.changes ? redactPII(input.changes) : undefined,
            },
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
            `[AUDIT] failed to record ${input.action} on ${input.entityType}:${input.entityId} by ${input.userId}:`,
            err instanceof Error ? err.message : err
        );
    }
}

/**
 * Fire-and-forget audit write that tolerates an unauthenticated
 * caller (e.g. failed-login attempts where the userId is unknown).
 * Falls back to a sentinel userId. Use this from the auth
 * callbacks; for everything else, prefer recordAudit() which
 * requires a real userId.
 */
export async function recordAuthEvent(input: Omit<RecordAuditInput, "userId"> & { userId?: string | null }): Promise<void> {
    const SENTINEL = "anonymous";
    return recordAudit({
        ...input,
        userId: input.userId ?? SENTINEL,
    });
}

/**
 * Computes a { before, after } diff between two snapshots, omitting
 * any fields that didn't change. Free helper — callers decide what
 * to put in.
 */
export function diff<T extends Record<string, unknown>>(
    before: T | null | undefined,
    after: T
): { before: Partial<T>; after: Partial<T> } {
    const changed: Partial<T> = {};
    for (const k of Object.keys(after) as (keyof T)[]) {
        if (JSON.stringify(before?.[k]) !== JSON.stringify(after[k])) {
            changed[k] = after[k];
        }
    }
    return { before: changed, after: changed };
}
