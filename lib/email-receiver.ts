/**
 * Email Receiver — fetches inbound messages via IMAP or webhook.
 *
 * Two strategies:
 *  1. IMAP polling: `syncAccountInbox(accountId)` opens an IMAP connection,
 *     walks the INBOX, downloads new messages, and stores them as
 *     `EmailMessage(direction=INBOUND)`. Run on a cron or manually from the
 *     Email Accounts UI.
 *  2. Webhook (Postmark / SendGrid): `receiveFromPostmark(payload)` and
 *     `receiveFromSendGrid(payload)` are called by the webhook endpoints
 *     `/api/email/inbound/postmark` and `/api/email/inbound/sendgrid`.
 *
 * Both write to the same `EmailMessage` table, with thread detection
 * (In-Reply-To / References headers), patient/claim routing (From address
 * match against Patient.email / InsuranceCompany.email).
 */
import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail, Attachment } from "mailparser";
import { prisma } from "./prisma";
import { getDefaultTenantId } from "./settings/store";

// ───── IMAP ────────────────────────────────────────────────────────────────

export async function testImapConnection(account: {
    imapHost: string | null;
    imapPort: number | null;
    imapUser: string | null;
    imapPassword: string | null;
    imapSecure: boolean;
}): Promise<{ ok: boolean; error?: string }> {
    if (!account.imapHost || !account.imapUser || !account.imapPassword) {
        return { ok: false, error: "IMAP credentials not configured" };
    }
    try {
        const client = new ImapFlow({
            host: account.imapHost,
            port: account.imapPort || 993,
            secure: account.imapSecure !== false,
            auth: { user: account.imapUser, pass: account.imapPassword },
            logger: false,
        });
        await client.connect();
        await client.logout();
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

/**
 * Sync inbound messages for a single EmailAccount.
 * Returns the count of new messages stored.
 */
export async function syncAccountInbox(accountId: string, opts: { sinceDays?: number; limit?: number } = {}): Promise<{ fetched: number; errors: string[] }> {
    const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
    if (!account) return { fetched: 0, errors: ["Account not found"] };
    if (!account.imapEnabled || !account.imapHost) {
        return { fetched: 0, errors: ["IMAP not enabled for this account"] };
    }

    const errors: string[] = [];
    const sinceDays = opts.sinceDays ?? 7;
    const limit = opts.limit ?? 50;

    const client = new ImapFlow({
        host: account.imapHost,
        port: account.imapPort || 993,
        secure: account.imapSecure !== false,
        auth: { user: account.imapUser!, pass: account.imapPassword! },
        logger: false,
    });

    let fetched = 0;
    try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
            const since = new Date(Date.now() - sinceDays * 86400000);
            const uids = await client.search({ since });

            for (const uid of uids) {
                if (fetched >= limit) break;
                try {
                    // Skip if we already have a message with this externalMessageId
                    const msg = await client.fetchOne(uid, { source: true, envelope: true });
                    if (!msg) continue;
                    const externalId = msg.envelope?.messageId || `${account.email}-${uid}`;

                    const existing = await prisma.emailMessage.findFirst({
                        where: { tenantId: account.tenantId, externalId },
                    });
                    if (existing) continue;

                    // Download the full source
                    const fullMsg = await client.fetchOne(uid, { source: true });
                    if (!fullMsg?.source) continue;
                    const parsed: ParsedMail = await simpleParser(fullMsg.source);

                    // Patient / claim routing: look up the from-address
                    const routing = await routeInbound(account.tenantId, parsed);

                    // Save attachments as a JSON manifest (we don't store blobs by default)
                    const attachmentManifest = (parsed.attachments || []).map((a: Attachment) => ({
                        filename: a.filename,
                        contentType: a.contentType,
                        size: a.size,
                    }));

                    await prisma.emailMessage.create({
                        data: {
                            tenantId: account.tenantId,
                            account: { connect: { id: account.id } },
                            direction: "INBOUND",
                            fromAddress: parsed.from?.value[0]?.address || "",
                            fromName: parsed.from?.value[0]?.name,
                            toAddresses: (parsed.to?.value || []).map((v) => v.address).join(", "),
                            ccAddresses: (parsed.cc?.value || []).map((v) => v.address).join(", ") || null,
                            subject: parsed.subject || "(no subject)",
                            bodyHtml: parsed.html || null,
                            bodyText: parsed.text || null,
                            threadId: threadIdFor(parsed),
                            externalMessageId: parsed.messageId,
                            externalInReplyTo: parsed.inReplyTo,
                            externalReferences: (parsed.references || []).join(" "),
                            status: "DELIVERED",
                            sentAt: parsed.date || null,
                            receivedAt: new Date(),
                            attachments: attachmentManifest as any,
                            patientId: routing.patientId,
                            claimId: routing.claimId,
                            provider: "imap",
                            externalId,
                            toUserId: routing.toUserId,
                        },
                    });
                    fetched++;
                } catch (e: any) {
                    errors.push(`UID ${uid}: ${e.message}`);
                }
            }
        } finally {
            lock.release();
        }
        await client.logout();

        // Update sync state
        await prisma.emailAccount.update({
            where: { id: account.id },
            data: { lastSyncAt: new Date(), lastSyncError: errors.length ? errors[0].slice(0, 500) : null },
        });
    } catch (e: any) {
        errors.push(e.message);
        await prisma.emailAccount.update({
            where: { id: account.id },
            data: { lastSyncError: e.message?.slice(0, 500) },
        }).catch(() => {});
    }
    return { fetched, errors };
}

