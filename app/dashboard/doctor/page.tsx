"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { Users, Calendar, Activity, ArrowRight, PlayCircle, CheckCircle2, X, Eye, Clock } from "lucide-react";
import styles from "./page.module.css";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function DoctorDashboardInner() {
    const { data: session } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [waitingPatients, setWaitingPatients] = useState<any[]>([]);
    const [allWaitingPatients, setAllWaitingPatients] = useState<any[]>([]);
    const [waitingTab, setWaitingTab] = useState<"mine" | "all">("mine");
    const [schedule, setSchedule] = useState<any[]>([]);
    const [completedToday, setCompletedToday] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Read ?completed= and ?next= query params from auto-advance
    const completedName = searchParams.get('completed');
    const nextName = searchParams.get('next');

    useEffect(() => {
        if (completedName) {
            if (nextName) {
                setSuccessMessage(`Consultation completed for ${completedName}. Next: ${nextName}.`);
            } else {
                setSuccessMessage(`Consultation completed for ${completedName}. All caught up!`);
            }
            // Strip the query params so a refresh doesn't re-show
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
            const t = setTimeout(() => setSuccessMessage(null), 6000);
            return () => clearTimeout(t);
        }
    }, [completedName, nextName]);

    const dismissBanner = () => setSuccessMessage(null);

    const fetchData = async () => {
        try {
            const [waitingRes, allWaitingRes, scheduleRes, completedRes] = await Promise.all([
                fetch('/api/doctor/waiting-patients', { credentials: "include" }),
                fetch('/api/doctor/waiting-patients?all=true', { credentials: "include" }),
                fetch('/api/doctor/today-schedule', { credentials: "include" }),
                fetch('/api/doctor/completed-today', { credentials: "include" })
            ]);

            if (waitingRes.ok) setWaitingPatients(await waitingRes.json());
            if (allWaitingRes.ok) setAllWaitingPatients(await allWaitingRes.json());
            if (scheduleRes.ok) setSchedule(await scheduleRes.json());
            if (completedRes.ok) setCompletedToday(await completedRes.json());
        } catch (error) {
            console.error("Error fetching doctor dashboard data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Auto-refresh waiting list every 60 seconds
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, []);

    const startConsultation = (visitId: string) => {
        router.push(`/dashboard/doctor/consultation/${visitId}`);
    };

    const takeAssignment = async (visitId: string) => {
        try {
            const res = await fetch('/api/doctor/take-assignment', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visitId })
            });

            if (res.ok) {
                await fetchData();
                setWaitingTab("mine");
            } else {
                const err = await res.json();
                alert(err.error || "Failed to take assignment");
            }
        } catch (error) {
            console.error("Error taking assignment", error);
            alert("An error occurred. Please try again.");
        }
    };

    const getPriorityClass = (priority: string) => {
        if (priority === 'Urgent') return styles.priorityUrgent;
        if (priority === 'Emergency') return styles.priorityEmergency;
        return styles.priorityNormal;
    };

    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading dashboard...</div>;

    const currentList = waitingTab === "mine" ? waitingPatients : allWaitingPatients;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Welcome, Dr. {session?.user?.name?.split(' ')[0]}</h1>
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

            <div className={styles.statsGrid}>
                <div className={`glass-card ${styles.statCard}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className={styles.statLabel}>My Patients</span>
                        <Users size={20} color="var(--primary-color)" />
                    </div>
                    <span className={styles.statValue}>{waitingPatients.length}</span>
                </div>

                <div className={`glass-card ${styles.statCard}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className={styles.statLabel}>Today's Schedule</span>
                        <Calendar size={20} color="var(--info-color)" />
                    </div>
                    <span className={styles.statValue}>{schedule.length}</span>
                </div>

                <div className={`glass-card ${styles.statCard}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className={styles.statLabel}>Completed Today</span>
                        <Activity size={20} color="var(--success-color)" />
                    </div>
                    <span className={styles.statValue}>{completedToday.length}</span>
                </div>
            </div>

            <div className={styles.mainGrid}>
                {/* Waiting Room List */}
                <div className={styles.sectionCard}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <Users size={18} />
                            Waiting Room
                        </h2>
                    </div>

                    <div className={styles.tabs}>
                        <div 
                            className={`${styles.tab} ${waitingTab === "mine" ? styles.tabActive : ""}`}
                            onClick={() => setWaitingTab("mine")}
                        >
                            Assigned to Me ({waitingPatients.length})
                        </div>
                        <div 
                            className={`${styles.tab} ${waitingTab === "all" ? styles.tabActive : ""}`}
                            onClick={() => setWaitingTab("all")}
                        >
                            All Waiting ({allWaitingPatients.length})
                        </div>
                    </div>

                    <div className={styles.list}>
                        {currentList.length === 0 ? (
                            <div className={styles.emptyState}>No patients currently waiting in this view.</div>
                        ) : (
                            currentList.map((visit) => (
                                <div key={visit.id} className={styles.listItem}>
                                    <div className={styles.patientInfo}>
                                        <div className={styles.patientName}>
                                            {visit.patient?.firstName} {visit.patient?.lastName}
                                            <span className={`${styles.badge} ${getPriorityClass(visit.priority)}`}>
                                                {visit.priority}
                                            </span>
                                            <span style={{
                                                fontSize: "0.7rem",
                                                padding: "0.1rem 0.4rem",
                                                borderRadius: "999px",
                                                background: visit.status === "Triaged" ? "rgba(34,197,94,0.12)" : "rgba(99,102,241,0.12)",
                                                color: visit.status === "Triaged" ? "var(--success-color)" : "var(--primary-color)",
                                                fontWeight: 600,
                                                marginLeft: "0.25rem"
                                            }}>
                                                {visit.status}
                                            </span>
                                            {visit.hasNewLabResults && (
                                                <span style={{
                                                    fontSize: "0.65rem",
                                                    padding: "0.15rem 0.5rem",
                                                    borderRadius: "999px",
                                                    background: "rgba(16,185,129,0.15)",
                                                    color: "#10b981",
                                                    fontWeight: 700,
                                                    marginLeft: "0.25rem",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: "3px"
                                                }}>
                                                    📋 Lab Ready
                                                </span>
                                            )}
                                            {visit.pendingLabCount > 0 && (
                                                <span style={{
                                                    fontSize: "0.65rem",
                                                    padding: "0.15rem 0.5rem",
                                                    borderRadius: "999px",
                                                    background: "rgba(245,158,11,0.15)",
                                                    color: "#f59e0b",
                                                    fontWeight: 600,
                                                    marginLeft: "0.25rem"
                                                }}>
                                                    {visit.pendingLabCount} pending
                                                </span>
                                            )}
                                        </div>
                                        <div className={styles.patientDetails}>
                                            #{visit.patient?.patientNumber} • {visit.type}
                                        </div>
                                        {visit.assignedDoctorId && waitingTab === "all" && (
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                                                Assigned to: {visit.assignedDoctorId === (session?.user as any)?.id ? "Me" : "Another Doctor"}
                                            </div>
                                        )}
                                        {visit.chiefComplaint && (
                                            <div className={styles.reasonText}>"{visit.chiefComplaint}"</div>
                                        )}
                                    </div>
                                    <div className={styles.actionArea}>
                                        <div className={styles.time}>
                                            Since {visit.checkInTime ? formatTime(visit.checkInTime) : "--:--"}
                                        </div>
                                        {visit.assignedDoctorId === (session?.user as any)?.id ? (
                                            // R55b: visit may be in the new-canonical "InConsultation"
                                            // or the legacy "Consultation" status — both mean
                                            // "doctor is mid-consultation, can finish".
                                            (visit.status === "Consultation" || visit.status === "InConsultation") ? (
                                                <button onClick={() => startConsultation(visit.id)} className={styles.resumeBtn}>
                                                    <PlayCircle size={14} />
                                                    Resume / Complete
                                                </button>
                                            ) : (
                                                <button onClick={() => startConsultation(visit.id)} className={styles.startBtn}>
                                                    Start <ArrowRight size={14} />
                                                </button>
                                            )
                                        ) : (
                                            <button onClick={() => takeAssignment(visit.id)} className={styles.takeBtn}>
                                                Take Assignment
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Scheduled Appointments (Today) */}
                <div className={styles.sectionCard}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <Calendar size={18} />
                            Today's Schedule
                        </h2>
                    </div>
                    <div className={styles.list}>
                        {schedule.length === 0 ? (
                            <div className={styles.emptyState}>No scheduled appointments today.</div>
                        ) : (
                            schedule.map((appt) => (
                                <div key={appt.id} className={styles.listItem} style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                                        <div className={styles.patientName}>{appt.patient.firstName} {appt.patient.lastName}</div>
                                        <div className={styles.time}>{formatTime(appt.date)}</div>
                                    </div>
                                    <div className={styles.reasonText} style={{ margin: 0 }}>{appt.reason}</div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                                        Status: {appt.status}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ── Completed Today (R61) ───────────────────────────────
                R61: doctor's "Completed Tasks" list. Visits the doctor
                finished since local midnight, sorted most-recent first.
                The list auto-empties at midnight — the API filters by
                completedTime >= startOfToday, so no cron / cleanup is
                required. Each entry links to the consultation page in
                read-only mode (?readonly=1). */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <CheckCircle2 size={18} />
                        Completed Today
                    </h2>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {completedToday.length === 0
                            ? "Nothing finished yet today."
                            : `Cleared automatically at midnight — ${completedToday.length} task${completedToday.length === 1 ? "" : "s"} so far today.`}
                    </span>
                </div>

                <div className={styles.list}>
                    {completedToday.length === 0 ? (
                        <div className={styles.emptyState}>
                            No completed consultations today. Once you click{" "}
                            <strong>Finish Consultation</strong> on a patient, they'll appear here in read-only mode.
                        </div>
                    ) : (
                        completedToday.map((visit) => {
                            const completedAt = visit.completedTime ? new Date(visit.completedTime) : null;
                            return (
                                <div key={visit.id} className={styles.listItem}>
                                    <div className={styles.patientInfo}>
                                        <div className={styles.patientName}>
                                            {visit.patient?.firstName} {visit.patient?.lastName}
                                            <span style={{
                                                fontSize: "0.7rem",
                                                padding: "0.1rem 0.4rem",
                                                borderRadius: "999px",
                                                background: "rgba(34,197,94,0.12)",
                                                color: "var(--success-color)",
                                                fontWeight: 600,
                                                marginLeft: "0.25rem"
                                            }}>
                                                Finished
                                            </span>
                                            <span style={{
                                                fontSize: "0.7rem",
                                                padding: "0.1rem 0.4rem",
                                                borderRadius: "999px",
                                                background: "rgba(99,102,241,0.12)",
                                                color: "var(--primary-color)",
                                                fontWeight: 600,
                                                marginLeft: "0.25rem"
                                            }}>
                                                {visit.status}
                                            </span>
                                        </div>
                                        <div className={styles.patientDetails}>
                                            #{visit.patient?.patientNumber} • {visit.visitNumber} • {visit.type}
                                        </div>
                                        {visit.chiefComplaint && (
                                            <div className={styles.reasonText}>"{visit.chiefComplaint}"</div>
                                        )}
                                    </div>
                                    <div className={styles.actionArea}>
                                        <div className={styles.time}>
                                            <Clock size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
                                            {completedAt ? formatTime(completedAt.toISOString()) : "--:--"}
                                        </div>
                                        <Link
                                            href={`/dashboard/doctor/consultation/${visit.id}?readonly=1`}
                                            className={styles.startBtn}
                                        >
                                            <Eye size={14} />
                                            View
                                        </Link>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

export default function DoctorDashboard() {
    return (
        <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading dashboard...</div>}>
            <DoctorDashboardInner />
        </Suspense>
    );
}
