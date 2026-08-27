"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, CreditCard, History, Printer } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";
import ModernInvoicePaper from "@/components/finance/ModernInvoicePaper";
import { useTenant } from "@/components/TenantContext";

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
    const { tenant } = useTenant();
    const [invoice, setInvoice] = useState<any>(null);
    const [settings, setSettings] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("Cash");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [invoiceRes, settingsRes] = await Promise.all([
                fetch(`/api/billing/invoices/${params.id}`, { credentials: "include" }),
                fetch("/api/admin/settings", { credentials: "include" }),
            ]);

            if (invoiceRes.ok) {
                const data = await invoiceRes.json();
                setInvoice(data);
                setAmount(data.balanceDue.toString());
            }
            if (settingsRes.ok) setSettings(await settingsRes.json());
        } catch (err) {
            console.error("Fetch error", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [params.id]);

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) return;
        await submitPayment();
    };

    const submitPayment = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/billing/invoices/${params.id}/payments`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount, paymentMethod: method, notes }),
            });
            const data = await res.json();
            if (res.ok) {
                setInvoice((prev: any) => prev ? {
                    ...prev,
                    status: data.updatedInvoice?.status ?? prev.status,
                    amountPaid: data.updatedInvoice?.amountPaid ?? prev.amountPaid,
                    balanceDue: data.updatedInvoice?.balanceDue ?? prev.balanceDue,
                    payments: data.payment
                        ? [data.payment, ...(prev.payments || [])]
                        : (prev.payments || [])
                } : prev);
                setNotes("");
            } else {
                alert(`Payment failed: ${data.error || "Unknown error"}`);
            }
        } catch (err) {
            alert("An error occurred while processing payment.");
        } finally {
            setSaving(false);
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
                    invoice={{
                        ...invoice,
                        // The most recent payment's createdAt is when the invoice
                        // was paid. For partial / unpaid invoices, paidAt stays
                        // undefined and the stamp is hidden.
                        paidAt: invoice.status === 'Paid' && invoice.payments?.[0]?.createdAt
                            ? invoice.payments[0].createdAt
                            : null,
                    }}
                    patient={invoice.patient}
                    visit={invoice.visit}
                />
            </div>

            <div className={`${styles.noPrint} ${styles.adminSection}`}>
                <div style={{ display: "grid", gridTemplateColumns: invoice.status !== 'Paid' ? "1.5fr 1fr" : "1fr", gap: "1.5rem" }}>
                    {/* Show the payment form whenever the invoice is not fully paid. */}
                    {invoice.status !== 'Paid' && (
                        <div className={styles.card}>
                            <h2 className={styles.sectionTitle}>
                                <CreditCard size={18} /> Record Payment
                            </h2>

                            <form onSubmit={handlePayment} className={styles.paymentForm}>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Amount to Pay (UGX)</label>
                                    <input
                                        type="number"
                                        className={styles.input}
                                        value={amount}
                                        max={invoice.balanceDue}
                                        onChange={e => setAmount(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Payment Method</label>
                                    <select
                                        className={styles.select}
                                        value={method}
                                        onChange={e => setMethod(e.target.value)}
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="Mobile_Money">Mobile Money</option>
                                        <option value="Credit_Card">Credit Card</option>
                                        <option value="Bank_Transfer">Bank Transfer</option>
                                    </select>
                                </div>
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
                                <button type="submit" className={styles.submitBtn} disabled={saving} style={{ gridColumn: "1 / span 2" }}>
                                    {saving ? "Processing..." : "Record Payment"}
                                </button>
                            </form>
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

        </div>
    );
}

