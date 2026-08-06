"use client";

import { useState, useEffect } from "react";
import { Activity, Clock, Trash2, ArrowRight, UserPlus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function ActiveVisitsModule() {
    const [visits, setVisits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const router = useRouter();
    const { data: session } = useSession();

    const userRole = session?.user?.role;
    const userId = (session?.user as any)?.id;
    const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

    const fetchVisits = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/visits/active", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setVisits(data);
            }
        } catch (error) {
            console.error("Failed to fetch active visits:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVisits();

        // Auto-refresh every minute
        const interval = setInterval(fetchVisits, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleDeleteClick = (id: string) => {
        console.log("Delete button clicked for visit ID:", id);
        setDeletingId(id);
    };

    const confirmDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/visits/${id}`, { method: "DELETE", credentials: "include" });
            if (res.ok) {
                alert("Visit cancelled successfully.");
                setDeletingId(null);
                fetchVisits();
            } else {
                const error = await res.json();
                alert(error.error || "Failed to cancel visit.");
            }
        } catch (error) {
            alert("Error cancelling visit.");
        }
    };

    const cancelDelete = () => {
        setDeletingId(null);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "Billing": return "var(--warning-color)";
            case "Waiting": return "var(--warning-color)";
            case "Triage": return "var(--info-color)";
            case "Triaged": return "var(--info-color)";
            case "Consultation":
            case "Doctor": return "var(--primary-color)";
            case "Pharmacy": return "var(--success-color)";
            case "Laboratory": return "#8b5cf6";
            default: return "var(--text-secondary)";
        }
    };

    return (
        <div className="glass-card card-premium" style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", animationDelay: "600ms", animation: "slideUpFade var(--transition-normal) forwards" }}>
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Activity size={20} color="var(--primary-color)" />
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Active Visits Management</h3>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Link
                        href="/dashboard/patients/new"
                        style={{
                            padding: "0.5rem 1rem",
                            background: "var(--info-color)",
                            color: "white",
                            borderRadius: "var(--radius-md)",
                            fontSize: "0.875rem",
                            fontWeight: 500,
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            transition: "all var(--transition-fast)"
                        }}
                        className="btn-premium"
                    >
                        <UserPlus size={16} />
                        Create New Patient
                    </Link>
                    <Link
                        href="/dashboard/patients"
                        style={{
                            padding: "0.5rem 1rem",
                            background: "var(--primary-color)",
                            color: "white",
                            borderRadius: "var(--radius-md)",
                            fontSize: "0.875rem",
                            fontWeight: 500,
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            transition: "all var(--transition-fast)"
                        }}
                        className="btn-premium"
                    >
                        <UserPlus size={16} />
                        New Visit (Patients Directory)
                    </Link>
                </div>
            </div>

            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: "left", padding: "1rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-color)", background: "rgba(0,0,0,0.02)" }}>Patient / Visit No</th>
                            <th style={{ textAlign: "left", padding: "1rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-color)", background: "rgba(0,0,0,0.02)" }}>Status</th>
                            <th style={{ textAlign: "left", padding: "1rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-color)", background: "rgba(0,0,0,0.02)" }}>Doctor</th>
                            <th style={{ textAlign: "left", padding: "1rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-color)", background: "rgba(0,0,0,0.02)" }}>Check-in / Type</th>
                            <th style={{ textAlign: "right", padding: "1rem 1.5rem", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-color)", background: "rgba(0,0,0,0.02)" }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Loading active visits...</td></tr>
                        ) : visits.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No active visits found.</td></tr>
                        ) : (
                            visits.map((visit) => (
                                <tr key={visit.id} style={{ borderBottom: "1px solid var(--border-color)", transition: "background var(--transition-fast)" }} className="hover-row">
                                    <td style={{ padding: "1rem 1.5rem" }}>
                                        <div style={{ fontWeight: 600 }}>{visit.patient.firstName} {visit.patient.lastName}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{visit.visitNumber}</div>
                                    </td>
                                    <td style={{ padding: "1rem 1.5rem" }}>
                                        <span style={{
                                            display: "inline-block",
                                            padding: "0.25rem 0.6rem",
                                            borderRadius: "99px",
                                            fontSize: "0.75rem",
                                            fontWeight: 600,
                                            background: `${getStatusColor(visit.status)}15`,
                                            color: getStatusColor(visit.status)
                                        }}>
                                            {visit.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: "1rem 1.5rem", fontSize: "0.875rem" }}>
                                        {visit.doctor ? visit.doctor.name : <span style={{ color: "var(--text-muted)" }}>Unassigned</span>}
                                    </td>
                                    <td style={{ padding: "1rem 1.5rem" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem" }}>
                                            <Clock size={14} color="var(--text-muted)" />
                                            {new Date(visit.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{visit.type}</div>
                                    </td>
                                    <td style={{ padding: "1rem 1.5rem", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: "0.5rem", minWidth: "150px" }}>
                                        {deletingId === visit.id ? (
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", animation: "slideInRight 0.2s ease-out" }}>
                                                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--danger-color)" }}>Confirm?</span>
                                                <button
                                                    onClick={() => confirmDelete(visit.id)}
                                                    style={{ padding: "0.3rem 0.6rem", background: "var(--danger-color)", color: "white", border: "none", borderRadius: "var(--radius-sm)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}
                                                >
                                                    Yes
                                                </button>
                                                <button
                                                    onClick={cancelDelete}
                                                    style={{ padding: "0.3rem 0.6rem", background: "var(--border-color)", color: "var(--text-primary)", border: "none", borderRadius: "var(--radius-sm)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => handleDeleteClick(visit.id)}
                                                        style={{
                                                            background: "none",
                                                            border: "none",
                                                            color: "var(--text-muted)",
                                                            cursor: "pointer",
                                                            padding: "0.5rem",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            borderRadius: "var(--radius-sm)",
                                                            transition: "all var(--transition-fast)",
                                                            position: "relative",
                                                            zIndex: 10
                                                        }}
                                                        title="Cancel / Delete Visit"
                                                        className="action-btn delete-btn"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                                {(isAdmin || (userId && visit.assignedDoctorId === userId)) && (
                                                    <button
                                                        onClick={() => {
                                                            if (visit.status === "Billing") {
                                                                router.push("/dashboard/billing");
                                                            } else {
                                                                router.push(`/dashboard/doctor/consultation/${visit.id}`);
                                                            }
                                                        }}
                                                        style={{
                                                            background: "none",
                                                            border: "1px solid var(--border-color)",
                                                            color: "var(--primary-color)",
                                                            cursor: "pointer",
                                                            padding: "0.3rem 0.75rem",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "0.3rem",
                                                            borderRadius: "var(--radius-sm)",
                                                            fontSize: "0.8rem",
                                                            fontWeight: 500,
                                                            transition: "all var(--transition-fast)",
                                                            position: "relative",
                                                            zIndex: 10
                                                        }}
                                                        className="btn-premium action-btn"
                                                        title="Go to Consultation"
                                                    >
                                                        View <ArrowRight size={14} />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <style jsx>{`
                .delete-btn:hover {
                    color: var(--danger-color) !important;
                    background: rgba(244, 63, 94, 0.1) !important;
                }
                .action-btn {
                    pointer-events: auto !important;
                }
            `}</style>
        </div>
    );
}
