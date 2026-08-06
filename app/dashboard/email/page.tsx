"use client";

import React, { useState, useEffect } from "react";
import { Inbox, Send, Search, RefreshCw, Mail, Reply, Archive, Loader2, ChevronRight, X, CheckCircle2, AlertCircle } from "lucide-react";
import { useTenant } from "@/components/TenantContext";
import { formatDateTime, formatDate } from "@/components/TenantContext";

type EmailMessage = {
    id: string;
    tenantId: string;
    accountId: string | null;
    direction: "INBOUND" | "OUTBOUND";
    fromAddress: string;
    fromName: string | null;
    toAddresses: string;
    ccAddresses: string | null;
    subject: string;
    bodyHtml: string | null;
    bodyText: string | null;
    threadId: string | null;
    externalMessageId: string | null;
    status: string;
    sentAt: string | null;
    deliveredAt: string | null;
    readAt: string | null;
    failedAt: string | null;
    failureReason: string | null;
    patientId: string | null;
    claimId: string | null;
    attachments: any;
    provider: string | null;
    createdAt: string;
    account: { id: string; email: string; displayName: string | null; purpose: string } | null;
};

export default function EmailPage() {
    const [tab, setTab] = useState<"inbox" | "outbox" | "compose">("inbox");
    const [messages, setMessages] = useState<EmailMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<EmailMessage | null>(null);
    const [thread, setThread] = useState<EmailMessage[]>([]);
    const [search, setSearch] = useState("");
    const [accountId, setAccountId] = useState<string>("");
    const [accounts, setAccounts] = useState<any[]>([]);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [composing, setComposing] = useState(false);

    useEffect(() => {
        loadAccounts();
        load();
    }, [tab, search, accountId, unreadOnly]);

    async function loadAccounts() {
        const r = await fetch("/api/email/accounts");
        if (r.ok) setAccounts(await r.json());
    }

    async function load() {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("direction", tab === "inbox" ? "INBOUND" : tab === "outbox" ? "OUTBOUND" : "");
            if (search) params.set("search", search);
            if (accountId) params.set("accountId", accountId);
            const r = await fetch("/api/email/messages?" + params.toString());
            if (r.ok) {
                const data = await r.json();
                let list = data.data as EmailMessage[];
                if (unreadOnly) list = list.filter((m) => m.direction === "INBOUND" && !m.readAt);
                setMessages(list);
            }
        } finally { setLoading(false); }
    }

    async function openMessage(m: EmailMessage) {
        setSelected(m);
        const r = await fetch(`/api/email/messages/${m.id}`);
        if (r.ok) {
            const data = await r.json();
            setThread(data.thread || [m]);
        }
    }

    async function archiveMessage(id: string) {
        await fetch(`/api/email/messages/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ARCHIVED" }) });
        load();
        setSelected(null);
    }

    const stats = {
        total: messages.length,
        unread: messages.filter((m) => m.direction === "INBOUND" && !m.readAt).length,
        failed: messages.filter((m) => m.status === "FAILED").length,
    };

    return (
        <div style={{ padding: "1.5rem", height: "calc(100vh - 60px)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Email</h1>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Send and receive emails through your clinic's email accounts.</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={load} className="btn-secondary"><RefreshCw size={16} /> Refresh</button>
                    <button onClick={() => setComposing(true)} className="btn-primary"><Send size={16} /> Compose</button>
                </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border-color)", marginBottom: "1rem" }}>
                <TabButton active={tab === "inbox"} onClick={() => setTab("inbox")} icon={<Inbox size={16} />} label={`Inbox${stats.unread ? ` (${stats.unread})` : ""}`} />
                <TabButton active={tab === "outbox"} onClick={() => setTab("outbox")} icon={<Send size={16} />} label="Sent" />
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <div style={{ position: "relative", flex: 1 }}>
                    <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input
                        className="input-field"
                        style={{ paddingLeft: 32, width: "100%" }}
                        placeholder="Search subject, from, to, body…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select className="input-field" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ width: 220 }}>
                    <option value="">All accounts</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.displayName || a.email} ({a.purpose})</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
                    Unread only
                </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1.2fr" : "1fr", gap: "1rem", flex: 1, minHeight: 0 }}>
                {/* Message list */}
                <div style={{ overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", background: "var(--bg-card)" }}>
                    {loading ? (
                        <div style={{ padding: "2rem", textAlign: "center" }}><Loader2 className="animate-spin" size={20} /></div>
                    ) : messages.length === 0 ? (
                        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                            <Mail size={32} style={{ margin: "0 auto 0.5rem", opacity: 0.5 }} />
                            <p>No messages in {tab}.</p>
                        </div>
                    ) : (
                        messages.map((m) => <MessageRow key={m.id} m={m} selected={selected?.id === m.id} onClick={() => openMessage(m)} tab={tab} />)
                    )}
                </div>

                {/* Detail pane */}
                {selected && (
                    <div style={{ overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", background: "var(--bg-card)" }}>
                        <MessageDetail message={selected} thread={thread} onClose={() => setSelected(null)} onReply={() => setComposing(true)} onArchive={() => archiveMessage(selected.id)} onRefresh={load} />
                    </div>
                )}
            </div>

            {composing && (
                <ComposeModal
                    onClose={() => { setComposing(false); }}
                    onSent={() => { setComposing(false); load(); }}
                    replyTo={selected}
                    accounts={accounts}
                />
            )}
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
    return (
        <button onClick={onClick} style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            padding: "0.5rem 1rem", borderRadius: "var(--radius-md) var(--radius-md) 0 0",
            background: active ? "var(--bg-card)" : "transparent",
            color: active ? "var(--primary-color)" : "var(--text-secondary)",
            borderBottom: active ? "2px solid var(--primary-color)" : "2px solid transparent",
            fontWeight: active ? 600 : 400,
            cursor: "pointer", fontSize: "0.875rem",
        }}>
            {icon} {label}
        </button>
    );
}

function MessageRow({ m, selected, onClick, tab }: { m: EmailMessage; selected: boolean; onClick: () => void; tab: string }) {
    const isUnread = m.direction === "INBOUND" && !m.readAt;
    const isFailed = m.status === "FAILED";
    const counterparty = tab === "inbox" ? m.fromAddress : m.toAddresses;
    return (
        <div
            onClick={onClick}
            style={{
                padding: "0.75rem",
                borderBottom: "1px solid var(--border-color)",
                background: selected ? "var(--primary-light, rgba(99,102,241,0.1))" : isUnread ? "var(--bg-hover, rgba(0,0,0,0.02))" : "transparent",
                cursor: "pointer",
                display: "flex", gap: "0.5rem", alignItems: "flex-start",
            }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span style={{ fontWeight: isUnread ? 700 : 500, fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.direction === "INBOUND" ? <Inbox size={12} style={{ marginRight: 4, color: "var(--primary-color)" }} /> : <Send size={12} style={{ marginRight: 4, color: "var(--text-muted)" }} />}
                        {counterparty}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", flexShrink: 0 }}>
                        {(m.sentAt || m.createdAt) && new Date(m.sentAt || m.createdAt).toLocaleDateString()}
                    </span>
                </div>
                <div style={{ fontSize: "0.875rem", fontWeight: isUnread ? 600 : 400, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.subject}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: 2 }}>
                    {isFailed && <span style={{ color: "var(--danger-color, red)", fontSize: "0.7rem" }}>⚠ Failed</span>}
                    {m.account && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>· {m.account.email}</span>}
                </div>
            </div>
        </div>
    );
}

function MessageDetail({ message, thread, onClose, onReply, onArchive, onRefresh }: {
    message: EmailMessage; thread: EmailMessage[]; onClose: () => void; onReply: () => void; onArchive: () => void; onRefresh: () => void;
}) {
    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border-color)" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>{message.subject}</h2>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                    {message.direction === "INBOUND" && <button onClick={onReply} className="btn-primary" style={{ padding: "0.25rem 0.5rem" }}><Reply size={14} /> Reply</button>}
                    <button onClick={onArchive} className="btn-secondary" style={{ padding: "0.25rem 0.5rem" }}><Archive size={14} /></button>
                    <button onClick={onClose} style={{ background: "transparent", border: "none" }}><X size={16} /></button>
                </div>
            </div>
            {message.failureReason && (
                <div style={{ padding: "0.75rem 1rem", background: "rgba(244,63,94,0.1)", color: "var(--danger-color, #f43f5e)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <AlertCircle size={16} /> Failed to send: {message.failureReason}
                </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
                {thread.map((m, idx) => (
                    <div key={m.id} style={{ padding: "1rem", borderBottom: idx < thread.length - 1 ? "1px solid var(--border-color)" : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                            <div>
                                <strong style={{ fontSize: "0.875rem" }}>{m.fromName || m.fromAddress}</strong>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: 8 }}>&lt;{m.fromAddress}&gt;</span>
                            </div>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                {m.sentAt && new Date(m.sentAt).toLocaleString()}
                            </span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                            To: {m.toAddresses}
                            {m.ccAddresses && <span> · CC: {m.ccAddresses}</span>}
                        </div>
                        <div style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
                            {m.bodyHtml ? (
                                <div dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
                            ) : (
                                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{m.bodyText || "(no body)"}</pre>
                            )}
                        </div>
                        {m.attachments && Array.isArray(m.attachments) && m.attachments.length > 0 && (
                            <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                📎 {m.attachments.length} attachment{m.attachments.length === 1 ? "" : "s"}: {m.attachments.map((a: any) => a.filename).join(", ")}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function ComposeModal({ onClose, onSent, replyTo, accounts }: { onClose: () => void; onSent: () => void; replyTo: EmailMessage | null; accounts: any[] }) {
    const [to, setTo] = useState(replyTo ? (replyTo.direction === "INBOUND" ? replyTo.fromAddress : replyTo.toAddresses) : "");
    const [cc, setCc] = useState("");
    const [subject, setSubject] = useState(replyTo ? (replyTo.subject.startsWith("Re:") ? replyTo.subject : `Re: ${replyTo.subject}`) : "");
    const [body, setBody] = useState("");
    const [accountId, setAccountId] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function send() {
        setSending(true);
        setError(null);
        try {
            const r = await fetch("/api/email/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to, cc: cc || undefined, subject, bodyHtml: body.replace(/\n/g, "<br/>"),
                    accountId: accountId || undefined,
                    inReplyToId: replyTo?.id,
                }),
            });
            if (r.ok) onSent();
            else {
                const err = await r.json().catch(() => ({}));
                setError(err.error || "Send failed");
            }
        } catch (e: any) { setError(e.message); } finally { setSending(false); }
    }

    return (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem" }}>
            <div className="glass-panel" style={{ width: "100%", maxWidth: 720, background: "var(--bg-card)", borderRadius: "var(--radius-lg)", padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h3 style={{ fontWeight: 600, fontSize: "1.1rem" }}>{replyTo ? "Reply" : "New Message"}</h3>
                    <button onClick={onClose}><X size={18} /></button>
                </div>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                    <input className="input-field" placeholder="To (email address)" value={to} onChange={(e) => setTo(e.target.value)} />
                    <input className="input-field" placeholder="CC (optional)" value={cc} onChange={(e) => setCc(e.target.value)} />
                    <input className="input-field" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                    <select className="input-field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                        <option value="">Use default account</option>
                        {accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.displayName || a.email} ({a.purpose})</option>)}
                    </select>
                    <textarea className="input-field" rows={10} placeholder="Write your message…" value={body} onChange={(e) => setBody(e.target.value)} style={{ resize: "vertical", minHeight: 200 }} />
                </div>
                {error && <p style={{ color: "var(--danger-color, red)", marginTop: "0.5rem" }}>{error}</p>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                    <button onClick={onClose} className="btn-secondary">Cancel</button>
                    <button onClick={send} className="btn-primary" disabled={!to || !subject || !body || sending}>
                        {sending ? <><Loader2 className="animate-spin" size={14} /> Sending…</> : <><Send size={14} /> Send</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
