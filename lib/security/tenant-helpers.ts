/**
 * Security helpers — tenant-configured password + session + lockout policies.
 */
import { getSetting } from "../settings/store";

/** Minimum password length. */
export async function getPasswordMinLength(): Promise<number> {
    return getSetting<number>("security.passwordMinLength", 8);
}

/** Whether passwords must contain a special character. */
export async function getPasswordRequireSpecial(): Promise<boolean> {
    return getSetting<boolean>("security.passwordRequireSpecial", false);
}

/** Password expiry in days (0 = never). */
export async function getPasswordExpiryDays(): Promise<number> {
    return getSetting<number>("security.passwordExpiryDays", 0);
}

/** Session timeout in hours. */
export async function getSessionTimeoutHours(): Promise<number> {
    return getSetting<number>("security.sessionTimeoutHours", 12);
}

/** Max login attempts before lockout. */
export async function getMaxLoginAttempts(): Promise<number> {
    return getSetting<number>("security.maxLoginAttempts", 5);
}

/** Lockout duration in minutes. */
export async function getLockoutMinutes(): Promise<number> {
    return getSetting<number>("security.lockoutMinutes", 15);
}

/** Whether 2FA is required for admins. */
export async function getRequire2FAForAdmins(): Promise<boolean> {
    return getSetting<boolean>("security.require2FA", false);
}

/** Audit log retention in days (0 = forever). */
export async function getAuditRetentionDays(): Promise<number> {
    return getSetting<number>("security.auditRetentionDays", 2555);
}

/** Validate a password against the configured policy. Throws on failure. */
export async function validatePassword(plain: string): Promise<void> {
    if (!plain || typeof plain !== "string") {
        throw new Error("Password is required");
    }
    const min = await getPasswordMinLength();
    if (plain.length < min) {
        throw new Error(`Password must be at least ${min} characters`);
    }
    const requireSpecial = await getPasswordRequireSpecial();
    if (requireSpecial) {
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(plain)) {
            throw new Error("Password must contain a special character (!@#$%^&* etc.)");
        }
    }
}

/** Returns the standard session expiry (now + timeout hours). */
export async function sessionMaxAge(): Promise<number> {
    const hours = await getSessionTimeoutHours();
    return hours * 3600;
}
