"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Activity, Thermometer, Scale, Ruler } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

export default function TriageCapturePage({ params }: { params: { visitId: string } }) {
    const router = useRouter();
    const [visit, setVisit] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [vitals, setVitals] = useState({
        bloodPressure: "",
        heartRate: "",
        temperature: "",
        weight: "",
        height: "",
        priority: "Normal"
    });

    useEffect(() => {
        fetch(`/api/visits/${params.visitId}`, { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    console.error("API error:", data.error);
                    setLoading(false);
                    return;
                }
                setVisit(data);
                if (data.bloodPressure) {
                    setVitals({
                        bloodPressure: data.bloodPressure || "",
                        heartRate: data.heartRate || "",
                        temperature: data.temperature || "",
                        weight: data.weight?.toString() || "",
                        height: data.height?.toString() || "",
                        priority: data.priority || "Normal"
                    });
                }
            })
            .catch(err => console.error("Failed to fetch visit", err))
            .finally(() => setLoading(false));
    }, [params.visitId]);

    // Auto-calculate BMI whenever weight or height changes
    const bmi = useMemo(() => {
        const w = parseFloat(vitals.weight);
        const h = parseFloat(vitals.height);
        if (w > 0 && h > 0) {
            const bmiVal = w / Math.pow(h / 100, 2);
            return Number.isFinite(bmiVal) ? bmiVal.toFixed(1) : null;
        }
        return null;
    }, [vitals.weight, vitals.height]);

    const bmiCategory = useMemo(() => {
        if (!bmi) return null;
        const v = parseFloat(bmi);
        if (v < 18.5) return { label: "Underweight", color: "#f59e0b" };
        if (v < 25) return { label: "Normal", color: "#22c55e" };
        if (v < 30) return { label: "Overweight", color: "#f59e0b" };
        return { label: "Obese", color: "#ef4444" };
    }, [bmi]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const res = await fetch(`/api/visits/${params.visitId}/triage`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(vitals)
            });

            if (res.ok) {
                // Auto-advance to the next patient waiting in the triage queue.
                // If the queue is empty, fall back to the triage list with a
                // "completed" flash so the user knows it worked.
                const completedName = visit?.patient
                    ? `${visit.patient.firstName} ${visit.patient.lastName}`.trim()
                    : null;
                try {
                    const qRes = await fetch('/api/triage/waiting', { credentials: 'include' });
                    if (qRes.ok) {
                        const waiting = await qRes.json();
                        // Filter out the visit we just completed (it may still be in the
                        // list briefly before the next refresh hits the DB)
                        const next = (waiting || []).find((v: any) => v.id !== params.visitId);
                        if (next) {
                            const flash = completedName
                                ? `?completed=${encodeURIComponent(completedName)}&next=${encodeURIComponent(`${next.patient.firstName} ${next.patient.lastName}`.trim())}`
                                : '';
                            router.push(`/dashboard/triage/${next.id}${flash}`);
                            return;
                        }
                    }
                } catch (e) {
                    console.warn('Could not fetch next-in-queue', e);
                }
                // No more patients — go to list with a "all done" flash
                const flash = completedName
                    ? `?completed=${encodeURIComponent(completedName)}`
                    : '';
                router.push(`/dashboard/triage${flash}`);
            } else {
                alert("Failed to save triage data");
            }
        } catch (err) {
            alert("Error saving triage data");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading patient data...</div>;
    if (!visit) return <div style={{ padding: "2rem", textAlign: "center" }}>Visit not found.</div>;

    return (
        <div className="container">
            <div style={{ marginBottom: "1.5rem" }}>
                <Link href="/dashboard/triage" style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    <ArrowLeft size={16} /> Back to Queue
                </Link>
            </div>

            <div className={`glass-card ${styles.formCard}`}>
                <div className={styles.patientHeader}>
                    <div className={styles.patientInfo}>
                        <h2>{visit?.patient?.firstName} {visit?.patient?.lastName}</h2>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                            {visit?.patient?.patientNumber} &bull; {visit?.type} &bull; {visit?.doctor ? `Dr. ${visit.doctor.name}` : "No Doctor Assigned"}
                        </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Visit Number</div>
                        <div style={{ fontWeight: 700, color: "var(--primary-color)" }}>{visit?.visitNumber}</div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                    {/* Vital Signs Grid */}
                    <div className={styles.vitalGrid}>
                        <div className={styles.vitalInput}>
                            <label>Blood Pressure</label>
                            <div className={styles.inputWrapper}>
                                <input
                                    type="text"
                                    placeholder="120/80"
                                    value={vitals.bloodPressure}
                                    onChange={(e) => setVitals({ ...vitals, bloodPressure: e.target.value })}
                                    required
                                />
                                <span className={styles.unit}>mmHg</span>
                            </div>
                        </div>

                        <div className={styles.vitalInput}>
                            <label>Heart Rate</label>
                            <div className={styles.inputWrapper}>
                                <input
                                    type="text"
                                    placeholder="72"
                                    value={vitals.heartRate}
                                    onChange={(e) => setVitals({ ...vitals, heartRate: e.target.value })}
                                    required
                                />
                                <span className={styles.unit}>bpm</span>
                            </div>
                        </div>

                        <div className={styles.vitalInput}>
                            <label>Temperature</label>
                            <div className={styles.inputWrapper}>
                                <input
                                    type="text"
                                    placeholder="36.5"
                                    value={vitals.temperature}
                                    onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })}
                                    required
                                />
                                <span className={styles.unit}>°C</span>
                            </div>
                        </div>

                        <div className={styles.vitalInput}>
                            <label>Weight</label>
                            <div className={styles.inputWrapper}>
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="70.0"
                                    value={vitals.weight}
                                    onChange={(e) => setVitals({ ...vitals, weight: e.target.value })}
                                />
                                <span className={styles.unit}>kg</span>
                            </div>
                        </div>

                        <div className={styles.vitalInput}>
                            <label>Height</label>
                            <div className={styles.inputWrapper}>
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="170.0"
                                    value={vitals.height}
                                    onChange={(e) => setVitals({ ...vitals, height: e.target.value })}
                                />
                                <span className={styles.unit}>cm</span>
                            </div>
                        </div>
                    </div>

                    {/* BMI Display */}
                    {bmi && (
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "1rem",
                            padding: "0.875rem 1.25rem",
                            background: "rgba(255,255,255,0.03)",
                            border: `1px solid ${bmiCategory ? `${bmiCategory.color}30` : "var(--border-color)"}`,
                            borderRadius: "var(--radius-md)",
                        }}>
                            <Activity size={18} color="var(--primary-color)" />
                            <div style={{ flex: 1 }}>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    Body Mass Index (BMI)
                                </span>
                                <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginTop: "2px" }}>
                                    <span style={{ fontSize: "1.5rem", fontWeight: 800, color: bmiCategory?.color || "var(--text-primary)" }}>
                                        {bmi}
                                    </span>
                                    {bmiCategory && (
                                        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: bmiCategory.color }}>
                                            {bmiCategory.label}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                {vitals.weight} kg &divide; ({vitals.height} cm)<sup>2</sup>
                            </div>
                        </div>
                    )}

                    <div>
                        <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.75rem", display: "block" }}>
                            Priority Level
                        </label>
                        <div className={styles.priorityGroup}>
                            {["Normal", "Urgent", "Emergency"].map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    className={`${styles.priorityBtn} ${vitals.priority === p ? styles.active : ""}`}
                                    data-priority={p}
                                    onClick={() => setVitals({ ...vitals, priority: p })}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => router.back()}
                            style={{ padding: "0.75rem 1.75rem" }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            style={{
                                padding: "0.75rem 2rem",
                                background: "var(--primary-color)",
                                color: "white",
                                border: "none",
                                borderRadius: "var(--radius-md)",
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                cursor: "pointer"
                            }}
                        >
                            <Save size={18} />
                            {submitting ? "Saving..." : "Save & Complete Triage"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
