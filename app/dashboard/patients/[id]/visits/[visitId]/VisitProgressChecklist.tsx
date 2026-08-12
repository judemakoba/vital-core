"use client";

import { useState } from "react";
import { CheckCircle, Circle, XCircle, Ban, AlertTriangle, ShieldCheck } from "lucide-react";
import styles from "./visit.module.css";
import { useSession } from "next-auth/react";

interface LabOrder {
    id: string;
    testName: string;
    status: string;
    subStatus?: string;
}
interface RadiologyOrder {
    id: string;
    examName: string;
    status: string;
    subStatus?: string;
}
interface Prescription {
    id: string;
    medicationName: string;
    status: string;
    subStatus?: string;
}

interface VisitProgressChecklistProps {
    visitId: string;
    visitNumber: string;
    visitStatus: string;
    visitType: string;
    labOrders: LabOrder[];
    radiologyOrders: RadiologyOrder[];
    prescriptions: Prescription[];
    invoices: Array<{ status: string; balanceDue: number }>;
    discontinuationNote?: string | null;
    discontinuationDate?: string | null;
    discontinuedByName?: string | null;
    /**
     * Per R46 — if the visit was created with insurance validation
     * passing, the consultation fee is owed by the insurer and gets
     * added to the FINAL- invoice at first order placement (then
     * submitted as a claim). When the cashier sees this banner, they
     * know to skip the upfront consultation payment and submit the
     * FINAL- invoice as a claim at end of visit.
     */
    insuranceDeferConsult?: boolean;
    insuranceName?: string | null;
    onDiscontinued: (newStatus: string) => void;
}

/**
 * Visit lifecycle progress checklist + admin discontinue button.
 *
 * Per the consolidated visit cycle spec (R45), the visit has 8 main
 * statuses and each order item has 4 sub-statuses. This component
 * renders a vertical checklist showing where the visit is in the
 * lifecycle, and an inline list of each order with its current
 * sub-status badge.
 */
