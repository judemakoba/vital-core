"use client";

import React, { useState, useEffect } from "react";
import { Mail, Save, Plus, Edit, Trash2, X, TestTube2, RefreshCw, Inbox, Send, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import styles from "../page.module.css";

type EmailAccount = {
    id: string;
    email: string;
    displayName: string | null;
    purpose: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassword: string;
    smtpSecure: boolean;
    imapEnabled: boolean;
    imapHost: string | null;
    imapPort: number | null;
    imapUser: string | null;
    imapPassword: string;
    imapSecure: boolean;
    isDefault: boolean;
    isActive: boolean;
    lastSyncAt: string | null;
    lastSyncError: string | null;
    createdAt: string;
};

const PURPOSES = [
    { value: "NOTIFICATIONS", label: "Patient Notifications", desc: "Appointment reminders, lab results, statements" },
    { value: "CLAIMS", label: "Insurance Claims", desc: "Submit and receive claim correspondence" },
    { value: "STAFF", label: "Internal Staff", desc: "Internal staff-to-staff messaging" },
    { value: "INBOX", label: "Generic Inbox", desc: "info@, contact@ — general inbound mailbox" },
    { value: "SUPPORT", label: "Support", desc: "Helpdesk / customer support mailbox" },
    { value: "OTHER", label: "Other", desc: "Other" },
];

export default function EmailSettingsTab() {
    const [accounts, setAccounts] = useState<EmailAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<EmailAccount | null>(null);
    const [testResult, setTestResult] = useState<{ accountId: string; smtp: { ok: boolean; error?: string }; imap?: { ok: boolean; error?: string } } | null>(null);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const r = await fetch("/api/email/accounts");
            if (r.ok) setAccounts(await r.json());
        } finally { setLoading(false); }
    };

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const data: any = Object.fromEntries(fd.entries());
        // Coerce booleans
        data.smtpSecure = fd.get("smtpSecure") === "on";
        data.imapEnabled = fd.get("imapEnabled") === "on";
        data.imapSecure = fd.get("imapSecure") === "on";
        data.isDefault = fd.get("isDefault") === "on";
        data.isActive = fd.get("isActive") === "on";
        if (data.smtpPort) data.smtpPort = Number(data.smtpPort);
        if (data.imapPort) data.imapPort = Number(data.imapPort);
        try {
            const r = editing
                ? await fetch(`/api/email/accounts/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                })
                : await fetch("/api/email/accounts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
            if (r.ok) {
                setMessage({ type: "ok", text: editing ? "Account updated" : "Account created" });
                setShowModal(false);
                setEditing(null);
                load();
            } else {
                const err = await r.json().catch(() => ({}));
                setMessage({ type: "err", text: err.error || "Save failed" });
            }
        } catch (e: any) {
            setMessage({ type: "err", text: e.message });
        }
        setTimeout(() => setMessage(null), 4000);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this email account?")) return;
        const r = await fetch(`/api/email/accounts/${id}`, { method: "DELETE" });
        if (r.ok) load();
        else {
            const err = await r.json().catch(() => ({}));
            alert(err.error || "Delete failed");
        }
    };

    const handleTest = async (id: string) => {
        setTestResult(null);
        const r = await fetch(`/api/email/accounts/${id}/test`, { method: "POST" });
        if (r.ok) setTestResult(await r.json());
        else {
            const err = await r.json().catch(() => ({}));
            setTestResult({ accountId: id, smtp: { ok: false, error: err.error || "Test failed" } });
        }
    };

    const handleSync = async (id: string) => {
        setSyncing(id);
        try {
            const r = await fetch(`/api/email/accounts/${id}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sinceDays: 7, limit: 50 }) });
            if (r.ok) {
                const data = await r.json();
                setMessage({ type: "ok", text: `Synced — fetched ${data.fetched} new message${data.fetched === 1 ? "" : "s"}` });
            } else {
                const err = await r.json().catch(() => ({}));
                setMessage({ type: "err", text: err.error || "Sync failed" });
            }
        } finally {
            setSyncing(null);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    if (loading) return <div className="text-muted">Loading email accounts...</div>;

    return (
        <div>
            {message && (
                <div className={`${styles.status} ${message.type === "ok" ? styles.success : styles.error}`} style={{ marginBottom: "1rem" }}>
                    {message.text}
                </div>
            )}

            <div className={styles.section}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                    <div>
                        <h2 className={styles.title}><Mail size={24} color="var(--primary-color)" /> Email Accounts</h2>
                        <p className="subtitle" style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                            Configure one or more email accounts (SMTP for sending, optional IMAP for receiving). The system can route different kinds of messages to different accounts.
                        </p>
                    </div>
                    <button className={styles.saveBtn} onClick={() => { setEditing(null); setShowModal(true); }}>
                        <Plus size={16} /> Add Email Account
                    </button>
                </div>

                {accounts.length === 0 ? (
                    <div className="glass-panel" style={{ padding: "2rem", textAlign: "center" }}>
                        <Mail size={32} color="var(--text-muted)" style={{ margin: "0 auto 1rem" }} />
                        <p style={{ color: "var(--text-muted)" }}>No email accounts configured yet. Add one to start sending and receiving emails.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>Purpose</th>
                                    <th>SMTP</th>
                                    <th>IMAP</th>
                                    <th>Status</th>
                                    <th>Last Sync</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((a) => {
                                    const purpose = PURPOSES.find((p) => p.value === a.purpose);
                                    return (
                                        <tr key={a.id}>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{a.displayName || a.email}</div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{a.email}</div>
                                            </td>
                                            <td>
                                                <span className="badge badge-secondary">{purpose?.label || a.purpose}</span>
                                                {a.isDefault && <span className="badge badge-primary" style={{ marginLeft: 4 }}>Default</span>}
                                            </td>
                                            <td>
                                                <code style={{ fontSize: "0.75rem" }}>{a.smtpHost}:{a.smtpPort}</code>
                                            </td>
                                            <td>
                                                {a.imapEnabled ? (
                                                    <code style={{ fontSize: "0.75rem" }}>{a.imapHost}:{a.imapPort}</code>
                                                ) : (
                                                    <span style={{ color: "var(--text-muted)" }}>—</span>
                                                )}
                                            </td>
                                            <td>
                                                {a.isActive ? <span style={{ color: "var(--success-color, green)" }}>● Active</span> : <span style={{ color: "var(--text-muted)" }}>○ Inactive</span>}
                                            </td>
                                            <td style={{ fontSize: "0.75rem" }}>
                                                {a.lastSyncAt ? new Date(a.lastSyncAt).toLocaleString() : <span style={{ color: "var(--text-muted)" }}>Never</span>}
                                                {a.lastSyncError && (
                                                    <div style={{ color: "var(--danger-color, red)", fontSize: "0.7rem" }} title={a.lastSyncError}>
                                                        {a.lastSyncError.slice(0, 40)}...
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: "flex", gap: "0.25rem" }}>
                                                    <button title="Test connection" onClick={() => handleTest(a.id)}><TestTube2 size={14} /></button>
                                                    {a.imapEnabled && (
                                                        <button title="Sync inbox" onClick={() => handleSync(a.id)} disabled={syncing === a.id}>
                                                            {syncing === a.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                        </button>
                                                    )}
                                                    <button title="Edit" onClick={() => { setEditing(a); setShowModal(true); }}><Edit size={14} /></button>
                                                    {!a.isDefault && <button title="Delete" onClick={() => handleDelete(a.id)}><Trash2 size={14} /></button>}
                                                </div>
                                                {testResult?.accountId === a.id && (
                                                    <div style={{ marginTop: "0.25rem", fontSize: "0.7rem" }}>
                                                        {testResult.smtp.ok
                                                            ? <span style={{ color: "green" }}>✓ SMTP</span>
                                                            : <span style={{ color: "red" }} title={testResult.smtp.error}>✗ SMTP</span>}
                                                        {" "}
                                                        {testResult.imap && (testResult.imap.ok
                                                            ? <span style={{ color: "green" }}>✓ IMAP</span>
                                                            : <span style={{ color: "red" }} title={testResult.imap.error}>✗ IMAP</span>)}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showModal && (
                <AccountModal
                    account={editing}
                    onClose={() => { setShowModal(false); setEditing(null); setTestResult(null); }}
                    onSaved={() => { setShowModal(false); setEditing(null); load(); }}
                />
            )}

            <div className={styles.section} style={{ marginTop: "2rem" }}>
                <h2 className={styles.title}><Inbox size={24} color="var(--info-color)" /> Inbound Webhooks</h2>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                    If you use a hosted email service (Postmark / SendGrid) for inbound, point it to these URLs:
                </p>
                <div style={{ fontFamily: "monospace", fontSize: "0.8rem", background: "var(--bg-hover, #f5f5f5)", padding: "0.5rem", borderRadius: "var(--radius-md)", marginBottom: "0.5rem" }}>
                    POST {typeof window !== "undefined" ? window.location.origin : "https://your-domain"}/api/email/inbound/postmark
                </div>
                <div style={{ fontFamily: "monospace", fontSize: "0.8rem", background: "var(--bg-hover, #f5f5f5)", padding: "0.5rem", borderRadius: "var(--radius-md)" }}>
                    POST {typeof window !== "undefined" ? window.location.origin : "https://your-domain"}/api/email/inbound/sendgrid
                </div>
            </div>
        </div>
    );
}

function AccountModal({ account, onClose, onSaved }: { account: EmailAccount | null; onClose: () => void; onSaved: () => void }) {
    return (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem" }}>
            <div className="glass-panel" style={{ width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto", padding: "1.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-lg)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h3 style={{ fontWeight: 600, fontSize: "1.1rem" }}>{account ? "Edit Email Account" : "Add Email Account"}</h3>
                    <button onClick={onClose}><X size={18} /></button>
                </div>
                <form onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const data: any = Object.fromEntries(fd.entries());
                    data.smtpSecure = fd.get("smtpSecure") === "on";
                    data.imapEnabled = fd.get("imapEnabled") === "on";
                    data.imapSecure = fd.get("imapSecure") === "on";
                    data.isDefault = fd.get("isDefault") === "on";
                    data.isActive = fd.get("isActive") === "on";
                    if (data.smtpPort) data.smtpPort = Number(data.smtpPort);
                    if (data.imapPort) data.imapPort = Number(data.imapPort);
                    // Don't send empty passwords on edit
                    if (account && !data.smtpPassword) delete data.smtpPassword;
                    if (account && !data.imapPassword) delete data.imapPassword;
                    try {
                        const r = account
                            ? await fetch(`/api/email/accounts/${account.id}`, {
                                method: "PATCH", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(data),
                            })
                            : await fetch("/api/email/accounts", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(data),
                            });
                        if (r.ok) onSaved();
                        else {
                            const err = await r.json().catch(() => ({}));
                            alert(err.error || "Save failed");
                        }
                    } catch (e: any) {
                        alert(e.message);
                    }
                }} style={{ display: "grid", gap: "0.75rem" }}>
                    <Row>
                        <Field label="Email Address" required>
                            <input className={styles.input} name="email" type="email" defaultValue={account?.email || ""} placeholder="notifications@clinic.com" required />
                        </Field>
                        <Field label="Display Name" hint="Shown in From: field">
                            <input className={styles.input} name="displayName" defaultValue={account?.displayName || ""} placeholder="VitalCore Clinic — Notifications" />
                        </Field>
                    </Row>
                    <Field label="Purpose" required>
                        <select className={styles.select} name="purpose" defaultValue={account?.purpose || "NOTIFICATIONS"} required>
                            {PURPOSES.map(p => <option key={p.value} value={p.value}>{p.label} — {p.desc}</option>)}
                        </select>
                    </Field>

                    <h4 style={{ marginTop: "0.5rem", fontSize: "0.9rem", fontWeight: 600 }}>SMTP (Outbound)</h4>
                    <Row>
                        <Field label="SMTP Host" required>
                            <input className={styles.input} name="smtpHost" defaultValue={account?.smtpHost || ""} placeholder="smtp.gmail.com" required />
                        </Field>
                        <Field label="SMTP Port">
                            <input className={styles.input} name="smtpPort" type="number" defaultValue={account?.smtpPort || 587} />
                        </Field>
                    </Row>
                    <Row>
                        <Field label="SMTP User" required>
                            <input className={styles.input} name="smtpUser" defaultValue={account?.smtpUser || ""} placeholder="notifications@clinic.com" required />
                        </Field>
                        <Field label="SMTP Password" required={!account} hint={account ? "Leave blank to keep existing" : "App password recommended for Gmail/Outlook"}>
                            <input className={styles.input} name="smtpPassword" type="password" defaultValue="" placeholder={account ? "********" : "••••••••"} required={!account} />
                        </Field>
                    </Row>
                    <Field label="Use TLS (rare)">
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                            <input type="checkbox" name="smtpSecure" defaultChecked={account?.smtpSecure || false} />
                            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>TLS on connect (port 465). Most servers use STARTTLS on 587 instead.</span>
                        </label>
                    </Field>

                    <h4 style={{ marginTop: "0.5rem", fontSize: "0.9rem", fontWeight: 600 }}>IMAP (Inbound) — optional</h4>
                    <Field label="Enable IMAP polling">
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                            <input type="checkbox" name="imapEnabled" defaultChecked={account?.imapEnabled || false} />
                            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Periodically fetch new messages from this account's inbox</span>
                        </label>
                    </Field>
                    <Row>
                        <Field label="IMAP Host">
                            <input className={styles.input} name="imapHost" defaultValue={account?.imapHost || ""} placeholder="imap.gmail.com" />
                        </Field>
                        <Field label="IMAP Port">
                            <input className={styles.input} name="imapPort" type="number" defaultValue={account?.imapPort || 993} />
                        </Field>
                    </Row>
                    <Row>
                        <Field label="IMAP User">
                            <input className={styles.input} name="imapUser" defaultValue={account?.imapUser || ""} />
                        </Field>
                        <Field label="IMAP Password" hint={account ? "Leave blank to keep existing" : ""}>
                            <input className={styles.input} name="imapPassword" type="password" defaultValue="" placeholder={account ? "********" : "••••••••"} />
                        </Field>
                    </Row>
                    <Field label="IMAP TLS">
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                            <input type="checkbox" name="imapSecure" defaultChecked={account?.imapSecure !== false} />
                            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>TLS (usually yes on port 993)</span>
                        </label>
                    </Field>

                    <h4 style={{ marginTop: "0.5rem", fontSize: "0.9rem", fontWeight: 600 }}>Status</h4>
                    <Row>
                        <Field label="Default Account">
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                                <input type="checkbox" name="isDefault" defaultChecked={account?.isDefault || false} />
                                <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Use as fallback for unspecified purposes</span>
                            </label>
                        </Field>
                        <Field label="Active">
                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                                <input type="checkbox" name="isActive" defaultChecked={account?.isActive !== false} />
                                <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Enabled and able to send/receive</span>
                            </label>
                        </Field>
                    </Row>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className={styles.saveBtn}><Save size={16} /> Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function Row({ children }: { children: React.ReactNode }) {
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>{children}</div>;
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
    return (
        <div className={styles.formGroup}>
            <label className={styles.label}>{label}{required && " *"}</label>
            {children}
            {hint && <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>{hint}</p>}
        </div>
    );
}
