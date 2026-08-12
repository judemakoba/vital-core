"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft, Stethoscope, FlaskConical, Pill, Scan,
    FileText, DollarSign, Activity, Heart, Thermometer,
    Droplets, Scale, Ruler, Clock, CheckCircle, XCircle,
    CreditCard, User, Calendar
} from "lucide-react";
import styles from "../../../page.module.css";
import visitStyles from "./visit.module.css";
import VisitProgressChecklist from "./VisitProgressChecklist";
interface Drug { name: string; genericName: string; strength: string }
interface Prescription {
    id: string; medicationName: string; dosage: string; frequency: string;
    durationDays: number; quantity: number; instructions: string; status: string;
    doseAmount?: number; doseUnit?: string; frequencyPerDay?: number;
    drug?: Drug;
    subStatus?: string;
}
interface LabOrder {
    id: string; testName: string; status: string; priority: string;
    orderedAt: string; results?: string;
    subStatus?: string;
}
interface RadiologyOrder {
    id: string; examName?: string; examType?: string; status: string; priority: string;
    orderedAt: string; findings?: string;
    subStatus?: string;
}
interface InvoiceItem { description: string; quantity: number; unitPrice: number; totalPrice: number; itemType: string }
interface Payment {
    id: string; amount: number; paymentMethod: string; createdAt: string;
    receivedBy?: { name: string };
}
interface Invoice {
    id: string; invoiceNumber: string; totalAmount: number; amountPaid: number;
    balanceDue: number; status: string; items: InvoiceItem[]; payments: Payment[];
}
interface Doctor { name: string; department?: string }
interface Patient {
    id: string; patientNumber: string; firstName: string; lastName: string;
    phone: string; dateOfBirth: string; gender: string;
        insuranceId: string;
        memberNumber: string;
        policyNumber: string;
        status: string;
        isActive: boolean;
        coverageStart: string | null;
        coverageEnd: string | null;
        insurance: { id: string; name: string; code: string };
    }>;
}
interface Visit {
    id: string; visitNumber: string; type: string; status: string;
    chiefComplaint: string; createdAt: string; completedTime?: string;
    bloodPressure?: string; heartRate?: string; temperature?: string;
    weight?: number; height?: number; priority?: string;
    subjective?: string; objective?: string; assessment?: string; treatmentPlan?: string;
    discontinuationNote?: string | null;
    discontinuationDate?: string | null;
    discontinuedBy?: { name: string } | null;
    patient: Patient; doctor?: Doctor;
    diagnoses: Array<{ id: string; code: string; name: string; type: string; notes?: string }>;
    prescriptions: Prescription[];
    labOrders: LabOrder[];
    radiologyOrders: RadiologyOrder[];
    invoices: Invoice[];
        status: 'PENDING' | 'APPROVED' | 'DENIED' | 'ERROR';
        verificationNumber: string | null;
        reason: string | null;
        provider: string | null;
        createdAt: string;
        coverageLimit: number | null;
        deductibleRemaining: number | null;
        coverageValidFrom: string | null;
        coverageValidTo: string | null;
        verifiedBy?: { name: string } | null;
        insurance?: { name: string; code: string } | null;
    }>;
}

function fmt(n: number) {
    return `UGX ${n.toLocaleString()}`;
}

function getStatusClass(status: string, type: "rx" | "lab" | "radio" | "invoice" = "rx") {
    if (type === "rx") {
        if (status === "Dispensed" || status === "Completed") return visitStyles.statusDispensed;
        if (status === "Cancelled") return visitStyles.statusCancelled;
        return visitStyles.statusPending;
    }
    if (type === "lab" || type === "radio") {
        if (status === "Completed" || status === "Reported") return "statusCompleted";
        if (status === "Cancelled") return "statusCancelled";
        return "statusPending";
    }
    if (status === "Paid") return "statusCompleted";
    if (status === "Partial") return "statusPartial";
    return "statusPending";
}

