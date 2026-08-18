"use client";

/**
 * /dashboard/ipd/requests
 *
 * R62: IPD request queue for admin / reception / super_admin.
 * Doctors submit IPD requests during consultation; this is where
 * admin / reception reviews and fulfils them.
 *
 * Status filter pills (top): PENDING / APPROVED / FULFILLED / REJECTED / CANCELLED
 * Each row shows patient, urgency, preferred ward, doctor, time submitted.
 * Actions per status:
 *   PENDING   -> Approve | Reject | Fulfill (with ward+bed+deposit form)
 *   APPROVED  -> Fulfill (with ward+bed+deposit form)
 *   FULFILLED -> link to the resulting Admission
 *   REJECTED  -> terminal (read-only)
 *   CANCELLED -> terminal (read-only)
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
    Bed,
    Check,
    X,
    ArrowRight,
    RefreshCw,
    Search,
    AlertCircle,
    Clock,
    CheckCircle2,
} from "lucide-react";
import styles from "../../doctor/page.module.css";
import listStyles from "../../patients/page.module.css";

interface IpdRequest {
    id: string;
    requestNumber: string;
    visitId: string;
    reasonForAdmission: string;
    admittingDiagnosis: string | null;
    urgency: "EMERGENCY" | "URGENT" | "ELECTIVE";
    preferredWardId: string | null;
    preferredBedType: string | null;
    clinicalNotes: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "FULFILLED";
    createdAt: string;
    reviewedAt: string | null;
    reviewNotes: string | null;
    fulfilledAt: string | null;
    visit: {
        id: string;
        visitNumber: string;
        status: string;
        type: string;
        patient: {
            id: string;
            firstName: string;
            lastName: string;
            patientNumber: string;
            gender: string;
            dateOfBirth: string;
        };
    };
    requestedBy: { id: string; name: string | null; email: string | null };
    reviewedBy: { id: string; name: string | null; email: string | null } | null;
    preferredWard: { id: string; name: string; type: string } | null;
    admission: { id: string; admissionNumber: string; status: string } | null;
}

const STATUS_TABS = [
    { key: "PENDING", label: "Pending", color: "#f59e0b" },
    { key: "APPROVED", label: "Approved", color: "#3b82f6" },
    { key: "FULFILLED", label: "Fulfilled", color: "#10b981" },
    { key: "REJECTED", label: "Rejected", color: "#ef4444" },
    { key: "CANCELLED", label: "Cancelled", color: "#6b7280" },
];

const URGENCY_COLORS: Record<string, string> = {
    EMERGENCY: "#ef4444",
    URGENT: "#f59e0b",
    ELECTIVE: "#3b82f6",
};

export default function IpdRequestQueuePage() {
    const [requests, setRequests] = useState<IpdRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>("PENDING");
    const [search, setSearch] = useState("");
    const [fulfilling, setFulfilling] = useState<IpdRequest | null>(null);
    const [rejecting, setRejecting] = useState<IpdRequest | null>(null);
    const [wards, setWards] = useState<any[]>([]);
    const [actionMsg, setActionMsg] = useState<string | null>(null);

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/ipd-requests?status=${statusFilter}`, { credentials: "include" });
            if (res.ok) {
                const data: IpdRequest[] = await res.json();
                setRequests(data);
            }
        } catch (e) {
            console.error("Failed to fetch IPD requests", e);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    const fetchWards = useCallback(async () => {
        try {
            const res = await fetch("/api/ipd/wards", { credentials: "include" });
            if (res.ok) {
                setWards(await res.json());
            }
        } catch (e) {
            console.error("Failed to fetch wards", e);
        }
    }, []);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);
    useEffect(() => { fetchWards(); }, [fetchWards]);

    // Auto-dismiss action flash after 4s
    useEffect(() => {
        if (!actionMsg) return;
        const t = setTimeout(() => setActionMsg(null), 4000);
        return () => clearTimeout(t);
    }, [actionMsg]);

    const filtered = requests.filter(r => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            r.requestNumber.toLowerCase().includes(q) ||
            r.visit.visitNumber.toLowerCase().includes(q) ||
            r.visit.patient.firstName.toLowerCase().includes(q) ||
            r.visit.patient.lastName.toLowerCase().includes(q) ||
            r.visit.patient.patientNumber.toLowerCase().includes(q) ||
            r.reasonForAdmission.toLowerCase().includes(q)
        );
    });

    const counts: Record<string, number> = {
        PENDING: 0, APPROVED: 0, FULFILLED: 0, REJECTED: 0, CANCELLED: 0,
    };
    for (const r of requests) {
        if (counts[r.status] !== undefined) counts[r.status]++;
    }

    const onApprove = async (req: IpdRequest) => {
        try {
            const res = await fetch(`/api/ipd-requests/${req.id}/approve`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            if (res.ok) {
                setActionMsg(`Request ${req.requestNumber} approved. Now ready to fulfil.`);
                await fetchRequests();
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error approving request.");
        }
    };

    const onReject = async (req: IpdRequest, reason: string) => {
        try {
            const res = await fetch(`/api/ipd-requests/${req.id}/reject`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reviewNotes: reason }),
            });
            if (res.ok) {
                setActionMsg(`Request ${req.requestNumber} rejected.`);
                setRejecting(null);
                await fetchRequests();
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error rejecting request.");
        }
    };

    const onFulfill = async (req: IpdRequest, opts: { wardId: string; bedId: string; initialDeposit: string }) => {
        try {
            const res = await fetch(`/api/ipd-requests/${req.id}/fulfill`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    wardId: opts.wardId || req.preferredWardId || undefined,
                    bedId: opts.bedId || undefined,
                    initialDeposit: opts.initialDeposit || undefined,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setActionMsg(`✓ ${req.requestNumber} fulfilled — admission ${data.admission?.admissionNumber} created. Visit transitioned to INPATIENT.`);
                setFulfilling(null);
                await fetchRequests();
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error fulfilling request.");
        }
    };

    const formatTime = (s: string) => {
        try { return new Date(s).toLocaleString([], { dateStyle: "short", timeStyle: "short" }); } catch { return s; }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>
                        <Bed size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
                        IPD Admission Requests
                    </h1>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>
                        Doctor-submitted requests for admission. Approve or fulfil to transition the visit to INPATIENT and create an Admission record.
                    </div>
                </div>
                <button
                    className={styles.startBtn}
                    onClick={() => { fetchRequests(); fetchWards(); }}
                    disabled={loading}
                    style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}
                >
                    <RefreshCw size={14} className={loading ? listStyles.spin : ""} /> Refresh
                </button>
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
                }}>
                    <CheckCircle2 size={16} /> {actionMsg}
                </div>
            )}

            {/* Status filter pills + search */}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                {STATUS_TABS.map(tab => {
                    const active = statusFilter === tab.key;
                    return (
                        <button
                            key={tab.key}
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
                                transition: "all 0.15s",
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
                <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
                    <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input
                        type="text"
                        placeholder="Search by request #, patient, reason…"
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

            {/* Request list */}
            <div className={listStyles.tableContainer} style={{ padding: 0 }}>
                {loading ? (
                    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                        No <strong>{statusFilter.toLowerCase()}</strong> requests.
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {filtered.map(req => (
                            <div
                                key={req.id}
                                style={{
                                    padding: "1rem 1.25rem",
                                    borderBottom: "1px solid var(--border-color)",
                                    display: "flex",
                                    gap: "1rem",
                                    alignItems: "flex-start",
                                }}
                            >
                                {/* Urgency stripe on the left */}
                                <div style={{
                                    width: 4,
                                    alignSelf: "stretch",
                                    background: URGENCY_COLORS[req.urgency] || "#6b7280",
                                    borderRadius: 2,
                                    flexShrink: 0,
                                }} />

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                                        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                                            {req.visit.patient.firstName} {req.visit.patient.lastName}
                                        </span>
                                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                            #{req.visit.patient.patientNumber} · {req.visit.visitNumber}
                                        </span>
                                        <span style={{
                                            fontSize: "0.7rem",
                                            fontWeight: 700,
                                            padding: "0.15rem 0.5rem",
                                            borderRadius: 999,
                                            background: `${URGENCY_COLORS[req.urgency]}20`,
                                            color: URGENCY_COLORS[req.urgency],
                                            textTransform: "uppercase",
                                            letterSpacing: "0.04em",
                                        }}>
                                            {req.urgency}
                                        </span>
                                        <span style={{
                                            fontSize: "0.7rem",
                                            color: "var(--text-muted)",
                                            padding: "0.1rem 0.4rem",
                                            background: "var(--bg-secondary)",
                                            borderRadius: 4,
                                        }}>
                                            {req.requestNumber}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: "0.8rem", marginBottom: 4 }}>
                                        <strong>Reason:</strong> {req.reasonForAdmission}
                                    </div>
                                    {req.admittingDiagnosis && (
                                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                                            <strong>Diagnosis:</strong> {req.admittingDiagnosis}
                                        </div>
                                    )}
                                    {req.clinicalNotes && (
                                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic", marginTop: 4 }}>
                                            "{req.clinicalNotes}"
                                        </div>
                                    )}
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                        <span><Clock size={11} style={{ verticalAlign: "middle", marginRight: 2 }} /> Submitted {formatTime(req.createdAt)}</span>
                                        <span>By: Dr. {req.requestedBy.name || req.requestedBy.email}</span>
                                        {req.preferredWard && <span>Preferred ward: {req.preferredWard.name}</span>}
                                        {req.preferredBedType && <span>Bed: {req.preferredBedType}</span>}
                                        {req.reviewNotes && (
                                            <span style={{ color: "var(--danger-color)" }}>
                                                <AlertCircle size={11} style={{ verticalAlign: "middle", marginRight: 2 }} />
                                                {req.reviewNotes}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                                    {req.status === "PENDING" && (
                                        <>
                                            <button
                                                onClick={() => onApprove(req)}
                                                style={{
                                                    padding: "0.4rem 0.75rem",
                                                    background: "var(--primary-color)",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: "var(--radius-sm)",
                                                    fontSize: "0.78rem",
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                    display: "flex", alignItems: "center", gap: 4,
                                                }}
                                            >
                                                <Check size={13} /> Approve
                                            </button>
                                            <button
                                                onClick={() => setFulfilling(req)}
                                                style={{
                                                    padding: "0.4rem 0.75rem",
                                                    background: "var(--success-color)",
                                                    color: "white",
                                                    border: "none",
                                                    borderRadius: "var(--radius-sm)",
                                                    fontSize: "0.78rem",
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                    display: "flex", alignItems: "center", gap: 4,
                                                }}
                                            >
                                                <Bed size={13} /> Fulfill
                                            </button>
                                            <button
                                                onClick={() => setRejecting(req)}
                                                style={{
                                                    padding: "0.4rem 0.75rem",
                                                    background: "transparent",
                                                    color: "var(--danger-color)",
                                                    border: "1px solid var(--danger-color)",
                                                    borderRadius: "var(--radius-sm)",
                                                    fontSize: "0.78rem",
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                    display: "flex", alignItems: "center", gap: 4,
                                                }}
                                            >
                                                <X size={13} /> Reject
                                            </button>
                                        </>
                                    )}
                                    {req.status === "APPROVED" && (
                                        <button
                                            onClick={() => setFulfilling(req)}
                                            style={{
                                                padding: "0.5rem 0.9rem",
                                                background: "var(--success-color)",
                                                color: "white",
                                                border: "none",
                                                borderRadius: "var(--radius-sm)",
                                                fontSize: "0.82rem",
                                                fontWeight: 600,
                                                cursor: "pointer",
                                                display: "flex", alignItems: "center", gap: 4,
                                            }}
                                        >
                                            <Bed size={13} /> Fulfill Now
                                            <ArrowRight size={13} />
                                        </button>
                                    )}
                                    {req.status === "FULFILLED" && req.admission && (
                                        <Link
                                            href={`/dashboard/ipd/admissions/${req.admission.id}`}
                                            style={{
                                                padding: "0.5rem 0.9rem",
                                                background: "rgba(34,197,94,0.1)",
                                                color: "var(--success-color)",
                                                border: "1px solid rgba(34,197,94,0.3)",
                                                borderRadius: "var(--radius-sm)",
                                                fontSize: "0.78rem",
                                                fontWeight: 600,
                                                textDecoration: "none",
                                                display: "flex", alignItems: "center", gap: 4,
                                            }}
                                        >
                                            View Admission
                                            <ArrowRight size={13} />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Fulfill modal — ward/bed + initial deposit */}
            {fulfilling && (
                <FulfillModal
                    req={fulfilling}
                    wards={wards}
                    onCancel={() => setFulfilling(null)}
                    onSubmit={(opts) => onFulfill(fulfilling, opts)}
                />
            )}

            {/* Reject modal — reason */}
            {rejecting && (
                <RejectModal
                    req={rejecting}
                    onCancel={() => setRejecting(null)}
                    onSubmit={(reason) => onReject(rejecting, reason)}
                />
            )}
        </div>
    );
}

function FulfillModal({ req, wards, onCancel, onSubmit }: {
    req: IpdRequest;
    wards: any[];
    onCancel: () => void;
    onSubmit: (opts: { wardId: string; bedId: string; initialDeposit: string }) => void;
}) {
    const [wardId, setWardId] = useState(req.preferredWardId || "");
    const [bedId, setBedId] = useState("");
    const [initialDeposit, setInitialDeposit] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const availableBeds = (wards.find(w => w.id === wardId)?.beds || [])
        .filter((b: any) => b.status === "AVAILABLE");

    return (
        <div
            onClick={onCancel}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{ background: "var(--bg-card)", padding: "1.5rem", borderRadius: 12, width: "100%", maxWidth: 500, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}
            >
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, marginBottom: 4 }}>
                    Fulfil IPD Request
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0, marginBottom: "1rem" }}>
                    {req.requestNumber} — {req.visit.patient.firstName} {req.visit.patient.lastName}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                            Ward
                        </label>
                        <select
                            value={wardId}
                            onChange={e => { setWardId(e.target.value); setBedId(""); }}
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}
                        >
                            <option value="">-- Select ward --</option>
                            {wards.map(w => (
                                <option key={w.id} value={w.id}>
                                    {w.name} ({w.type}) — {w.beds?.filter((b: any) => b.status === "AVAILABLE").length || 0} beds available
                                </option>
                            ))}
                        </select>
                    </div>
                    {wardId && (
                        <div>
                            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                                Bed (optional)
                            </label>
                            <select
                                value={bedId}
                                onChange={e => setBedId(e.target.value)}
                                style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}
                            >
                                <option value="">-- No bed assigned yet --</option>
                                {availableBeds.map((b: any) => (
                                    <option key={b.id} value={b.id}>
                                        {b.bedNumber} ({b.type})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                            Initial Deposit (optional, in UGX)
                        </label>
                        <input
                            type="number"
                            value={initialDeposit}
                            onChange={e => setInitialDeposit(e.target.value)}
                            min="0"
                            step="1000"
                            placeholder="0"
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}
                        />
                    </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "1.25rem" }}>
                    <button onClick={onCancel} style={{ padding: "0.55rem 1rem", background: "transparent", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-secondary)" }}>
                        Cancel
                    </button>
                    <button
                        onClick={async () => {
                            if (!wardId) {
                                alert("Please select a ward.");
                                return;
                            }
                            setSubmitting(true);
                            await onSubmit({ wardId, bedId, initialDeposit });
                            setSubmitting(false);
                        }}
                        disabled={submitting}
                        style={{
                            padding: "0.55rem 1.25rem",
                            background: "var(--success-color)",
                            color: "white",
                            border: "none",
                            borderRadius: "var(--radius-sm)",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex", alignItems: "center", gap: 6,
                        }}
                    >
                        <Check size={14} />
                        {submitting ? "Fulfilling…" : "Fulfil & Admit"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function RejectModal({ req, onCancel, onSubmit }: {
    req: IpdRequest;
    onCancel: () => void;
    onSubmit: (reason: string) => void;
}) {
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    return (
        <div
            onClick={onCancel}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{ background: "var(--bg-card)", padding: "1.5rem", borderRadius: 12, width: "100%", maxWidth: 480, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}
            >
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, marginBottom: 4 }}>
                    Reject IPD Request
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0, marginBottom: "1rem" }}>
                    {req.requestNumber} — {req.visit.patient.firstName} {req.visit.patient.lastName}
                </p>

                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Reason for rejection <span style={{ color: "var(--danger-color)" }}>*</span>
                </label>
                <textarea
                    value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. No beds available in preferred ward, please escalate to manager"
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", fontFamily: "inherit", resize: "vertical" }}
                />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "1.25rem" }}>
                    <button onClick={onCancel} style={{ padding: "0.55rem 1rem", background: "transparent", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-secondary)" }}>
                        Cancel
                    </button>
                    <button
                        onClick={async () => {
                            if (!reason.trim()) {
                                alert("Please provide a reason.");
                                return;
                            }
                            setSubmitting(true);
                            await onSubmit(reason.trim());
                            setSubmitting(false);
                        }}
                        disabled={submitting}
                        style={{ padding: "0.55rem 1.25rem", background: "var(--danger-color)", color: "white", border: "none", borderRadius: "var(--radius-sm)", fontWeight: 600, cursor: "pointer" }}
                    >
                        {submitting ? "Rejecting…" : "Reject Request"}
                    </button>
                </div>
            </div>
        </div>
    );
}
