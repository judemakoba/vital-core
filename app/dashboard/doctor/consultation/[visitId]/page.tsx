"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import styles from "./page.module.css";

interface Diagnosis {
    id: string;
    name: string;
    code: string;
    icdVersion?: string;
}

interface Prescription {
    id: string;
    medicationName: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    quantity: number;
}

interface Visit {
    id: string;
    patient: {
        id: string;
        firstName: string;
        lastName: string;
        dateOfBirth: string;
        gender: string;
        bloodGroup: string;
        allergies?: string;
    };
    bloodPressure: string;
    heartRate: string;
    temperature: string;
    weight: number;
    height: number;
    subjective: string;
    objective: string;
    assessment: string;
    treatmentPlan: string;
    diagnoses: Diagnosis[];
    prescriptions: Prescription[];
    labOrders: any[];
    radiologyOrders: any[];
    visitNumber: string;
    priority: string;
}

export default function ConsultationPage({ params }: { params: { visitId: string } }) {
    const router = useRouter();
    const { data: session, status: sessionStatus } = useSession();
    const [activeTab, setActiveTab] = useState("notes");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
    // Keep a ref to notes so setTimeout always reads the current value, not a stale closure.
    // Initialized to null; synced in the useEffect below.
    const notesRef = useRef<{ subjective: string; objective: string; assessment: string; treatmentPlan: string } | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [labCatalog, setLabCatalog] = useState<any[]>([]);
    const [selectedTestId, setSelectedTestId] = useState("");
    const [labSearchQuery, setLabSearchQuery] = useState("");
    const [showLabDropdown, setShowLabDropdown] = useState(false);
    const [labError, setLabError] = useState("");

    // Radiology state
    const [radiologyCatalog, setRadiologyCatalog] = useState<any[]>([]);
    const [selectedExamId, setSelectedExamId] = useState("");
    const [radiologySearchQuery, setRadiologySearchQuery] = useState("");
    const [showRadiologyDropdown, setShowRadiologyDropdown] = useState(false);
    const [radiologyError, setRadiologyError] = useState("");

    const [currency, setCurrency] = useState("UGX"); // Default fallback
    const [confirmingId, setConfirmingId] = useState<string | null>(null);

    const [visit, setVisit] = useState<Visit | null>(null);
    const [patientInsurance, setPatientInsurance] = useState<any>(null);
    const [auths, setAuths] = useState<any[]>([]);
    const [requestingAuth, setRequestingAuth] = useState(false);
    const [authServiceName, setAuthServiceName] = useState("");
    const [authEstCost, setAuthEstCost] = useState("");
    // sidebar card stays hidden even if the patient has an active
    // enrollment on file. Insurance fetches are skipped.
    useEffect(() => {
    }, []);

    // Admit Patient State
    const [showAdmitModal, setShowAdmitModal] = useState(false);
    const [admitting, setAdmitting] = useState(false);
    const [wards, setWards] = useState<any[]>([]);
    const [admitForm, setAdmitForm] = useState({
        type: 'EMERGENCY',
        wardId: '',
        bedId: '',
    });

    const openAdmitModal = async () => {
        setShowAdmitModal(true);
        try {
            const res = await fetch('/api/ipd/wards', { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setWards(data);
            }
        } catch (e) {
            console.error("Failed to fetch wards", e);
        }
    };

    const handleAdmit = async () => {
        setAdmitting(true);
        try {
            const res = await fetch('/api/ipd/admissions', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientId: visit?.patient.id,
                    visitId: params.visitId,
                    type: admitForm.type,
                    wardId: admitForm.wardId || undefined,
                    bedId: admitForm.bedId || undefined,
                })
            });
            if (res.ok) {
                alert("Patient successfully admitted to IPD.");
                setShowAdmitModal(false);
            } else {
                const err = await res.json();
                alert(`Error admitting patient: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("An error occurred during admission.");
        } finally {
            setAdmitting(false);
        }
    };

    const [notes, setNotes] = useState({
        subjective: "",
        objective: "",
        assessment: "",
        treatmentPlan: ""
    });

    // Keep notesRef in sync with notes state — so the autoSave setTimeout always reads fresh values
    useEffect(() => {
        notesRef.current = notes;
    }, [notes]);

    const [icdSearchQuery, setIcdSearchQuery] = useState("");
    const [icdResults, setIcdResults] = useState<any[]>([]);
    const [showIcdDropdown, setShowIcdDropdown] = useState(false);
    const [selectedIcdCode, setSelectedIcdCode] = useState("");

    // Fetch ICD codes
    useEffect(() => {
        if (icdSearchQuery.length > 1) {
            const fetchIcd = async () => {
                try {
                    const res = await fetch(`/api/doctor/icd?search=${encodeURIComponent(icdSearchQuery)}&version=ICD-11`, { credentials: "include" });
                    if (res.ok) {
                        const data = await res.json();
                        setIcdResults(data);
                    }
                } catch (err) {
                    console.error("Failed to fetch ICD codes", err);
                }
            };
            const timer = setTimeout(fetchIcd, 300);
            return () => clearTimeout(timer);
        } else {
            setIcdResults([]);
        }
    }, [icdSearchQuery]);

    useEffect(() => {
        const fetchVisit = async () => {
            try {
                const res = await fetch(`/api/doctor/consultation/${params.visitId}`, { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();

                    // ── Access Control ──────────────────────────────────────
                    const userId = (session?.user as any)?.id;
                    const userRole = (session?.user as any)?.role;
                    const isAdminRole = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
                    const isAssignedDoctor = userId && data.assignedDoctorId === userId;

                    if (!isAdminRole && !isAssignedDoctor) {
                        setAccessDenied(true);
                        setTimeout(() => router.push("/dashboard"), 3000);
                        return;
                    }
                    // ────────────────────────────────────────────────────────

                    setVisit(data);
                    setNotes({
                        subjective: data.subjective || "",
                        objective: data.objective || "",
                        assessment: data.assessment || "",
                        treatmentPlan: data.treatmentPlan || ""
                    });

                    // Fetch insurance + existing auths — only when the
                    // feature is enabled. When OFF the patient detail
                    // is enough for the doctor to treat the visit as cash.
                    if (insuranceEnabled) {
                        fetch(`/api/patients/${data.patient.id}/insurance`, { credentials: "include" })
                            .then(r => r.ok ? r.json() : [])
                            .then(ins => {
                                const active = ins.find((i: any) => i.isActive);
                                if (active) setPatientInsurance(active);
                            });

                        // Fetch existing auths for this patient
                        fetch(`/api/admin/insurance/authorizations?patientId=${data.patient.id}`, { credentials: "include" })
                            .then(r => r.ok ? r.json() : [])
                            .then(data => setAuths(data));
                    }
                } else {
                    router.push("/dashboard/doctor");
                }
            } catch (err) {
                console.error("Failed to fetch visit details", err);
            } finally {
                setLoading(false);
            }
        };

        const fetchLabCatalog = async () => {
            try {
                const res = await fetch('/api/lab/catalog', { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    setLabCatalog(data.filter((t: any) => t.isActive));
                }
            } catch (err) {
                console.error("Failed to fetch lab catalog");
            }
        };

        const fetchRadiologyCatalog = async () => {
            try {
                const res = await fetch('/api/radiology/catalog', { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    setRadiologyCatalog(data);
                }
            } catch (err) {
                console.error("Failed to fetch radiology catalog");
            }
        };

        const fetchSystemSettings = async () => {
            try {
                const res = await fetch("/api/admin/settings", { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    if (data.currency) setCurrency(data.currency);
                }
            } catch (err) {
                console.error("Failed to load settings", err);
            }
        };

        // Only run once session has resolved — avoids race conditions
        if (sessionStatus === "loading") return;
        fetchVisit();
        fetchLabCatalog();
        fetchRadiologyCatalog();
        fetchSystemSettings();
    }, [params.visitId, router, session, sessionStatus]);

    const handleSave = async (complete: boolean = false) => {
        setSaving(true);
        try {
            const res = await fetch(`/api/doctor/consultation/${params.visitId}`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...notes,
                    // When finishing, the server decides the next status based on
                    // pending lab/radiology/pharmacy orders:
                    //   pending lab        → Laboratory
                    //   pending radiology  → Radiology
                    //   pending pharmacy   → Pharmacy
                    //   nothing pending    → FinalBilling
                    // Sending `finishing: true` signals this without the client having
                    // to know the order priorities.
                    ...(complete ? { finishing: true } : { status: "Consultation" })
                })
            });

            if (res.ok) {
                setLastSaved(new Date());
                setIsDirty(false);
                if (complete) {
                    // Auto-advance to the next patient waiting for this doctor.
                    // If the queue is empty, fall back to the doctor list with a
                    // "completed" flash so the user knows it worked.
                    const completedName = visit?.patient
                        ? `${visit.patient.firstName} ${visit.patient.lastName}`.trim()
                        : null;
                    try {
                        const qRes = await fetch('/api/doctor/waiting-patients', { credentials: 'include' });
                        if (qRes.ok) {
                            const waiting = await qRes.json();
                            const next = (waiting || []).find((v: any) => v.id !== params.visitId);
                            if (next) {
                                const flash = completedName
                                    ? `?completed=${encodeURIComponent(completedName)}&next=${encodeURIComponent(`${next.patient.firstName} ${next.patient.lastName}`.trim())}`
                                    : '';
                                router.push(`/dashboard/doctor/consultation/${next.id}${flash}`);
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
                    router.push(`/dashboard/doctor${flash}`);
                }
            }
        } catch (err) {
            console.error("Failed to save consultation", err);
        } finally {
            setSaving(false);
        }
    };

    // Debounced auto-save: fires 2s after the last note change
    // Uses notesRef to avoid stale closures — the setTimeout always reads current notes
    const autoSave = useCallback(() => {
        if (!isDirty) return;
        // Only auto-save while visit is still in the consultation phase. Once it has
        // been pushed to Pharmacy / Lab / Radiology the API will 400 the save (correct
        // behaviour to prevent regressing the visit status). The Finish Consultation
        // button handles the close path.
        const currentVisitStatus = visit?.status;
        if (currentVisitStatus && !["Triaged", "Consultation"].includes(currentVisitStatus)) {
            return;
        }
        const currentNotes = notesRef.current;
        setSaving(true);
        fetch(`/api/doctor/consultation/${params.visitId}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...currentNotes, status: "Consultation" })
        })
            .then(res => {
                if (res.ok) {
                    setLastSaved(new Date());
                    setIsDirty(false);
                }
            })
            .catch(err => console.error("Auto-save failed:", err))
            .finally(() => setSaving(false));
    }, [isDirty, params.visitId, visit?.status]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isDirty) return;
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(autoSave, 2000);
        return () => {
            if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        };
    }, [notes, autoSave]);

    const calculateAge = (dob: string) => {
        return new Date().getFullYear() - new Date(dob).getFullYear();
    };

    const handleCancelLabOrder = async (id: string) => {
        try {
            const res = await fetch(`/api/lab/orders/${id}`, { method: "DELETE", credentials: "include" });
            if (res.ok) {
                setVisit(prev => prev ? {
                    ...prev,
                    labOrders: prev.labOrders.filter(o => o.id !== id)
                } : null);
                setConfirmingId(null);
            } else {
                alert("Failed to cancel lab order.");
            }
        } catch (err) {
            console.error("Error cancelling lab order:", err);
        }
    };

    const handleCancelRadiologyOrder = async (id: string) => {
        try {
            const res = await fetch(`/api/radiology/orders/${id}`, { method: "DELETE", credentials: "include" });
            if (res.ok) {
                setVisit(prev => prev ? {
                    ...prev,
                    radiologyOrders: prev.radiologyOrders.filter(o => o.id !== id)
                } : null);
                setConfirmingId(null);
            } else {
                const data = await res.json();
                alert(`Failed to cancel radiology order: ${data.error || "Unknown error"}`);
            }
        } catch (err) {
            console.error("Error cancelling radiology order:", err);
            alert("An error occurred while cancelling the radiology order.");
        }
    };



    const handleCancelPrescription = async (id: string) => {
        console.log("handleCancelPrescription execution for ID:", id);
        try {
            const res = await fetch(`/api/doctor/consultation/${params.visitId}/prescriptions/${id}`, { method: "DELETE", credentials: "include" });
            if (res.ok) {
                setVisit(prev => prev ? {
                    ...prev,
                    prescriptions: prev.prescriptions.filter(p => p.id !== id)
                } : null);
                setConfirmingId(null);
            } else {
                const data = await res.json();
                alert(`Failed to cancel prescription: ${data.error || "Unknown error"}`);
            }
        } catch (err) {
            console.error("Error cancelling prescription:", err);
            alert("An error occurred while cancelling the prescription.");
        }
    };

    const handleRemoveDiagnosis = async (id: string) => {
        try {
            const res = await fetch(`/api/doctor/consultation/${params.visitId}/diagnosis/${id}`, { method: "DELETE", credentials: "include" });
            if (res.ok) {
                setVisit(prev => prev ? {
                    ...prev,
                    diagnoses: prev.diagnoses.filter(d => d.id !== id)
                } : null);
                setConfirmingId(null);
            } else {
                alert("Failed to remove diagnosis.");
            }
        } catch (err) {
            console.error("Error removing diagnosis:", err);
        }
    };

    if (loading || sessionStatus === "loading") return <div style={{ padding: "2rem", textAlign: "center" }}>Loading Consultation...</div>;

    if (accessDenied) return (
        <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: "60vh", gap: "1.5rem", textAlign: "center"
        }}>
            <div style={{
                width: 72, height: 72, borderRadius: "50%", background: "rgba(239,68,68,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center"
            }}>
                <Lock size={36} color="var(--danger-color, #ef4444)" />
            </div>
            <div>
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                                {patientInsurance.insurance.name} — {patientInsurance.package?.name || "Base Plan"}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                                <input
                                    type="text"
                                    className={styles.input}
                                    style={{ fontSize: "0.85rem", padding: "0.5rem" }}
                                    placeholder="Service Name (e.g. MRI Scan)"
                                    value={authServiceName}
                                    onChange={e => setAuthServiceName(e.target.value)}
                                />
                                <input
                                    type="number"
                                    className={styles.input}
                                    style={{ fontSize: "0.85rem", padding: "0.5rem" }}
                                    placeholder="Est. Cost (UGX)"
                                    value={authEstCost}
                                    onChange={e => setAuthEstCost(e.target.value)}
                                />
                                <button
                                    className="btn-secondary"
                                    style={{ fontSize: "0.85rem", padding: "0.5rem", justifyContent: "center" }}
                                    disabled={!authServiceName || !authEstCost || requestingAuth}
                                    onClick={async () => {
                                        setRequestingAuth(true);
                                        const res = await
                                        if (res.ok) {
                                            const newA = await res.json();
                                            setAuths([newA, ...auths]);
                                            setAuthServiceName("");
                                            setAuthEstCost("");
                                        }
                                        setRequestingAuth(false);
                                    }}
                                >
                                    {requestingAuth ? "Submitting..." : "Submit Request"}
                                </button>
                            </div>

                            <div className={styles.list} style={{ gap: "0.5rem", maxHeight: "200px", overflowY: "auto" }}>
                                {auths.map(a => (
                                    <div key={a.id} style={{ background: "rgba(0,0,0,0.02)", padding: "0.5rem", borderRadius: "6px", fontSize: "0.8rem" }}>
                                        <div style={{ fontWeight: 600 }}>{a.serviceName}</div>
                                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                                            <span>{a.status}</span>
                                            <span style={{ fontWeight: 600, color: a.status === 'APPROVED' ? '#16a34a' : a.status === 'REJECTED' ? '#dc2626' : 'inherit' }}>
                                                {a.status === 'APPROVED' && a.authorizationCode ? a.authorizationCode : a.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className={styles.sidebarCard}>
                        <h2 className={styles.sidebarTitle}>
                            <History size={18} style={{ marginRight: "8px", verticalAlign: "middle" }} />
                            Quick History
                        </h2>
                        <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                            No previous visits found for this patient.
                        </div>
                    </div>
                </aside>
            </div>

            {/* Admit Patient Modal */}
            {showAdmitModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#fff', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '500px' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Bed size={20} color="#6366f1" />
                            Admit Patient to IPD
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Admission Type</label>
                                <select 
                                    className={styles.input} 
                                    value={admitForm.type}
                                    onChange={e => setAdmitForm({ ...admitForm, type: e.target.value })}
                                >
                                    <option value="EMERGENCY">Emergency</option>
                                    <option value="ELECTIVE">Elective</option>
                                    <option value="URGENT">Urgent</option>
                                    <option value="TRANSFER">Transfer</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Select Ward</label>
                                <select 
                                    className={styles.input} 
                                    value={admitForm.wardId}
                                    onChange={e => setAdmitForm({ ...admitForm, wardId: e.target.value, bedId: '' })}
                                >
                                    <option value="">-- Choose Ward (Optional) --</option>
                                    {wards.map(w => (
                                        <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
                                    ))}
                                </select>
                            </div>
                            {admitForm.wardId && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Select Bed</label>
                                    <select 
                                        className={styles.input} 
                                        value={admitForm.bedId}
                                        onChange={e => setAdmitForm({ ...admitForm, bedId: e.target.value })}
                                    >
                                        <option value="">-- Choose Bed (Optional) --</option>
                                        {wards.find(w => w.id === admitForm.wardId)?.beds?.filter((b: any) => b.status === 'AVAILABLE').map((b: any) => (
                                            <option key={b.id} value={b.id}>{b.bedNumber} ({b.type})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                            <button type="button" className={styles.cancelButton} onClick={() => setShowAdmitModal(false)} disabled={admitting}>Cancel</button>
                            <button type="button" className={styles.saveBtn} onClick={handleAdmit} disabled={admitting}>
                                {admitting ? 'Admitting...' : 'Confirm Admission'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────
// Frequency → daily-dose mapping (standard medical abbreviations)
// ──────────────────────────────────────────────────────────────────
const FREQUENCIES: { label: string; value: string; timesPerDay: number }[] = [
    { label: 'OD – Once Daily',           value: 'OD',   timesPerDay: 1 },
    { label: 'BD – Twice Daily',          value: 'BD',   timesPerDay: 2 },
    { label: 'TDS – Three Times Daily',   value: 'TDS',  timesPerDay: 3 },
    { label: 'QID – Four Times Daily',    value: 'QID',  timesPerDay: 4 },
    { label: 'Q4H – Every 4 Hours',       value: 'Q4H',  timesPerDay: 6 },
    { label: 'Q6H – Every 6 Hours',       value: 'Q6H',  timesPerDay: 4 },
    { label: 'Q8H – Every 8 Hours',       value: 'Q8H',  timesPerDay: 3 },
    { label: 'Q12H – Every 12 Hours',     value: 'Q12H', timesPerDay: 2 },
    { label: 'NOCTE – At Night',          value: 'NOCTE',timesPerDay: 1 },
    { label: 'MANE – In the Morning',     value: 'MANE', timesPerDay: 1 },
    { label: 'SOS – When Required',       value: 'SOS',  timesPerDay: 1 },
    { label: 'STAT – Immediately (Once)', value: 'STAT', timesPerDay: 1 },
];

function calcTotalQty(freqValue: string, durationDays: number): number {
    const match = FREQUENCIES.find(f => f.value === freqValue);
    const timesPerDay = (match?.timesPerDay) ?? 1;
    const days = Number.isFinite(durationDays) ? durationDays : 7;
    return timesPerDay * Math.max(1, days);
}

/** Parse "500mg" → { amount: 500, unit: "mg" } — returns null if unparseable */
function parseDosage(dosage: string): { doseAmount: number | null; doseUnit: string | null } {
    const match = dosage.match(/^([\d.]+)\s*([a-zA-Z%\/]+)$/);
    if (match) {
        const parsed = parseFloat(match[1]);
        // Guard: parseFloat("") = NaN, parseFloat("abc") = NaN
        return { doseAmount: Number.isFinite(parsed) ? parsed : null, doseUnit: match[2] };
    }
    return { doseAmount: null, doseUnit: null };
}

interface PrescriptionFormProps {
    visitId: string;
    patientId: string;
    prescriptions: Prescription[];
    confirmingId: string | null;
    setConfirmingId: (id: string | null) => void;
    onAdd: (p: Prescription) => void;
    onCancel: (id: string) => void;
}

function PrescriptionForm({
    visitId, patientId, prescriptions,
    confirmingId, setConfirmingId, onAdd, onCancel
}: PrescriptionFormProps) {
    const [form, setForm] = useState({
        medicationName: '',
        dosage: '500mg',
        frequency: 'TDS',
        durationDays: 7,
        instructions: ''
    });
    const [submitting, setSubmitting] = useState(false);

    const totalQty = calcTotalQty(form.frequency, form.durationDays);
    const freqMeta = FREQUENCIES.find(f => f.value === form.frequency);

    const handleSubmit = async () => {
        if (!form.medicationName.trim()) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/doctor/consultation/${visitId}/prescriptions`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    medicationName: form.medicationName,
                    dosage: form.dosage,
                    frequency: form.frequency,
                    durationDays: form.durationDays,
                    quantity: totalQty,
                    instructions: form.instructions,
                    patientId,
                    // Structured dose fields for auto-quantity calculation
                    ...parseDosage(form.dosage),
                    frequencyPerDay: freqMeta?.timesPerDay ?? 1,
                    isManualQuantity: false,
                })
            });
            if (res.ok) {
                const data = await res.json();
                // API returns { prescription, formularyDrug }; unwrap to get the prescription
                const newP: Prescription = (data && data.prescription) ? data.prescription : data;
                onAdd(newP);
                setForm({ medicationName: '', dosage: '500mg', frequency: 'TDS', durationDays: 7, instructions: '' });
            } else {
                const err = await res.json();
                alert(`Error: ${err.error || 'Failed to prescribe'}`);
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* ── Form ── */}
            <div style={{ background: 'var(--bg-secondary, #f8fafc)', borderRadius: '10px', padding: '1.25rem', border: '1px solid var(--border-color, #e5e7eb)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary, #4b5563)' }}>Medication Name</label>
                        <input
                            className={styles.input}
                            placeholder="e.g. Paracetamol, Amoxicillin"
                            value={form.medicationName}
                            onChange={e => setForm({ ...form, medicationName: e.target.value })}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary, #4b5563)' }}>Dosage / Strength</label>
                        <input
                            className={styles.input}
                            placeholder="500mg"
                            value={form.dosage}
                            onChange={e => setForm({ ...form, dosage: e.target.value })}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary, #4b5563)' }}>Frequency</label>
                        <select
                            className={styles.input}
                            value={form.frequency}
                            onChange={e => setForm({ ...form, frequency: e.target.value })}
                        >
                            {FREQUENCIES.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary, #4b5563)' }}>Duration (Days)</label>
                        <input
                            type="number"
                            className={styles.input}
                            min={1}
                            value={form.durationDays}
                            onChange={e => setForm({ ...form, durationDays: parseInt(e.target.value) || 1 })}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary, #4b5563)' }}>Instructions (Optional)</label>
                    <input
                        className={styles.input}
                        placeholder="e.g. Take after meals, with plenty of water"
                        value={form.instructions}
                        onChange={e => setForm({ ...form, instructions: e.target.value })}
                    />
                </div>

                <button
                    className={styles.saveBtn}
                    style={{ width: '100%', justifyContent: 'center', height: '44px' }}
                    disabled={submitting || !form.medicationName.trim()}
                    onClick={handleSubmit}
                >
                    {submitting ? 'Adding...' : 'Prescribe'}
                </button>
            </div>

            {/* ── List ── */}
            <div className={styles.list}>
                {prescriptions.map((p) => (
                    <div key={p.id} className={styles.listItem} style={{
                        padding: '0.85rem 0', borderBottom: '1px solid var(--border-color)',
                        justifyContent: 'space-between', display: 'flex', alignItems: 'center', gap: '1rem'
                    }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{p.medicationName}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {p.dosage} &bull; {p.frequency} &bull; {p.durationDays} days
                            </div>
                        </div>
                        {confirmingId === p.id ? (
                            <div className={styles.confirmGroup}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger-color)' }}>Cancel?</span>
                                <button type="button" className={styles.confirmButton} onClick={() => onCancel(p.id)}>Yes</button>
                                <button type="button" className={styles.cancelButton} onClick={() => setConfirmingId(null)}>No</button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className={styles.dangerButton}
                                onClick={e => { e.stopPropagation(); setConfirmingId(p.id); }}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                ))}
                {prescriptions.length === 0 && (
                    <div className={styles.emptyState} style={{ padding: '1.5rem' }}>No medications prescribed yet.</div>
                )}
            </div>
        </div>
    );
}
