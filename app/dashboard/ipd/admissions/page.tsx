"use client";

/**
 * /dashboard/ipd/admissions
 *
 * R63: IPD admissions management dashboard. Replaces the 404 that
 * was there because the route lived in the nav (ipd/layout.tsx) but
 * no page.tsx existed at this level (only [id]/ and new/ subroutes).
 *
 * Lists all admissions with:
 *   - Status filter pills (Active / Discharged / Cancelled / All)
 *   - Live search (admission #, patient, ward, doctor, type)
 *   - Stat cards at the top
 *
 * Row actions per admission:
 *   - View      -> /dashboard/ipd/admissions/[id] (existing detail page)
 *   - Modify    -> opens modal: change ward / bed / type / notes
 *   - Terminate -> opens modal: admin-override cancel (releases bed,
 *                 audit trail; does NOT settle bills)
 *   - Delete    -> opens modal: hard-delete (only if no downstream
 *                 records; only for records created in error)
 *
 * The full discharge-with-settlement path still lives on the detail
 * page (button -> /api/ipd/final-bill/[id]/settle). That's the
 * "patient finished treatment" flow; terminate is the admin-override
 * "this record is wrong" flow.
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
    Search,
    RefreshCw,
    Eye,
    Edit3,
    XCircle,
    Trash2,
    UserPlus,
    CheckCircle,
    AlertTriangle,
    Bed,
    Users,
} from "lucide-react";
import styles from "../ipd.module.css";
import listStyles from "../../patients/page.module.css";

interface Admission {
    id: string;
    admissionNumber: string;
    status: string; // ADMITTED / DISCHARGED / CANCELLED
    type: string;
    admissionDate: string;
    dischargeDate: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    notes: string | null;
    patient: { id: string; firstName: string; lastName: string; patientNumber: string; gender: string; dateOfBirth: string };
    ward: { id: string; name: string; type: string } | null;
    bed: { id: string; bedNumber: string; type: string } | null;
    admittingDoctor: { id: string; name: string | null; email: string | null };
    cancelledBy: { id: string; name: string | null; email: string | null } | null;
}

const STATUS_TABS = [
    { key: "ADMITTED", label: "Active", color: "var(--success-color)" },
    { key: "DISCHARGED", label: "Discharged", color: "var(--info-color)" },
    { key: "CANCELLED", label: "Cancelled", color: "var(--danger-color)" },
    { key: "", label: "All", color: "var(--text-secondary)" },
];

export default function IpdAdmissionsPage() {
    const [admissions, setAdmissions] = useState<Admission[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>("ADMITTED");
    const [search, setSearch] = useState("");
    const [actionMsg, setActionMsg] = useState<string | null>(null);

    // Modals
    const [modifying, setModifying] = useState<Admission | null>(null);
    const [terminating, setTerminating] = useState<Admission | null>(null);
    const [deleting, setDeleting] = useState<Admission | null>(null);

    const fetchAdmissions = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set("status", statusFilter);
            const res = await fetch(`/api/ipd/admissions?${params.toString()}`, { credentials: "include" });
            if (res.ok) setAdmissions(await res.json());
        } catch (e) {
            console.error("Failed to fetch admissions", e);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { fetchAdmissions(); }, [fetchAdmissions]);
    useEffect(() => {
        if (!actionMsg) return;
        const t = setTimeout(() => setActionMsg(null), 5000);
        return () => clearTimeout(t);
    }, [actionMsg]);

    const filtered = admissions.filter(a => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            a.admissionNumber.toLowerCase().includes(q) ||
            `${a.patient.firstName} ${a.patient.lastName}`.toLowerCase().includes(q) ||
            a.patient.patientNumber.toLowerCase().includes(q) ||
            a.ward?.name?.toLowerCase().includes(q) ||
            a.bed?.bedNumber?.toLowerCase().includes(q) ||
            a.admittingDoctor?.name?.toLowerCase().includes(q) ||
            a.type.toLowerCase().includes(q)
        );
    });

    // Stats
    const stats = {
        active: admissions.filter(a => a.status === "ADMITTED").length,
        discharged: admissions.filter(a => a.status === "DISCHARGED").length,
        cancelled: admissions.filter(a => a.status === "CANCELLED").length,
        avgLosDays: 0,
    };
    if (admissions.length > 0) {
        const losValues = admissions
            .filter(a => a.dischargeDate)
            .map(a => {
                const start = new Date(a.admissionDate).getTime();
                const end = new Date(a.dischargeDate!).getTime();
                return (end - start) / (1000 * 60 * 60 * 24);
            });
        if (losValues.length > 0) {
            stats.avgLosDays = Math.round((losValues.reduce((a, b) => a + b, 0) / losValues.length) * 10) / 10;
        }
    }

    const refresh = () => { fetchAdmissions(); };

    return (
        <div>
            {/* Header */}
            <div className={styles.pageHeader}>
                <div>
                    <h2>
                        <Bed size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
                        IPD Admissions
                    </h2>
                    <p className="text-sm text-gray-500" style={{ marginTop: 4 }}>
                        View, modify, terminate, or delete admissions. Terminate is the admin-override for erroneous records; delete is only for records with no downstream activity.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={refresh} className="btn-secondary" disabled={loading} title="Refresh">
                        <RefreshCw size={14} className={loading ? listStyles.spin : ""} /> Refresh
                    </button>
                    <Link href="/dashboard/ipd/admissions/new" className="btn-primary">
                        <UserPlus size={16} /> New Admission
                    </Link>
                </div>
            </div>

            {actionMsg && (
                <div style={{
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    color: "var(--success-color)",
                    padding: "0.6rem 0.85rem",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: "1rem",
                }}>
                    <CheckCircle size={16} /> {actionMsg}
                </div>
            )}

            {/* Stats */}
            <div className={styles.summaryCards}>
                <div className={styles.summaryCard}>
                    <div className={`${styles.iconWrapper} ${styles.success}`}>
                        <Bed size={20} />
                    </div>
                    <div>
                        <div className={styles.cardLabel}>Active</div>
                        <div className={styles.cardValue}>{stats.active}</div>
                    </div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={`${styles.iconWrapper} ${styles.info}`}>
                        <CheckCircle size={20} />
                    </div>
                    <div>
                        <div className={styles.cardLabel}>Discharged</div>
                        <div className={styles.cardValue}>{stats.discharged}</div>
                    </div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={`${styles.iconWrapper} ${styles.warning}`}>
                        <XCircle size={20} />
                    </div>
                    <div>
                        <div className={styles.cardLabel}>Cancelled</div>
                        <div className={styles.cardValue}>{stats.cancelled}</div>
                    </div>
                </div>
                <div className={styles.summaryCard}>
                    <div className={`${styles.iconWrapper} ${styles.primary}`}>
                        <Users size={20} />
                    </div>
                    <div>
                        <div className={styles.cardLabel}>Avg LOS (days)</div>
                        <div className={styles.cardValue}>{stats.avgLosDays || "—"}</div>
                    </div>
                </div>
            </div>

            {/* Status tabs + search */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
                {STATUS_TABS.map(tab => {
                    const active = statusFilter === tab.key;
                    return (
                        <button
                            key={tab.key || "all"}
                            onClick={() => setStatusFilter(tab.key)}
                            style={{
                                padding: "0.45rem 0.85rem",
                                borderRadius: "var(--radius-md)",
                                border: active ? `2px solid ${tab.color}` : "1px solid var(--border-color)",
                                background: active ? `${tab.color}15` : "var(--bg-card)",
                                color: active ? tab.color : "var(--text-secondary)",
                                fontWeight: active ? 700 : 500,
                                fontSize: "0.82rem",
                                cursor: "pointer",
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
                <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
                    <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input
                        type="text"
                        placeholder="Search admission #, patient, ward, doctor, type…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "0.45rem 0.6rem 0.45rem 2rem",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-color)",
                            background: "var(--bg-card)",
                            fontSize: "0.82rem",
                            outline: "none",
                        }}
                    />
                </div>
            </div>

            {/* Admissions table */}
            <div className={listStyles.tableContainer} style={{ padding: 0 }}>
                {loading ? (
                    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                        {search.trim()
                            ? <>No admissions match <strong>"{search}"</strong> in this view.</>
                            : <>No <strong>{statusFilter.toLowerCase() || "admissions"}</strong> found.</>}
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Admission #</th>
                                    <th style={thStyle}>Patient</th>
                                    <th style={thStyle}>Ward / Bed</th>
                                    <th style={thStyle}>Type</th>
                                    <th style={thStyle}>Doctor</th>
                                    <th style={thStyle}>Admitted</th>
                                    <th style={thStyle}>Discharged / Cancelled</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(a => (
                                    <tr key={a.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--primary-color)" }}>{a.admissionNumber}</div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: 600 }}>{a.patient.firstName} {a.patient.lastName}</div>
                                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                                #{a.patient.patientNumber} · {a.patient.gender}
                                            </div>
                                        </td>
                                        <td style={tdStyle}>
                                            {a.ward ? (
                                                <>
                                                    <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{a.ward.name}</div>
                                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                                        {a.ward.type} · Bed: <strong>{a.bed?.bedNumber || "—"}</strong>
                                                    </div>
                                                </>
                                            ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={typeBadgeStyle(a.type)}>{a.type}</span>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontSize: "0.85rem" }}>Dr. {a.admittingDoctor?.name || a.admittingDoctor?.email || "—"}</div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ fontSize: "0.8rem" }}>{new Date(a.admissionDate).toLocaleDateString()}</div>
                                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{new Date(a.admissionDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td style={tdStyle}>
                                            {a.cancelledAt ? (
                                                <>
                                                    <div style={{ fontSize: "0.8rem", color: "var(--danger-color)", fontWeight: 600 }}>Cancelled</div>
                                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{new Date(a.cancelledAt).toLocaleDateString()}</div>
                                                    {a.cancellationReason && (
                                                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic", maxWidth: 180, marginTop: 2 }}>
                                                            "{a.cancellationReason.length > 60 ? a.cancellationReason.slice(0, 60) + "…" : a.cancellationReason}"
                                                        </div>
                                                    )}
                                                </>
                                            ) : a.dischargeDate ? (
                                                <>
                                                    <div style={{ fontSize: "0.8rem", color: "var(--info-color)", fontWeight: 600 }}>Discharged</div>
                                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{new Date(a.dischargeDate).toLocaleDateString()}</div>
                                                </>
                                            ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={statusBadgeStyle(a.status)}>{a.status}</span>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right" }}>
                                            <div style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                                                <Link
                                                    href={`/dashboard/ipd/admissions/${a.id}`}
                                                    className="btn-secondary"
                                                    style={{ padding: "0.3rem 0.55rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 3 }}
                                                    title="View details"
                                                >
                                                    <Eye size={12} /> View
                                                </Link>
                                                {a.status === "ADMITTED" && (
                                                    <>
                                                        <button
                                                            onClick={() => setModifying(a)}
                                                            className="btn-secondary"
                                                            style={{ padding: "0.3rem 0.55rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 3 }}
                                                            title="Modify ward / bed / type / notes"
                                                        >
                                                            <Edit3 size={12} /> Modify
                                                        </button>
                                                        <button
                                                            onClick={() => setTerminating(a)}
                                                            style={{ padding: "0.3rem 0.55rem", fontSize: "0.75rem", background: "var(--warning-color)", color: "white", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}
                                                            title="Admin-override termination (releases bed, does NOT settle bills)"
                                                        >
                                                            <XCircle size={12} /> Terminate
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => setDeleting(a)}
                                                    style={{ padding: "0.3rem 0.55rem", fontSize: "0.75rem", background: "transparent", color: "var(--danger-color)", border: "1px solid var(--danger-color)", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}
                                                    title="Hard-delete (only allowed if no downstream records; refused if charges/deposits exist)"
                                                >
                                                    <Trash2 size={12} /> Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modals */}
            {modifying && (
                <ModifyAdmissionModal
                    admission={modifying}
                    onCancel={() => setModifying(null)}
                    onSuccess={(msg) => { setActionMsg(msg); setModifying(null); fetchAdmissions(); }}
                />
            )}
            {terminating && (
                <TerminateModal
                    admission={terminating}
                    onCancel={() => setTerminating(null)}
                    onSuccess={(msg) => { setActionMsg(msg); setTerminating(null); fetchAdmissions(); }}
                />
            )}
            {deleting && (
                <DeleteModal
                    admission={deleting}
                    onCancel={() => setDeleting(null)}
                    onSuccess={(msg) => { setActionMsg(msg); setDeleting(null); fetchAdmissions(); }}
                />
            )}
        </div>
    );
}

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "0.75rem 0.85rem",
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: "rgba(0, 0, 0, 0.02)",
    borderBottom: "1px solid var(--border-color)",
    whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
    padding: "0.75rem 0.85rem",
    fontSize: "0.85rem",
    color: "var(--text-primary)",
    verticalAlign: "top",
};
function statusBadgeStyle(s: string): React.CSSProperties {
    if (s === "ADMITTED") return { fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 999, background: "rgba(34, 197, 94, 0.12)", color: "var(--success-color)" };
    if (s === "DISCHARGED") return { fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 999, background: "rgba(59, 130, 246, 0.12)", color: "var(--info-color)" };
    if (s === "CANCELLED") return { fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 999, background: "rgba(239, 68, 68, 0.12)", color: "var(--danger-color)" };
    return { fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: 999, background: "var(--bg-secondary)" };
}
function typeBadgeStyle(t: string): React.CSSProperties {
    const map: Record<string, { fg: string; bg: string }> = {
        EMERGENCY: { fg: "var(--danger-color)",  bg: "rgba(239, 68, 68, 0.12)" },
        URGENT:    { fg: "var(--warning-color)", bg: "rgba(245, 158, 11, 0.12)" },
        ELECTIVE: { fg: "var(--info-color)",    bg: "rgba(59, 130, 246, 0.12)" },
        TRANSFER:  { fg: "var(--text-secondary)", bg: "rgba(107, 114, 128, 0.12)" },
    };
    const c = map[t] || map.ELECTIVE;
    return { fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 4, background: c.bg, color: c.fg };
}

// ──────────────────────────────────────────────────────────────────
// Modify modal — change ward / bed / type / notes
// ──────────────────────────────────────────────────────────────────
function ModifyAdmissionModal({ admission, onCancel, onSuccess }: {
    admission: Admission;
    onCancel: () => void;
    onSuccess: (msg: string) => void;
}) {
    const [wards, setWards] = useState<any[]>([]);
    const [wardId, setWardId] = useState(admission.ward?.id || "");
    const [bedId, setBedId] = useState(admission.bed?.id || "");
    const [type, setType] = useState(admission.type);
    const [notes, setNotes] = useState(admission.notes || "");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetch("/api/ipd/wards", { credentials: "include" })
            .then(r => r.ok ? r.json() : [])
            .then(setWards)
            .catch(() => {});
    }, []);

    const availableBeds = (wards.find(w => w.id === wardId)?.beds || [])
        .filter((b: any) => b.status === "AVAILABLE" || b.id === admission.bed?.id);

    const onSubmit = async () => {
        setSubmitting(true);
        try {
            const res = await fetch(`/api/ipd/admissions/${admission.id}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    wardId: wardId || null,
                    bedId: bedId || null,
                    type,
                    notes: notes || null,
                }),
            });
            if (res.ok) {
                onSuccess(`✓ Admission ${admission.admissionNumber} modified.`);
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error modifying admission.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={`Modify ${admission.admissionNumber}`} subtitle={`${admission.patient.firstName} ${admission.patient.lastName}`} onClose={onCancel}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="Ward">
                    <select value={wardId} onChange={e => { setWardId(e.target.value); setBedId(""); }} style={inputStyle}>
                        <option value="">-- No ward --</option>
                        {wards.map((w: any) => <option key={w.id} value={w.id}>{w.name} ({w.type})</option>)}
                    </select>
                </Field>
                {wardId && (
                    <Field label="Bed (only available beds + current)">
                        <select value={bedId} onChange={e => setBedId(e.target.value)} style={inputStyle}>
                            <option value="">-- No bed --</option>
                            {availableBeds.map((b: any) => (
                                <option key={b.id} value={b.id}>
                                    {b.bedNumber} ({b.type}) — {b.status === "OCCUPIED" ? "current" : b.status}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}
                <Field label="Admission Type">
                    <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                        <option value="EMERGENCY">Emergency</option>
                        <option value="ELECTIVE">Elective</option>
                        <option value="URGENT">Urgent</option>
                        <option value="TRANSFER">Transfer</option>
                    </select>
                </Field>
                <Field label="Notes">
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional notes" style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />
                </Field>
            </div>
            <ModalFooter onCancel={onCancel} submitting={submitting} onSubmit={onSubmit} submitLabel="Save Changes" submitColor="var(--primary-color)" />
        </Modal>
    );
}

// ──────────────────────────────────────────────────────────────────
// Terminate modal — admin-override cancel
// ──────────────────────────────────────────────────────────────────
function TerminateModal({ admission, onCancel, onSuccess }: {
    admission: Admission;
    onCancel: () => void;
    onSuccess: (msg: string) => void;
}) {
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const onSubmit = async () => {
        if (reason.trim().length < 5) {
            alert("Reason must be at least 5 characters.");
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch(`/api/ipd/admissions/${admission.id}/terminate`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: reason.trim() }),
            });
            if (res.ok) {
                onSuccess(`✓ Admission ${admission.admissionNumber} terminated. Bed released.`);
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error terminating admission.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={`Terminate Admission ${admission.admissionNumber}`} subtitle={admission.patient.firstName + " " + admission.patient.lastName} onClose={onCancel} tone="warning">
            <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 8, padding: "0.75rem", marginBottom: "1rem", display: "flex", gap: 8, fontSize: "0.8rem", color: "#92400e" }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                    <strong>Admin override.</strong> This marks the admission as CANCELLED, releases the bed (status -> CLEANING), and records your reason for the audit log. It does <strong>not</strong> settle any charges or deposits. For normal patient discharge, use the "Discharge" button on the detail page.
                </div>
            </div>
            <Field label="Reason for termination (>= 5 chars, required for audit log)" required>
                <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. Patient left against medical advice, transferred to another hospital"
                    style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
                />
            </Field>
            <ModalFooter
                onCancel={onCancel}
                submitting={submitting}
                onSubmit={onSubmit}
                submitLabel="Terminate Admission"
                submitColor="var(--warning-color)"
            />
        </Modal>
    );
}

// ──────────────────────────────────────────────────────────────────
// Delete modal — hard delete with reason
// ──────────────────────────────────────────────────────────────────
function DeleteModal({ admission, onCancel, onSuccess }: {
    admission: Admission;
    onCancel: () => void;
    onSuccess: (msg: string) => void;
}) {
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async () => {
        if (reason.trim().length < 5) {
            setError("Reason must be at least 5 characters.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/ipd/admissions/${admission.id}`, {
                method: "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: reason.trim() }),
            });
            if (res.ok) {
                onSuccess(`✓ Admission ${admission.admissionNumber} permanently deleted.`);
            } else {
                const err = await res.json();
                setError(err.error);
            }
        } catch (e) {
            console.error(e);
            setError("Error deleting admission.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={`Delete Admission ${admission.admissionNumber}`} subtitle={admission.patient.firstName + " " + admission.patient.lastName} onClose={onCancel} tone="danger">
            <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, padding: "0.75rem", marginBottom: "1rem", display: "flex", gap: 8, fontSize: "0.8rem", color: "#991b1b" }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                    <strong>Permanent delete.</strong> This removes the admission record entirely. The server will refuse if the admission has any charges, deposits, daily summaries, or floor-stock usage records — settle or void those first. The originating IpdRequest (if any) is preserved with admissionId nulled and status set to CANCELLED.
                </div>
            </div>
            <Field label="Reason for deletion (>= 5 chars, required for audit log)" required>
                <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. Created in error during training; patient never actually admitted"
                    style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
                />
            </Field>
            {error && (
                <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#991b1b", borderRadius: 6, padding: "0.5rem 0.7rem", fontSize: "0.8rem", marginTop: 8 }}>
                    {error}
                </div>
            )}
            <ModalFooter
                onCancel={onCancel}
                submitting={submitting}
                onSubmit={onSubmit}
                submitLabel="Permanently Delete"
                submitColor="var(--danger-color)"
            />
        </Modal>
    );
}

// ──────────────────────────────────────────────────────────────────
// Shared modal scaffolding
// ──────────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, tone, children }: {
    title: string;
    subtitle?: string;
    onClose: () => void;
    tone?: "warning" | "danger";
    children: React.ReactNode;
}) {
    const borderColor = tone === "danger" ? "var(--danger-color)" : tone === "warning" ? "var(--warning-color)" : "var(--primary-color)";
    return (
        <div
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "1rem" }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: "var(--bg-card)",
                    borderRadius: 12,
                    width: "100%",
                    maxWidth: 520,
                    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                    overflow: "hidden",
                    borderTop: `4px solid ${borderColor}`,
                }}
            >
                <div style={{ padding: "1.25rem 1.5rem 0.5rem" }}>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>{title}</h3>
                    {subtitle && <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.25rem 0 0" }}>{subtitle}</p>}
                </div>
                <div style={{ padding: "0.5rem 1.5rem 1.5rem" }}>{children}</div>
            </div>
        </div>
    );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                {label}
                {required && <span style={{ color: "var(--danger-color)" }}> *</span>}
            </label>
            {children}
        </div>
    );
}

function ModalFooter({ onCancel, submitting, onSubmit, submitLabel, submitColor }: {
    onCancel: () => void;
    submitting: boolean;
    onSubmit: () => void;
    submitLabel: string;
    submitColor: string;
}) {
    return (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "1.25rem" }}>
            <button onClick={onCancel} disabled={submitting} style={cancelBtnStyle}>Cancel</button>
            <button onClick={onSubmit} disabled={submitting} style={{ ...submitBtnStyle(submitColor), opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "Working…" : submitLabel}
            </button>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.65rem",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border-color)",
    background: "var(--bg-card)",
    color: "var(--text-primary)",
    fontSize: "0.85rem",
    outline: "none",
    boxSizing: "border-box",
};
const cancelBtnStyle: React.CSSProperties = {
    padding: "0.55rem 1rem",
    background: "transparent",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    color: "var(--text-secondary)",
    fontSize: "0.85rem",
};
function submitBtnStyle(color: string): React.CSSProperties {
    return {
        padding: "0.55rem 1.25rem",
        background: color,
        color: "white",
        border: "none",
        borderRadius: "var(--radius-sm)",
        fontWeight: 600,
        cursor: "pointer",
        fontSize: "0.85rem",
    };
}
