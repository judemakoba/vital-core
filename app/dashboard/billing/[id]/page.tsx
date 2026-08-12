"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import ModernInvoicePaper from "@/components/finance/ModernInvoicePaper";
import { useTenant } from "@/components/TenantContext";

const fmt = (n: number) => `UGX ${(n ?? 0).toLocaleString("en-UG")}`;

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
    const { tenant } = useTenant();
    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("Cash");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/billing/invoices/${params.id}`, { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setInvoice(data);
                setAmount(String(data.balanceDue ?? 0));
            }
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
        setError(null);
        setSuccess(null);
        if (!amount || parseFloat(amount) <= 0) {
            setError("Enter a valid amount");
            return;
        }

        setSaving(true);
        try {
            const res = await fetch(`/api/billing/invoices/${params.id}/payments`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amount: parseFloat(amount),
                    paymentMethod: method,
                    notes,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setSuccess(`Payment recorded.`);
                setNotes("");
                // Refetch to update amounts
                await fetchData();
            } else {
                setError(data.error || "Payment failed");
            }
        } catch (err: any) {
            setError(err.message || "Network error");
        } finally {
            setSaving(false);
        }
    };

    if (loading && !invoice) {
        return <div className={styles.card} style={{ padding: 24 }}>Loading invoice…</div>;
    }

    if (!invoice) {
        return (
            <div className={styles.card} style={{ padding: 24 }}>
                <p>Invoice not found.</p>
                <Link href="/dashboard/billing" className={styles.btnSecondary}>← Back to Billing</Link>
            </div>
        );
    }

    const isPaid = invoice.status === "Paid";
    const balance = Number(invoice.balanceDue ?? 0);

    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <Link href="/dashboard/billing" className={styles.btnSecondary}>← Back</Link>
                <h1 style={{ fontSize: 20, margin: 0 }}>Invoice {invoice.invoiceNumber}</h1>
                <span className={styles[`status${invoice.status}`] ?? ""} style={{ marginLeft: 8 }}>
                    {invoice.status}
                </span>
            </div>

            <div className={styles.card} style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    <div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Patient</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                            {invoice.visit?.patient ? `${invoice.visit.patient.firstName} ${invoice.visit.patient.lastName}` : "—"}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Visit</div>
                        <div style={{ fontSize: 14 }}>
                            {invoice.visit?.visitNumber ?? "—"}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Issued</div>
                        <div style={{ fontSize: 14 }}>
                            {invoice.createdAt ? new Date(invoice.createdAt).toLocaleString() : "—"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Line items */}
            <div className={styles.card} style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ padding: 16, borderBottom: "1px solid var(--border)", fontWeight: 600 }}>
                    Line items
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-elevated)" }}>
                            <th style={th}>Description</th>
                            <th style={thRight}>Qty</th>
                            <th style={thRight}>Unit price</th>
                            <th style={thRight}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(invoice.items ?? []).map((it: any, i: number) => (
                            <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                                <td style={td}>{it.description}</td>
                                <td style={tdRight}>{it.quantity}</td>
                                <td style={tdRight}>{fmt(it.unitPrice)}</td>
                                <td style={tdRight}>{fmt(it.totalPrice ?? it.unitPrice * it.quantity)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: "2px solid var(--border)" }}>
                            <td colSpan={3} style={{ ...tdRight, fontWeight: 700 }}>Total</td>
                            <td style={{ ...tdRight, fontWeight: 700, fontFamily: "monospace" }}>{fmt(invoice.totalAmount)}</td>
                        </tr>
                        <tr>
                            <td colSpan={3} style={tdRight}>Paid</td>
                            <td style={{ ...tdRight, color: "#059669", fontFamily: "monospace" }}>{fmt(invoice.amountPaid)}</td>
                        </tr>
                        <tr>
                            <td colSpan={3} style={{ ...tdRight, fontWeight: 700 }}>Balance</td>
                            <td style={{ ...tdRight, fontWeight: 700, color: balance > 0 ? "#dc2626" : "#059669", fontFamily: "monospace" }}>
                                {fmt(balance)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Payments */}
            {(invoice.payments ?? []).length > 0 && (
                <div className={styles.card} style={{ padding: 16, marginBottom: 16 }}>
                    <h3 style={{ margin: "0 0 12px 0", fontSize: 14 }}>Payments</h3>
                    {invoice.payments.map((p: any) => (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                            <span>{new Date(p.createdAt).toLocaleString()} — {p.paymentMethod}</span>
                            <span style={{ fontFamily: "monospace" }}>{fmt(p.amount)}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Payment form */}
            {!isPaid && balance > 0 && (
                <div className={styles.card} style={{ padding: 16 }}>
                    <h3 style={{ margin: "0 0 12px 0", fontSize: 14 }}>Record payment</h3>
                    <form onSubmit={handlePayment} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 12, alignItems: "end" }}>
                        <div>
                            <label style={labelStyle}>Amount (UGX)</label>
                            <input
                                type="number"
                                min="0"
                                max={balance}
                                step="0.01"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                required
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Method</label>
                            <select value={method} onChange={e => setMethod(e.target.value)} style={inputStyle}>
                                <option value="Cash">Cash</option>
                                <option value="Mobile_Money">Mobile Money</option>
                                <option value="Card">Card</option>
                                <option value="Bank_Transfer">Bank Transfer</option>
                                <option value="Cheque">Cheque</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Notes</label>
                            <input value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} />
                        </div>
                        <button type="submit" disabled={saving} className={styles.btnPrimary}>
                            {saving ? "Saving…" : "Pay"}
                        </button>
                    </form>
                    {error && <div style={{ marginTop: 12, padding: 8, background: "rgba(239,68,68,0.1)", color: "#dc2626", borderRadius: 6 }}>{error}</div>}
                    {success && <div style={{ marginTop: 12, padding: 8, background: "rgba(34,197,94,0.1)", color: "#059669", borderRadius: 6 }}>{success}</div>}
                </div>
            )}
        </div>
    );
}

const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" };
const thRight: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13 };
const tdRight: React.CSSProperties = { ...td, textAlign: "right", fontFamily: "monospace" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, background: "var(--bg)", color: "var(--text)" };
