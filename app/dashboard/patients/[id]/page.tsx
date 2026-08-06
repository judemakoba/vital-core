"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    User, Phone, Mail, MapPin, ArrowLeft,
    Activity, HeartPulse, Pill, AlertCircle,
    Clock, Users, Edit2, CalendarCheck, FileText, Shield
} from "lucide-react";
import Link from "next/link";
import styles from "../page.module.css";
import stylesProfile from "./profile.module.css";

/**
 * R48 + R48c: Insurance enrollment is captured at patient registration
 * (and can be edited via the patient edit form). The patient profile
 * shows the current enrollment as an informational section so the
 * cashier can see at a glance which insurer covers this patient
 * (and which policy / member # to verify with the third-party when
 * the visit is created).
 */
interface InsuranceEnrollment {
    id: string;
    insuranceId: string;
    memberNumber: string | null;
    policyNumber: string;
    status: string;
    isActive: boolean;
    coverageStart: string | null;
    coverageEnd: string | null;
    insurance: { id: string; name: string; code: string };
}

interface Patient {
    id: string;
    patientNumber: string;
    firstName: string;
    lastName: string;
    phone: string;
    alternativePhone: string;
    email: string;
    dateOfBirth: string;
    gender: string;
    bloodGroup: string;
    maritalStatus: string;
    occupation: string;
    address: string;
    city: string;
    district: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    emergencyContactRel: string;
    nextOfKinName: string;
    nextOfKinPhone: string;
    nextOfKinEmail: string;
    nextOfKinAddress: string;
    nextOfKinRel: string;
    allergies: string;
    chronicConditions: string;
    currentMedications: string;
    // R48c: the most-recent active enrollment is shown in the
    // profile (informational). Edit via the patient edit form.
    insuranceEnrollments?: InsuranceEnrollment[];
}

interface Visit {
    id: string;
    patientId: string;
    type: string;
    chiefComplaint: string;
    status: string;
    createdAt: string;
    doctor: { name: string };
}

type Tab = "overview" | "medical" | "visits" | "contacts";