export default function VisitDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [visit, setVisit] = useState<Visit | null>(null);
    const [loading, setLoading] = useState(true);
    // the insurance-deferred banner is suppressed.
    useEffect(() => {
        fetch(`/api/visits/${params.visitId}`, { credentials: "include" })
            .then(r => r.ok ? r.json() : null)
            .then(data => { setVisit(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [params.visitId]);
    // this flag on the visit directly — we infer it from "the visit has a
    // consultation line item marked as deferred to claim" (or, if no
    // orders have been placed yet, the visit was created with
    // insuranceDeferConsult=true which is shown by the FINAL- invoice
    // missing a separate consultation line). The simplest reliable
    // signal: any invoice has a consultation line item with the
    // "(deferred to claim)" suffix in its description.
    //
    // if a visit has a leftover "(deferred to claim — AAR Insurance)"
    // line item (from a time when insurance was ON), we don't want to
    // show the "insurance-verified visit" banner when the clinic has
    // since flipped the toggle to OFF.
    const isInsuranceDefer = insuranceEnabled && !!(visit?.invoices ?? []).some((inv: any) =>
        (inv.items ?? []).some((it: any) =>
            it.itemType === 'Consultation' && typeof it.description === 'string' && it.description.includes('(deferred to claim')
        )
    );

    // Try to pull the insurance name from the same line item description.
    const insuranceNameFromLine: string | null = (() => {
        for (const inv of (visit?.invoices ?? []) as any[]) {
            for (const it of (inv.items ?? []) as any[]) {
                if (it.itemType === 'Consultation' && typeof it.description === 'string' && it.description.includes('(deferred to claim — ')) {
                    const m = it.description.match(/\(deferred to claim — ([^)]+)\)/);
                    if (m) return m[1];
                }
            }
        }
        return null;
    })();

    if (loading) return <div className={styles.container}><p style={{ color: "var(--text-muted)" }}>Loading visit details...</p></div>;
    if (!visit) return <div className={styles.container}><p style={{ color: "var(--danger-color)" }}>Visit not found.</p></div>;

    const getAge = (dob: string) => {
        const d = new Date(dob);
        if (isNaN(d.getTime())) return "—";
        return Math.abs(new Date(Date.now() - d.getTime()).getUTCFullYear() - 1970);
    };

    const statusColor = (s: string) => {
        const map: Record<string, string> = {
            Billing: visitStyles.badgeAmber, Waiting: visitStyles.badgeAmber,
            Triage: visitStyles.badgeBlue, Triaged: visitStyles.badgeBlue,
            Consultation: visitStyles.badgePurple, Doctor: visitStyles.badgePurple,
            Pharmacy: visitStyles.badgeGreen, Laboratory: visitStyles.badgeGreen,
            Completed: visitStyles.badgeGreen,
        };
        return map[s] || "";
    };

    return (
        <div className={styles.container}>

            {/* Back button */}
            <div className={visitStyles.backRow}>
                <button onClick={() => router.back()} className={visitStyles.backBtn}>
                    <ArrowLeft size={15} /> Back
                </button>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    Patient: <Link href={`/dashboard/patients/${visit.patient.id}`} style={{ color: "var(--primary-color)", fontWeight: 500 }}>
                        {visit.patient.firstName} {visit.patient.lastName}
                    </Link>
                </span>
            </div>

            {/* Visit header */}
            <div className={visitStyles.visitHeader}>
                <div className={visitStyles.visitIcon}>
                    <Stethoscope size={20} />
                </div>
                <div className={visitStyles.visitMeta}>
                    <div className={visitStyles.visitNumber}>{visit.visitNumber}</div>
                    <div className={visitStyles.visitType}>{visit.type}</div>
                    <div className={visitStyles.visitSub}>
                        {visit.doctor?.name ? `Dr. ${visit.doctor.name}` : "No doctor assigned"}
                        {visit.doctor?.department ? ` · ${visit.doctor.department}` : ""}
                        {visit.chiefComplaint ? ` · ${visit.chiefComplaint}` : ""}
                    </div>
                    <div className={visitStyles.visitBadges}>
                        <span className={`${visitStyles.badge} ${statusColor(visit.status)}`}>{visit.status}</span>
                        <span className={visitStyles.badge}>{visit.priority || "Normal"} Priority</span>
                        <span className={visitStyles.badge}><Calendar size={11} style={{ marginRight: 3 }} />{new Date(visit.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        <span className={visitStyles.badge}><Clock size={11} style={{ marginRight: 3 }} />{new Date(visit.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {visit.completedTime && (
                            <span className={`${visitStyles.badge} ${visitStyles.badgeGreen}`}>
                                <CheckCircle size={11} style={{ marginRight: 3 }} />Completed {new Date(visit.completedTime).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Visit Progress Checklist (consolidated spec R45) */}
            <VisitProgressChecklist
                visitId={visit.id}
                visitNumber={visit.visitNumber}
                visitStatus={visit.status}
                visitType={visit.type}
                labOrders={visit.labOrders}
                radiologyOrders={visit.radiologyOrders}
                prescriptions={visit.prescriptions}
                invoices={visit.invoices}
                discontinuationNote={visit.discontinuationNote}
                discontinuationDate={visit.discontinuationDate ?? undefined}
                discontinuedByName={visit.discontinuedBy?.name}
                insuranceDeferConsult={isInsuranceDefer}
                insuranceName={insuranceNameFromLine}
                onDiscontinued={(newStatus) => setVisit({ ...visit, status: newStatus })}
            />

            
            {insuranceEnabled && (
                <InsuranceValidationCard
                    visitId={visit.id}
                    visitStatus={visit.status}
                    enrollments={visit.patient?.insuranceEnrollments ?? []}
                    verifications={visit.insuranceVerifications ?? []}
                    onVerificationComplete={() => {
                        // Refetch the visit to pick up the new status and any
                        // consultation fee invoice that was created on denial
                        setVisit(null);
                        setLoading(true);
                        fetch(`/api/visits/${params.visitId}`, { credentials: 'include' })
                            .then(r => r.ok ? r.json() : null)
                            .then(data => { setVisit(data); setLoading(false); })
                            .catch(() => setLoading(false));
                    }}
                />
            )}

            {/* Vitals — always visible */}
            {(visit.bloodPressure || visit.heartRate || visit.temperature || visit.weight || visit.height) && (
                <div className={visitStyles.section}>
                    <div className={visitStyles.sectionHeader}>
                        <Activity size={15} color="var(--primary-color)" />
                        <span className={visitStyles.sectionTitle}>Vitals &amp; Measurements</span>
                    </div>
                    <div className={visitStyles.vitalsGrid}>
                        {visit.bloodPressure && (
                            <div className={visitStyles.vitalItem}>
                                <div className={visitStyles.vitalLabel}><Droplets size={12} style={{ marginRight: 3 }} />BP</div>
                                <div className={visitStyles.vitalValue}>{visit.bloodPressure}</div>
                            </div>
                        )}
                        {visit.heartRate && (
                            <div className={visitStyles.vitalItem}>
                                <div className={visitStyles.vitalLabel}><Heart size={12} style={{ marginRight: 3 }} />Heart Rate</div>
                                <div className={visitStyles.vitalValue}>{visit.heartRate}</div>
                            </div>
                        )}
                        {visit.temperature && (
                            <div className={visitStyles.vitalItem}>
                                <div className={visitStyles.vitalLabel}><Thermometer size={12} style={{ marginRight: 3 }} />Temp</div>
                                <div className={visitStyles.vitalValue}>{visit.temperature}</div>
                            </div>
                        )}
                        {visit.weight && (
                            <div className={visitStyles.vitalItem}>
                                <div className={visitStyles.vitalLabel}><Scale size={12} style={{ marginRight: 3 }} />Weight</div>
                                <div className={visitStyles.vitalValue}>{visit.weight} kg</div>
                            </div>
                        )}
                        {visit.height && (
                            <div className={visitStyles.vitalItem}>
                                <div className={visitStyles.vitalLabel}><Ruler size={12} style={{ marginRight: 3 }} />Height</div>
                                <div className={visitStyles.vitalValue}>{visit.height} cm</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SOAP Notes */}
            {(visit.subjective || visit.objective || visit.assessment || visit.treatmentPlan) && (
                <div className={visitStyles.soapGrid}>
                    {[
                        { key: "subjective", label: "Subjective", icon: <FileText size={12} />, cls: visitStyles.soapSubjective, text: visit.subjective },
                        { key: "objective",  label: "Objective",  icon: <Activity size={12} />,   cls: visitStyles.soapObjective,  text: visit.objective  },
                        { key: "assessment", label: "Assessment", icon: <Stethoscope size={12} />, cls: visitStyles.soapAssessment, text: visit.assessment },
                        { key: "plan",       label: "Plan",        icon: <CheckCircle size={12} />, cls: visitStyles.soapPlan,       text: visit.treatmentPlan },
                    ].map(({ key, label, icon, cls, text }) => (
                        <div key={key} className={visitStyles.soapCard}>
                            <div className={`${visitStyles.soapLabel} ${cls}`}>{icon}{label}</div>
                            <div className={visitStyles.soapText}>{text || <span className={visitStyles.soapEmpty}>Not recorded</span>}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* 2-column layout for sections */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", alignItems: "start" }}>

                {/* Left column */}
                <div>
                    {/* Diagnoses */}
                    <div className={visitStyles.section}>
                        <div className={visitStyles.sectionHeader}>
                            <Stethoscope size={15} color="#a78bfa" />
                            <span className={visitStyles.sectionTitle}>Diagnoses</span>
                            <span className={visitStyles.sectionCount}>{visit.diagnoses.length}</span>
                        </div>
                        {visit.diagnoses.length === 0 ? (
                            <div className={visitStyles.emptySection}>No diagnoses recorded.</div>
                        ) : (
                            <div className={visitStyles.diagChips}>
                                {visit.diagnoses.map(d => (
                                    <div key={d.id} className={visitStyles.diagChip} title={d.notes}>
                                        <span className={visitStyles.diagChipCode}>{d.code || d.type}</span>
                                        {d.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Prescriptions */}
                    <div className={visitStyles.section}>
                        <div className={visitStyles.sectionHeader}>
                            <Pill size={15} color="#34d399" />
                            <span className={visitStyles.sectionTitle}>Prescriptions</span>
                            <span className={visitStyles.sectionCount}>{visit.prescriptions.length}</span>
                        </div>
                        {visit.prescriptions.length === 0 ? (
                            <div className={visitStyles.emptySection}>No prescriptions on this visit.</div>
                        ) : (
                            visit.prescriptions.map(rx => (
                                <div key={rx.id} className={visitStyles.drugLine}>
                                    <div className={visitStyles.drugName}>
                                        {rx.drug?.name || rx.medicationName}
                                        <span className={`${visitStyles.drugStatus} ${getStatusClass(rx.status)}`}>{rx.status}</span>
                                    </div>
                                    <div className={visitStyles.drugMeta}>
                                        <span>{rx.dosage}</span>
                                        <span>{rx.frequency}</span>
                                        <span>{rx.durationDays}d</span>
                                        <span>{rx.quantity} units</span>
                                        {rx.drug?.strength && <span>{rx.drug.strength}</span>}
                                    </div>
                                    {rx.instructions && (
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 3 }}>
                                            → {rx.instructions}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right column */}
                <div>
                    {/* Lab Orders */}
                    <div className={visitStyles.section}>
                        <div className={visitStyles.sectionHeader}>
                            <FlaskConical size={15} color="#60a5fa" />
                            <span className={visitStyles.sectionTitle}>Lab Tests</span>
                            <span className={visitStyles.sectionCount}>{visit.labOrders.length}</span>
                        </div>
                        {visit.labOrders.length === 0 ? (
                            <div className={visitStyles.emptySection}>No lab orders on this visit.</div>
                        ) : (
                            visit.labOrders.map(lo => (
                                <div key={lo.id} className={visitStyles.testLine}>
                                    <FlaskConical size={13} color="var(--text-muted)" />
                                    <span className={visitStyles.testName}>{lo.testName}</span>
                                    <span className={visitStyles.testMeta}>{lo.priority} · {new Date(lo.orderedAt).toLocaleDateString()}</span>
                                    <span className={`${visitStyles.testStatus} ${getStatusClass(lo.status, "lab")}`}>{lo.status}</span>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Radiology */}
                    <div className={visitStyles.section}>
                        <div className={visitStyles.sectionHeader}>
                            <Scan size={15} color="#c084fc" />
                            <span className={visitStyles.sectionTitle}>Radiology Exams</span>
                            <span className={visitStyles.sectionCount}>{visit.radiologyOrders.length}</span>
                        </div>
                        {visit.radiologyOrders.length === 0 ? (
                            <div className={visitStyles.emptySection}>No radiology orders on this visit.</div>
                        ) : (
                            visit.radiologyOrders.map(ro => (
                                <div key={ro.id} className={visitStyles.testLine}>
                                    <Scan size={13} color="var(--text-muted)" />
                                    <span className={visitStyles.testName}>{ro.examType}</span>
                                    <span className={visitStyles.testMeta}>{ro.priority} · {new Date(ro.orderedAt).toLocaleDateString()}</span>
                                    <span className={`${visitStyles.testStatus} ${getStatusClass(ro.status, "radio")}`}>{ro.status}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Billing — full width */}
            <div className={visitStyles.section}>
                <div className={visitStyles.sectionHeader}>
                    <DollarSign size={15} color="#fbbf24" />
                    <span className={visitStyles.sectionTitle}>Bills &amp; Payments</span>
                    <span className={visitStyles.sectionCount}>{visit.invoices.length}</span>
                </div>
                {visit.invoices.length === 0 ? (
                    <div className={visitStyles.emptySection}>No invoices on this visit.</div>
                ) : (
                    visit.invoices.map(inv => (
                        <div key={inv.id} className={visitStyles.invoiceBlock}>
                            <div className={visitStyles.invoiceHeader}>
                                <span className={visitStyles.invoiceNum}>{inv.invoiceNumber}</span>
                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                                    {inv.status}
                                </span>
                                <span className={visitStyles.invoiceAmount}>{fmt(inv.totalAmount)}</span>
                            </div>

                            {/* Invoice line items */}
                            {inv.items.map((item, i) => (
                                <div key={i} className={visitStyles.invoiceItems}>
                                    <div className={visitStyles.invoiceItem}>
                                        <span className={visitStyles.invoiceItemDesc}>{item.description}</span>
                                        <span className={visitStyles.invoiceItemQty}>×{item.quantity}</span>
                                        <span className={visitStyles.invoiceItemPrice}>{fmt(item.totalPrice)}</span>
                                    </div>
                                </div>
                            ))}

                            {/* Payments */}
                            {inv.payments.length > 0 && (
                                <div className={visitStyles.paymentsSection}>
                                    {inv.payments.map(p => (
                                        <div key={p.id} className={visitStyles.paymentRow}>
                                            <label>Paid</label>
                                            <span>{fmt(p.amount)}</span>
                                            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{p.paymentMethod}</span>
                                            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                                                {p.receivedBy?.name ? `by ${p.receivedBy.name}` : ""} · {new Date(p.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Balance summary */}
                            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.5rem", fontSize: "0.8125rem" }}>
                                <span style={{ color: "var(--text-muted)" }}>Paid: <strong style={{ color: "#22c55e" }}>{fmt(inv.amountPaid)}</strong></span>
                                <span className={`${visitStyles.balanceBadge} ${
                                    inv.balanceDue === 0 ? visitStyles.balanceClear :
                                    inv.amountPaid > 0 ? visitStyles.balancePartial :
                                    visitStyles.balanceUnpaid
                                }`}>
                                    {inv.balanceDue === 0 ? "✓ Settled" : `Balance: ${fmt(inv.balanceDue)}`}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