/** Sync all active IMAP-enabled accounts for the current tenant. */
export async function syncAllInboxes(opts: { sinceDays?: number; limit?: number } = {}): Promise<{ total: number; perAccount: Array<{ accountId: string; email: string; fetched: number; errors: string[] }> }> {
    const tenantId = await getDefaultTenantId();
    const accounts = await prisma.emailAccount.findMany({
        where: { tenantId, isActive: true, imapEnabled: true },
    });
    const results: Array<{ accountId: string; email: string; fetched: number; errors: string[] }> = [];
    let total = 0;
    for (const acc of accounts) {
        const r = await syncAccountInbox(acc.id, opts);
        results.push({ accountId: acc.id, email: acc.email, ...r });
        total += r.fetched;
    }
    return { total, perAccount: results };
}

// ───── Webhook helpers (Postmark / SendGrid) ───────────────────────────────

/**
 * Postmark inbound webhook payload (the fields we use).
 * https://postmarkapp.com/developer/webhooks/inbound-webhook
 */
export type PostmarkInbound = {
    MessageID: string;
    From: string;
    FromFull?: { Email: string; Name?: string };
    FromName?: string;
    To: string;
    Cc?: string;
    Bcc?: string;
    ReplyTo?: string;
    Subject: string;
    HtmlBody?: string;
    TextBody?: string;
    MessageStream?: string;
    Date?: string;
    Headers?: Array<{ Name: string; Value: string }>;
};

export async function receiveFromPostmark(tenantId: string, payload: PostmarkInbound): Promise<{ id: string; duplicate: boolean }> {
    // Idempotency: skip if we've already stored this MessageID
    const externalId = payload.MessageID;
    const existing = await prisma.emailMessage.findFirst({ where: { tenantId, externalId } });
    if (existing) return { id: existing.id, duplicate: true };

    // Find the account that should "own" this inbound message
    // (match by To: address against configured email accounts)
    const account = await prisma.emailAccount.findFirst({
        where: {
            tenantId,
            isActive: true,
            OR: [
                { email: payload.To },
                { email: { contains: payload.To.split("@")[1] || "" } }, // loose match by domain
            ],
        },
    });

    const parsed: ParsedMail = {
        from: { value: payload.FromFull ? [{ address: payload.FromFull.Email, name: payload.FromFull.Name } as any] : [{ address: payload.From, name: payload.FromName } as any] } as any,
        to: { value: payload.To.split(",").map((s) => ({ address: s.trim() })) } as any,
        cc: payload.Cc ? { value: payload.Cc.split(",").map((s) => ({ address: s.trim() })) } as any : undefined,
        subject: payload.Subject,
        html: payload.HtmlBody,
        text: payload.TextBody,
        date: payload.Date ? new Date(payload.Date) : undefined,
        messageId: payload.MessageID,
        inReplyTo: payload.Headers?.find((h) => h.Name === "In-Reply-To")?.Value,
        references: payload.Headers?.find((h) => h.Name === "References")?.Value.split(" ").filter(Boolean),
    } as any;

    const routing = await routeInbound(tenantId, parsed);
    const threadId = threadIdFor(parsed);

    const record = await prisma.emailMessage.create({
        data: {
            tenantId,
            account: account?.id ? { connect: { id: account.id } } : undefined,
            direction: "INBOUND",
            fromAddress: payload.FromFull?.Email || payload.From,
            fromName: payload.FromFull?.Name || payload.FromName,
            toAddresses: payload.To,
            ccAddresses: payload.Cc,
            bccAddresses: payload.Bcc,
            replyTo: payload.ReplyTo,
            subject: payload.Subject,
            bodyHtml: payload.HtmlBody,
            bodyText: payload.TextBody,
            threadId,
            externalMessageId: payload.MessageID,
            externalInReplyTo: parsed.inReplyTo,
            externalReferences: parsed.references?.join(" "),
            status: "DELIVERED",
            sentAt: parsed.date,
            receivedAt: new Date(),
            patientId: routing.patientId,
            claimId: routing.claimId,
            toUserId: routing.toUserId,
            provider: "postmark",
            externalId,
        },
    });
    return { id: record.id, duplicate: false };
}

