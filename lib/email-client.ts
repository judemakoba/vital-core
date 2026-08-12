/**
 * Email Client — outbound SMTP + inbound IMAP/webhook.
 *
 * Replaces the old SMS-based `lib/messaging.ts sendSMS` with a proper
 * email client. The clinic configures one or more `EmailAccount` rows
 * (notifications@, staff@, etc.) and the system can send and
 * receive through them.
 *
 *   sendEmail({ to, subject, html })  →  picks the right account, sends, logs to EmailMessage
 *   syncInbox(accountId)              →  fetches new messages via IMAP
 *   receiveFromWebhook(provider, body) →  drops a Postmark/SendGrid payload into EmailMessage
 */
import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { getDefaultTenantId, getSetting, getTenant } from "./settings/store";

// ───── Outbound ────────────────────────────────────────────────────────────

export type SendEmailOptions = {
    /** Account to send from. If omitted, picks the tenant's default EmailAccount. */
    accountId?: string;
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    subject: string;
    html?: string;
    text?: string;
    /** Optional FK links for traceability */
    patientId?: string;
visitId?: string;
    appointmentId?: string;
    labOrderId?: string;
    fromUserId?: string;
    toUserId?: string;
    /** If this is a reply, set the inReplyTo EmailMessage id to thread correctly */
    inReplyToId?: string;
    /** Attachments: { filename, content (Buffer or string), contentType? } */
    attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
    /** Override the "from" address (rarely needed) */
    fromOverride?: { address: string; name?: string };
};

function csvify(list?: string | string[]): string | null {
    if (!list) return null;
    if (Array.isArray(list)) return list.filter(Boolean).join(", ");
    return list;
}

async function pickAccount(opts: { accountId?: string; tenantId: string; purpose?: string }): Promise<any> {
    if (opts.accountId) {
        return prisma.emailAccount.findFirst({
            where: { id: opts.accountId, tenantId: opts.tenantId, isActive: true },
        });
    }
    // Default: the isDefault=true account, or the first active one
    const def = await prisma.emailAccount.findFirst({
        where: { tenantId: opts.tenantId, isDefault: true, isActive: true },
    });
    if (def) return def;
    return prisma.emailAccount.findFirst({
        where: { tenantId: opts.tenantId, isActive: true },
        orderBy: { createdAt: "asc" },
    });
}

function buildThreadId(opts: { threadId?: string; inReplyToId?: string; externalReferences?: string; subject: string }) {
    if (opts.threadId) return opts.threadId;
    if (opts.inReplyToId) return `reply-${opts.inReplyToId}`;
    // New thread — use first 8 chars of a hash of the subject (strip RE:/FWD:)
    const clean = (opts.subject || "").replace(/^\s*(re|fwd)\s*:\s*/i, "").trim();
    let h = 0;
    for (let i = 0; i < clean.length; i++) h = ((h << 5) - h + clean.charCodeAt(i)) | 0;
    return `t-${Math.abs(h).toString(36)}`;
}