export default function VisitProgressChecklist({
    visitId,
    visitNumber,
    visitStatus,
    visitType,
    labOrders,
    radiologyOrders,
    prescriptions,
    invoices,
    discontinuationNote,
    discontinuationDate,
    discontinuedByName,
    insuranceDeferConsult,
    insuranceName,
    onDiscontinued,
}: VisitProgressChecklistProps) {
    const { data: session } = useSession();
    const isAdmin = (session?.user as any)?.role === "ADMIN" || (session?.user as any)?.role === "SUPER_ADMIN";
    const [showDiscontinue, setShowDiscontinue] = useState(false);
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Stages for the main visit lifecycle
    const STAGES: { id: string; label: string }[] = [
        { id: "ConsultationBilling", label: "Consultation fee" },
        { id: "Triage",               label: "Triage" },
        { id: "InConsultation",       label: "Doctor consultation" },
        { id: "PendingOrders",        label: "Orders in progress" },
        { id: "FinalBilling",         label: "Final bill" },
        { id: "Completed",            label: "Completed" },
    ];

    // Direct-service types skip triage + consultation
    const isDirectService = ["LAB_ONLY", "RADIOLOGY_ONLY", "PRESCRIPTION_ONLY"].includes(visitType);

    // Map current status to a position in the checklist
    const statusToPos: Record<string, number> = {
        Waiting: 0,
        ConsultationBilling: 0,
        Triage: 1,
        Triaged: 1,
        InConsultation: 2,
        Consultation: 2,
        Laboratory: 2,
        Radiology: 2,
        Pharmacy: 2,
        PendingOrders: 3,
        DirectServicePending: 3,
        FinalBilling: 4,
        Completed: 5,
        Discontinued: -1, // terminal alternative
    };
    const currentPos = statusToPos[visitStatus] ?? 0;
    const isDiscontinued = visitStatus === "Discontinued";

    // Order stats
    const allOrders = [
        ...labOrders.map(o => ({ ...o, kind: "lab" as const, name: o.testName })),
        ...radiologyOrders.map(o => ({ ...o, kind: "rad" as const, name: o.examName })),
        ...prescriptions.map(o => ({ ...o, kind: "rx"  as const, name: o.medicationName })),
    ];
    const orderCount = allOrders.length;
    const orderFulfilled = allOrders.filter(o => o.subStatus === "Fulfilled" || o.subStatus === "Unfulfilled").length;
    const orderInProgress = allOrders.filter(o => o.subStatus === "InProgress").length;
    const orderAwaiting = allOrders.filter(o => o.subStatus === "AwaitingPayment" || !o.subStatus).length;

    // Invoice stats
    const unpaidInvoices = invoices.filter(i => i.status !== "Paid" && i.status !== "Cancelled");
    const allPaid = unpaidInvoices.length === 0 && invoices.length > 0;

    // Sub-status color map
    const subStatusColor = (s?: string) => {
        if (s === "Fulfilled") return visitStyles.subStatusFulfilled;
        if (s === "InProgress") return visitStyles.subStatusInProgress;
        if (s === "Unfulfilled") return visitStyles.subStatusUnfulfilled;
        return visitStyles.subStatusAwaiting;
    };

    const handleDiscontinue = async () => {
        if (note.trim().length === 0) {
            setError("A reason is required to discontinue the visit.");
            return;
        }
        if (note.length > 1000) {
            setError("Note must be 1000 characters or fewer.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/visits/${visitId}/discontinue`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ note: note.trim() }),
            });
            if (res.ok) {
                const data = await res.json();
                setShowDiscontinue(false);
                setNote("");
                onDiscontinued(data.status);
            } else {
                const data = await res.json();
                setError(data.error || "Failed to discontinue visit");
            }
        } catch (e: any) {
            setError(e.message || "Network error");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={visitStyles.section}>
            <div className={visitStyles.sectionHeader}>
                <CheckCircle size={15} color="var(--primary-color)" />
                <span className={visitStyles.sectionTitle}>Visit Progress</span>
            </div>

            {isDiscontinued && (
                <div className={visitStyles.discontinueBanner}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Ban size={16} color="var(--danger-color)" />
                        <strong>Discontinued</strong>
                    </div>
                    {discontinuationNote && (
                        <div style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            <strong>Reason:</strong> {discontinuationNote}
                        </div>
                    )}
                    {discontinuationDate && (
                        <div style={{ marginTop: 4, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            On {new Date(discontinuationDate).toLocaleString()}{discontinuedByName ? ` by ${discontinuedByName}` : ""}
                        </div>
                    )}
                </div>
            )}
            {!isDiscontinued && insuranceDeferConsult && (
                <div className={visitStyles.insuranceBanner}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        
                        <strong>Insurance-verified visit</strong>
                    </div>
                    <div style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {insuranceName ? `Provider: ${insuranceName}.` : ""} No upfront payment from the patient.
                        The consultation fee is added to the FINAL- invoice at first order placement, and the
                        whole invoice gets submitted as a claim at end of visit.
                    </div>
                </div>
            )}

            {!isDiscontinued && (
                <>
                    {/* Main lifecycle checklist */}
                    <ol className={visitStyles.checklist}>
                        {STAGES.map((stage, idx) => {
                            // Skip stages for direct-service visits
                            if (isDirectService && (stage.id === "Triage" || stage.id === "InConsultation")) {
                                return null;
                            }
                            const reached = idx <= currentPos;
                            const isCurrent = idx === currentPos;
                            return (
                                <li
                                    key={stage.id}
                                    className={`${visitStyles.checklistItem} ${reached ? visitStyles.checklistReached : ""} ${isCurrent ? visitStyles.checklistCurrent : ""}`}
                                >
                                    {reached ? (
                                        isCurrent ? <Circle size={14} /> : <CheckCircle size={14} />
                                    ) : (
                                        <Circle size={14} />
                                    )}
                                    <span>{stage.label}</span>
                                </li>
                            );
                        })}
                    </ol>

                    {/* Order sub-status summary */}
                    {orderCount > 0 && (
                        <div style={{ marginTop: 12, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            <strong>Orders:</strong> {orderFulfilled}/{orderCount} fulfilled ·{" "}
                            {orderInProgress} in progress · {orderAwaiting} awaiting payment
                        </div>
                    )}

                    {/* Per-order sub-status */}
                    {orderCount > 0 && (
                        <div className={visitStyles.orderSubList}>
                            {allOrders.map(o => {
                                // lifecycle than lab/rad. The doctor places
                                // the order (subStatus=AwaitingPayment), but
                                // there's no line item for the cashier to pay
                                // for until the pharmacist dispenses. So
                                // "AwaitingPayment" is misleading for
                                // prescriptions — show "Awaiting pharmacy"
                                // instead. The other sub-statuses are the
                                // same across all order kinds.
                                const subStatus = o.subStatus || "AwaitingPayment";
                                const displayStatus = (o.kind === "rx" && subStatus === "AwaitingPayment")
                                    ? "Awaiting pharmacy"
                                    : subStatus;
                                return (
                                    <div key={o.id} className={visitStyles.orderSubRow}>
                                        <span className={visitStyles.orderSubName}>{o.name}</span>
                                        <span className={`${visitStyles.subStatusBadge} ${subStatusColor(subStatus)}`}>
                                            {displayStatus}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Invoice payment summary */}
                    {invoices.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: "0.8rem", color: allPaid ? "var(--success-color)" : "var(--text-muted)" }}>
                            {allPaid ? "✓ All invoices paid" : `${unpaidInvoices.length} invoice(s) with balance outstanding`}
                        </div>
                    )}

                    {/* Admin: Discontinue button */}
                    {isAdmin && currentPos < 5 && (
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-color, #e5e7eb)" }}>
                            {!showDiscontinue ? (
                                <button
                                    onClick={() => setShowDiscontinue(true)}
                                    className={visitStyles.discontinueBtn}
                                >
                                    <Ban size={14} /> Discontinue Visit
                                </button>
                            ) : (
                                <div className={visitStyles.discontinueForm}>
                                    <label style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                                        Reason for discontinuation *
                                    </label>
                                    <textarea
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="e.g. Patient left before consultation, no doctor available, duplicate visit, etc."
                                        rows={3}
                                        style={{
                                            width: "100%",
                                            padding: 8,
                                            fontSize: "0.8rem",
                                            borderRadius: 4,
                                            border: "1px solid var(--border-color, #d1d5db)",
                                            marginTop: 4,
                                            fontFamily: "inherit",
                                        }}
                                        maxLength={1000}
                                    />
                                    {error && (
                                        <div style={{ color: "var(--danger-color)", fontSize: "0.75rem", marginTop: 4 }}>
                                            <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
                                            {error}
                                        </div>
                                    )}
                                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                        <button
                                            onClick={handleDiscontinue}
                                            disabled={submitting || note.trim().length === 0}
                                            className={visitStyles.discontinueBtnConfirm}
                                        >
                                            {submitting ? "Discontinuing…" : "Confirm Discontinue"}
                                        </button>
                                        <button
                                            onClick={() => { setShowDiscontinue(false); setError(null); setNote(""); }}
                                            disabled={submitting}
                                            className={visitStyles.discontinueBtnCancel}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
