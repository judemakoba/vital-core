"use client";

import { useState, useEffect, useMemo } from "react";
import {
    Search, Plus, Eye, CalendarPlus, Trash2, X, Edit, Sparkles, Loader2, ArrowLeft,
    Users, UserCheck, UserX, UserPlus, Filter, ArrowDownNarrowWide, ArrowUpNarrowWide,
    ArrowDownAZ, ArrowUpAZ, Eraser, Inbox
} from "lucide-react";
import styles from "./page.module.css";
import Link from "next/link";
import { useSession } from "next-auth/react";

/**
 * Patients Directory.
 *
 * Cash-only flow (insurance module was removed 2026-08):
 *   - No per-patient insurance enrollments, no third-party verification panel.
 *   - All visits are billed up front (ConsultationBilling for billable types,
 *     Triage for zero-fee auto-transition, DirectServicePending for direct
 *     service types).
 *
 * R45 features that ARE preserved:
 *   - Smart visit-type suggestion based on patient's last visit
 *   - FOLLOW_UP prior-visit picker (must link to a recent Completed visit)
 *   - Rich pop-out visit creation modal with patient banner + sectioned form
 */

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
    department?: string | null;
    role?: { name: string };
}

interface PriorVisit {
    id: string;
    visitNumber: string;
    type: string;
    checkInTime: string | null;
    status: string;
    chiefComplaint?: string | null;
}

interface VisitSuggestion {
    suggestedType: string;
    reason: string;
    followUpWindowDays?: number;
}

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "newest" | "oldest" | "name_az" | "name_za";

// Map UI sort keys to API sortBy/sortOrder. The API whitelists
// `createdAt`, `firstName`, `lastName`, `patientNumber` so this is
// safe to send verbatim.
const SORT_TO_API: Record<SortKey, { sortBy: string; sortOrder: "asc" | "desc" }> = {
    newest:    { sortBy: "createdAt", sortOrder: "desc" },
    oldest:    { sortBy: "createdAt", sortOrder: "asc" },
    name_az:   { sortBy: "firstName", sortOrder: "asc" },
    name_za:   { sortBy: "firstName", sortOrder: "desc" },
};

const SORT_LABELS: Record<SortKey, string> = {
    newest: "Newest first",
    oldest: "Oldest first",
    name_az: "Name A–Z",
    name_za: "Name Z–A",
};

