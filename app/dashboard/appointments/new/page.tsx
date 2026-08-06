"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Search } from "lucide-react";
import styles from "./page.module.css";

export default function NewAppointmentPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Data lists
    const [doctors, setDoctors] = useState<any[]>([]);
    const [patientSearch, setPatientSearch] = useState("");
    const [patientResults, setPatientResults] = useState<any[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);

    // Form state
    const [formData, setFormData] = useState({
        doctorId: "",
        date: "",
        time: "",
        duration: "30",
        reason: "",
        notesForStaff: ""
    });

    // Load doctors on mount
    useEffect(() => {
        fetch('/api/users?role=DOCTOR', { credentials: "include" })
            .then(res => res.json())
            .then(data => setDoctors(data || []));
    }, []);

    // Search patients
    useEffect(() => {
        if (patientSearch.length < 2) {
            setPatientResults([]);
            return;
        }
        const delayDebounce = setTimeout(async () => {
            const res = await fetch(`/api/patients?search=${patientSearch}&limit=5`, { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                // /api/patients returns { data: patients[], total, page, ... } — accept both shapes defensively
                const list = Array.isArray(data) ? data : (data.patients ?? data.data ?? []);
                setPatientResults(list);
            }
        }, 400);

        return () => clearTimeout(delayDebounce);
    }, [patientSearch]);

    const selectPatient = (patient: any) => {
        setSelectedPatient(patient);
        setPatientSearch("");
        setPatientResults([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatient) return alert("Please select a patient");

        setIsSubmitting(true);
        try {
            const payload = { ...formData, patientId: selectedPatient.id };
            const res = await fetch("/api/appointments", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                router.push("/dashboard/appointments");
            } else {
                alert("Failed to create appointment");
            }
        } catch (err) { }
        setIsSubmitting(false);
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Link href="/dashboard/appointments" className={styles.backLink}>
                    <ArrowLeft size={16} /> Back to Schedule
                </Link>
                <h1 className={styles.title}>Schedule Appointment</h1>
            </div>

            <div className={`glass-card ${styles.formCard}`}>
                <form onSubmit={handleSubmit} className={styles.formGrid}>

                    <div className={styles.formGroupFull}>
                        <label className={styles.label}>Patient Selection *</label>
                        {!selectedPatient ? (
                            <div className={styles.searchWrapper}>
                                <input
                                    type="text"
                                    className={styles.input}
                                    placeholder="Search patient by name or phone..."
                                    value={patientSearch}
                                    onChange={e => setPatientSearch(e.target.value)}
                                />
                                {patientResults.length > 0 && (
                                    <div className={styles.dropdownBox}>
                                        {patientResults.map(p => (
                                            <div key={p.id} className={styles.patientItem} onClick={() => selectPatient(p)}>
                                                <span className={styles.patientName}>{p.firstName} {p.lastName}</span>
                                                <span className={styles.patientDetails}>{p.patientNumber} • {p.phone}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ padding: "1rem", background: "rgba(16, 185, 129, 0.1)", borderRadius: "var(--radius-md)", display: "flex", justifyContent: "space-between" }}>
                                <div>
                                    <strong>{selectedPatient.firstName} {selectedPatient.lastName}</strong>
                                    <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{selectedPatient.phone}</div>
                                </div>
                                <button type="button" onClick={() => setSelectedPatient(null)} style={{ background: "none", border: "none", color: "var(--danger-color)", cursor: "pointer", fontSize: "0.875rem" }}>
                                    Change
                                </button>
                            </div>
                        )}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Assign Doctor *</label>
                        <select
                            required
                            className={styles.select}
                            value={formData.doctorId}
                            onChange={e => setFormData({ ...formData, doctorId: e.target.value })}
                        >
                            <option value="">Select a Doctor</option>
                            {doctors.map(d => (
                                <option key={d.id} value={d.id}>Dr. {d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.formGroup} style={{ visibility: "hidden" }}></div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Date *</label>
                        <input
                            required
                            type="date"
                            className={styles.input}
                            value={formData.date}
                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Time *</label>
                        <input
                            required
                            type="time"
                            className={styles.input}
                            value={formData.time}
                            onChange={e => setFormData({ ...formData, time: e.target.value })}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Duration (minutes)</label>
                        <select
                            className={styles.select}
                            value={formData.duration}
                            onChange={e => setFormData({ ...formData, duration: e.target.value })}
                        >
                            <option value="15">15 mins</option>
                            <option value="30">30 mins</option>
                            <option value="45">45 mins</option>
                            <option value="60">1 Hour</option>
                        </select>
                    </div>

                    <div className={styles.formGroupFull}>
                        <label className={styles.label}>Reason for Visit *</label>
                        <textarea
                            required
                            className={styles.textarea}
                            placeholder="Brief description of symptoms or reason for visit..."
                            value={formData.reason}
                            onChange={e => setFormData({ ...formData, reason: e.target.value })}
                        />
                    </div>

                    <div className={styles.formActions}>
                        <button type="submit" disabled={isSubmitting || !selectedPatient} className={styles.submitBtn}>
                            <Save size={18} style={{ marginRight: "0.5rem", display: "inline-block", verticalAlign: "middle" }} />
                            {isSubmitting ? "Creating..." : "Schedule Appointment"}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
