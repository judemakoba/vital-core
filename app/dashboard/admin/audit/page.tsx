"use client";

/**
 * /dashboard/admin/audit
 *
 * User activity audit report. Drives compliance, troubleshooting,
 * and post-incident review. Backed by /api/audit (paginated,
 * filterable).
 *
 * Features:
 *   - Date range (from / to) + 3 quick presets
 *   - Filters: userId, entityType, action, free-text q
 *   - Paginated table (50/page)
 *   - Click a row → modal with the full JSON changes
 *   - Export the current filtered set to CSV
 *   - SUPER_ADMIN only (enforced both on the page and on the API)
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import {
    History,
    Search,
    Calendar as CalendarIcon,
    Filter,
    Download,
    ChevronLeft,
    ChevronRight,
    X,
} from "lucide-react";
import styles from "../../reports/page.module.css";
// Reuse the lab-catalog's "patient list" styles for the filter bar
// and table — those are the same shapes we render here.
import adminStyles from "../../patients/page.module.css";

interface AuditRow {
    id: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    changes: any;
    timestamp: string;
    user: { id: string; name: string | null; email: string | null } | null;
}

interface AuditResponse {
    rows: AuditRow[];
    total: number;
    limit: number;
    offset: number;
}

const PAGE_SIZE = 50;

const ACTION_OPTIONS = [
    "",
    "LOGIN_SUCCESS",
    "LOGIN_FAIL",
    "LOGOUT",
    "PATIENT_CREATE",
    "PATIENT_UPDATE",
    "VISIT_CREATE",
    "VISIT_DISCONTINUE",
    "INVOICE_PAYMENT",
    "INVOICE_CREATE",
    "DISPENSE",
    "LAB_RESULT_SUBMIT",
    "RAD_RESULT_SUBMIT",
    "USER_CREATE",
    "USER_UPDATE",
    "ROLE_CHANGE",
    "PERMISSION_CHANGE",
];

const ENTITY_OPTIONS = [
    "",
    "User",
    "Patient",
    "Visit",
    "Invoice",
    "Payment",
    "DispensingLog",
    "LabOrder",
    "RadiologyOrder",
    "Prescription",
    "Role",
    "Permission",
    "Session",
];

const today = () => new Date().toISOString().split("T")[0];
const daysAgo = (n: number) =>
    new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

export default function AuditPage() {
    const [from, setFrom] = useState(daysAgo(7));
    const [to, setTo] = useState(today());
    const [action, setAction] = useState("");
    const [entityType, setEntityType] = useState("");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(0);

    const [data, setData] = useState<AuditResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<AuditRow | null>(null);

    const buildQuery = useCallback(() => {
        const p = new URLSearchParams();
        if (from) p.set("from", from);
        if (to)   p.set("to",   to);
        if (action)     p.set("action", action);
        if (entityType) p.set("entityType", entityType);
        if (q)          p.set("q", q);
        p.set("limit",  String(PAGE_SIZE));
        p.set("offset", String(page * PAGE_SIZE));
        return p.toString();
    }, [from, to, action, entityType, q, page]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        fetch(`/api/audit?${buildQuery()}`, { signal: controller.signal })
            .then(async (res) => {
                if (res.status === 401) {
                    setError("Not signed in.");
                    return;
                }
                if (res.status === 403) {
                    setError("SUPER_ADMIN only. Sign in as a super admin to view this report.");
                    return;
                }
                if (!res.ok) {
                    setError(`Failed to load (${res.status})`);
                    return;
                }
                const body: AuditResponse = await res.json();
                setData(body);
            })
            .catch((err) => {
                if (err.name !== "AbortError") setError(err.message);
            })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, [buildQuery]);

    const totalPages = useMemo(
        () => (data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1),
        [data]
    );

    const handleExportCSV = () => {
        if (!data) return;
        const headers = [
            "Timestamp", "User", "Email", "Action", "EntityType", "EntityId", "Changes",
        ];
        const rows = data.rows.map((r) => [
            new Date(r.timestamp).toISOString(),
            r.user?.name ?? "",
            r.user?.email ?? "",
            r.action,
            r.entityType,
            r.entityId,
            r.changes ? JSON.stringify(r.changes).replace(/"/g, '""') : "",
        ]);
        const csv = [
            headers.join(","),
            ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
        ].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `VitalCore_Audit_${from}_to_${to}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const applyPreset = (days: number) => {
        setFrom(daysAgo(days));
        setTo(today());
        setPage(0);
    };

    return (
        <div className={styles.container}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                    <h1 className="title">User Activity Audit</h1>
                    <p style={{ color: "var(--text-muted)", margin: 0 }}>
                        Who did what, when — across the entire clinic.
                        Compliance-grade trail of every login, dispense,
                        payment, and admin action.
                    </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={handleExportCSV} className={styles.exportBtn} disabled={!data || data.rows.length === 0}>
                        <Download size={18} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.controls}>
                <div className={styles.filterGroup}>
                    <CalendarIcon size={18} color="var(--primary-color)" />
                    <span style={{ fontWeight: 600 }}>Range:</span>
                    <input type="date" className={styles.dateInput} value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
                    <span>to</span>
                    <input type="date" className={styles.dateInput} value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
                    <button onClick={() => applyPreset(1)} className={adminStyles.tab} style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}>Today</button>
                    <button onClick={() => applyPreset(7)} className={adminStyles.tab} style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}>7d</button>
                    <button onClick={() => applyPreset(30)} className={adminStyles.tab} style={{ padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}>30d</button>
                </div>

                <div className={styles.filterGroup} style={{ marginTop: "0.75rem" }}>
                    <Filter size={18} color="var(--primary-color)" />
                    <select className={styles.dateInput} value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }}>
                        {ACTION_OPTIONS.map((a) => (
                            <option key={a} value={a}>{a || "All actions"}</option>
                        ))}
                    </select>
                    <select className={styles.dateInput} value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(0); }}>
                        {ENTITY_OPTIONS.map((e) => (
                            <option key={e} value={e}>{e || "All entities"}</option>
                        ))}
                    </select>
                    <div style={{ position: "relative" }}>
                        <Search size={16} style={{ position: "absolute", left: 8, top: 9, color: "var(--text-muted)" }} />
                        <input
                            className={styles.dateInput}
                            style={{ paddingLeft: 28, minWidth: 220 }}
                            placeholder="Search entity id / user id…"
                            value={q}
                            onChange={(e) => { setQ(e.target.value); setPage(0); }}
                        />
                    </div>
                </div>

                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                    {data ? (
                        <>{data.total.toLocaleString()} event{data.total === 1 ? "" : "s"} · page {page + 1} of {totalPages}</>
                    ) : null}
                </div>
            </div>

            {error ? (
                <div className="glass-card" style={{ padding: "1.5rem", color: "var(--danger-color)", borderLeft: "4px solid var(--danger-color)" }}>
                    {error}
                </div>
            ) : null}

            {/* Table */}
            <div className={styles.tableCard}>
                <h3 className={styles.tableTitle}>
                    <History size={20} /> Events
                </h3>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Timestamp</th>
                            <th className={styles.th}>User</th>
                            <th className={styles.th}>Action</th>
                            <th className={styles.th}>Entity</th>
                            <th className={styles.th}>Entity ID</th>
                            <th className={styles.th}>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}>Loading…</td></tr>
                        ) : !data || data.rows.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                No events match these filters.
                            </td></tr>
                        ) : (
                            data.rows.map((r) => (
                                <tr
                                    key={r.id}
                                    onClick={() => setExpanded(r)}
                                    style={{ cursor: "pointer" }}
                                >
                                    <td className={styles.td}>
                                        <div>{new Date(r.timestamp).toLocaleDateString()}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                            {new Date(r.timestamp).toLocaleTimeString()}
                                        </div>
                                    </td>
                                    <td className={styles.td}>
                                        {r.user
                                            ? <>
                                                <div style={{ fontWeight: 600 }}>{r.user.name || "—"}</div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{r.user.email}</div>
                                              </>
                                            : <span style={{ color: "var(--text-muted)" }}>{r.userId || "anonymous"}</span>
                                        }
                                    </td>
                                    <td className={styles.td}>
                                        <span style={{
                                            fontFamily: "monospace",
                                            fontSize: "0.8rem",
                                            padding: "0.1rem 0.4rem",
                                            borderRadius: "4px",
                                            background: actionColor(r.action),
                                            color: "white",
                                        }}>
                                            {r.action}
                                        </span>
                                    </td>
                                    <td className={styles.td}>{r.entityType}</td>
                                    <td className={styles.td}>
                                        <code style={{ fontSize: "0.75rem" }}>{r.entityId.length > 16 ? r.entityId.slice(0, 16) + "…" : r.entityId}</code>
                                    </td>
                                    <td className={styles.td}>
                                        {r.changes ? (
                                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                {summarizeChanges(r.changes)}
                                            </span>
                                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                {data && data.total > PAGE_SIZE && (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", padding: "1rem" }}>
                        <button
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className={adminStyles.tab}
                            style={{ padding: "0.4rem 0.8rem" }}
                        >
                            <ChevronLeft size={16} /> Prev
                        </button>
                        <span>Page {page + 1} / {totalPages}</span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className={adminStyles.tab}
                            style={{ padding: "0.4rem 0.8rem" }}
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* Detail modal */}
            {expanded && (
                <div
                    onClick={() => setExpanded(null)}
                    style={{
                        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                        display: "flex", justifyContent: "center", alignItems: "center",
                        zIndex: 100, padding: "2rem",
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="glass-card"
                        style={{
                            maxWidth: 720, width: "100%",
                            maxHeight: "80vh", overflow: "auto",
                            padding: "1.5rem", position: "relative",
                        }}
                    >
                        <button
                            onClick={() => setExpanded(null)}
                            style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer" }}
                            aria-label="Close"
                        >
                            <X size={20} />
                        </button>
                        <h2 style={{ marginTop: 0 }}>{expanded.action}</h2>
                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.25rem 1rem", fontSize: "0.875rem", marginBottom: "1rem" }}>
                            <span style={{ color: "var(--text-muted)" }}>When</span>
                            <span>{new Date(expanded.timestamp).toLocaleString()}</span>
                            <span style={{ color: "var(--text-muted)" }}>Who</span>
                            <span>{expanded.user ? `${expanded.user.name} (${expanded.user.email})` : expanded.userId || "anonymous"}</span>
                            <span style={{ color: "var(--text-muted)" }}>Entity</span>
                            <span>{expanded.entityType} <code style={{ fontSize: "0.75rem" }}>{expanded.entityId}</code></span>
                        </div>
                        <h3>Changes</h3>
                        <pre style={{
                            background: "var(--bg-muted, rgba(0,0,0,0.05))",
                            padding: "1rem",
                            borderRadius: "6px",
                            fontSize: "0.8rem",
                            overflow: "auto",
                            maxHeight: "50vh",
                        }}>
                            {JSON.stringify(expanded.changes, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

function summarizeChanges(changes: any): string {
    try {
        if (typeof changes !== "object" || changes === null) return JSON.stringify(changes);
        const parts: string[] = [];
        for (const [k, v] of Object.entries(changes)) {
            if (v && typeof v === "object") {
                if ("after" in v && typeof (v as any).after === "object") {
                    const after = (v as any).after;
                    parts.push(`${k}: ${Object.keys(after).slice(0, 3).join(", ")}`);
                } else if ("reason" in v) {
                    parts.push(`reason=${(v as any).reason}`);
                } else {
                    parts.push(`${k}: ${Object.keys(v).slice(0, 3).join(", ")}`);
                }
            } else {
                parts.push(`${k}=${v}`);
            }
        }
        return parts.slice(0, 3).join(" · ");
    } catch {
        return "(complex)";
    }
}

function actionColor(action: string): string {
    if (action.startsWith("LOGIN_FAIL")) return "#ef4444";
    if (action.startsWith("LOGIN"))      return "#0ea5e9";
    if (action.startsWith("LOGOUT"))     return "#64748b";
    if (action.includes("PAYMENT"))      return "#10b981";
    if (action.includes("DISPENSE"))     return "#f59e0b";
    if (action.startsWith("USER"))        return "#8b5cf6";
    if (action.startsWith("PATIENT"))     return "#0047AB";
    return "#475569";
}