const formatRegistered = (iso: string) => {
    if (!iso) return { day: "—", time: "" };
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { day: "—", time: "" };
    const day = `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { day, time };
};

export default function PatientsPage() {
    const { data: session } = useSession();
    const canDelete = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

    const [patients, setPatients] = useState<Patient[]>([]);
    const [stats, setStats] = useState<{ total: number; active: number; inactive: number } | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [sortKey, setSortKey] = useState<SortKey>("newest");
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    // New Visit Modal
    const [showVisitModal, setShowVisitModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [visitData, setVisitData] = useState({
        type: "OPD",
        doctorId: "",
        chiefComplaint: "",
        linkedPriorVisitId: "" as string,
    });
    const [priorVisits, setPriorVisits] = useState<PriorVisit[]>([]);
    const [loadingPriorVisits, setLoadingPriorVisits] = useState(false);
    const [isCreatingVisit, setIsCreatingVisit] = useState(false);

    // Smart visit-type suggestion (cash-only flow)
    const [visitSuggestion, setVisitSuggestion] = useState<VisitSuggestion | null>(null);
    const [loadingSuggestion, setLoadingSuggestion] = useState(false);

    // Inline status for the create-visit result (since the visit detail page
    // route is in flux; keeps the user on the directory and shows a banner)
    const [visitFeedback, setVisitFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

    useEffect(() => {
        const fetchPatients = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (search) params.set("search", search);
                if (statusFilter !== "all") params.set("status", statusFilter);
                const sortApi = SORT_TO_API[sortKey];
                params.set("sortBy", sortApi.sortBy);
                params.set("sortOrder", sortApi.sortOrder);
                params.set("withStats", "true");
                params.set("page", String(page));
                const res = await fetch(`/api/patients?${params.toString()}`, {
                    credentials: "include",
                });
                if (res.ok) {
                    const data = await res.json();
                    setPatients(data.data || []);
                    setTotalPages(data.totalPages || 1);
                    setTotalCount(data.total || 0);
                    if (data.stats) setStats(data.stats);
                } else if (res.status === 401) {
                    window.location.href = "/login";
                } else {
                    const err = await res.json().catch(() => ({}));
                    console.error("Failed to fetch patients:", res.status, err);
                }
            } catch (err) {
                console.error("Failed to fetch patients:", err);
            }
            setLoading(false);
        };
        // 300 ms debounce so we don't refetch on every keystroke but
        // still feel responsive.
        const t = setTimeout(fetchPatients, 300);
        return () => clearTimeout(t);
    }, [search, page, statusFilter, sortKey]);

    useEffect(() => {
        if (showVisitModal) {
            // Load doctors for the assign-doctor picker
            fetch("/api/users?role=DOCTOR", { credentials: "include" })
                .then(r => r.ok ? r.json() : [])
                .then(data => setDoctors(Array.isArray(data) ? data : []))
                .catch(err => console.error("Failed to fetch doctors", err));
        }
    }, [showVisitModal]);

    // Reset to page 1 whenever a filter or sort changes. Without
    // this, paging past page 1 with a filter that has fewer results
    // shows an empty table.
    useEffect(() => {
        setPage(1);
    }, [search, statusFilter, sortKey]);

    const calculateAge = (dobString: string | null | undefined) => {
        if (!dobString) return "N/A";
        const dob = new Date(dobString);
        if (isNaN(dob.getTime())) return "N/A";
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
        return age;
    };

    const hasActiveFilters = !!search || statusFilter !== "all";
    const clearFilters = () => {
        setSearch("");
        setStatusFilter("all");
    };

    const handleDelete = async (id: string, name: string) => {
        const confirmMsg = `Are you sure you want to delete ${name}? Patients with history will be deactivated instead of deleted.`;
        if (!confirm(confirmMsg)) return;
        try {
            const res = await fetch(`/api/patients/${id}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                alert(data.message || `${name} removed.`);
                window.location.reload();
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || "Failed to delete patient");
            }
        } catch (err) {
            alert("Error deleting patient");
        }
    };

    const openVisitModal = (p: Patient) => {
        setSelectedPatient(p);
        setVisitData({ type: "OPD", doctorId: "", chiefComplaint: "", linkedPriorVisitId: "" });
        setVisitSuggestion(null);
        setPriorVisits([]);
        setVisitFeedback(null);

        setShowVisitModal(true);

        // Smart suggestion based on patient's visit history
        setLoadingSuggestion(true);
        fetch(`/api/patients/${p.id}/visit-suggestion`, { credentials: "include" })
            .then(r => r.ok ? r.json() : null)
            .then((d: VisitSuggestion | null) => {
                if (d && d.suggestedType) {
                    setVisitSuggestion(d);
                    setVisitData(prev => ({ ...prev, type: d.suggestedType }));
                }
            })
            .catch(() => {})
            .finally(() => setLoadingSuggestion(false));

        // Prior visits for FOLLOW_UP picker
        setLoadingPriorVisits(true);
        fetch(`/api/patients/${p.id}/recent-visits`, { credentials: "include" })
            .then(r => r.ok ? r.json() : null)
            .then((d: PriorVisit[] | null) => {
                if (Array.isArray(d)) setPriorVisits(d);
            })
            .catch(() => {})
            .finally(() => setLoadingPriorVisits(false));
    };

    const handleCreateVisit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatient || !visitData.doctorId) return;
        if (visitData.type === "FOLLOW_UP" && !visitData.linkedPriorVisitId) {
            setVisitFeedback({ kind: "err", text: "Please select the prior visit this follow-up is linked to." });
            return;
        }

        setIsCreatingVisit(true);
        setVisitFeedback(null);
        try {
            const payload: Record<string, unknown> = {
                type: visitData.type,
                doctorId: visitData.doctorId,
                chiefComplaint: visitData.chiefComplaint,
            };
            if (visitData.type === "FOLLOW_UP" && visitData.linkedPriorVisitId) {
                payload.linkedPriorVisitId = visitData.linkedPriorVisitId;
            }
            const res = await fetch(`/api/patients/${selectedPatient.id}/visit`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                let msg: string;
                if (data.isDirectService) {
                    msg = `direct service (${data.initialStatus})`;
                } else if (data.feeCharged) {
                    msg = `cash patient — consultation fee UGX ${Number(data.consultationFee || 0).toLocaleString()}, status: ${data.initialStatus}`;
                } else {
                    msg = `no consultation fee, status: ${data.initialStatus}`;
                }
                setVisitFeedback({ kind: "ok", text: `Visit ${data.visitNumber} created — ${msg}.` });
                // Auto-close and route to the main dashboard
                setTimeout(() => {
                    setShowVisitModal(false);
                    window.location.href = `/dashboard`;
                }, 1200);
                return;
            }
            setVisitFeedback({ kind: "err", text: data.error || "Failed to create visit" });
            // Close on hard validation errors to avoid the user re-submitting
            if (res.status === 400) {
                setTimeout(() => {
                    setShowVisitModal(false);
                    setSelectedPatient(null);
                }, 1500);
            }
        } catch (err: any) {
            setVisitFeedback({ kind: "err", text: err?.message || "Network error" });
        } finally {
            setIsCreatingVisit(false);
        }
    };

    // Choose the right SortIcon for the current sortKey so the
    // dropdown preview hints at the direction.
    const SortIcon = useMemo(() => {
        if (sortKey === "oldest") return ArrowUpNarrowWide;
        if (sortKey === "name_az") return ArrowDownAZ;
        if (sortKey === "name_za") return ArrowUpAZ;
        return ArrowDownNarrowWide;
    }, [sortKey]);

    return (
        <div className={styles.container}>
            {/* R57: small back link to the dashboard home, matching the
                pattern used on /dashboard/patients/new (back-to-directory
                link in its own row above the page header). Uses a Link,
                not router.back(), so it always lands on /dashboard even
                if the user navigated here from somewhere unexpected. */}
            <Link href="/dashboard" className={styles.backLink}>
                <ArrowLeft size={16} /> Back to Dashboard
            </Link>

            {/* Page header */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Patients Directory</h1>
                    <p className={styles.subtitle}>
                        All registered patients — search, filter, and start visits in one place.
                    </p>
                </div>
                <Link href="/dashboard/patients/new" className={styles.addBtn}>
                    <Plus size={18} /> Register Patient
                </Link>
            </div>

            {/* Stats — over the directory as a whole (the API returns
                the active/inactive/total breakdown alongside the page). */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>
                        <Users size={14} color="var(--primary-color)" style={{ marginRight: "0.4rem" }} />
                        Total Patients
                    </div>
                    <div className={styles.statValue}>
                        {stats ? stats.total.toLocaleString() : "—"}
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>
                        <UserCheck size={14} color="var(--success-color)" style={{ marginRight: "0.4rem" }} />
                        Active
                    </div>
                    <div className={styles.statValue} style={{ color: "var(--success-color)" }}>
                        {stats ? stats.active.toLocaleString() : "—"}
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>
                        <UserX size={14} color="var(--text-muted)" style={{ marginRight: "0.4rem" }} />
                        Inactive
                    </div>
                    <div className={styles.statValue} style={{ color: stats && stats.inactive > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {stats ? stats.inactive.toLocaleString() : "—"}
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>
                        <UserPlus size={14} color="var(--info-color)" style={{ marginRight: "0.4rem" }} />
                        {hasActiveFilters ? "Showing (filtered)" : "On this page"}
                    </div>
                    <div className={styles.statValue}>
                        {patients.length}
                        {!hasActiveFilters && stats && stats.total !== patients.length && (
                            <span className={styles.statSubValue}>
                                / {stats.total.toLocaleString()}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter bar — single row with labeled groups */}
            <div className={`glass-card ${styles.filterBar}`}>
                {/* Group 1: status */}
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>
                        <Filter size={14} />
                        Status
                    </label>
                    <select
                        className={styles.filterSelect}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    >
                        <option value="all">All</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>

                <span className={styles.filterDivider} aria-hidden="true" />

                {/* Group 2: sort */}
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>
                        <SortIcon size={14} />
                        Sort
                    </label>
                    <select
                        className={styles.filterSelect}
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value as SortKey)}
                        aria-label="Sort patients"
                    >
                        {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                            <option key={k} value={k}>{SORT_LABELS[k]}</option>
                        ))}
                    </select>
                </div>

                <span className={styles.filterDivider} aria-hidden="true" />

                {/* Group 3: search (flex-grows to fill the bar) */}
                <div className={styles.searchWrap}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search by name, ID, or phone number…"
                        className={styles.searchInput}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {/* Clear filters — only when something is active */}
                {hasActiveFilters && (
                    <button
                        type="button"
                        className={styles.clearBtn}
                        onClick={clearFilters}
                        title="Clear all filters"
                    >
                        <Eraser size={14} /> Clear
                    </button>
                )}
            </div>

            {/* Result-count strip — mirrors the billing page so the
                user has context for the table below. */}
            <div className={styles.resultCount}>
                <span className={hasActiveFilters ? styles.resultCountActive : styles.resultCountInactive}>
                    {loading
                        ? "Loading…"
                        : `Showing ${patients.length} of ${totalCount.toLocaleString()} patient${totalCount === 1 ? "" : "s"}${hasActiveFilters ? " (filtered)" : ""}`}
                </span>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Patient Details</th>
                            <th className={styles.th}>Patient Number</th>
                            <th className={styles.th}>Contact</th>
                            <th className={styles.th}>Age / Gender</th>
                            <th className={styles.th}>Registered</th>
                            <th className={styles.th}>Status</th>
                            <th className={`${styles.th} ${styles.thRight}`}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={7} className={`${styles.td} ${styles.tdCenter} ${styles.tdEmpty}`}>
                                    <Loader2 size={20} className={styles.spin} style={{ marginRight: "0.5rem", verticalAlign: "middle" }} />
                                    Loading records…
                                </td>
                            </tr>
                        ) : patients.length === 0 ? (
                            <tr>
                                <td colSpan={7} className={`${styles.td} ${styles.tdCenter} ${styles.tdEmpty}`}>
                                    <Inbox size={28} className={styles.emptyIcon} />
                                    <div className={styles.emptyTitle}>
                                        {hasActiveFilters ? "No patients match your filters" : "No patients yet"}
                                    </div>
                                    <div className={styles.emptyHint}>
                                        {hasActiveFilters
                                            ? "Try clearing the filters or registering a new patient."
                                            : "Click \u201cRegister Patient\u201d to add the first one."}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            patients.map(patient => {
                                const reg = formatRegistered(patient.createdAt);
                                return (
                                    <tr
                                        key={patient.id}
                                        className={`${styles.tr} ${!patient.isActive ? styles.inactiveRow : ""}`}
                                    >
                                        <td className={styles.td}>
                                            <div className={styles.patientName}>
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
                                            <div className={styles.tdDate}>
                                                <div className={styles.tdDateDay}>{reg.day}</div>
                                                {reg.time && <div className={styles.tdDateTime}>{reg.time}</div>}
                                            </div>
                                        </td>
                                        <td className={styles.td}>
                                            <span className={`${styles.statusBadge} ${patient.isActive ? styles.active : styles.inactive}`}>
                                                {patient.isActive ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td className={`${styles.td} ${styles.tdActions}`}>
                                            <Link
                                                href={`/dashboard/patients/${patient.id}`}
                                                className={styles.iconBtn}
                                                title="View Profile"
                                                aria-label="View patient profile"
                                            >
                                                <Eye size={16} />
                                            </Link>
                                            {canDelete && (
                                                <Link
                                                    href={`/dashboard/patients/${patient.id}/edit`}
                                                    className={styles.iconBtn}
                                                    title="Edit Patient"
                                                    aria-label="Edit patient"
                                                >
                                                    <Edit size={16} />
                                                </Link>
                                            )}
                                            <button
                                                className={`${styles.iconBtn} ${styles.iconBtnSuccess}`}
                                                title="New Visit"
                                                aria-label="Create new visit"
                                                onClick={() => openVisitModal(patient)}
                                                disabled={!patient.isActive}
                                            >
                                                <CalendarPlus size={16} />
                                            </button>
                                            {canDelete && (
                                                <button
                                                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                                    title="Delete Patient"
                                                    aria-label="Delete patient"
                                                    onClick={() => handleDelete(patient.id, `${patient.firstName} ${patient.lastName}`)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
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
                        <span className={styles.pageInfo}>
                            Page {page} of {totalPages}
                        </span>
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
            {showVisitModal && selectedPatient && (
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
                                {loadingSuggestion && (
                                    <div className={styles.visitSuggestionBanner} data-tone="indigo">
                                        <Loader2 size={14} className={styles.spin} />
                                        <div>
                                            <strong>Looking at recent visits…</strong>
                                        </div>
                                    </div>
                                )}
                                {visitSuggestion && !loadingSuggestion && (
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

                                {/* ── Visit Type Picker ── */}
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
                                            <option value="OPD">OPD — General outpatient</option>
                                            <option value="EMERGENCY">Emergency</option>
                                            <option value="SCHEDULED">Scheduled</option>
                                            <option value="OTHER">Other</option>
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
                                            {loadingPriorVisits && (
                                                <option value="" disabled>Loading prior visits…</option>
                                            )}
                                            {!loadingPriorVisits && priorVisits.length === 0 && (
                                                <option value="" disabled>No eligible prior visits in last 14 days</option>
                                            )}
                                            {priorVisits.map(v => (
                                                <option key={v.id} value={v.id}>
                                                    {v.visitNumber} — {v.type}{v.checkInTime ? ` — ${new Date(v.checkInTime).toLocaleDateString()}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* ── Doctor + Complaint ── */}
                                <div className={styles.visitSection}>
                                    <div className={styles.visitSectionHeader}>
                                        <span className={styles.visitSectionNumber}>
                                            {visitData.type === "FOLLOW_UP" ? '3' : '2'}
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
                                                    {doc.name}{doc.department ? ` — ${doc.department}` : ""}
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

                                {visitFeedback && (
                                    <div
                                        className={styles.visitSuggestionBanner}
                                        data-tone={visitFeedback.kind === "ok" ? "green" : "indigo"}
                                        style={visitFeedback.kind === "err" ? { borderColor: "var(--tint-danger-border)", background: "var(--tint-danger-soft)" } : undefined}
                                    >
                                        {visitFeedback.kind === "ok" ? <Sparkles size={14} /> : <X size={14} />}
                                        <div>
                                            <strong>{visitFeedback.kind === "ok" ? "Success" : "Error"}</strong>
                                            <div className={styles.visitSuggestionReason}>
                                                {visitFeedback.text}
                                            </div>
                                        </div>
                                    </div>
                                )}
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
                                        <><Loader2 size={16} className={styles.spin} /> Creating…</>
                                    ) : (
                                        <><CalendarPlus size={16} /> Start Visit</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