/**
 * Send an outbound email.
 *
 * Behaviour:
 *  1. Resolve the right EmailAccount (or use opts.accountId)
 *  2. If `comm.emailSimulate` is true OR no account is configured, persist as SENT
 *     (or QUEUED) and skip the actual SMTP call
 *  3. Otherwise create a nodemailer transporter, send, then update status to SENT
 *  4. On failure, persist as FAILED with the error
 *  5. Always insert an EmailMessage row for audit
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{
    success: boolean;
    messageId?: string;
    emailMessageId?: string;
    error?: string;
    simulated?: boolean;
}> {
    const tenantId = await getDefaultTenantId();
    const tenant = await getTenant();
    const simulate = await getSetting<boolean>("comm.emailSimulate", true);
    const subjectPrefix = await getSetting<string>("comm.emailSubjectPrefix", "");
    const footerHtml = await getSetting<string>("comm.emailFooter", "");

    const account = await pickAccount({ accountId: opts.accountId, tenantId });
    if (!account) {
        // No account configured — record as FAILED for visibility
        const record = await persistOutbound({ ...opts, tenantId, accountId: null, status: "FAILED", failureReason: "No active EmailAccount configured", subjectPrefix, footerHtml });
        return { success: false, error: "No active EmailAccount configured", emailMessageId: record.id };
    }

    const fromAddress = opts.fromOverride?.address || account.email;
    const fromName = opts.fromOverride?.name || account.displayName || tenant?.name || undefined;
    const toAddressesCsv = csvify(opts.to);
    const ccAddressesCsv = csvify(opts.cc);
    const bccAddressesCsv = csvify(opts.bcc);
    const fullSubject = subjectPrefix ? `${subjectPrefix} ${opts.subject}` : opts.subject;
    const fullHtml = opts.html
        ? `${opts.html}${footerHtml ? `<div style="margin-top:32px;border-top:1px solid #eee;padding-top:12px;font-size:11px;color:#888">${footerHtml}</div>` : ""}`
        : undefined;
    const fullText = opts.text
        ? opts.text
        : undefined;

    // If a reply was requested, look up the inReplyTo for thread + external In-Reply-To
    let inReplyTo: any = null;
    if (opts.inReplyToId) {
        inReplyTo = await prisma.emailMessage.findUnique({ where: { id: opts.inReplyToId } });
    }
    const threadId = buildThreadId({
        threadId: inReplyTo?.threadId || undefined,
        inReplyToId: opts.inReplyToId,
        externalReferences: inReplyTo?.externalReferences,
        subject: fullSubject,
    });
    const externalInReplyTo = inReplyTo?.externalMessageId || null;
    const externalReferences = inReplyTo
        ? [inReplyTo.externalReferences, inReplyTo.externalMessageId].filter(Boolean).join(" ")
        : null;

    // Simulate mode — no SMTP call
    if (simulate) {
        const record = await persistOutbound({
            ...opts,
            tenantId,
            accountId: account.id,
            fromAddress,
            fromName: fromName || null,
            toAddresses: toAddressesCsv || "",
            ccAddresses: ccAddressesCsv,
            bccAddresses: bccAddressesCsv,
            subject: fullSubject,
            bodyHtml: fullHtml || null,
            bodyText: fullText || null,
            threadId,
            inReplyToId: opts.inReplyToId || null,
            externalInReplyTo,
            externalReferences,
            status: "SENT",
            sentAt: new Date(),
            provider: "simulated",
        });
        console.log(`[email simulate] to=${toAddressesCsv} subject="${fullSubject}"`);
        return { success: true, messageId: `simulated-${record.id}`, emailMessageId: record.id, simulated: true };
    }

    // Create the PENDING record first so we have an audit row even if SMTP fails
    const record = await persistOutbound({
        ...opts,
        tenantId,
        accountId: account.id,
        fromAddress,
        fromName: fromName || null,
        toAddresses: toAddressesCsv || "",
        ccAddresses: ccAddressesCsv,
        bccAddresses: bccAddressesCsv,
        subject: fullSubject,
        bodyHtml: fullHtml || null,
        bodyText: fullText || null,
        threadId,
        inReplyToId: opts.inReplyToId || null,
        externalInReplyTo,
        externalReferences,
        status: "PENDING",
        provider: "smtp",
    });

    try {
        const transporter = nodemailer.createTransport({
            host: account.smtpHost,
            port: account.smtpPort,
            secure: account.smtpSecure,
            auth: { user: account.smtpUser, pass: account.smtpPassword },
        });

        const info = await transporter.sendMail({
            from: fromName ? `"${fromName}" <${fromAddress}>` : fromAddress,
            to: toAddressesCsv,
            cc: ccAddressesCsv || undefined,
            bcc: bccAddressesCsv || undefined,
            replyTo: opts.replyTo || undefined,
            subject: fullSubject,
            html: fullHtml,
            text: fullText,
            attachments: opts.attachments?.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType,
            })),
            inReplyTo: externalInReplyTo || undefined,
            references: externalReferences || undefined,
        });

        await prisma.emailMessage.update({
            where: { id: record.id },
            data: {
                status: "SENT",
                sentAt: new Date(),
                externalMessageId: info.messageId,
                externalId: info.messageId,
            },
        });
        return { success: true, messageId: info.messageId, emailMessageId: record.id };
    } catch (e: any) {
        await prisma.emailMessage.update({
            where: { id: record.id },
            data: {
                status: "FAILED",
                failedAt: new Date(),
                failureReason: e.message?.slice(0, 500) || "Unknown error",
                retryCount: { increment: 1 },
            },
        });
        console.error("[email] send failed:", e);
        return { success: false, error: e.message, emailMessageId: record.id };
    }
}

async function persistOutbound(opts: any) {
    return prisma.emailMessage.create({
        data: {
            tenantId: opts.tenantId,
            accountId: opts.accountId,
            direction: "OUTBOUND",
            fromAddress: opts.fromAddress,
            fromName: opts.fromName,
            toAddresses: opts.toAddresses,
            ccAddresses: opts.ccAddresses,
            bccAddresses: opts.bccAddresses,
            replyTo: opts.replyTo,
            subject: opts.subject,
            bodyHtml: opts.bodyHtml,
            bodyText: opts.bodyText,
            threadId: opts.threadId,
            inReplyToId: opts.inReplyToId,
            externalInReplyTo: opts.externalInReplyTo,
            externalReferences: opts.externalReferences,
            status: opts.status,
            sentAt: opts.sentAt,
            failedAt: opts.failedAt,
            failureReason: opts.failureReason,
            attachments: opts.attachments,
            patientId: opts.patientId,
            visitId: opts.visitId,
            appointmentId: opts.appointmentId,
            labOrderId: opts.labOrderId,
            fromUserId: opts.fromUserId,
            toUserId: opts.toUserId,
            provider: opts.provider,
            createdById: opts.fromUserId,
        },
    });
}

// ───── Connection test ────────────────────────────────────────────────────

export async function testEmailAccount(accountId: string): Promise<{ smtp: { ok: boolean; error?: string }; imap?: { ok: boolean; error?: string } }> {
    const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
    if (!account) return { smtp: { ok: false, error: "Account not found" } };

    // Test SMTP
    let smtp = { ok: false, error: undefined as string | undefined };
    try {
        const t = nodemailer.createTransport({
            host: account.smtpHost,
            port: account.smtpPort,
            secure: account.smtpSecure,
            auth: { user: account.smtpUser, pass: account.smtpPassword },
        });
        await t.verify();
        smtp = { ok: true };
    } catch (e: any) {
        smtp = { ok: false, error: e.message };
    }

    // Test IMAP if enabled
    let imap: { ok: boolean; error?: string } | undefined;
    if (account.imapEnabled && account.imapHost) {
        try {
            const { testImapConnection } = await import("./email-receiver");
            imap = await testImapConnection(account);
        } catch (e: any) {
            imap = { ok: false, error: e.message };
        }
    }

    return { smtp, imap };
}
