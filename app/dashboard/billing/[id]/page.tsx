"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, CreditCard, History, Printer, Save, CheckCircle, Shield, FilePlus2, AlertTriangle, X, Repeat, UserPlus } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";
import ModernInvoicePaper from "@/components/finance/ModernInvoicePaper";
import { useTenant } from "@/components/TenantContext";

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
    const { tenant } = useTenant();
    const [invoice, setInvoice] = useState<any>(null);
    const [companies, setCompanies] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("Cash");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [insurancePreview, setInsurancePreview] = useState<any>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [submittingClaim, setSubmittingClaim] = useState(false);
    const [claimSubmitError, setClaimSubmitError] = useState<string | null>(null);
    const [claimSubmitSuccess, setClaimSubmitSuccess] = useState<string | null>(null);

    // R49c: insurance feature flag. When OFF, the entire insurance
    // flow is hidden on the settlement page — no claim status card,
    // no "Submit Insurance Claim" card, no "Insurance" payment
    // method option, no warning banner. The clinic has opted out of
    // insurance; the cashier settles in cash.
    const [insuranceEnabled, setInsuranceEnabled] = useState(true);

    // Insurance waiver flow
    const [waiveDialogOpen, setWaiveDialogOpen] = useState(false);
    const [waiverReason, setWaiverReason] = useState("");
    const [waiverConfirmed, setWaiverConfirmed] = useState(false);

    // Insurance quick-enroll flow (when patient has no enrollment)
    const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
    const [enrollInsuranceId, setEnrollInsuranceId] = useState("");
    const [enrollMemberNumber, setEnrollMemberNumber] = useState("");
    const [enrollPolicyNumber, setEnrollPolicyNumber] = useState("");
    const [enrolling, setEnrolling] = useState(false);
    const [enrollError, setEnrollError] = useState<string | null>(null);
    const [enrollSuccess, setEnrollSuccess] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [invoiceRes, companiesRes, settingsRes, insuranceEnabledRes] = await Promise.all([
                fetch(`/api/billing/invoices/${params.id}`, { credentials: "include" }),
                fetch("/api/admin/insurance", { credentials: "include" }),
                fetch("/api/admin/settings", { credentials: "include" }),
                // R49c: insurance feature flag. Independent fetch so it
                // doesn't couple to the admin/insurance or settings
                // endpoints (those may 404 / 403 for non-admin roles).
                fetch("/api/insurance/enabled", { credentials: "include" })
                    .then(r => r.ok ? r.json() : { enabled: true })
                    .catch(() => ({ enabled: true })),
            ]);

            if (invoiceRes.ok) {
                const data = await invoiceRes.json();
                setInvoice(data);
                setAmount(data.balanceDue.toString());
            }
            if (companiesRes.ok) setCompanies(await companiesRes.json());
            if (settingsRes.ok) setSettings(await settingsRes.json());
            // R49c: default to true on fetch failure (matches the
            // server-side helper which defaults to enabled when the
            // SystemSetting row is missing).
            const enabled = insuranceEnabledRes?.enabled;
            setInsuranceEnabled(enabled === undefined || enabled === null ? true : !!enabled);
        } catch (err) {
            console.error("Fetch error", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [params.id]);

    useEffect(() => {
        if (invoice?.patientId && invoice?.visitId) {
            setLoadingPreview(true);
            fetch(`/api/billing/insurance-preview?patientId=${invoice.patientId}&visitId=${invoice.visitId}`, { credentials: "include" })
                .then(r => r.ok ? r.json() : null)
                .then(data => setInsurancePreview(data))
                .catch(() => { })
                .finally(() => setLoadingPreview(false));
        }

        if (invoice?.isInsurance) {
            setMethod("Insurance");
            setAmount(invoice.balanceDue.toString());
        }
    }, [invoice]);

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) return;

        // If patient is insured and the cashier is paying non-insurance, require explicit waiver
        const isInsuredWithCoverage = insurancePreview?.hasInsurance
            && (insurancePreview?.summary?.totalInsuranceNet ?? 0) > 0;
        const isNonInsurancePayment = method !== "Insurance";
        if (isInsuredWithCoverage && isNonInsurancePayment && !waiverConfirmed) {
            setWaiveDialogOpen(true);
            return;
        }

        await submitPayment();
    };

    const submitPayment = async () => {
        setSaving(true);
        try {
            const body: any = { amount, paymentMethod: method, notes };
            // Attach waiver info if applicable
            if (waiverConfirmed && method !== "Insurance" && insurancePreview?.hasInsurance) {
                body.waivedInsurance = true;
                body.insuranceId = insurancePreview.enrollment.insuranceId ?? insurancePreview.enrollment.insurance?.id;
                body.waiverReason = waiverReason;
                body.insuranceSavedAmount = insurancePreview.summary.totalInsuranceNet;
            }
            const res = await fetch(`/api/billing/invoices/${params.id}/payments`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (res.ok) {
                setInvoice((prev: any) => prev ? {
                    ...prev,
                    status: data.updatedInvoice?.status ?? prev.status,
                    amountPaid: data.updatedInvoice?.amountPaid ?? prev.amountPaid,
                    balanceDue: data.updatedInvoice?.balanceDue ?? prev.balanceDue,
                    // Insurance payments don't return a `payment` object — only
                    // a `claimNumber`. In that case, leave the existing payments
                    // list alone; the invoice is marked Paid and a claim row is
                    // created, both of which are reflected via re-fetch.
                    payments: data.payment
                        ? [data.payment, ...(prev.payments || [])]
                        : (prev.payments || [])
                } : prev);
                setNotes("");
                setWaiverConfirmed(false);
                setWaiverReason("");
                // If insurance path, re-fetch so the claim row appears in the
                // claim status card and the payments list stays clean.
                if (!data.payment) {
                    fetchData();
                }
            } else {
                alert(`Payment failed: ${data.error || "Unknown error"}`);
            }
        } catch (err) {
            alert("An error occurred while processing payment.");
        } finally {
            setSaving(false);
        }
    };

    const handleSwitchToInsurance = () => {
        setMethod("Insurance");
        if (insurancePreview?.summary) {
            // Pre-fill with the patient's copay (what they'd actually pay out of pocket)
            setAmount(insurancePreview.summary.totalPatientPayable.toString());
        }
        setWaiverConfirmed(false);
        setWaiverReason("");
    };

    const handleConfirmWaive = () => {
        setWaiveDialogOpen(false);
        setWaiverConfirmed(true);
        // Trigger the actual payment submission
        // Use a microtask to let state update first
        setTimeout(() => submitPayment(), 0);
    };

    // Quick-enroll handler — creates a PatientInsurance record inline so the
    // patient becomes immediately eligible for insurance billing.
    const handleQuickEnroll = async () => {
        if (!invoice?.patientId || !enrollInsuranceId || !enrollMemberNumber) {
            setEnrollError('Insurance company and member number are required');
            return;
        }
        setEnrolling(true);
        setEnrollError(null);
        try {
            const res = await fetch('/api/admin/insurance/enrollments', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientId: invoice.patientId,
                    insuranceId: enrollInsuranceId,
                    memberNumber: enrollMemberNumber,
                    policyNumber: enrollPolicyNumber || enrollMemberNumber,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setEnrollError(data.error || 'Failed to enroll patient');
                return;
            }
            setEnrollSuccess(data.message);
            // Refresh preview so Insurance option becomes available
            if (invoice?.patientId && invoice?.visitId) {
                const previewRes = await fetch(
                    `/api/billing/insurance-preview?patientId=${invoice.patientId}&visitId=${invoice.visitId}`,
                    { credentials: 'include' }
                );
                if (previewRes.ok) setInsurancePreview(await previewRes.json());
            }
            // Reset form + close dialog after a brief delay
            setTimeout(() => {
                setEnrollDialogOpen(false);
                setEnrollInsuranceId('');
                setEnrollMemberNumber('');
                setEnrollPolicyNumber('');
                setEnrollSuccess(null);
                setEnrollError(null);
            }, 1500);
        } catch (err) {
            setEnrollError('Network error');
        } finally {
            setEnrolling(false);
        }
    };

    // When the cashier picks Insurance in the dropdown, gate it by eligibility.
    // If ineligible, intercept and open the enroll dialog instead.
    const handleMethodChange = (newMethod: string) => {
        setWaiverConfirmed(false); // method change invalidates waiver
        if (newMethod === 'Insurance') {
            // Check eligibility (preview already loaded hasInsurance; but use the
            // structured eligibility object for more nuance).
            if (insurancePreview && !insurancePreview.eligibility?.eligible) {
                // Open quick-enroll dialog
                setEnrollDialogOpen(true);
                setEnrollError(null);
                setEnrollSuccess(null);
                return;
            }
            handleSwitchToInsurance();
        } else {
            setMethod(newMethod);
        }
    };

    // Retroactively submit a claim for an already-paid invoice
    const handleSubmitClaim = async () => {
        if (!confirm('Create a retroactive insurance claim for this invoice? It will be saved as DRAFT for review.')) return;
        setSubmittingClaim(true);
        setClaimSubmitError(null);
        setClaimSubmitSuccess(null);
        try {
            const res = await fetch('/api/admin/insurance/claims/retroactive', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceId: params.id, notes }),
            });
            const data = await res.json();
            if (res.ok) {
                setClaimSubmitSuccess(`Claim ${data.claimNumber} created in DRAFT. Review in Claims Dashboard.`);
                fetchData();
            } else {
                setClaimSubmitError(data.error || 'Failed to create claim');
            }
        } catch (err) {
            setClaimSubmitError('Network error');
        } finally {
            setSubmittingClaim(false);
        }
    };

    if (loading) return <div style={{ padding: "2rem" }}>Loading invoice...</div>;
    if (!invoice) return <div style={{ padding: "2rem" }}>Invoice not found.</div>;

    // Build clinic identity from the Tenant row (single source of truth
    // for identity/branding). The Tenant columns (name, address, city,
    // phone, logoUrl) are configured in /dashboard/settings. The
    // terms text comes from a TenantSetting (clinic.regulatoryText).
    // Fallbacks only kick in if the admin hasn't configured anything.
    const clinicAddress = [tenant.address, tenant.city, tenant.region, tenant.country]
        .filter(Boolean)
        .join(', ');
    const clinicInfo = {
        name: tenant.shortName || tenant.name || "VitalCore Healthcare",
        address: clinicAddress || "Plot 123, Medical Hub, City",
        phone: tenant.phone || "+256 000 000 000",
        email: tenant.email || undefined,
        taxId: tenant.taxId || undefined,
        registrationNumber: tenant.registrationNumber || undefined,
        logoUrl: tenant.logoUrl || undefined,
        terms: settings['clinic.regulatoryText']
            || `Thank you for choosing ${tenant.shortName || tenant.name || 'our clinic'}. Please keep this invoice for your medical records.`,
    };

    // ── Compute whether to show the insurance warning banner ──
    // Show when: (a) not yet paid, (b) patient has valid active insurance, (c) at least 1 line
    // would be covered, (d) cashier hasn't already chosen Insurance
    // R49c: also gate on the feature flag. Even if eligibility is
    // somehow true in leftover state, don't show the warning when
    // insurance is OFF.
    const showInsuranceWarning = insuranceEnabled
        && invoice.status !== 'Paid'
        && insurancePreview?.eligibility?.eligible === true
        && !invoice.isInsurance
        && method !== 'Insurance'
        && (insurancePreview?.summary?.totalInsuranceNet ?? 0) > 0;

    // Count covered vs total line items
    const coveredCount = insurancePreview?.lineItems?.filter((li: any) => li.insuranceNet > 0).length ?? 0;
    const totalLines = insurancePreview?.lineItems?.length ?? 0;

    return (
        <div className={styles.container}>
            <div className={styles.noPrint}>
                <Link href="/dashboard/billing" className={styles.backLink}>
                    <ArrowLeft size={16} /> Back to Invoices
                </Link>

                <div className={styles.toolbar}>
                    <div className={styles.statusBox}>
                        <span className={`badge ${invoice.status === 'Paid' ? 'status-completed' : 'status-waiting'}`}>
                            {invoice.status.toUpperCase()}
                        </span>
                    </div>
                    <button className="btn-primary" onClick={() => window.print()}>
                        <Printer size={16} /> Print Branded Invoice
                    </button>
                </div>
            </div>

            {/* Premium High-Fidelity Invoice Paper */}
            <div className={styles.invoicePaperContainer}>
                <ModernInvoicePaper
                    clinicInfo={clinicInfo}
                    invoice={invoice}
                    patient={invoice.patient}
                    visit={invoice.visit}
                />
            </div>

            <div className={`${styles.noPrint} ${styles.adminSection}`}>
                <div style={{ display: "grid", gridTemplateColumns: invoice.status !== 'Paid' ? "1.5fr 1fr" : "1fr", gap: "1.5rem" }}>
                    {/* Show the payment form whenever the invoice is not fully paid — even
                       if an insurance claim is attached. The patient may still owe a copay
                       or extra charges, and settlement is independent of claim state. */}
                    {invoice.status !== 'Paid' && (
                        <div className={styles.card}>
                            <h2 className={styles.sectionTitle}>
                                {/* R49c: when insurance is OFF, the section
                                    is always "Record Payment" — even for
                                    legacy invoices that were flagged as
                                    isInsurance=true when insurance was ON.
                                    The clinic has opted out; treat them
                                    as cash settlement. */}
                                <CreditCard size={18} /> {invoice.isInsurance && insuranceEnabled ? "Insurance Checkout" : "Record Payment"}
                            </h2>

                            {/* ─── Insurance warning banner ───────────────────────────
                                R49c: hidden when insurance is OFF. The clinic has
                                opted out of insurance, so there's no point
                                showing a "switch to insurance" prompt. */}
                            {insuranceEnabled && showInsuranceWarning && (
                                <InsuranceWarningBanner
                                                    preview={insurancePreview}
                                                    coveredCount={coveredCount}
                                                    totalLines={totalLines}
                                                    onSwitchToInsurance={handleSwitchToInsurance}
                                                    onWaive={() => setWaiveDialogOpen(true)}
                                                />
                            )}

                            <form onSubmit={handlePayment} className={styles.paymentForm}>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Amount to Pay (UGX)</label>
                                    <input
                                        type="number"
                                        className={styles.input}
                                        value={amount}
                                        max={invoice.balanceDue}
                                        onChange={e => {
                                            setAmount(e.target.value);
                                            setWaiverConfirmed(false); // amount change invalidates waiver
                                        }}
                                        required
                                        disabled={invoice.isInsurance || method === 'Insurance'}
                                    />
                                    {method === 'Insurance' && insurancePreview?.summary && (
                                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                                            Patient copay: UGX {insurancePreview.summary.totalPatientPayable.toLocaleString()} ·
                                            Insurance covers: UGX {insurancePreview.summary.totalInsuranceNet.toLocaleString()}
                                        </small>
                                    )}
                                </div>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Payment Method</label>
                                    <select
                                        className={styles.select}
                                        value={invoice.isInsurance ? "Insurance" : method}
                                        onChange={e => handleMethodChange(e.target.value)}
                                        disabled={invoice.isInsurance}
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="Mobile_Money">Mobile Money</option>
                                        <option value="Credit_Card">Credit Card</option>
                                        <option value="Bank_Transfer">Bank Transfer</option>
                                        {/* R49c: hide the "Insurance" option in the
                                            payment-method dropdown when the clinic has
                                            insurance disabled. There's no point
                                            offering a payment path the clinic has
                                            opted out of. */}
                                        {insuranceEnabled && (
                                            <option value="Insurance">
                                                Insurance
                                                {insurancePreview?.eligibility?.eligible === false
                                                    ? ' (not enrolled)'
                                                    : insurancePreview?.eligibility?.eligible
                                                    ? ` — ${insurancePreview.enrollment?.insuranceName ?? 'verified'}`
                                                    : ''}
                                            </option>
                                        )}
                                    </select>
                                    {insuranceEnabled && insurancePreview?.eligibility?.eligible === false && method !== 'Insurance' && (
                                        <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 4, display: 'block' }}>
                                            <AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                            {insurancePreview.eligibility.reason}
                                        </small>
                                    )}
                                </div>
                                {!invoice.isInsurance && (
                                    <div className={styles.inputGroup} style={{ gridColumn: "1 / span 2" }}>
                                        <label className={styles.label}>Notes / Ref #</label>
                                        <input
                                            type="text"
                                            className={styles.input}
                                            placeholder="e.g. Transaction ID"
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                        />
                                    </div>
                                )}
                                {waiverConfirmed && method !== 'Insurance' && insurancePreview?.hasInsurance && (
                                    <div style={{ gridColumn: "1 / span 2", padding: '0.5rem 0.75rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, fontSize: '0.8rem', color: '#92400e' }}>
                                        ⚠️ Insurance waived for this payment. Reason: <strong>{waiverReason || '(none given)'}</strong>
                                        &nbsp;·&nbsp;
                                        <button type="button" onClick={() => { setWaiverConfirmed(false); setWaiverReason(''); }} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>undo</button>
                                    </div>
                                )}
                                <button type="submit" className={styles.submitBtn} disabled={saving} style={{ gridColumn: "1 / span 2" }}>
                                    {saving ? "Processing..." : invoice.isInsurance ? "Complete Transaction" : "Record Payment"}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* R49c: hide the Insurance Claim Status card entirely
                        when the insurance feature is OFF. The clinic has
                        opted out of insurance; the cashier should never
                        see claim metadata on the settlement page. The
                        claim row may still exist in the DB (created when
                        insurance was ON) but the UI should not surface it. */}
                    {insuranceEnabled && invoice.claim && (
                        <div className={styles.card} style={{ borderLeft: "4px solid var(--warning-color)" }}>
                            <h2 className={styles.sectionTitle}><Shield size={18} /> Insurance Claim Status</h2>
                            <div style={{ marginBottom: "1rem" }}>
                                <span className={`badge status-waiting`}>{(invoice.claim.status || "DRAFT").toUpperCase()}</span>
                                <p style={{ marginTop: "1rem", fontSize: "0.875rem" }}>
                                    Claim #: <strong>{invoice.claim.claimNumber || "—"}</strong><br />
                                    Claimed: <strong>UGX {(invoice.claim.totalAmount || 0).toLocaleString()}</strong><br />
                                    Provider: <strong>{companies.find(c => c.id === invoice.claim.insuranceId)?.name || "Insurance Partner"}</strong>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Retroactive "Submit Claim" — for Paid invoices that have insurance but no claim yet.
                        R49c: hidden when insurance is OFF. The clinic has opted out of insurance;
                        creating a claim after the fact would be pointless. */}
                    {insuranceEnabled && invoice.status === 'Paid' && !invoice.claim && (
                        <div className={styles.card} style={{ borderLeft: "4px solid var(--info-color)" }}>
                            <h2 className={styles.sectionTitle}>
                                <FilePlus2 size={18} /> Submit Insurance Claim
                            </h2>
                            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                                This invoice is paid but no insurance claim has been filed yet. Submit one if the patient had insurance.
                                The claim will be created as DRAFT so you can review before submitting.
                            </p>
                            {claimSubmitError && (
                                <div style={{ background: 'rgba(244, 63, 94, 0.08)', color: 'var(--danger-color)', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                                    {claimSubmitError}
                                </div>
                            )}
                            {claimSubmitSuccess && (
                                <div style={{ background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-color)', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                                    {claimSubmitSuccess}
                                </div>
                            )}
                            <button
                                className="btn-primary"
                                onClick={handleSubmitClaim}
                                disabled={submittingClaim}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                            >
                                <FilePlus2 size={16} />
                                {submittingClaim ? 'Creating…' : 'Create Draft Claim'}
                            </button>
                        </div>
                    )}

                    <div className={styles.card}>
                        <h2 className={styles.sectionTitle}><History size={18} /> Payment History</h2>
                        <div className={styles.historyList}>
                            {invoice.payments.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No payments recorded yet.</p>
                            ) : invoice.payments.map((p: any) => (
                                <div key={p.id} className={styles.historyItem}>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>UGX {p.amount.toLocaleString()}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Via {p.paymentMethod}</div>
                                        {p.waivedInsurance && (
                                            <div style={{ fontSize: '0.7rem', color: '#92400e', marginTop: 2 }}>
                                                ⚠️ Insurance waived: {p.waiverReason || 'no reason'}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: "0.875rem" }}>{new Date(p.createdAt).toLocaleDateString()}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>By {p.receivedBy?.name || "System"}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Waiver confirmation dialog ─── */}
            {waiveDialogOpen && (
                <WaiverDialog
                    preview={insurancePreview}
                    onCancel={() => setWaiveDialogOpen(false)}
                    onConfirm={handleConfirmWaive}
                    reason={waiverReason}
                    setReason={setWaiverReason}
                />
            )}

            {/* ─── Quick-enroll dialog (when patient has no valid insurance) ─── */}
            {enrollDialogOpen && (
                <EnrollDialog
                    patientName={`${invoice.patient?.firstName ?? ''} ${invoice.patient?.lastName ?? ''}`.trim() || 'this patient'}
                    companies={companies}
                    insuranceId={enrollInsuranceId}
                    setInsuranceId={setEnrollInsuranceId}
                    memberNumber={enrollMemberNumber}
                    setMemberNumber={setEnrollMemberNumber}
                    policyNumber={enrollPolicyNumber}
                    setPolicyNumber={setEnrollPolicyNumber}
                    reason={insurancePreview?.eligibility?.reason}
                    error={enrollError}
                    success={enrollSuccess}
                    enrolling={enrolling}
                    onSubmit={handleQuickEnroll}
                    onCancel={() => setEnrollDialogOpen(false)}
                />
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Insurance Warning Banner                                                    */
/* ──────────────────────────────────────────────────────────────────────────── */

function InsuranceWarningBanner({
    preview,
    coveredCount,
    totalLines,
    onSwitchToInsurance,
    onWaive,
}: {
    preview: any;
    coveredCount: number;
    totalLines: number;
    onSwitchToInsurance: () => void;
    onWaive: () => void;
}) {
    const insuranceName = preview.enrollment?.insuranceName ?? 'Unknown';
    const totalOriginal = preview.summary?.totalOriginal ?? 0;
    const insuranceNet = preview.summary?.totalInsuranceNet ?? 0;
    const patientPayable = preview.summary?.totalPatientPayable ?? 0;

    return (
        <div style={{
            marginBottom: '1rem',
            padding: '0.875rem 1rem',
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderLeft: '4px solid var(--warning-color)',
            borderRadius: 8,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <AlertTriangle size={18} color="var(--warning-color)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
                        Patient is enrolled with {insuranceName}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                        <strong>{coveredCount} of {totalLines}</strong> line items may be covered.
                        Insurance would pay <strong>UGX {insuranceNet.toLocaleString()}</strong> of <strong>UGX {totalOriginal.toLocaleString()}</strong>;
                        patient would owe <strong>UGX {patientPayable.toLocaleString()}</strong> as copay.
                    </div>
                    {/* Per-line coverage breakdown */}
                    {preview.lineItems && preview.lineItems.length > 0 && (
                        <details style={{ marginTop: 8 }}>
                            <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                Show line-by-line coverage
                            </summary>
                            <div style={{ marginTop: 6, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 4 }}>
                                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)' }}>Item</th>
                                            <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-muted)' }}>Base</th>
                                            <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-muted)' }}>Insurance</th>
                                            <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-muted)' }}>Patient</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.lineItems.map((li: any, i: number) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '4px 6px' }}>{li.label}</td>
                                                <td style={{ textAlign: 'right', padding: '4px 6px', fontFamily: 'monospace' }}>{li.basePrice.toLocaleString()}</td>
                                                <td style={{ textAlign: 'right', padding: '4px 6px', fontFamily: 'monospace', color: li.insuranceNet > 0 ? 'var(--success-color)' : 'var(--text-muted)' }}>
                                                    {li.insuranceNet > 0 ? li.insuranceNet.toLocaleString() : '—'}
                                                </td>
                                                <td style={{ textAlign: 'right', padding: '4px 6px', fontFamily: 'monospace' }}>{li.patientPayable.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={onSwitchToInsurance}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', fontSize: '0.8rem', fontWeight: 500,
                                background: 'var(--primary-color)', color: 'white',
                                border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            <Repeat size={14} /> Switch to Insurance billing
                        </button>
                        <button
                            type="button"
                            onClick={onWaive}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', fontSize: '0.8rem', fontWeight: 500,
                                background: 'transparent', color: 'var(--text-secondary)',
                                border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            Waive — patient pays cash
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Waiver confirmation dialog                                                  */
/* ──────────────────────────────────────────────────────────────────────────── */

function WaiverDialog({
    preview,
    onCancel,
    onConfirm,
    reason,
    setReason,
}: {
    preview: any;
    onCancel: () => void;
    onConfirm: () => void;
    reason: string;
    setReason: (s: string) => void;
}) {
    const insuranceName = preview.enrollment?.insuranceName ?? 'Unknown';
    const insuranceNet = preview.summary?.totalInsuranceNet ?? 0;

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
            <div style={{
                background: 'var(--bg-card, white)', borderRadius: 12, padding: 24,
                maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={20} color="var(--warning-color)" />
                        Confirm Insurance Waiver
                    </h3>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
                    You are about to record a cash payment for a patient enrolled with <strong>{insuranceName}</strong>.
                    By proceeding, the clinic is choosing <strong>not</strong> to file an insurance claim worth
                    {' '}<strong>UGX {insuranceNet.toLocaleString()}</strong> for this visit.
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 16 }}>
                    The reason will be saved on the payment record for reporting.
                </p>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: 6 }}>
                        Reason for waiving insurance
                    </label>
                    <select
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        style={{
                            width: '100%', padding: '8px 10px', border: '1px solid var(--border-color)',
                            borderRadius: 6, fontSize: '0.85rem', fontFamily: 'inherit', background: 'var(--bg-card)',
                        }}
                    >
                        <option value="">— Select a reason —</option>
                        <option value="Patient deductible not met">Patient deductible not met</option>
                        <option value="Service not covered by plan">Service not covered by plan</option>
                        <option value="Patient chose to pay cash">Patient chose to pay cash</option>
                        <option value="Insurance card not presented">Insurance card not presented</option>
                        <option value="Coverage expired">Coverage expired</option>
                        <option value="Pre-auth not obtained">Pre-authorization not obtained</option>
                        <option value="Other (specify in notes)">Other (specify in notes)</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)',
                            border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={!reason}
                        style={{
                            padding: '8px 16px', background: 'var(--warning-color)', color: 'white',
                            border: 'none', borderRadius: 6, cursor: reason ? 'pointer' : 'not-allowed',
                            opacity: reason ? 1 : 0.5, fontFamily: 'inherit', fontWeight: 500,
                        }}
                    >
                        Confirm waiver & record payment
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Quick-enroll dialog (when patient has no valid insurance enrollment)        */
/* ──────────────────────────────────────────────────────────────────────────── */

function EnrollDialog({
    patientName,
    companies,
    insuranceId, setInsuranceId,
    memberNumber, setMemberNumber,
    policyNumber, setPolicyNumber,
    reason,
    error, success,
    enrolling,
    onSubmit, onCancel,
}: {
    patientName: string;
    companies: any[];
    insuranceId: string;
    setInsuranceId: (v: string) => void;
    memberNumber: string;
    setMemberNumber: (v: string) => void;
    policyNumber: string;
    setPolicyNumber: (v: string) => void;
    reason: string | null;
    error: string | null;
    success: string | null;
    enrolling: boolean;
    onSubmit: () => void;
    onCancel: () => void;
}) {
    const activeCompanies = companies.filter(c => c.isActive);
    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
            <div style={{
                background: 'var(--bg-card, white)', borderRadius: 12, padding: 24,
                maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <UserPlus size={20} color="var(--primary-color)" />
                        Enroll Patient in Insurance
                    </h3>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 8 }}>
                    Quick-enrolling <strong>{patientName}</strong> so they can use insurance billing.
                </p>
                {reason && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 16, fontStyle: 'italic' }}>
                        Reason: {reason}
                    </p>
                )}
                {error && (
                    <div style={{ background: 'rgba(244, 63, 94, 0.08)', color: 'var(--danger-color)', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.85rem', marginBottom: 12 }}>
                        {error}
                    </div>
                )}
                {success && (
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', color: 'var(--success-color)', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: '0.85rem', marginBottom: 12 }}>
                        {success}
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: 500 }}>Insurance Provider *</span>
                        <select
                            value={insuranceId}
                            onChange={e => setInsuranceId(e.target.value)}
                            disabled={enrolling || !!success}
                            style={{
                                padding: '8px 10px', border: '1px solid var(--border-color)',
                                borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit',
                                background: 'var(--bg-card)',
                            }}
                        >
                            <option value="">— Select insurance —</option>
                            {activeCompanies.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.name} ({c.code})
                                </option>
                            ))}
                        </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: 500 }}>Member Number *</span>
                        <input
                            type="text"
                            value={memberNumber}
                            onChange={e => setMemberNumber(e.target.value)}
                            placeholder="As shown on the insurance card"
                            disabled={enrolling || !!success}
                            style={{
                                padding: '8px 10px', border: '1px solid var(--border-color)',
                                borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit',
                                background: 'var(--bg-card)',
                            }}
                        />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: 500 }}>Policy Number <small style={{ color: 'var(--text-muted)' }}>(optional, defaults to member #)</small></span>
                        <input
                            type="text"
                            value={policyNumber}
                            onChange={e => setPolicyNumber(e.target.value)}
                            placeholder="Group/policy number if different"
                            disabled={enrolling || !!success}
                            style={{
                                padding: '8px 10px', border: '1px solid var(--border-color)',
                                borderRadius: 6, fontSize: '0.9rem', fontFamily: 'inherit',
                                background: 'var(--bg-card)',
                            }}
                        />
                    </label>
                </div>
                <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                    <strong>Note:</strong> The enrollment is created in <strong>VERIFIED</strong> state so the patient is immediately eligible for insurance billing. In production, you would typically mark as PENDING and verify manually — but at the cashier we skip that for speed.
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={enrolling}
                        style={{
                            padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)',
                            border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={enrolling || !insuranceId || !memberNumber || !!success}
                        style={{
                            padding: '8px 16px', background: 'var(--primary-color)', color: 'white',
                            border: 'none', borderRadius: 6, cursor: (enrolling || !insuranceId || !memberNumber || !!success) ? 'not-allowed' : 'pointer',
                            opacity: (enrolling || !insuranceId || !memberNumber || !!success) ? 0.5 : 1, fontFamily: 'inherit', fontWeight: 500,
                        }}
                    >
                        {enrolling ? 'Enrolling…' : success ? 'Done' : 'Enroll & use Insurance'}
                    </button>
                </div>
            </div>
        </div>
    );
}
