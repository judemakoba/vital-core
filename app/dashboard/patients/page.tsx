"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import styles from "./page.module.css";

interface Patient {
    id: string;
    patientNumber: string;
    firstName: string;
    lastName: string;
    phone: string;
    gender: string;
    dateOfBirth: string;
    isActive: boolean;
    createdAt: string;
}

interface Doctor {
    id: string;
    name: string;
}

interface VisitType {
    value: string;
    label: string;
    billable: boolean;
}

const VISIT_TYPES: VisitType[] = [
    { value: "OPD", label: "OPD (Out-Patient)", billable: true },
    { value: "EMERGENCY", label: "Emergency", billable: true },
    { value: "SCHEDULED", label: "Scheduled Visit", billable: true },
    { value: "FOLLOW_UP", label: "Follow-up (within 14d)", billable: false },
    { value: "VACCINATION", label: "Vaccination", billable: false },
    { value: "ANTENATAL", label: "Antenatal", billable: false },
    { value: "LAB_REVIEW", label: "Lab Review", billable: false },
    { value: "LAB_ONLY", label: "Lab Test Only", billable: false },
    { value: "RADIOLOGY_ONLY", label: "Radiology Only", billable: false },
    { value: "PRESCRIPTION_ONLY", label: "Prescription Pickup Only", billable: false },
    { value: "OTHER", label: "Other", billable: true },
];