export default function PatientProfilePage() {
    const params = useParams();
    const router = useRouter();
    const [patient, setPatient] = useState<Patient | null>(null);
    const [visits, setVisits] = useState<Visit[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>("overview");
    // R49: feature flag — when OFF, hide the Insurance Enrollment
    // card on the profile.
    const [insuranceEnabled, setInsuranceEnabled] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [patientRes, visitsRes, flagRes] = await Promise.all([
                    fetch(`/api/patients/${params.id}`),
                    fetch(`/api/patients/${params.id}/visits`),
                    fetch("/api/insurance/enabled"),
                ]);
                if (patientRes.ok) setPatient(await patientRes.json());
                if (visitsRes.ok) setVisits(await visitsRes.json());
                if (flagRes.ok) {
                    const data = await flagRes.json();
                    setInsuranceEnabled(data.enabled !== false);
                }
            } catch (err) {
                console.error("Failed to fetch patient data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [params.id]);

    if (loading) return <div className={styles.container}><p style={{ color: "var(--text-muted)" }}>Loading...</p></div>;
    if (!patient) return <div className={styles.container}><p style={{ color: "var(--danger-color)" }}>Patient not found.</p></div>;

    const getAge = (dobString: string | null | undefined) => {
        if (!dobString) return "N/A";
        const dob = new Date(dobString);
        if (isNaN(dob.getTime())) return "N/A";
        const diffMs = Date.now() - dob.getTime();
        return Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
    };

    const getInitials = (first: string, last: string) =>
        `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase();

    const getStatusClass = (status: string) => {
        const map: Record<string, string> = {
            Billing: "statusBilling",
            Waiting: "statusWaiting",
            Triage: "statusTriage",
            Triaged: "statusTriaged",
            Consultation: "statusConsultation",
            Doctor: "statusDoctor",
            Pharmacy: "statusPharmacy",
            Laboratory: "statusLaboratory",
            Completed: "statusCompleted",
        };
        return map[status] || "";
    };

    const hasMedicalAlerts = patient.allergies || patient.chronicConditions || patient.currentMedications;

    return (
        <div className={styles.container}>
            {/* Compact Header */}
            <div className={stylesProfile.profileHeader}>
                <div className={stylesProfile.avatar}>{getInitials(patient.firstName, patient.lastName)}</div>
                <div className={stylesProfile.headerMeta}>
                    <div className={stylesProfile.patientName}>{patient.firstName} {patient.lastName}</div>
                    <div className={stylesProfile.patientNumber}>{patient.patientNumber}</div>
                    <div className={stylesProfile.badges}>
                        <span className={stylesProfile.badge}>{getAge(patient.dateOfBirth)} yrs</span>
                        <span className={stylesProfile.badge}>{patient.gender || "—"}</span>
                        {patient.bloodGroup && (
                            <span className={`${stylesProfile.badge} ${stylesProfile.badgeRed}`}>{patient.bloodGroup}</span>
                        )}
                        {patient.maritalStatus && (
                            <span className={stylesProfile.badge}>{patient.maritalStatus}</span>
                        )}
                        {patient.occupation && (
                            <span className={`${stylesProfile.badge} ${stylesProfile.badgeBlue}`}>{patient.occupation}</span>
                        )}
                    </div>
                </div>
                <Link href={`/dashboard/patients/${patient.id}/edit`} className={styles.addBtn}>
                    <Edit2 size={14} /> Edit
                </Link>
            </div>

            {/* Tab Bar */}
            <div className={stylesProfile.tabBar}>
                {(["overview", "medical", "visits", "contacts"] as Tab[]).map(tab => (
                    <button
                        key={tab}
                        className={`${stylesProfile.tab} ${activeTab === tab ? stylesProfile.tabActive : ""}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === "overview" && <><Activity size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />Overview</>}
                        {tab === "medical" && <><HeartPulse size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />Medical</>}
                        {tab === "visits" && <><CalendarCheck size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />Visits{visits.length > 0 && <span className={stylesProfile.tabDot} title={`${visits.length} visits`} />}</>}
                        {tab === "contacts" && <><Users size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />Contacts</>}
                    </button>
                ))}
            </div>

            {/* ── Overview Tab ── */}
            {activeTab === "overview" && (
                <div className={stylesProfile.grid2}>
                    <div>
                        {/* Personal Information (bio data) */}
                        <div className={stylesProfile.cardRow}>
                            <div className={stylesProfile.sectionTitle}><User size={14} />Personal Information</div>
                            <div className={stylesProfile.infoRow}>
                                <label>Full Name</label>
                                <span>{patient.firstName} {patient.lastName}</span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Patient Number</label>
                                <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{patient.patientNumber}</span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Date of Birth</label>
                                <span>
                                    {patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : "—"}
                                    {patient.dateOfBirth && ` (${getAge(patient.dateOfBirth)} yrs)`}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Gender</label>
                                <span>{patient.gender || <span style={{ color: "var(--text-muted)" }}>Not provided</span>}</span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Blood Group</label>
                                <span>
                                    {patient.bloodGroup || <span style={{ color: "var(--text-muted)" }}>Unknown</span>}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Marital Status</label>
                                <span>
                                    {patient.maritalStatus || <span style={{ color: "var(--text-muted)" }}>Not provided</span>}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Occupation</label>
                                <span>
                                    {patient.occupation || <span style={{ color: "var(--text-muted)" }}>Not provided</span>}
                                </span>
                            </div>
                        </div>

                        {/* Contact Information */}
                        <div className={stylesProfile.cardRow} style={{ marginTop: "0.75rem" }}>
                            <div className={stylesProfile.sectionTitle}><Phone size={14} />Contact Information</div>
                            <div className={stylesProfile.infoRow}>
                                <label>Phone</label>
                                <span style={{ fontWeight: 700, color: "var(--primary-color)" }}>{patient.phone || "—"}</span>
                            </div>
                            {patient.alternativePhone && (
                                <div className={stylesProfile.infoRow}>
                                    <label>Alternative Phone</label>
                                    <span>{patient.alternativePhone}</span>
                                </div>
                            )}
                            <div className={stylesProfile.infoRow}>
                                <label>Email</label>
                                <span>
                                    {patient.email || <span style={{ color: "var(--text-muted)" }}>Not provided</span>}
                                </span>
                            </div>
                        </div>

                        {/* Address */}
                        <div className={stylesProfile.cardRow} style={{ marginTop: "0.75rem" }}>
                            <div className={stylesProfile.sectionTitle}><MapPin size={14} />Address</div>
                            <div className={stylesProfile.infoRow}>
                                <label>Street</label>
                                <span>
                                    {patient.address || <span style={{ color: "var(--text-muted)" }}>Not provided</span>}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>City</label>
                                <span>
                                    {patient.city || <span style={{ color: "var(--text-muted)" }}>—</span>}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>District</label>
                                <span>
                                    {patient.district || <span style={{ color: "var(--text-muted)" }}>—</span>}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div>
                        {/* Insurance Enrollment (informational) — R49: hidden
                            when the insurance feature is OFF for this clinic. */}
                        {insuranceEnabled && (
                        <div className={stylesProfile.cardRow}>
                            <div className={stylesProfile.sectionTitle}><Shield size={14} />Insurance Enrollment</div>
                            {(() => {
                                const enrollment = (patient.insuranceEnrollments || []).find(e => e.isActive)
                                    || (patient.insuranceEnrollments || [])[0]
                                    || null;
                                if (!enrollment) {
                                    return (
                                        <div style={{ padding: "0.625rem 0.75rem", fontSize: "0.8rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-color)", borderRadius: 6 }}>
                                            No insurance on file — patient is treated as cash. Coverage is validated per visit when applicable.
                                        </div>
                                    );
                                }
                                return (
                                    <>
                                        <div className={stylesProfile.infoRow}>
                                            <label>Provider</label>
                                            <span style={{ fontWeight: 700 }}>{enrollment.insurance.name}</span>
                                        </div>
                                        <div className={stylesProfile.infoRow}>
                                            <label>Policy Number</label>
                                            <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{enrollment.policyNumber}</span>
                                        </div>
                                        {enrollment.memberNumber && (
                                            <div className={stylesProfile.infoRow}>
                                                <label>Member Number</label>
                                                <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{enrollment.memberNumber}</span>
                                            </div>
                                        )}
                                        <div className={stylesProfile.infoRow}>
                                            <label>Coverage Period</label>
                                            <span>
                                                {enrollment.coverageStart ? new Date(enrollment.coverageStart).toLocaleDateString() : "—"}
                                                {" → "}
                                                {enrollment.coverageEnd ? new Date(enrollment.coverageEnd).toLocaleDateString() : "Open-ended"}
                                            </span>
                                        </div>
                                        <div style={{ marginTop: 6 }}>
                                            <Link href={`/dashboard/patients/${patient.id}/edit`} style={{ fontSize: "0.78rem", color: "var(--primary-color)", textDecoration: "underline" }}>Edit enrollment</Link>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                        )}

                        {/* Emergency Contact */}
                        <div className={stylesProfile.cardRow} style={{ marginTop: "0.75rem" }}>
                            <div className={stylesProfile.sectionTitle}><AlertCircle size={14} />Emergency Contact</div>
                            <div className={stylesProfile.infoRow}>
                                <label>Name</label>
                                <span>
                                    {patient.emergencyContactName || <span style={{ color: "var(--text-muted)" }}>Not provided</span>}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Relationship</label>
                                <span>
                                    {patient.emergencyContactRel || <span style={{ color: "var(--text-muted)" }}>—</span>}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Phone</label>
                                <span style={{ fontWeight: 700, color: "var(--primary-color)" }}>
                                    {patient.emergencyContactPhone || <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>Not provided</span>}
                                </span>
                            </div>
                        </div>

                        {/* Next of Kin */}
                        <div className={stylesProfile.cardRow} style={{ marginTop: "0.75rem" }}>
                            <div className={stylesProfile.sectionTitle}><Users size={14} />Next of Kin</div>
                            <div className={stylesProfile.infoRow}>
                                <label>Name</label>
                                <span>
                                    {patient.nextOfKinName || <span style={{ color: "var(--text-muted)" }}>Not provided</span>}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Relationship</label>
                                <span>
                                    {patient.nextOfKinRel || <span style={{ color: "var(--text-muted)" }}>—</span>}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Phone</label>
                                <span>
                                    {patient.nextOfKinPhone || <span style={{ color: "var(--text-muted)" }}>Not provided</span>}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Email</label>
                                <span>
                                    {patient.nextOfKinEmail || <span style={{ color: "var(--text-muted)" }}>Not provided</span>}
                                </span>
                            </div>
                            <div className={stylesProfile.infoRow}>
                                <label>Address</label>
                                <span>
                                    {patient.nextOfKinAddress || <span style={{ color: "var(--text-muted)" }}>Not provided</span>}
                                </span>
                            </div>
                        </div>

                        {/* Quick Medical Summary */}
                        {hasMedicalAlerts && (
                            <div className={stylesProfile.cardRow} style={{ marginTop: "0.75rem" }}>
                                <div className={stylesProfile.sectionTitle}><AlertCircle size={14} />Medical Alerts</div>
                                {patient.allergies && (
                                    <div className={`${stylesProfile.alertItem} ${stylesProfile.alertRed}`}>
                                        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                                        <div><strong>Allergies:</strong> {patient.allergies}</div>
                                    </div>
                                )}
                                {patient.chronicConditions && (
                                    <div className={`${stylesProfile.alertItem} ${stylesProfile.alertAmber}`}>
                                        <HeartPulse size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                                        <div><strong>Chronic Conditions:</strong> {patient.chronicConditions}</div>
                                    </div>
                                )}
                                {patient.currentMedications && (
                                    <div className={`${stylesProfile.alertItem} ${stylesProfile.alertGreen}`}>
                                        <Pill size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                                        <div><strong>Current Meds:</strong> {patient.currentMedications}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Medical Tab ── */}
            {activeTab === "medical" && (
                <div className={stylesProfile.grid3} style={{ gridTemplateColumns: "1fr" }}>
                    <div className={stylesProfile.cardRow}>
                        <div className={stylesProfile.sectionTitle}><AlertCircle size={14} />Medical Summary</div>
                        <div className={stylesProfile.grid3}>
                            <div>
                                <div className={stylesProfile.sectionTitle} style={{ borderBottom: "none", marginBottom: "0.25rem", paddingBottom: 0, fontSize: "0.7rem" }}><AlertCircle size={12} />Allergies</div>
                                <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                                    {patient.allergies || "No known allergies documented."}
                                </p>
                            </div>
                            <div>
                                <div className={stylesProfile.sectionTitle} style={{ borderBottom: "none", marginBottom: "0.25rem", paddingBottom: 0, fontSize: "0.7rem" }}><HeartPulse size={12} />Chronic Conditions</div>
                                <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                                    {patient.chronicConditions || "No chronic conditions documented."}
                                </p>
                            </div>
                            <div>
                                <div className={stylesProfile.sectionTitle} style={{ borderBottom: "none", marginBottom: "0.25rem", paddingBottom: 0, fontSize: "0.7rem" }}><Pill size={12} />Current Medications</div>
                                <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                                    {patient.currentMedications || "No current medications documented."}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Visits Tab ── */}
            {activeTab === "visits" && (
                <div className={stylesProfile.cardRow}>
                    <div className={stylesProfile.sectionTitle}><Clock size={14} />Visit History ({visits.length})</div>
                    {visits.length === 0 ? (
                        <div className={stylesProfile.emptyState}>No visits on record.</div>
                    ) : (
                        <div style={{ overflowX: "auto" }}>
                            <table className={stylesProfile.visitsTable}>
                                <thead>
                                    <tr>
                                        <th>Visit ID</th>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Doctor</th>
                                        <th>Complaint</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visits.map(visit => (
                                        <tr key={visit.id}>
                                            <td>
                                                <Link
                                                    href={`/dashboard/patients/${patient.id}/visits/${visit.id}`}
                                                    style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--primary-color)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}
                                                >
                                                    <FileText size={12} />{visit.id.slice(0, 8)}…
                                                </Link>
                                            </td>
                                            <td>{visit.createdAt ? new Date(visit.createdAt).toLocaleDateString() : "—"}</td>
                                            <td>{visit.type || "—"}</td>
                                            <td>{visit.doctor?.name || "—"}</td>
                                            <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {visit.chiefComplaint || "—"}
                                            </td>
                                            <td>
                                                <span className={`${stylesProfile.visitStatus} ${getStatusClass(visit.status)}`}>
                                                    {visit.status || "—"}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Contacts Tab ── */}
            {activeTab === "contacts" && (
                <div className={stylesProfile.grid2}>
                    <div className={stylesProfile.cardRow}>
                        <div className={stylesProfile.sectionTitle}><Users size={14} />Next of Kin</div>
                        <div className={stylesProfile.infoRow}>
                            <label>Name</label>
                            <span>{patient.nextOfKinName || "—"}</span>
                        </div>
                        <div className={stylesProfile.infoRow}>
                            <label>Relationship</label>
                            <span>{patient.nextOfKinRel || "—"}</span>
                        </div>
                        <div className={stylesProfile.infoRow}>
                            <label>Phone</label>
                            <span>{patient.nextOfKinPhone || "—"}</span>
                        </div>
                        <div className={stylesProfile.infoRow}>
                            <label>Email</label>
                            <span>{patient.nextOfKinEmail || "—"}</span>
                        </div>
                        <div className={stylesProfile.infoRow}>
                            <label>Address</label>
                            <span>{patient.nextOfKinAddress || "—"}</span>
                        </div>
                    </div>

                    <div className={stylesProfile.cardRow}>
                        <div className={stylesProfile.sectionTitle}><AlertCircle size={14} />Emergency Contact</div>
                        <div className={stylesProfile.infoRow}>
                            <label>Name</label>
                            <span>{patient.emergencyContactName || "—"}</span>
                        </div>
                        <div className={stylesProfile.infoRow}>
                            <label>Relationship</label>
                            <span>{patient.emergencyContactRel || "—"}</span>
                        </div>
                        <div className={stylesProfile.infoRow}>
                            <label>Phone</label>
                            <span style={{ fontWeight: 700, color: "var(--primary-color)" }}>{patient.emergencyContactPhone || "—"}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