export type SendGridInbound = {
    envelope: string; // "from@x.com to@y.com"
    from: string;
    subject: string;
    spam_score?: number;
    attachment_info?: string;
    attachment_count?: number;
    charsets?: { to: number; from: number; subject: number; html: number; text: number };
    spam_report?: string;
    to: string;
    html?: string;
    text?: string;
    headers: string; // raw headers as JSON-stringified string
    cc?: string;
    bcc?: string;
    sender_ip?: string;
    attachment1?: string;
    // ... dynamic attachmentN keys
};

export async function receiveFromSendGrid(tenantId: string, payload: Record<string, any>): Promise<{ id: string; duplicate: boolean }> {
    // SendGrid uses dynamic keys; the message ID is in headers
    let messageId: string | undefined;
    let inReplyTo: string | undefined;
    let references: string[] = [];
    try {
        const hdrs = typeof payload.headers === "string" ? JSON.parse(payload.headers) : payload.headers;
        for (const h of hdrs) {
            if (h.name?.toLowerCase() === "message-id") messageId = h.value;
            if (h.name?.toLowerCase() === "in-reply-to") inReplyTo = h.value;
            if (h.name?.toLowerCase() === "references") references = h.value.split(/\s+/).filter(Boolean);
        }
    } catch {}

    const externalId = messageId || `sendgrid-${Date.now()}-${Math.random()}`;
    const existing = await prisma.emailMessage.findFirst({ where: { tenantId, externalId } });
    if (existing) return { id: existing.id, duplicate: true };

    const account = await prisma.emailAccount.findFirst({
        where: { tenantId, isActive: true, OR: [{ email: payload.to }, { email: { contains: (payload.to || "").split("@")[1] || "" } }] },
    });

    const parsed: ParsedMail = {
        from: { value: [{ address: payload.from, name: payload.from }] } as any,
        to: { value: (payload.to || "").split(",").map((s: string) => ({ address: s.trim() })) } as any,
        cc: payload.cc ? { value: payload.cc.split(",").map((s: string) => ({ address: s.trim() })) } as any : undefined,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        messageId,
        inReplyTo,
        references,
    } as any;

    const routing = await routeInbound(tenantId, parsed);
    const threadId = threadIdFor(parsed);

    const record = await prisma.emailMessage.create({
        data: {
            tenantId,
            account: account?.id ? { connect: { id: account.id } } : undefined,
            direction: "INBOUND",
            fromAddress: payload.from,
            fromName: payload.from,
            toAddresses: payload.to,
            ccAddresses: payload.cc,
            bccAddresses: payload.bcc,
            subject: payload.subject,
            bodyHtml: payload.html,
            bodyText: payload.text,
            threadId,
            externalMessageId: messageId,
            externalInReplyTo: inReplyTo,
            externalReferences: references.join(" "),
            status: "DELIVERED",
            receivedAt: new Date(),
            patientId: routing.patientId,
            claimId: routing.claimId,
            toUserId: routing.toUserId,
            provider: "sendgrid",
            externalId,
        },
    });
    return { id: record.id, duplicate: false };
}

// ───── Routing ─────────────────────────────────────────────────────────────

async function routeInbound(tenantId: string, parsed: ParsedMail): Promise<{ patientId?: string; claimId?: string; toUserId?: string }> {
    const fromEmail = parsed.from?.value[0]?.address?.toLowerCase();
    if (!fromEmail) return {};
    // Match against User email (internal staff reply)
    const user = await prisma.user.findFirst({ where: { email: { equals: fromEmail, mode: "insensitive" } } });
    if (user) return { toUserId: user.id };
    // Match against Patient email
    const patient = await prisma.patient.findFirst({ where: { email: { equals: fromEmail, mode: "insensitive" } } });
    if (patient) return { patientId: patient.id };
    // Match against Insurance company email
    const ins = await prisma.insuranceCompany.findFirst({ where: { email: { equals: fromEmail, mode: "insensitive" } } });
    if (ins) {
        // Find a recent claim for this insurer (heuristic)
        const recentClaim = await prisma.insuranceClaim.findFirst({
            where: { insuranceCompanyId: ins.id },
            orderBy: { createdAt: "desc" },
        });
        return { claimId: recentClaim?.id };
    }
    return {};
}

function threadIdFor(parsed: ParsedMail): string {
    if (parsed.inReplyTo) {
        // Hash of the inReplyTo keeps a thread stable across replies
        let h = 0;
        for (let i = 0; i < parsed.inReplyTo.length; i++) h = ((h << 5) - h + parsed.inReplyTo.charCodeAt(i)) | 0;
        return `t-${Math.abs(h).toString(36)}`;
    }
    const clean = (parsed.subject || "").replace(/^\s*(re|fwd)\s*:\s*/i, "").trim();
    let h = 0;
    for (let i = 0; i < clean.length; i++) h = ((h << 5) - h + clean.charCodeAt(i)) | 0;
    return `t-${Math.abs(h).toString(36)}`;
}
