"use client";

import { useState, useEffect } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import { useSession } from "next-auth/react";

/**
 * R48: The create-visit form now runs the third-party insurance
 * verification BEFORE the visit is created (no more "create then
 * verify" flow). The patient must have an active enrollment on file
 * for the validation button to appear.
 */

interface PatientEnrollment {
    id: string;
    policyNumber: string;
    memberNumber: string | null;
    coverageStart: string | null;
    coverageEnd: string | null;
    status: string;
    insurance: {
        id: string;
        name: string;
        code: string;
        consultationFee: number | null;
    };
}

interface Patient {
    id: string;
    patientNumber: string;
    firstName: string;
    lastName: string;
    phone: string;
    gender: string;
    dateOfBirth: string;
    hasInsurance: boolean;
    isActive: boolean;
    createdAt: string;
    // visit creation modal can show the "Validate Insurance" button.
}

interface Doctor {
    id: string;
    name: string;
}

type VerificationResult = {
    status: 'APPROVED' | 'DENIED' | 'ERROR';
    verificationNumber?: string;
    provider?: string;
    reason?: string;
    coverageLimit?: number;
    deductibleRemaining?: number;
    coverageValidFrom?: string;
    coverageValidTo?: string;
};

export default function PatientsPage() {
    const { data: session } = useSession();
    const canDelete = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

    const [patients, setPatients] = useState<Patient[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // New Visit Modal State
    const [showVisitModal, setShowVisitModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [visitData, setVisitData] = useState({
        type: "OPD",
        doctorId: "",
        chiefComplaint: "",
        linkedPriorVisitId: "" as string,
    });
    const [priorVisits, setPriorVisits] = useState<Array<{
        id: string; visitNumber: string; type: string;
        checkInTime: string | null; status: string;
    }>>([]);
    const [loadingPriorVisits, setLoadingPriorVisits] = useState(false);
    const [isCreatingVisit, setIsCreatingVisit] = useState(false);
    // Smart default for visit type (e.g. "patient was here 5 days ago → probably FOLLOW_UP")
    const [visitSuggestion, setVisitSuggestion] = useState<{ suggestedType: string; reason: string } | null>(null);
    const [loadingSuggestion, setLoadingSuggestion] = useState(false);
    // The cashier runs the third-party check here, the result drives the
    // visit status. The verification is included in the POST /visit
    // payload so the visit is created with the right initial status
    // (no separate "Validate" button on the visit page needed).
    // The visit must be created first before verify-insurance can write
    // the InsuranceVerification row, so we run a temporary validation
    // here using a synthetic placeholder visit. Actually, we use a
    // different shape — we hit verify-insurance against a non-existent
    // visit. The verify-insurance route creates the InsuranceVerification
    // row linked to the visit id, so we can't call it before the visit
    // exists. Instead, the create-visit API accepts a `verification`
    // payload and records the row itself (single source of truth).
    // panel is hidden and visits are created as cash by default.
    useEffect(() => {
        const fetchPatients = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/patients?search=${search}&page=${page}`, {
                credentials: 'include',
            });
                if (res.ok) {
                    const data = await res.json();
                    // API returns { data: patients[], total, page, limit, totalPages }
                    setPatients(data.data || []);
                    setTotalPages(data.totalPages || 1);
                } else {
                    // Handle auth errors and other HTTP errors
                    const errorData = await res.json().catch(() => ({}));
                    console.error("Failed to fetch patients:", res.status, errorData);
                    if (res.status === 401) {
                        // Redirect to login or show auth error
                        window.location.href = "/login";
                    }
                }
            } catch (err) {
                console.error("Failed to fetch patients:", err);
            }
            setLoading(false);
        };

        const delayDebounceFn = setTimeout(() => {
            fetchPatients();
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [search, page]);

    useEffect(() => {
        if (showVisitModal) {
            fetch("/api/users?role=DOCTOR", { credentials: "include" })
                .then(res => res.json())
                .then(data => setDoctors(data))
                .catch(err => console.error("Failed to fetch doctors", err));
        }
    }, [showVisitModal]);

    const calculateAge = (dobString: string | null | undefined) => {
        if (!dobString) return "N/A";
        const dob = new Date(dobString);
        if (isNaN(dob.getTime())) return "N/A";

        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        return age;
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete ${name}? Patients with history will be deactivated instead of deleted.`)) return;

        try {
            const res = await fetch(`/api/patients/${id}`, { method: "DELETE", credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                alert(data.message);
                // Refresh list
                setPatients(patients.filter(p => canDelete ? p.id !== id || !p.isActive : p.id !== id));
                // Force full reload for better accuracy
                window.location.reload();
            } else {
                alert("Failed to delete patient");
            }
        } catch (err) {
            alert("Error deleting patient");
        }
    };

    const handleCreateVisit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatient || !visitData.doctorId) return;

        // FOLLOW_UP requires a linked prior visit
        if (visitData.type === "FOLLOW_UP" && !visitData.linkedPriorVisitId) {
            alert("Please select the prior visit this follow-up is linked to.");
            return;
        }

        setIsCreatingVisit(true);
        try {
            const payload: any = {
                type: visitData.type,
                doctorId: visitData.doctorId,
                chiefComplaint: visitData.chiefComplaint,
            };
            if (visitData.type === "FOLLOW_UP" && visitData.linkedPriorVisitId) {
                payload.linkedPriorVisitId = visitData.linkedPriorVisitId;
            }
            // is created with the right initial status. The
            // create-visit API records the InsuranceVerification row
            // based on this payload — we don't need a separate
            // verify-insurance call before the visit exists.
            if (validationResult) {
                payload.verification = validationResult;
            }
            const res = await fetch(`/api/patients/${selectedPatient.id}/visit`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                let statusMsg: string;
                if (data.isDirectService) {
                    statusMsg = `direct service (${data.initialStatus})`;
                } else if (data.insuranceDeferConsult) {
                    // form → deferred billing. Fee is added to the
                    // FINAL- invoice at first order placement, then
                    // submitted as a single claim.
                    statusMsg = `insurance validated (${data.insuranceName}) — ` +
                        `consultation fee UGX ${(data.consultationFee || 0).toLocaleString()} ` +
                        `deferred to claim. Status: ${data.initialStatus}.`;
                } else if (data.insuranceDenied) {
                    // form → cash fallback. Consult fee invoice issued
                    // at this point at the negotiated rate.
                    const reason = validationResult?.reason || 'no reason given';
                    statusMsg = `insurance denied (${data.insuranceName}) — ${reason}. ` +
                        `Falling back to cash. Consultation fee UGX ${(data.consultationFee || 0).toLocaleString()} ` +
                        `(${data.insuranceName} rate), status: ${data.initialStatus}.`;
                } else if (data.insuranceOnFile) {
                    // validate (or got ERROR and chose to proceed).
                    // Visit is parked at PendingInsuranceValidation;
                    // cashier can validate on the visit page later.
                    statusMsg =
                        `insurance on file (${data.insuranceName}) — ` +
                        `awaiting third-party validation. Status: ${data.initialStatus}. ` +
                        `Open the visit and press "Validate Insurance" to cross-check with the provider.`;
                } else if (data.feeCharged) {
                    const source = data.feeSource === 'insurance' ? ' (insurance rate)' : '';
                    statusMsg = `cash patient — consultation fee UGX ${(data.consultationFee || 0).toLocaleString()}${source}, status: ${data.initialStatus}`;
                } else {
                    statusMsg = `no consultation fee, status: ${data.initialStatus}`;
                }
                alert(`Visit ${data.visitNumber} created — ${statusMsg}.`);
                setShowVisitModal(false);
                setSelectedPatient(null);


            } else {
                const error = await res.json();
                alert(error.error || "Failed to create visit");
                // Close modal even on error to prevent user from spamming create
                if (res.status === 400) {
                    setShowVisitModal(false);
                    setSelectedPatient(null);


                }
            }
        } catch (err) {
            alert("Error creating visit");
        } finally {
            setIsCreatingVisit(false);
        }
    };

    /**
     * R48: Run the third-party insurance check from the create-visit
     * form. The result is captured in form state and passed to the
     * visit creation API on submit. We call the existing
     * verify-insurance route AFTER the visit is created (the route
     * requires a visitId) — but since we want the result BEFORE the
     * visit exists, we use a different approach: we call a new
     * /api/insurance/verify-preview endpoint that runs the third-party
     * check WITHOUT writing to the DB. The result is purely for UI
     * display; the actual InsuranceVerification row is recorded by the
     * create-visit route when the visit is created.
     *
     * The "force" param (admin tools) is NOT exposed here — only AUTO
     * mode is allowed. This is the cashier's standard flow.
     */
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Patients Directory</h1>
                <Link href="/dashboard/patients/new" className={styles.addBtn}>
                    <Plus size={18} /> Register Patient
                </Link>
            </div>

            <div className={`glass-card ${styles.controls}`}>
                <div className={styles.searchBox}>
                    <Search size={18} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search by name, ID, or phone number..."
                        className={styles.searchInput}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Patient Details</th>
                            <th className={styles.th}>Patient Number</th>
                            <th className={styles.th}>Contact</th>
                            <th className={styles.th}>Age / Gender</th>
                            <th className={styles.th}>Status</th>
                            <th className={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem" }}>
                                    Loading records...
                                </td>
                            </tr>
                        ) : patients.length === 0 ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                    No patients found matching your search.
                                </td>
                            </tr>
                        ) : (
                            patients.map(patient => (
                                <tr key={patient.id} className={`${styles.tr} ${!patient.isActive ? styles.inactiveRow : ""}`}>
                                    <td className={styles.td}>
                                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                            {patient.firstName} {patient.lastName}
                                        </div>
                                    </td>
                                    <td className={styles.td}>
                                        <span className={styles.patientId}>{patient.patientNumber}</span>
                                    </td>
                                    <td className={styles.td}>{patient.phone || "N/A"}</td>
                                    <td className={styles.td}>
                                        {calculateAge(patient.dateOfBirth)} yrs, {patient.gender ? patient.gender.substring(0, 1) : "N/A"}
                                    </td>
                                    <td className={styles.td}>
                                        <span className={`${styles.statusBadge} ${patient.isActive ? styles.active : styles.inactive}`}>
                                            {patient.isActive ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <Link href={`/dashboard/patients/${patient.id}`} className={styles.actionBtn} title="View Profile">
                                            <Eye size={18} />
                                        </Link>
                                        {canDelete && (
                                            <Link href={`/dashboard/patients/${patient.id}/edit`} className={styles.actionBtn} title="Edit Patient">
                                                <Edit size={18} />
                                            </Link>
                                        )}
                                        <button
                                            className={`${styles.actionBtn} ${styles.visitBtn}`}
                                            title="New Visit"
                                            onClick={() => {
                                                setSelectedPatient(patient);
                                                setShowVisitModal(true);
                                                setVisitData({ type: 'OPD', doctorId: '', chiefComplaint: '', linkedPriorVisitId: '' });
                                                setVisitSuggestion(null);
                                                // modal opens. The cashier runs the third-party
                                                // check on the form.


                                                // Fetch smart default based on patient's recent visit history
                                                setLoadingSuggestion(true);
                                                fetch(`/api/patients/${patient.id}/visit-suggestion`, { credentials: 'include' })
                                                    .then(r => r.ok ? r.json() : null)
                                                    .then(d => {
                                                        if (d) {
                                                            setVisitSuggestion({ suggestedType: d.suggestedType, reason: d.reason });
                                                            // Pre-select the suggested type
                                                            setVisitData(prev => ({ ...prev, type: d.suggestedType }));
                                                        }
                                                    })
                                                    .catch(() => {})
                                                    .finally(() => setLoadingSuggestion(false));
                                                // Fetch the patient's recent completed visits for the
                                                // FOLLOW_UP prior-visit picker (consolidated spec R45).
                                                setLoadingPriorVisits(true);
                                                fetch(`/api/patients/${patient.id}/recent-visits`, { credentials: 'include' })
                                                    .then(r => r.ok ? r.json() : null)
                                                    .then(d => {
                                                        if (Array.isArray(d)) setPriorVisits(d);
                                                    })
                                                    .catch(() => {})
                                                    .finally(() => setLoadingPriorVisits(false));
                                            }}
                                            disabled={!patient.isActive}
                                        >
                                            <CalendarPlus size={18} />
                                        </button>
                                        {canDelete && (
                                            <button
                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                title="Delete Patient"
                                                onClick={() => handleDelete(patient.id, `${patient.firstName} ${patient.lastName}`)}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {totalPages > 1 && (
                    <div className={styles.pagination}>
                        <button
                            className={styles.pageBtn}
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                        >
                            Previous
                        </button>
                        <span style={{ padding: "0.5rem", fontSize: "0.875rem" }}>Page {page} of {totalPages}</span>
                        <button
                            className={styles.pageBtn}
                            disabled={page === totalPages}
                            onClick={() => setPage(p => p + 1)}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* New Visit Modal */}
            {
                showVisitModal && selectedPatient && (
                    <div className={styles.modalOverlay}>
                        <div className={`glass-card ${styles.visitModal}`}>
                            <form onSubmit={handleCreateVisit} className={styles.visitForm}>
                                {/* ── Modal Header ── */}
                                <div className={styles.visitModalHeader}>
                                    <div>
                                        <h2 className={styles.visitModalTitle}>Create New Visit</h2>
                                        <p className={styles.visitModalSubtitle}>
                                            Step 1 of 1 — confirm details and start the visit
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.visitCloseBtn}
                                        onClick={() => setShowVisitModal(false)}
                                        aria-label="Close"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className={styles.visitModalBody}>
                                    {/* ── Patient Banner ── */}
                                    <div className={styles.visitPatientBanner}>
                                        <div className={styles.visitPatientAvatar}>
                                            {selectedPatient.firstName?.[0] || ""}{selectedPatient.lastName?.[0] || ""}
                                        </div>
                                        <div className={styles.visitPatientInfo}>
                                            <div className={styles.visitPatientName}>
                                                {selectedPatient.firstName} {selectedPatient.lastName}
                                            </div>
                                            <div className={styles.visitPatientMeta}>
                                                <span className={styles.visitPatientChip}>{selectedPatient.patientNumber}</span>
                                                <span className={styles.visitPatientChip}>
                                                    {calculateAge(selectedPatient.dateOfBirth)} yrs
                                                </span>
                                                <span className={styles.visitPatientChip}>
                                                    {selectedPatient.gender || "—"}
                                                </span>
                                                {selectedPatient.phone && (
                                                    <span className={styles.visitPatientChipMuted}>{selectedPatient.phone}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Smart suggestion banner */}
                                    {visitSuggestion && (
                                        <div
                                            className={styles.visitSuggestionBanner}
                                            data-tone={visitSuggestion.suggestedType === 'FOLLOW_UP' ? 'green' : 'indigo'}
                                        >
                                            <Sparkles size={14} />
                                            <div>
                                                <strong>Suggested: {visitSuggestion.suggestedType}</strong>
                                                <div className={styles.visitSuggestionReason}>
                                                    {visitSuggestion.reason}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── Visit Type Picker (dropdown) ── */}
                                    <div className={styles.visitSection}>
                                        <div className={styles.visitSectionHeader}>
                                            <span className={styles.visitSectionNumber}>1</span>
                                            <span className={styles.visitSectionTitle}>Visit Type</span>
                                            <span className={styles.visitSectionHint}>
                                                Non-billable types skip the consultation fee
                                            </span>
                                        </div>

                                        <select
                                            className={styles.select}
                                            value={visitData.type}
                                            onChange={(e) => setVisitData({ ...visitData, type: e.target.value, linkedPriorVisitId: '' })}
                                            required
                                        >
                                            <optgroup label="Consultation visits">
                                                <option value="OPD">OPD — General outpatient (UGX 50K)</option>
                                                <option value="EMERGENCY">Emergency (UGX 50K)</option>
                                                <option value="SCHEDULED">Scheduled (UGX 50K)</option>
                                                <option value="OTHER">Other (UGX 50K)</option>
                                                <option value="FOLLOW_UP">Follow-up — link to prior visit (no fee)</option>
                                                <option value="LAB_REVIEW">Lab/Radiology review (no fee)</option>
                                                <option value="VACCINATION">Vaccination only (no fee)</option>
                                                <option value="ANTENATAL">Antenatal (no fee)</option>
                                            </optgroup>
                                            <optgroup label="Direct service (skips triage + consultation)">
                                                <option value="LAB_ONLY">Lab only</option>
                                                <option value="RADIOLOGY_ONLY">Radiology only</option>
                                                <option value="PRESCRIPTION_ONLY">Prescription only</option>
                                            </optgroup>
                                        </select>
                                    </div>

                                    {/* FOLLOW_UP: link to a prior visit */}
                                    {visitData.type === "FOLLOW_UP" && (
                                        <div className={styles.visitSection}>
                                            <div className={styles.visitSectionHeader}>
                                                <span className={styles.visitSectionNumber}>2</span>
                                                <span className={styles.visitSectionTitle}>Prior Visit</span>
                                                <span className={styles.visitSectionHint}>
                                                    Must be Completed within 14 days
                                                </span>
                                            </div>
                                            <select
                                                className={styles.select}
                                                value={visitData.linkedPriorVisitId}
                                                onChange={(e) => setVisitData({ ...visitData, linkedPriorVisitId: e.target.value })}
                                                required
                                            >
                                                <option value="">— Select a recent completed visit —</option>
                                                {priorVisits.length === 0 && !loadingPriorVisits && (
                                                    <option value="" disabled>No eligible prior visits in last 14 days</option>
                                                )}
                                                {loadingPriorVisits && (
                                                    <option value="" disabled>Loading prior visits…</option>
                                                )}
                                                {priorVisits.map(v => (
                                                    <option key={v.id} value={v.id}>
                                                        {v.visitNumber} — {v.type}{v.checkInTime ? ` — ${new Date(v.checkInTime).toLocaleDateString()}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    {insuranceEnabled && selectedPatient.insuranceEnrollments && selectedPatient.insuranceEnrollments.length > 0 && (() => {
                                        const enrollment = selectedPatient.insuranceEnrollments![0];
                                        const isBillable = !['FOLLOW_UP', 'LAB_REVIEW', 'VACCINATION', 'ANTENATAL', 'LAB_ONLY', 'RADIOLOGY_ONLY', 'PRESCRIPTION_ONLY']
                                            .includes(visitData.type.toUpperCase());
                                        if (!isBillable) return null;
                                        const status = validationResult?.status;
                                        return (
                                            <div className={styles.visitSection}>
                                                <div className={styles.visitSectionHeader}>
                                                    <span className={styles.visitSectionNumber}>3</span>
                                                    <span className={styles.visitSectionTitle}>Insurance Validation</span>
                                                    <span className={styles.visitSectionHint}>
                                                        Cross-check with the third-party system
                                                    </span>
                                                </div>
                                                <div
                                                    className={styles.insuranceValidationCard}
                                                    data-status={status || 'idle'}
                                                >
                                                    <div className={styles.insuranceValidationHeader}>
                                                        <div className={styles.insuranceValidationProvider}>
                                                            
                                                            <div>
                                                                <div className={styles.insuranceValidationProviderName}>
                                                                    {enrollment.insurance.name}
                                                                </div>
                                                                {enrollment.policyNumber && (
                                                                    <div className={styles.insuranceValidationPolicy}>
                                                                        Policy {enrollment.policyNumber}
                                                                        {enrollment.memberNumber ? ` · Member ${enrollment.memberNumber}` : ''}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={handleValidateInsurance}
                                                            disabled={validationState === 'validating'}
                                                            className={styles.insuranceValidateBtn}
                                                            data-status={status || 'idle'}
                                                        >
                                                            {validationState === 'validating' && <><Loader2 size={14} className="spin" /> Validating…</>}
                                                            {validationState === 'idle' && 'Validate Insurance'}
                                                            {validationState === 'done' && (
                                                                status === 'APPROVED' ? 'Re-validate' : 'Try Again'
                                                            )}
                                                        </button>
                                                    </div>
                                                    <div className={styles.insuranceValidationBody}>
                                                        {validationState === 'idle' && (
                                                            <div className={styles.insuranceValidationHint}>
                                                                <AlertCircle size={13} />
                                                                Not yet validated. Run the third-party check to confirm coverage for this visit, or skip to park the visit for later.
                                                            </div>
                                                        )}
                                                        {validationState === 'validating' && (
                                                            <div className={styles.insuranceValidationStatus} data-status="validating">
                                                                <Loader2 size={14} className="spin" />
                                                                Cross-checking with {enrollment.insurance.name}…
                                                            </div>
                                                        )}
                                                        {validationState === 'done' && status === 'APPROVED' && (
                                                            <div className={styles.insuranceValidationStatus} data-status="approved">
                                                                <CheckCircle2 size={14} />
                                                                <div>
                                                                    <strong>Approved{validationResult.verificationNumber ? ` (${validationResult.verificationNumber})` : ''}</strong>
                                                                    <div className={styles.insuranceValidationReason}>
                                                                        Consultation fee will be added to the FINAL- invoice and submitted as a claim to {enrollment.insurance.name}.
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {validationState === 'done' && status === 'DENIED' && (
                                                            <div className={styles.insuranceValidationStatus} data-status="denied">
                                                                <XCircle size={14} />
                                                                <div>
                                                                    <strong>Denied</strong>
                                                                    <div className={styles.insuranceValidationReason}>
                                                                        {validationResult.reason || 'no reason given'}. Falling back to cash — consultation fee invoice will be issued at the negotiated rate.
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {validationState === 'done' && status === 'ERROR' && (
                                                            <div className={styles.insuranceValidationStatus} data-status="error">
                                                                <AlertTriangle size={14} />
                                                                <div>
                                                                    <strong>Provider unavailable</strong>
                                                                    <div className={styles.insuranceValidationReason}>
                                                                        {validationError || validationResult.reason || 'try again later'}. Visit will be parked for retry.
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {validationState === 'done' && (
                                                            <div className={styles.insuranceValidationSkip}>
                                                                Or{' '}
                                                                <a
                                                                    href="#"
                                                                    onClick={(e) => { e.preventDefault(); setValidationResult(null); setValidationState('idle'); setValidationError(null); }}
                                                                >
                                                                    skip validation
                                                                </a>
                                                                {' '}— visit will be parked at PendingInsuranceValidation.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* ── Doctor + Complaint ── */}
                                    <div className={styles.visitSection}>
                                        <div className={styles.visitSectionHeader}>
                                            <span className={styles.visitSectionNumber}>
                                                {insuranceEnabled
                                                    && selectedPatient.insuranceEnrollments
                                                    && selectedPatient.insuranceEnrollments.length > 0
                                                    && !['FOLLOW_UP', 'LAB_REVIEW', 'VACCINATION', 'ANTENATAL', 'LAB_ONLY', 'RADIOLOGY_ONLY', 'PRESCRIPTION_ONLY']
                                                        .includes(visitData.type.toUpperCase()) ? '3' : '2'}
                                            </span>
                                            <span className={styles.visitSectionTitle}>Doctor &amp; Complaint</span>
                                        </div>

                                        <div className={styles.formGroup}>
                                            <label className={styles.label}>Assign Doctor *</label>
                                            <select
                                                className={styles.select}
                                                value={visitData.doctorId}
                                                onChange={(e) => setVisitData({ ...visitData, doctorId: e.target.value })}
                                                required
                                            >
                                                <option value="">Select Doctor</option>
                                                {doctors.map(doc => (
                                                    <option key={doc.id} value={doc.id}>
                                                        {doc.name}{(doc as any).department ? ` — ${(doc as any).department}` : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className={styles.formGroup}>
                                            <label className={styles.label}>Chief Complaint (optional)</label>
                                            <textarea
                                                className={styles.textarea}
                                                placeholder="Brief description of why the patient is visiting today…"
                                                value={visitData.chiefComplaint}
                                                onChange={(e) => setVisitData({ ...visitData, chiefComplaint: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* ── Modal Footer ── */}
                                <div className={styles.visitModalFooter}>
                                    <button
                                        type="button"
                                        className={styles.cancelBtn}
                                        onClick={() => setShowVisitModal(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className={styles.submitBtn}
                                        disabled={isCreatingVisit}
                                    >
                                        {isCreatingVisit ? (
                                            <><Loader2 size={16} className="spin" /> Creating…</>
                                        ) : (
                                            <><CalendarPlus size={16} /> Start Visit</>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
