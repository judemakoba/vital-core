"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Thermometer, User, Clock, ArrowRight, CheckCircle2, X } from "lucide-react";
import styles from "../patients/page.module.css"; // Reuse table styles
import Link from "next/link";

interface Visit {
    id: string;
    visitNumber: string;
    type: string;
    priority: string;
    createdAt: string;
    patient: {
        firstName: string;
        lastName: string;
        patientNumber: string;
    };
    doctor: {
        name: string;
    } | null;
}

function TriageListInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(true);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Read ?completed= and ?next= query params from auto-advance
    const completedName = searchParams.get('completed');
    const nextName = searchParams.get('next');

    useEffect(() => {
        const fetchWaiting = async () => {
            setLoading(true);
            try {
                const res = await fetch("/api/triage/waiting", { credentials: "include" });
                if (res.ok) {
                    setVisits(await res.json());
                }
            } catch (err) {
                console.error("Failed to fetch triage list", err);
            }
            setLoading(false);
        };
        fetchWaiting();
    }, []);

    // Build a success banner from the query params
    useEffect(() => {
        if (completedName) {
            if (nextName) {
                setSuccessMessage(`Triage completed for ${completedName}. Next: ${nextName}.`);
            } else {
                setSuccessMessage(`Triage completed for ${completedName}. All patients triaged!`);
            }
            // Strip the query params so a refresh doesn't re-show
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
            // Auto-dismiss after 6s
            const t = setTimeout(() => setSuccessMessage(null), 6000);
            return () => clearTimeout(t);
        }
    }, [completedName, nextName]);

    const dismissBanner = () => setSuccessMessage(null);

    const getTimeInWaiting = (createdAt: string) => {
        const diff = Date.now() - new Date(createdAt).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m`;
        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Triage Queue</h1>
                <p style={{ color: "var(--text-secondary)" }}>Waiting for vitals check-up</p>
            </div>

            {successMessage && (
                <div style={{
                    marginBottom: '1rem',
                    padding: '0.875rem 1rem',
                    background: 'rgba(16,185,129,0.08)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderLeft: '4px solid var(--success-color)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: 'var(--text-primary)',
                }}>
                    <CheckCircle2 size={18} color="var(--success-color)" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.9rem' }}>{successMessage}</span>
                    <button
                        onClick={dismissBanner}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}
                        aria-label="Dismiss"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Patient</th>
                            <th className={styles.th}>Visit No.</th>
                            <th className={styles.th}>Assigned Doctor</th>
                            <th className={styles.th}>Wait Time</th>
                            <th className={styles.th}>Priority</th>
                            <th className={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem" }}>
                                    Loading queue...
                                </td>
                            </tr>
                        ) : visits.length === 0 ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                    No patients in triage queue.
                                </td>
                            </tr>
                        ) : (
                            visits.map(visit => (
                                <tr key={visit.id} className={styles.tr}>
                                    <td className={styles.td}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                            <div style={{
                                                width: "32px",
                                                height: "32px",
                                                borderRadius: "50%",
                                                background: "rgba(100, 116, 139, 0.1)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                color: "var(--text-secondary)"
                                            }}>
                                                <User size={16} />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{visit.patient.firstName} {visit.patient.lastName}</div>
                                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{visit.patient.patientNumber}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className={styles.td}>
                                        <span className={styles.patientId}>{visit.visitNumber}</span>
                                    </td>
                                    <td className={styles.td}>{visit.doctor ? `Dr. ${visit.doctor.name}` : "Unassigned"}</td>
                                    <td className={styles.td}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--warning-color)" }}>
                                            <Clock size={14} /> {getTimeInWaiting(visit.createdAt)}
                                        </div>
                                    </td>
                                    <td className={styles.td}>
                                        <span style={{
                                            padding: "0.2rem 0.5rem",
                                            borderRadius: "999px",
                                            fontSize: "0.75rem",
                                            fontWeight: 600,
                                            background: visit.priority === "Emergency" ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                                            color: visit.priority === "Emergency" ? "var(--danger-color)" : "var(--success-color)"
                                        }}>
                                            {visit.priority}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <Link href={`/dashboard/triage/${visit.id}`} className={styles.addBtn} style={{ padding: "0.4rem 0.8rem", fontSize: "0.875rem" }}>
                                            Perform Triage <ArrowRight size={14} />
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function TriageListPage() {
    return (
        <Suspense fallback={<div className={styles.container}><div className={styles.header}><h1 className={styles.title}>Triage Queue</h1></div></div>}>
            <TriageListInner />
        </Suspense>
    );
}