const fmtDate = (s: string | null | undefined) => {
    if (!s) return "—";
    const d = new Date(s);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

const calcAge = (dob: string) => {
    if (!dob) return "—";
    const d = new Date(dob);
    if (isNaN(d.getTime())) return "—";
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
};

export default function PatientsPage() {
    const { data: session } = useSession();
    const canDelete = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

    const [patients, setPatients] = useState<Patient[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // New Visit Modal
    const [showVisitModal, setShowVisitModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [visitData, setVisitData] = useState({
        type: "OPD",
        doctorId: "",
        chiefComplaint: "",
    });
    const [isCreatingVisit, setIsCreatingVisit] = useState(false);
    const [visitError, setVisitError] = useState<string | null>(null);
    const [visitSuccess, setVisitSuccess] = useState<string | null>(null);

    useEffect(() => {
        const fetchPatients = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/patients?search=${encodeURIComponent(search)}&page=${page}`, {
                    credentials: "include",
                });
                if (res.ok) {
                    const data = await res.json();
                    setPatients(data.data || []);
                    setTotalPages(data.totalPages || 1);
                } else if (res.status === 401) {
                    window.location.href = "/login";
                }
            } catch (err) {
                console.error("Failed to fetch patients:", err);
            }
            setLoading(false);
        };
        const t = setTimeout(fetchPatients, 300);
        return () => clearTimeout(t);
    }, [search, page]);

    useEffect(() => {
        if (showVisitModal) {
            fetch("/api/users?role=DOCTOR", { credentials: "include" })
                .then(r => r.ok ? r.json() : [])
                .then(data => setDoctors(Array.isArray(data) ? data : []))
                .catch(err => console.error("Failed to fetch doctors", err));
        }
    }, [showVisitModal]);

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Delete patient ${name}?`)) return;
        const res = await fetch(`/api/patients/${id}`, {
            method: "DELETE",
            credentials: "include",
        });
        if (res.ok) {
            setPatients(prev => prev.filter(p => p.id !== id));
        } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || data.message || "Delete failed");
        }
    };

    const openVisitModal = (p: Patient) => {
        setSelectedPatient(p);
        setVisitData({ type: "OPD", doctorId: "", chiefComplaint: "" });
        setVisitError(null);
        setVisitSuccess(null);
        setShowVisitModal(true);
    };

    const handleCreateVisit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatient) return;
        setVisitError(null);
        setVisitSuccess(null);
        if (!visitData.doctorId) {
            setVisitError("Please select a doctor");
            return;
        }
        setIsCreatingVisit(true);
        try {
            const res = await fetch(`/api/patients/${selectedPatient.id}/visit`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(visitData),
            });
            const data = await res.json();
            if (res.ok) {
                setVisitSuccess(`Visit created — initial status: ${data.initialStatus || "(see visit page)"}.`);
                setTimeout(() => {
                    setShowVisitModal(false);
                    window.location.href = `/dashboard/patients/${selectedPatient.id}/visits/${data.visitId}`;
                }, 1500);
            } else {
                setVisitError(data.error || "Failed to create visit");
            }
        } catch (err: any) {
            setVisitError(err.message || "Network error");
        } finally {
            setIsCreatingVisit(false);
        }
    };

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <h1 style={{ fontSize: 22, margin: 0 }}>Patients</h1>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <input
                        className={styles.searchInput}
                        placeholder="Search by name, phone, or patient #…"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        style={{ width: 320 }}
                    />
                    <Link href="/dashboard/patients/new" className={styles.btnPrimary}>＋ New Patient</Link>
                </div>
            </div>

            <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-elevated)" }}>
                            <th style={th}>Patient #</th>
                            <th style={th}>Name</th>
                            <th style={th}>Sex</th>
                            <th style={th}>Age</th>
                            <th style={th}>Phone</th>
                            <th style={th}>Registered</th>
                            <th style={th}>Status</th>
                            <th style={th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>Loading…</td></tr>
                        ) : patients.length === 0 ? (
                            <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>No patients found.</td></tr>
                        ) : patients.map(p => (
                            <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                                <td style={td}><strong>{p.patientNumber}</strong></td>
                                <td style={td}>
                                    <Link href={`/dashboard/patients/${p.id}`} style={{ color: "var(--primary-color)" }}>
                                        {p.firstName} {p.lastName}
                                    </Link>
                                </td>
                                <td style={td}>{p.gender}</td>
                                <td style={td}>{calcAge(p.dateOfBirth)}</td>
                                <td style={td}>{p.phone}</td>
                                <td style={td}>{fmtDate(p.createdAt)}</td>
                                <td style={td}>
                                    <span style={{
                                        padding: "2px 8px", borderRadius: 4, fontSize: 11,
                                        background: p.isActive ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                                        color: p.isActive ? "#059669" : "#dc2626",
                                    }}>
                                        {p.isActive ? "Active" : "Inactive"}
                                    </span>
                                </td>
                                <td style={td}>
                                    <Link href={`/dashboard/patients/${p.id}`} className={styles.btnSecondary}>View</Link>
                                    <button onClick={() => openVisitModal(p)} className={styles.btnPrimary} style={{ marginLeft: 4 }}>＋ Visit</button>
                                    {canDelete && (
                                        <button onClick={() => handleDelete(p.id, `${p.firstName} ${p.lastName}`)} className={styles.btnSecondary} style={{ marginLeft: 4, color: "#dc2626" }}>🗑</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className={styles.btnSecondary}>← Prev</button>
                    <span style={{ alignSelf: "center" }}>Page {page} of {totalPages}</span>
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className={styles.btnSecondary}>Next →</button>
                </div>
            )}

            {/* New visit modal */}
            {showVisitModal && selectedPatient && (
                <div className={styles.modalBackdrop} onClick={() => setShowVisitModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ padding: 16, maxWidth: 480 }}>
                        <h3 style={{ margin: "0 0 16px 0" }}>New Visit — {selectedPatient.firstName} {selectedPatient.lastName}</h3>
                        <form onSubmit={handleCreateVisit}>
                            <div style={{ marginBottom: 12 }}>
                                <label style={labelStyle}>Visit type</label>
                                <select value={visitData.type} onChange={e => setVisitData(v => ({ ...v, type: e.target.value }))} style={inputStyle}>
                                    {VISIT_TYPES.map(vt => (
                                        <option key={vt.value} value={vt.value}>
                                            {vt.label}{vt.billable ? "" : " (no consult fee)"}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={labelStyle}>Doctor *</label>
                                <select value={visitData.doctorId} onChange={e => setVisitData(v => ({ ...v, doctorId: e.target.value }))} style={inputStyle} required>
                                    <option value="">— Select —</option>
                                    {doctors.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <label style={labelStyle}>Chief complaint</label>
                                <textarea value={visitData.chiefComplaint} onChange={e => setVisitData(v => ({ ...v, chiefComplaint: e.target.value }))} rows={3} style={inputStyle} />
                            </div>
                            {visitError && <div style={errorStyle}>{visitError}</div>}
                            {visitSuccess && <div style={successStyle}>{visitSuccess}</div>}
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                                <button type="button" onClick={() => setShowVisitModal(false)} className={styles.btnSecondary}>Cancel</button>
                                <button type="submit" disabled={isCreatingVisit} className={styles.btnPrimary}>
                                    {isCreatingVisit ? "Creating…" : "Create Visit"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--bg)", color: "var(--text)" };
const errorStyle: React.CSSProperties = { padding: 8, background: "rgba(239,68,68,0.1)", color: "#dc2626", borderRadius: 6, fontSize: 13 };
const successStyle: React.CSSProperties = { padding: 8, background: "rgba(34,197,94,0.1)", color: "#059669", borderRadius: 6, fontSize: 13 };
