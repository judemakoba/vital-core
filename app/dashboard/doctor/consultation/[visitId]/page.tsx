"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
    Save,
    CheckCircle,
    Clipboard,
    Pill,
    FlaskConical,
    History,
    AlertCircle,
    Lock,
    Bed,
    Scan,
    ExternalLink,
    ArrowLeft,
    Eye
} from "lucide-react";
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
    const searchParams = useSearchParams();
    const { data: session, status: sessionStatus } = useSession();
    // R61: ?readonly=1 renders the consultation in read-only mode for the
    // doctor's "Completed Today" list. Disables all inputs + hides every
    // mutating button. Tabs still work so the doctor can browse notes,
    // diagnosis, prescriptions, lab, radiology.
    const isReadOnly = searchParams.get('readonly') === '1';
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

    // R62: IPD Request state. The doctor now submits a *request* that
    // admin/reception fulfils — they no longer create the Admission
    // directly. The visit's type/status do not change until fulfilment.
    const [showIpdRequestModal, setShowIpdRequestModal] = useState(false);
    const [ipdRequestSubmitting, setIpdRequestSubmitting] = useState(false);
    const [wards, setWards] = useState<any[]>([]);
    const [ipdRequestForm, setIpdRequestForm] = useState({
        reasonForAdmission: '',
        admittingDiagnosis: '',
        urgency: 'ELECTIVE',
        preferredWardId: '',
        preferredBedType: '',
        clinicalNotes: '',
    });
    const [ipdRequests, setIpdRequests] = useState<any[]>([]);

    const fetchIpdRequests = async () => {
        if (!params.visitId) return;
        try {
            const res = await fetch(`/api/ipd-requests?visitId=${params.visitId}`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setIpdRequests(data);
            }
        } catch (e) {
            console.error('Failed to fetch IPD requests', e);
        }
    };

    const openIpdRequestModal = async () => {
        setShowIpdRequestModal(true);
        try {
            const res = await fetch('/api/ipd/wards', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setWards(data);
            }
        } catch (e) {
            console.error('Failed to fetch wards', e);
        }
    };

    const handleRequestIpdAdmission = async () => {
        if (!ipdRequestForm.reasonForAdmission.trim()) {
            alert('Reason for admission is required.');
            return;
        }
        setIpdRequestSubmitting(true);
        try {
            const res = await fetch('/api/ipd-requests', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    visitId: params.visitId,
                    reasonForAdmission: ipdRequestForm.reasonForAdmission,
                    admittingDiagnosis: ipdRequestForm.admittingDiagnosis || undefined,
                    urgency: ipdRequestForm.urgency,
                    preferredWardId: ipdRequestForm.preferredWardId || undefined,
                    preferredBedType: ipdRequestForm.preferredBedType || undefined,
                    clinicalNotes: ipdRequestForm.clinicalNotes || undefined,
                }),
            });
            if (res.ok) {
                const created = await res.json();
                alert(
                    `IPD request ${created.requestNumber} submitted. Reception / admin will assign a bed and fulfil the request shortly.`
                );
                setShowIpdRequestModal(false);
                setIpdRequestForm({
                    reasonForAdmission: '',
                    admittingDiagnosis: '',
                    urgency: 'ELECTIVE',
                    preferredWardId: '',
                    preferredBedType: '',
                    clinicalNotes: '',
                });
                await fetchIpdRequests();
            } else {
                const err = await res.json();
                alert(`Error submitting IPD request: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while submitting the IPD request.');
        } finally {
            setIpdRequestSubmitting(false);
        }
    };

    const handleCancelIpdRequest = async (requestId: string) => {
        if (!confirm('Cancel this IPD admission request?')) return;
        try {
            const res = await fetch(`/api/ipd-requests/${requestId}/cancel`, {
                method: 'POST',
                credentials: 'include',
            });
            if (res.ok) {
                await fetchIpdRequests();
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert('Error cancelling IPD request.');
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
        // R62: also load any existing IPD request for this visit so the
        // doctor sees a "Pending" / "Approved" badge on the page.
        fetchIpdRequests();
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
        if (isReadOnly) return; // R61: never persist in read-only view
        // Only auto-save while visit is still in the consultation phase. Once it has
        // been pushed to Pharmacy / Lab / Radiology the API will 400 the save (correct
        // behaviour to prevent regressing the visit status). The Finish Consultation
        // button handles the close path.
        //
        // R55b: include "InConsultation" (new canonical) alongside the legacy
        // alias "Consultation".
        const currentVisitStatus = visit?.status;
        if (currentVisitStatus && !["Triaged", "InConsultation", "Consultation"].includes(currentVisitStatus)) {
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
                <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>Access Denied</h2>
                <p style={{ color: "var(--text-secondary)", maxWidth: 380 }}>
                    You are not authorized to view this consultation. Only the assigned doctor, admins, and super admins may access it.
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "1rem" }}>
                    Redirecting you to the dashboard...
                </p>
            </div>
        </div>
    );

    if (!visit) return null;

    return (
        <div className={styles.container}>
            {/* R61: read-only banner. Shown only when the page is opened from
                the doctor's "Completed Today" list (?readonly=1). All inputs
                on the page below become readOnly and every mutating button
                is hidden via the .readOnlyHide class (see page.module.css). */}
            {isReadOnly && (
                <div className={styles.readOnlyBanner}>
                    <Eye size={18} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                        <strong>Read-only view</strong> — this consultation is finished and can no longer be edited.
                        {visit && (visit as any).completedTime && (
                            <> Completed at {new Date((visit as any).completedTime).toLocaleString()}.</>
                        )}
                    </div>
                </div>
            )}

            {/* R58a: back to doctor waiting room. Placed ABOVE the header
                card (not inside it) so the small back link doesn't have
                to share a flex row with the multi-line patient info block
                — that's what made it look "squished" before. Uses a
                deterministic Link to /dashboard/doctor (not router.back())
                so the target is always the doctor queue regardless of how
                the user arrived (direct URL, sidebar, etc.). */}
            <Link href="/dashboard/doctor" className={styles.backLink}>
                <ArrowLeft size={16} /> Back to Waiting Room
            </Link>
            <header className={styles.header}>
                <div className={styles.patientInfo}>
                    <h1 className={styles.patientName}>
                        {visit.patient?.firstName} {visit.patient?.lastName}
                    </h1>
                    <div className={styles.patientMeta}>
                        {visit.patient?.gender} • {calculateAge(visit.patient?.dateOfBirth || "")} yrs • BG: {visit.patient?.bloodGroup || "N/A"}
                    </div>
                    <div className={styles.vitalsRow}>
                        <div className={styles.vitalItem}>
                            <span className={styles.vitalLabel}>BP</span>
                            <span className={styles.vitalValue}>{visit.bloodPressure || "--/--"}</span>
                        </div>
                        <div className={styles.vitalItem}>
                            <span className={styles.vitalLabel}>HR</span>
                            <span className={styles.vitalValue}>{visit.heartRate || "--"} bpm</span>
                        </div>
                        <div className={styles.vitalItem}>
                            <span className={styles.vitalLabel}>Temp</span>
                            <span className={styles.vitalValue}>{visit.temperature || "--"} °C</span>
                        </div>
                        <div className={styles.vitalItem}>
                            <span className={styles.vitalLabel}>Weight</span>
                            <span className={styles.vitalValue}>{visit.weight ? `${visit.weight} kg` : "--"}</span>
                        </div>
                        <div className={styles.vitalItem}>
                            <span className={styles.vitalLabel}>Height</span>
                            <span className={styles.vitalValue}>{visit.height ? `${visit.height} cm` : "--"}</span>
                        </div>
                        <div className={styles.vitalItem}>
                            <span className={styles.vitalLabel}>BMI</span>
                            <span className={styles.vitalValue}>
                                {visit.weight && visit.height 
                                    ? (visit.weight / Math.pow(visit.height / 100, 2)).toFixed(1) 
                                    : "--"}
                            </span>
                        </div>
                    </div>
                    {visit.patient?.allergies && (
                        <div style={{ 
                            backgroundColor: "rgba(239,68,68,0.1)", 
                            color: "var(--danger-color)", 
                            padding: "0.5rem 0.75rem", 
                            borderRadius: "6px",
                            fontSize: "0.8rem",
                            marginTop: "0.5rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem"
                        }}>
                            <AlertCircle size={14} />
                            <strong>Allergies:</strong> {visit.patient.allergies}
                        </div>
                    )}
                </div>
            </header>

            <div className={styles.layout}>
                <div className={styles.mainContent}>
                    <div className={styles.tabs}>
                        <div
                            className={`${styles.tab} ${activeTab === "notes" ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab("notes")}
                        >
                            <Clipboard size={16} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                            Notes (SOAP)
                        </div>
                        <div
                            className={`${styles.tab} ${activeTab === "diagnosis" ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab("diagnosis")}
                        >
                            <AlertCircle size={16} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                            Diagnosis
                        </div>
                        <div
                            className={`${styles.tab} ${activeTab === "prescription" ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab("prescription")}
                        >
                            <Pill size={16} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                            Prescription
                        </div>
                        <div
                            className={`${styles.tab} ${activeTab === "lab" ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab("lab")}
                        >
                            <FlaskConical size={16} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                            Lab Orders
                        </div>
                        <div
                            className={`${styles.tab} ${activeTab === "radiology" ? styles.tabActive : ""}`}
                            onClick={() => setActiveTab("radiology")}
                        >
                            <Scan size={16} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                            Radiology
                        </div>
                    </div>

                    <div className={styles.card}>
                        {activeTab === "notes" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Subjective (Symptoms, patient complaints)</label>
                                    <textarea
                                        className={styles.textarea}
                                        value={notes.subjective}
                                        onChange={(e) => { setNotes({ ...notes, subjective: e.target.value }); setIsDirty(true); }}
                                        readOnly={isReadOnly}
                                        placeholder={isReadOnly ? "" : "e.g. Headache for 3 days, low grade fever..."}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Objective (Physical exam findings)</label>
                                    <textarea
                                        className={styles.textarea}
                                        value={notes.objective}
                                        onChange={(e) => { setNotes({ ...notes, objective: e.target.value }); setIsDirty(true); }}
                                        readOnly={isReadOnly}
                                        placeholder={isReadOnly ? "" : "e.g. Clear lungs, mild abdominal tenderness..."}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Assessment (Initial thoughts, differential diagnosis)</label>
                                    <textarea
                                        className={styles.textarea}
                                        value={notes.assessment}
                                        onChange={(e) => { setNotes({ ...notes, assessment: e.target.value }); setIsDirty(true); }}
                                        readOnly={isReadOnly}
                                        placeholder={isReadOnly ? "" : "e.g. Likely malaria but need to rule out typhoid..."}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Treatment Plan (Next steps, counseling)</label>
                                    <textarea
                                        className={styles.textarea}
                                        value={notes.treatmentPlan}
                                        onChange={(e) => { setNotes({ ...notes, treatmentPlan: e.target.value }); setIsDirty(true); }}
                                        readOnly={isReadOnly}
                                        placeholder={isReadOnly ? "" : "e.g. Order RDT, start paracetamol, follow up in 2 days..."}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === "diagnosis" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                                {!isReadOnly && (
                                <div className={styles.formGroup} style={{ position: "relative", marginBottom: 0 }}>
                                    <label className={styles.label}>Search and Add Diagnosis (ICD-11 / ICD-10)</label>
                                    <div style={{ display: "flex", gap: "0.5rem" }}>
                                        <input 
                                            className={styles.input} 
                                            placeholder="Search by code or title (e.g. Cholera or 1A00)..."
                                            value={icdSearchQuery}
                                            onChange={(e) => {
                                                setIcdSearchQuery(e.target.value);
                                                setShowIcdDropdown(true);
                                                setSelectedIcdCode("");
                                            }}
                                            onFocus={() => setShowIcdDropdown(true)}
                                            onBlur={() => setTimeout(() => setShowIcdDropdown(false), 200)}
                                            onKeyDown={async (e) => {
                                                if (e.key === 'Enter' && icdSearchQuery && !selectedIcdCode) {
                                                    // Allow manual entry if no item is selected
                                                    const name = icdSearchQuery;
                                                    const res = await fetch(`/api/doctor/consultation/${params.visitId}/diagnosis`, {
                                                        method: "POST",
                                                        credentials: "include",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ 
                                                            name, 
                                                            code: "", 
                                                            icdVersion: "ICD-10",
                                                            patientId: visit.patient.id 
                                                        })
                                                    });
                                                    if (res.ok) {
                                                        const newD = await res.json();
                                                        setVisit(prev => prev ? { ...prev, diagnoses: [...prev.diagnoses, newD] } : prev);
                                                        setIcdSearchQuery("");
                                                    }
                                                }
                                            }}
                                        />
                                        <button 
                                            className={styles.saveBtn}
                                            style={{ padding: "0.6rem 1.5rem" }}
                                            onClick={async () => {
                                                if (!icdSearchQuery) return;
                                                const res = await fetch(`/api/doctor/consultation/${params.visitId}/diagnosis`, {
                                                    method: "POST",
                                                    credentials: "include",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ 
                                                        name: icdSearchQuery, 
                                                        code: selectedIcdCode || "", 
                                                        icdVersion: selectedIcdCode ? "ICD-11" : "ICD-10",
                                                        patientId: visit.patient.id 
                                                    })
                                                });
                                                if (res.ok) {
                                                    const newD = await res.json();
                                                    setVisit(prev => prev ? { ...prev, diagnoses: [...prev.diagnoses, newD] } : prev);
                                                    setIcdSearchQuery("");
                                                    setSelectedIcdCode("");
                                                }
                                            }}
                                        >
                                            Add
                                        </button>
                                    </div>
                                    {showIcdDropdown && icdResults.length > 0 && (
                                        <ul className={styles.dropdownList} style={{
                                            position: "absolute",
                                            top: "100%",
                                            left: 0,
                                            right: 0,
                                            maxHeight: "300px",
                                            overflowY: "auto",
                                            background: "var(--bg-color, #fff)",
                                            border: "1px solid var(--border-color, #e2e8f0)",
                                            borderRadius: "var(--radius-md, 8px)",
                                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                                            listStyle: "none",
                                            padding: 0,
                                            margin: "4px 0 0 0",
                                            zIndex: 20
                                        }}>
                                            {icdResults.map(res => (
                                                <li
                                                    key={res.id}
                                                    style={{
                                                        padding: "0.75rem 1rem",
                                                        cursor: "pointer",
                                                        borderBottom: "1px solid var(--border-color, #e2e8f0)",
                                                        fontSize: "0.9rem",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: "0.25rem"
                                                    }}
                                                    onMouseDown={async (e) => {
                                                        e.preventDefault();
                                                        // Immediately add upon selection
                                                        const response = await fetch(`/api/doctor/consultation/${params.visitId}/diagnosis`, {
                                                            method: "POST",
                                                            credentials: "include",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ 
                                                                name: res.title, 
                                                                code: res.code, 
                                                                icdVersion: "ICD-11",
                                                                patientId: visit.patient.id 
                                                            })
                                                        });
                                                        if (response.ok) {
                                                            const newD = await response.json();
                                                            setVisit(prev => prev ? { ...prev, diagnoses: [...prev.diagnoses, newD] } : prev);
                                                            setIcdSearchQuery("");
                                                            setShowIcdDropdown(false);
                                                        }
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        (e.currentTarget as HTMLElement).style.background = "var(--hover-bg, #f1f5f9)";
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        (e.currentTarget as HTMLElement).style.background = "transparent";
                                                    }}
                                                >
                                                    <span style={{ fontWeight: 600, color: "var(--primary-color)" }}>{res.code}</span>
                                                    <span style={{ color: "var(--text-color)" }}>{res.title}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                )}

                                <div className={styles.list}>
                                    {visit.diagnoses.map((d) => (
                                        <div key={d.id} className={styles.listItem} style={{ padding: "0.75rem 0", borderBottom: "1px solid var(--border-color)", justifyContent: "space-between", display: "flex", alignItems: "center" }}>
                                            <div>
                                                <strong>{d.name}</strong> {d.code && <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>({d.icdVersion || "ICD-10"}: {d.code})</span>}
                                            </div>
                                            {isReadOnly ? null : confirmingId === d.id ? (
                                                <div className={styles.confirmGroup}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger-color)' }}>Delete?</span>
                                                    <button type="button" className={styles.confirmButton} onClick={() => handleRemoveDiagnosis(d.id)}>Yes</button>
                                                    <button type="button" className={styles.cancelButton} onClick={() => setConfirmingId(null)}>No</button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={styles.dangerButton}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmingId(d.id);
                                                    }}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {visit.diagnoses.length === 0 && <div className={styles.emptyState} style={{ padding: "1rem" }}>No diagnoses added yet.</div>}
                                </div>
                            </div>
                        )}

                        {activeTab === "prescription" && (
                            <PrescriptionForm
                                visitId={params.visitId}
                                patientId={visit.patient.id}
                                prescriptions={visit.prescriptions}
                                confirmingId={confirmingId}
                                setConfirmingId={setConfirmingId}
                                onAdd={(newP) => setVisit(prev => prev ? { ...prev, prescriptions: [...prev.prescriptions, newP] } : prev)}
                                onCancel={handleCancelPrescription}
                                readOnly={isReadOnly}
                            />
                        )}

                        {activeTab === "lab" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                                {labError && (
                                    <div style={{ backgroundColor: "#fee2e2", color: "#b91c1c", padding: "0.75rem 1rem", borderRadius: "10px", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
                                        <AlertCircle size={16} />
                                        <span>{labError}</span>
                                        <button 
                                            onClick={() => setLabError("")} 
                                            style={{ marginLeft: "auto", background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: "1.2rem", lineHeight: 1 }}
                                        >
                                            &times;
                                        </button>
                                    </div>
                                )}
                                {!isReadOnly && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem", alignItems: "flex-end" }}>
                                    <div className={styles.formGroup} style={{ marginBottom: 0, position: "relative" }}>
                                        <label className={styles.label}>Search Lab Test From Catalog</label>
                                        <input
                                            type="text"
                                            className={styles.input}
                                            value={labSearchQuery}
                                            onChange={(e) => {
                                                setLabSearchQuery(e.target.value);
                                                setShowLabDropdown(true);
                                                setSelectedTestId(""); // Clear selection when typing
                                            }}
                                            onFocus={() => setShowLabDropdown(true)}
                                            onBlur={() => setTimeout(() => setShowLabDropdown(false), 200)}
                                            placeholder="-- Search a Lab Test --"
                                        />
                                        {showLabDropdown && (
                                            <ul className={styles.dropdownList} style={{
                                                position: "absolute",
                                                top: "100%",
                                                left: 0,
                                                right: 0,
                                                maxHeight: "200px",
                                                overflowY: "auto",
                                                background: "var(--bg-color, #fff)",
                                                border: "1px solid var(--border-color, #e2e8f0)",
                                                borderRadius: "var(--radius-md, 8px)",
                                                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                                                listStyle: "none",
                                                padding: 0,
                                                margin: "4px 0 0 0",
                                                zIndex: 10
                                            }}>
                                                {labCatalog
                                                    .filter(test => 
                                                        test.name.toLowerCase().includes(labSearchQuery.toLowerCase()) || 
                                                        (test.category?.name || "Uncategorized").toLowerCase().includes(labSearchQuery.toLowerCase())
                                                    )
                                                    .map(test => (
                                                        <li
                                                            key={test.id}
                                                            style={{
                                                                padding: "0.5rem 1rem",
                                                                cursor: "pointer",
                                                                borderBottom: "1px solid var(--border-color, #e2e8f0)",
                                                                fontSize: "0.875rem"
                                                            }}
                                                            onMouseDown={(e) => {
                                                                // using onMouseDown instead of onClick to fire before input's onBlur
                                                                e.preventDefault(); 
                                                                setSelectedTestId(test.id);
                                                                setLabSearchQuery(`${test.name} (${test.category?.name || "Uncategorized"})`);
                                                                setShowLabDropdown(false);
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                (e.target as HTMLElement).style.background = "var(--hover-bg, #f1f5f9)";
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                (e.target as HTMLElement).style.background = "transparent";
                                                            }}
                                                        >
                                                            {test.name} <span style={{ color: "var(--text-muted, #64748b)" }}>({test.category?.name || "Uncategorized"})</span> - {currency} {test.price.toFixed(2)}
                                                        </li>
                                                    ))}
                                                {labCatalog.filter(test => test.name.toLowerCase().includes(labSearchQuery.toLowerCase()) || (test.category?.name || "Uncategorized").toLowerCase().includes(labSearchQuery.toLowerCase())).length === 0 && (
                                                    <li style={{ padding: "0.5rem 1rem", color: "var(--text-muted, #64748b)", fontSize: "0.875rem" }}>
                                                        No tests found.
                                                    </li>
                                                )}
                                            </ul>
                                        )}
                                    </div>
                                    <button
                                        className={styles.saveBtn}
                                        style={{ height: "42px" }}
                                        disabled={!selectedTestId}
                                        onClick={async () => {
                                            if (!selectedTestId) return;

                                            const selectedTest = labCatalog.find(t => t.id === selectedTestId);
                                            if (!selectedTest) return;

                                            const isAlreadyOrdered = visit.labOrders && visit.labOrders.some(o => o.testName === selectedTest.name);
                                            if (isAlreadyOrdered) {
                                                setLabError("This lab test has already been requested for this consultation.");
                                                return;
                                            }
                                            
                                            setLabError(""); // Clear error if successful

                                            const res = await fetch(`/api/lab/orders`, {
                                                method: "POST",
                                                credentials: "include",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    visitId: params.visitId,
                                                    patientId: visit.patient.id,
                                                    testName: selectedTest.name,
                                                    testCategory: selectedTest.category?.name || "Uncategorized",
                                                    priority: visit.priority
                                                })
                                            });
                                            if (res.ok) {
                                                const newL = await res.json();
                                                setVisit(prev => prev ? { ...prev, labOrders: [...(prev.labOrders || []), newL] } : prev);
                                                setSelectedTestId(""); // Reset selection
                                                setLabSearchQuery(""); // Reset search query
                                            } else {
                                                const errorData = await res.json();
                                                setLabError(errorData.error || "Failed to order lab test.");
                                            }
                                        }}
                                    >
                                        Order Test
                                    </button>
                                </div>
                                )}

                                <div className={styles.list}>
                                    {(visit.labOrders || []).map((l) => (
                                        <div key={l.id} className={styles.listItem} style={{ padding: "0.75rem 0", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between" }}>
                                            <div>
                                                <strong>{l.testName}</strong> <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>[{l.testCategory}]</span>
                                                <div style={{ fontSize: "0.75rem", color: l.status === "Completed" ? "var(--success-color)" : "var(--warning-color)", marginBottom: l.status === "Completed" ? "0.5rem" : "0" }}>
                                                    Status: {l.status}
                                                </div>
                                                {l.status === "Completed" && (
                                                    <div style={{
                                                        background: "rgba(0,0,0,0.03)",
                                                        padding: "0.75rem",
                                                        borderRadius: "var(--radius-sm)",
                                                        borderLeft: `3px solid ${l.resultFlags === "Normal" ? "var(--success-color)" : (l.resultFlags === "Critical" ? "var(--danger-color)" : "var(--warning-color)")}`,
                                                        marginTop: "0.5rem"
                                                    }}>
                                                        <div style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.25rem", color: "var(--text-secondary)", display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span>RESULT <span style={{ marginLeft: "0.5rem", padding: "0.1rem 0.4rem", background: "rgba(0,0,0,0.1)", borderRadius: "4px" }}>{l.resultFlags}</span></span>
                                                            <a
                                                                href={`/dashboard/lab/${l.id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.3rem',
                                                                    padding: '0.25rem 0.55rem',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 600,
                                                                    color: 'var(--primary-color)',
                                                                    background: 'rgba(99, 102, 241, 0.08)',
                                                                    border: '1px solid rgba(99, 102, 241, 0.2)',
                                                                    borderRadius: '6px',
                                                                    textDecoration: 'none',
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                                title="Open the full standardized GMC report in a new tab"
                                                            >
                                                                <ExternalLink size={12} /> View Full Report
                                                            </a>
                                                        </div>
                                                        <div style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>
                                                            {l.result}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {!isReadOnly && l.status !== "Completed" && (
                                                confirmingId === l.id ? (
                                                    <div className={styles.confirmGroup}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger-color)' }}>Cancel?</span>
                                                        <button type="button" className={styles.confirmButton} onClick={() => handleCancelLabOrder(l.id)}>Confirm</button>
                                                        <button type="button" className={styles.cancelButton} onClick={() => setConfirmingId(null)}>Back</button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className={styles.dangerButton}
                                                        style={{ height: "fit-content" }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmingId(l.id);
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    ))}
                                    {(visit.labOrders || []).length === 0 && <div className={styles.emptyState} style={{ padding: "1rem" }}>No lab tests ordered yet.</div>}
                                </div>
                            </div>
                        )}

                        {activeTab === "radiology" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                                {radiologyError && (
                                    <div style={{ backgroundColor: "#fee2e2", color: "#b91c1c", padding: "0.75rem 1rem", borderRadius: "10px", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
                                        <AlertCircle size={16} />
                                        <span>{radiologyError}</span>
                                        <button
                                            onClick={() => setRadiologyError("")}
                                            style={{ marginLeft: "auto", background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: "1.2rem", lineHeight: 1 }}
                                        >
                                            &times;
                                        </button>
                                    </div>
                                )}
                                {!isReadOnly && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem", alignItems: "flex-end" }}>
                                    <div className={styles.formGroup} style={{ marginBottom: 0, position: "relative" }}>
                                        <label className={styles.label}>Search Radiology Exam from Catalog</label>
                                        <input
                                            type="text"
                                            className={styles.input}
                                            value={radiologySearchQuery}
                                            onChange={(e) => {
                                                setRadiologySearchQuery(e.target.value);
                                                setShowRadiologyDropdown(true);
                                                setSelectedExamId("");
                                            }}
                                            onFocus={() => setShowRadiologyDropdown(true)}
                                            onBlur={() => setTimeout(() => setShowRadiologyDropdown(false), 200)}
                                            placeholder="-- Search an X-Ray, CT, MRI, or Ultrasound --"
                                        />
                                        {showRadiologyDropdown && (
                                            <ul style={{
                                                position: "absolute",
                                                top: "100%",
                                                left: 0,
                                                right: 0,
                                                maxHeight: "250px",
                                                overflowY: "auto",
                                                background: "var(--bg-color, #fff)",
                                                border: "1px solid var(--border-color, #e2e8f0)",
                                                borderRadius: "var(--radius-md, 8px)",
                                                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                                                listStyle: "none",
                                                padding: 0,
                                                margin: "4px 0 0 0",
                                                zIndex: 10
                                            }}>
                                                {radiologyCatalog
                                                    .filter(exam =>
                                                        exam.name.toLowerCase().includes(radiologySearchQuery.toLowerCase()) ||
                                                        (exam.category?.name || "").toLowerCase().includes(radiologySearchQuery.toLowerCase())
                                                    )
                                                    .map(exam => (
                                                        <li
                                                            key={exam.id}
                                                            style={{
                                                                padding: "0.6rem 1rem",
                                                                cursor: "pointer",
                                                                borderBottom: "1px solid var(--border-color, #e2e8f0)",
                                                                fontSize: "0.875rem",
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                alignItems: "center"
                                                            }}
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                setSelectedExamId(exam.id);
                                                                setRadiologySearchQuery(`${exam.name} (${exam.category?.name || "Uncategorized"})`);
                                                                setShowRadiologyDropdown(false);
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                    (e.currentTarget as HTMLElement).style.background = "var(--hover-bg, #f1f5f9)";
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                    (e.currentTarget as HTMLElement).style.background = "transparent";
                                                            }}
                                                        >
                                                            <span>
                                                                <span style={{ fontWeight: 600 }}>{exam.name}</span>
                                                                <span style={{ color: "var(--text-muted, #64748b)", marginLeft: "0.5rem" }}>
                                                                    [{exam.category?.name || "Uncategorized"}]
                                                                </span>
                                                            </span>
                                                            <span style={{ color: "var(--primary-color)", fontWeight: 700, fontSize: "0.8rem" }}>
                                                                {currency} {exam.price.toFixed(2)}
                                                            </span>
                                                        </li>
                                                    ))}
                                                {radiologyCatalog.filter(exam =>
                                                    exam.name.toLowerCase().includes(radiologySearchQuery.toLowerCase()) ||
                                                    (exam.category?.name || "").toLowerCase().includes(radiologySearchQuery.toLowerCase())
                                                ).length === 0 && (
                                                    <li style={{ padding: "0.5rem 1rem", color: "var(--text-muted, #64748b)", fontSize: "0.875rem" }}>
                                                        No exams found.
                                                    </li>
                                                )}
                                            </ul>
                                        )}
                                    </div>
                                    <button
                                        className={styles.saveBtn}
                                        style={{ height: "42px" }}
                                        disabled={!selectedExamId}
                                        onClick={async () => {
                                            if (!selectedExamId) return;

                                            const selectedExam = radiologyCatalog.find(e => e.id === selectedExamId);
                                            if (!selectedExam) return;

                                            const isAlreadyOrdered = (visit as any).radiologyOrders?.some(
                                                (o: any) => o.examName.toLowerCase() === selectedExam.name.toLowerCase()
                                            );
                                            if (isAlreadyOrdered) {
                                                setRadiologyError(`"${selectedExam.name}" has already been ordered for this visit.`);
                                                return;
                                            }

                                            setRadiologyError("");

                                            const res = await fetch(`/api/radiology/orders`, {
                                                method: "POST",
                                                credentials: "include",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    visitId: params.visitId,
                                                    patientId: visit.patient.id,
                                                    examName: selectedExam.name,
                                                    category: selectedExam.category?.name || "General",
                                                    priority: visit.priority
                                                })
                                            });

                                            if (res.ok) {
                                                const newR = await res.json();
                                                setVisit((prev: any) => prev ? {
                                                    ...prev,
                                                    radiologyOrders: [...(prev.radiologyOrders || []), newR]
                                                } : null);
                                                setSelectedExamId("");
                                                setRadiologySearchQuery("");
                                            } else {
                                                const data = await res.json();
                                                setRadiologyError(data.error || "Failed to order radiology exam.");
                                            }
                                        }}
                                    >
                                        Order Exam
                                    </button>
                                </div>
                                )}

                                <div className={styles.list}>
                                    {(visit as any).radiologyOrders?.map((r: any) => (
                                        <div key={r.id} style={{
                                            padding: "0.85rem 0",
                                            borderBottom: "1px solid var(--border-color)",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            gap: "1rem"
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{r.examName}</div>
                                                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                                    {r.category} &bull; Priority: {r.priority}
                                                </div>
                                                <div style={{
                                                    fontSize: "0.75rem",
                                                    fontWeight: 600,
                                                    color: r.status === "Completed" ? "var(--success-color)"
                                                        : r.status === "InProgress" ? "var(--warning-color)"
                                                        : "var(--primary-color)",
                                                    marginTop: "4px"
                                                }}>
                                                    Status: {r.status}
                                                </div>
                                                {r.status === "Completed" && (
                                                    <div style={{
                                                        marginTop: "0.5rem",
                                                        padding: "0.75rem",
                                                        background: "rgba(0,0,0,0.03)",
                                                        borderRadius: "var(--radius-sm)",
                                                        borderLeft: "3px solid var(--success-color)",
                                                    }}>
                                                        <div style={{
                                                            fontSize: "0.75rem",
                                                            fontWeight: 700,
                                                            marginBottom: "0.4rem",
                                                            color: "var(--text-secondary)",
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            gap: '0.5rem'
                                                        }}>
                                                            <span>REPORT</span>
                                                            <a
                                                                href={`/dashboard/radiology/${r.id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.3rem',
                                                                    padding: '0.25rem 0.55rem',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 600,
                                                                    color: 'var(--primary-color)',
                                                                    background: 'rgba(99, 102, 241, 0.08)',
                                                                    border: '1px solid rgba(99, 102, 241, 0.2)',
                                                                    borderRadius: '6px',
                                                                    textDecoration: 'none',
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                                title="Open the full GMC report in a new tab"
                                                            >
                                                                <ExternalLink size={12} /> View Full Report
                                                            </a>
                                                        </div>
                                                        {r.modality && (
                                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                                                                <strong>Modality:</strong> {r.modality}{r.contrastUsed ? " (with contrast)" : ""}
                                                            </div>
                                                        )}
                                                        {r.technique && (
                                                            <div style={{ fontSize: "0.8rem", marginBottom: "0.25rem", whiteSpace: "pre-wrap" }}>
                                                                <strong>Technique:</strong> {r.technique}
                                                            </div>
                                                        )}
                                                        {r.findings && (
                                                            <div style={{ fontSize: "0.8rem", marginBottom: "0.25rem", whiteSpace: "pre-wrap" }}>
                                                                <strong>Findings:</strong> {r.findings}
                                                            </div>
                                                        )}
                                                        {r.impression && (
                                                            <div style={{ fontSize: "0.8rem", marginBottom: "0.25rem", whiteSpace: "pre-wrap" }}>
                                                                <strong>Impression:</strong> {r.impression}
                                                            </div>
                                                        )}
                                                        {r.recommendations && (
                                                            <div style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
                                                                <strong>Recommendations:</strong> {r.recommendations}
                                                            </div>
                                                        )}
                                                        {!r.findings && !r.impression && r.result && (
                                                            <div style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
                                                                {r.result}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {!isReadOnly && r.status !== "Completed" && (
                                                confirmingId === r.id ? (
                                                    <div className={styles.confirmGroup}>
                                                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--danger-color)" }}>Cancel?</span>
                                                        <button type="button" className={styles.confirmButton} onClick={() => handleCancelRadiologyOrder(r.id)}>Yes</button>
                                                        <button type="button" className={styles.cancelButton} onClick={() => setConfirmingId(null)}>No</button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className={styles.dangerButton}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmingId(r.id);
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    ))}
                                    {(visit as any).radiologyOrders?.length === 0 && (
                                        <div className={styles.emptyState} style={{ padding: "1.5rem" }}>
                                            No radiology exams ordered yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <aside className={styles.sidebar}>
                    <div className={styles.sidebarCard}>
                        <h2 className={styles.sidebarTitle}>
                            {isReadOnly ? "Status" : "Actions"}
                        </h2>
                        {isReadOnly ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                <div style={{
                                    display: "flex", alignItems: "center", gap: "0.5rem",
                                    padding: "0.75rem",
                                    background: "rgba(34,197,94,0.08)",
                                    border: "1px solid rgba(34,197,94,0.25)",
                                    borderRadius: "var(--radius-md)",
                                    color: "var(--success-color)",
                                    fontWeight: 600, fontSize: "0.85rem"
                                }}>
                                    <CheckCircle size={16} />
                                    Consultation Finished
                                </div>
                                {(visit as any)?.completedTime && (
                                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                        <strong>Completed:</strong> {new Date((visit as any).completedTime).toLocaleString()}
                                    </div>
                                )}
                                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                    This visit is read-only. Switch tabs above to review the consultation.
                                </div>
                            </div>
                        ) : (
                        <div className={styles.actions}>
                            {/* R62: Request IPD Admission — doctor's action.
                                Sends a request to admin/reception; they fulfil
                                it (assign bed, transition Visit.type, create
                                Admission) via /api/ipd-requests/[id]/fulfill.
                                Disabled when the visit is already admitted or
                                has a request in flight. */}
                            <button
                                className="btn-secondary"
                                onClick={openIpdRequestModal}
                                disabled={
                                    saving ||
                                    (visit as any)?.admission !== undefined ||
                                    ipdRequests.some(r => r.status === "PENDING" || r.status === "APPROVED" || r.status === "FULFILLED")
                                }
                                title={
                                    (visit as any)?.admission
                                        ? "Visit is already admitted to IPD"
                                        : ipdRequests.some(r => r.status === "PENDING" || r.status === "APPROVED")
                                            ? "An IPD request is already in progress for this visit"
                                            : ipdRequests.some(r => r.status === "FULFILLED")
                                                ? "IPD request already fulfilled — visit is admitted"
                                                : "Submit a request to admit this patient to IPD"
                                }
                                style={{ width: '100%', marginBottom: '0.75rem', justifyContent: 'center' }}
                            >
                                <Bed size={18} style={{ marginRight: '8px' }} />
                                {(visit as any)?.admission || ipdRequests.some(r => r.status === "FULFILLED")
                                    ? "Admitted to IPD"
                                    : ipdRequests.some(r => r.status === "PENDING" || r.status === "APPROVED")
                                        ? "IPD Request In Progress"
                                        : "Request IPD Admission"}
                            </button>

                            {/* R62: Show pending / approved / fulfilled / cancelled IPD requests for this visit */}
                            {ipdRequests.length > 0 && (
                                <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    {ipdRequests
                                        .filter(r => r.status === "PENDING" || r.status === "APPROVED")
                                        .map(r => (
                                            <div
                                                key={r.id}
                                                style={{
                                                    background: "rgba(245, 158, 11, 0.1)",
                                                    border: "1px solid rgba(245, 158, 11, 0.3)",
                                                    borderRadius: "var(--radius-sm)",
                                                    padding: "0.5rem 0.65rem",
                                                    fontSize: "0.78rem",
                                                    color: "#92400e",
                                                }}
                                            >
                                                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                                                    IPD Request {r.requestNumber} · {r.status}
                                                </div>
                                                <div style={{ fontSize: "0.7rem" }}>
                                                    Submitted {new Date(r.createdAt).toLocaleString()} · Urgency: <strong>{r.urgency}</strong>
                                                </div>
                                                {r.preferredWard && (
                                                    <div style={{ fontSize: "0.7rem" }}>Preferred ward: {r.preferredWard.name}</div>
                                                )}
                                                {r.status === "PENDING" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCancelIpdRequest(r.id)}
                                                        style={{
                                                            marginTop: 6,
                                                            background: "transparent",
                                                            border: "1px solid rgba(245, 158, 11, 0.4)",
                                                            color: "#92400e",
                                                            fontSize: "0.72rem",
                                                            padding: "0.2rem 0.55rem",
                                                            borderRadius: 4,
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        Cancel request
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    {ipdRequests
                                        .filter(r => r.status === "FULFILLED")
                                        .map(r => (
                                            <div
                                                key={r.id}
                                                style={{
                                                    background: "rgba(34, 197, 94, 0.1)",
                                                    border: "1px solid rgba(34, 197, 94, 0.3)",
                                                    borderRadius: "var(--radius-sm)",
                                                    padding: "0.5rem 0.65rem",
                                                    fontSize: "0.78rem",
                                                    color: "var(--success-color)",
                                                }}
                                            >
                                                <div style={{ fontWeight: 700 }}>✓ Admitted to IPD</div>
                                                <div style={{ fontSize: "0.7rem" }}>
                                                    Request {r.requestNumber} fulfilled {r.fulfilledAt && new Date(r.fulfilledAt).toLocaleString()}
                                                </div>
                                            </div>
                                        ))}
                                    {ipdRequests
                                        .filter(r => r.status === "REJECTED" || r.status === "CANCELLED")
                                        .map(r => (
                                            <div
                                                key={r.id}
                                                style={{
                                                    background: "rgba(239, 68, 68, 0.05)",
                                                    border: "1px solid rgba(239, 68, 68, 0.2)",
                                                    borderRadius: "var(--radius-sm)",
                                                    padding: "0.5rem 0.65rem",
                                                    fontSize: "0.78rem",
                                                    color: "var(--danger-color)",
                                                }}
                                            >
                                                <div style={{ fontWeight: 700 }}>IPD Request {r.status.toLowerCase()}</div>
                                                {r.reviewNotes && (
                                                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: 2 }}>
                                                        {r.reviewNotes}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                </div>
                            )}
                            <button
                                className={styles.saveBtn}
                                onClick={() => handleSave(false)}
                                disabled={saving}
                            >
                                {saving ? (
                                    <>
                                        <Save size={18} />
                                        Saving...
                                    </>
                                ) : isDirty ? (
                                    <>
                                        <Save size={18} />
                                        Save Draft
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={18} style={{ color: '#16a34a' }} />
                                        Saved
                                    </>
                                )}
                            </button>
                            <button
                                className={styles.finishBtn}
                                onClick={() => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); handleSave(true); }}
                                disabled={saving}
                            >
                                <CheckCircle size={18} />
                                Finish Consultation
                            </button>
                        </div>
                        )}
                    </div>

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
                    <div style={{ background: '#fff', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Bed size={20} color="#6366f1" />
                            Request IPD Admission
                        </h2>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            The visit type will change to <strong>INPATIENT</strong> only after admin or reception fulfils this request. The doctor does not assign the bed or change the visit type directly.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Reason for Admission <span style={{ color: 'var(--danger-color)' }}>*</span>
                                </label>
                                <textarea
                                    className={styles.input}
                                    value={ipdRequestForm.reasonForAdmission}
                                    onChange={e => setIpdRequestForm({ ...ipdRequestForm, reasonForAdmission: e.target.value })}
                                    rows={2}
                                    placeholder="e.g. Severe pneumonia requiring IV antibiotics and oxygen support"
                                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Admitting Diagnosis (ICD-10/11, optional)
                                </label>
                                <input
                                    className={styles.input}
                                    value={ipdRequestForm.admittingDiagnosis}
                                    onChange={e => setIpdRequestForm({ ...ipdRequestForm, admittingDiagnosis: e.target.value })}
                                    placeholder="e.g. J18.9 — Pneumonia, unspecified organism"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Urgency
                                </label>
                                <select
                                    className={styles.input}
                                    value={ipdRequestForm.urgency}
                                    onChange={e => setIpdRequestForm({ ...ipdRequestForm, urgency: e.target.value })}
                                >
                                    <option value="ELECTIVE">Elective (planned)</option>
                                    <option value="URGENT">Urgent (within hours)</option>
                                    <option value="EMERGENCY">Emergency (immediate)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Preferred Ward (advisory — admin may override)
                                </label>
                                <select
                                    className={styles.input}
                                    value={ipdRequestForm.preferredWardId}
                                    onChange={e => setIpdRequestForm({ ...ipdRequestForm, preferredWardId: e.target.value })}
                                >
                                    <option value="">-- No preference --</option>
                                    {wards.map(w => (
                                        <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Preferred Bed Type
                                </label>
                                <select
                                    className={styles.input}
                                    value={ipdRequestForm.preferredBedType}
                                    onChange={e => setIpdRequestForm({ ...ipdRequestForm, preferredBedType: e.target.value })}
                                >
                                    <option value="">-- No preference --</option>
                                    <option value="STANDARD">Standard</option>
                                    <option value="DELUXE">Deluxe</option>
                                    <option value="PRIVATE">Private</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Clinical Notes (optional)
                                </label>
                                <textarea
                                    className={styles.input}
                                    value={ipdRequestForm.clinicalNotes}
                                    onChange={e => setIpdRequestForm({ ...ipdRequestForm, clinicalNotes: e.target.value })}
                                    rows={2}
                                    placeholder="Any additional context the admin / reception should know"
                                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                            <button type="button" className={styles.cancelButton} onClick={() => setShowIpdRequestModal(false)} disabled={ipdRequestSubmitting}>
                                Cancel
                            </button>
                            <button type="button" className={styles.saveBtn} onClick={handleRequestIpdAdmission} disabled={ipdRequestSubmitting}>
                                {ipdRequestSubmitting ? 'Submitting…' : 'Submit Request'}
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
    readOnly?: boolean;
}

function PrescriptionForm({
    visitId, patientId, prescriptions,
    confirmingId, setConfirmingId, onAdd, onCancel,
    readOnly = false
}: PrescriptionFormProps) {
    const [form, setForm] = useState({
        medicationName: '',
        dosage: '500mg',
        frequency: 'TDS',
        durationDays: 7,
        instructions: ''
    });
    const [submitting, setSubmitting] = useState(false);

    const freqMeta = FREQUENCIES.find(f => f.value === form.frequency);

    const handleSubmit = async () => {
        if (!form.medicationName.trim()) return;
        // Coerce durationDays to a number — the field can be '' while the
        // user is mid-edit, so the API must never see a string.
        const durationDays = parseInt(form.durationDays, 10);
        const safeDuration = Number.isFinite(durationDays) && durationDays >= 1 ? durationDays : 1;
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
                    durationDays: safeDuration,
                    quantity: calcTotalQty(form.frequency, safeDuration),
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
            {/* R61: hide the entire prescribe form in read-only mode; the
                existing prescriptions list below still renders. */}
            {!readOnly && (
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
                            inputMode="numeric"
                            className={`${styles.input} ${styles.numberInput}`}
                            min={1}
                            max={365}
                            value={form.durationDays}
                            onChange={e => {
                                const raw = e.target.value;
                                // Allow the field to be cleared while typing —
                                // snap back to '' instead of jumping to 1.
                                if (raw === '') {
                                    setForm({ ...form, durationDays: '' as any });
                                } else {
                                    const n = parseInt(raw, 10);
                                    setForm({ ...form, durationDays: Number.isFinite(n) ? n : 1 });
                                }
                            }}
                            onBlur={e => {
                                // On blur, ensure a sensible default so submit
                                // never sends 0 / NaN.
                                const n = parseInt(e.target.value, 10);
                                if (!Number.isFinite(n) || n < 1) {
                                    setForm({ ...form, durationDays: 1 });
                                }
                            }}
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
            )}

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
                        {readOnly ? null : confirmingId === p.id ? (
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
