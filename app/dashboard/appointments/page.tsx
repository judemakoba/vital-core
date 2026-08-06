"use client";

import { useState, useEffect } from "react";
import { Plus, CheckCircle, XCircle } from "lucide-react";
import styles from "./page.module.css";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface Appointment {
    id: string;
    date: string;
    duration: number;
    reason: string;
    status: string;
    patient: {
        firstName: string;
        lastName: string;
        phone: string;
    };
    doctor: {
        name: string;
    };
}

export default function AppointmentsPage() {
    const { data: session } = useSession();
    const isAdmin = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN" || session?.user?.role === "RECEPTIONIST";

    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]); // Today YYYY-MM-DD
    const [doctorFilter, setDoctorFilter] = useState("all");

    const [doctors, setDoctors] = useState<{ id: string, name: string }[]>([]);

    useEffect(() => {
        // Fetch doctors for filter dropdown
        fetch('/api/users?role=DOCTOR', { credentials: "include" })
            .then(res => res.json())
            .then(data => setDoctors(data || []))
            .catch(err => console.error("Failed to load doctors", err));
    }, []);

    const fetchAppointments = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/appointments?date=${dateFilter}&doctorId=${doctorFilter}`, { credentials: "include" });
            if (res.ok) {
                setAppointments(await res.json());
            }
        } catch (err) {
            console.error("Failed to fetch appts", err);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAppointments();
    }, [dateFilter, doctorFilter]);

    const handleCheckIn = async (id: string) => {
        if (!confirm("Check-in this patient? A Visit will be created.")) return;
        try {
            const res = await fetch(`/api/appointments/${id}/check-in`, {
                method: "POST",
                credentials: "include",
            });
            if (res.ok) {
                fetchAppointments();
            } else {
                const errBody = await res.json().catch(() => ({}));
                alert(errBody.error || `Check-in failed (${res.status})`);
            }
        } catch (err) {
            console.error("Check-in error:", err);
            alert("Check-in failed — see console for details.");
        }
    };

    const getStatusClass = (status: string) => {
        switch (status) {
            case 'Pending': return styles.statusPending;
            case 'Checked-In': return styles.statusCheckedIn;
            case 'Completed': return styles.statusCompleted;
            default: return styles.statusCancelled;
        }
    };

    // Time formatter
    const formatTime = (isoStr: string) => {
        return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Appointments</h1>
                <Link href="/dashboard/appointments/new" className={styles.addBtn}>
                    <Plus size={18} /> Schedule Appointment
                </Link>
            </div>

            <div className={`glass-card ${styles.controls}`}>
                <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className={styles.datePicker}
                />

                {isAdmin && (
                    <select
                        className={styles.filterSelect}
                        value={doctorFilter}
                        onChange={(e) => setDoctorFilter(e.target.value)}
                    >
                        <option value="all">All Doctors</option>
                        {doctors.map(d => (
                            <option key={d.id} value={d.id}>Dr. {d.name}</option>
                        ))}
                    </select>
                )}
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Time</th>
                            <th className={styles.th}>Patient</th>
                            <th className={styles.th}>Doctor</th>
                            <th className={styles.th}>Reason</th>
                            <th className={styles.th}>Status</th>
                            <th className={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem" }}>
                                    Loading schedule...
                                </td>
                            </tr>
                        ) : appointments.length === 0 ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                    No appointments found for this date.
                                </td>
                            </tr>
                        ) : (
                            appointments.map(appt => (
                                <tr key={appt.id} className={styles.tr}>
                                    <td className={styles.td} style={{ fontWeight: 600 }}>
                                        {formatTime(appt.date)}
                                        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 400 }}>
                                            {appt.duration} min
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                                            {appt.patient.firstName} {appt.patient.lastName}
                                        </div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{appt.patient.phone}</div>
                                    </td>
                                    <td className={styles.td}>Dr. {appt.doctor.name}</td>
                                    <td className={styles.td}>
                                        {appt.reason.length > 30 ? appt.reason.substring(0, 30) + '...' : appt.reason}
                                    </td>
                                    <td className={styles.td}>
                                        <span className={`${styles.badge} ${getStatusClass(appt.status)}`}>
                                            {appt.status}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        {appt.status === "Pending" && (
                                            <button
                                                onClick={() => handleCheckIn(appt.id)}
                                                className={styles.checkInBtn}
                                                title="Check-In Patient"
                                            >
                                                Check-in
                                            </button>
                                        )}
                                        {(appt.status !== "Cancelled" && appt.status !== "Completed" && appt.status !== "Checked-In") && (
                                            <button className={styles.actionBtn} title="Cancel">
                                                <XCircle size={18} />
                                            </button>
                                        )}
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
