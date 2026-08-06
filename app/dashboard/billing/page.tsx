"use client";

import { useState, useEffect } from "react";
import { Receipt, Search, Filter, Plus, TrendingUp, Wallet, AlertCircle } from "lucide-react";
import styles from "./page.module.css";
import Link from "next/link";

interface Invoice {
    id: string;
    invoiceNumber: string;
    patient: { firstName: string; lastName: string; patientNumber: string };
    totalAmount: number;
    amountPaid: number;
    balanceDue: number;
    status: string;
    createdAt: string;
}

export default function BillingPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        const fetchInvoices = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/billing/invoices?status=${filter}`, { credentials: "include" });
                if (res.ok) setInvoices(await res.json());
            } catch (err) {
                console.error("Failed to fetch invoices");
            }
            setLoading(false);
        };
        fetchInvoices();
    }, [filter]);

    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.amountPaid, 0);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balanceDue, 0);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Billing & Invoices</h1>
                <Link href="/dashboard/billing/new" className={styles.actionBtn} style={{ padding: "0.6rem 1.25rem" }}>
                    <Plus size={18} style={{ marginRight: "0.5rem", verticalAlign: "middle" }} />
                    Create Invoice
                </Link>
            </div>

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>
                        <TrendingUp size={16} color="var(--success-color)" style={{ marginRight: "0.5rem" }} />
                        Total Collected (UGX)
                    </div>
                    <div className={styles.statValue}>{totalRevenue.toLocaleString()}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>
                        <AlertCircle size={16} color="var(--danger-color)" style={{ marginRight: "0.5rem" }} />
                        Outstanding Debt (UGX)
                    </div>
                    <div className={styles.statValue} style={{ color: "var(--danger-color)" }}>{totalOutstanding.toLocaleString()}</div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>
                        <Receipt size={16} color="var(--primary-color)" style={{ marginRight: "0.5rem" }} />
                        Total Invoices
                    </div>
                    <div className={styles.statValue}>{invoices.length}</div>
                </div>
            </div>

            <div className={`glass-card`} style={{ padding: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
                <Filter size={18} color="var(--text-muted)" />
                <select
                    className="search-input"
                    style={{ width: "200px" }}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                >
                    <option value="all">All Invoices</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                    <option value="Paid">Paid</option>
                </select>
                <div style={{ flex: 1 }}></div>
                <div className="search-box" style={{ maxWidth: "300px" }}>
                    <Search size={16} />
                    <input type="text" placeholder="Search invoice or patient..." />
                </div>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Invoice #</th>
                            <th className={styles.th}>Patient</th>
                            <th className={styles.th}>Total</th>
                            <th className={styles.th}>Paid</th>
                            <th className={styles.th}>Balance</th>
                            <th className={styles.th}>Status</th>
                            <th className={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ textAlign: "center", padding: "2rem" }}>Loading billing records...</td></tr>
                        ) : invoices.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No invoices found.</td></tr>
                        ) : (
                            invoices.map(inv => (
                                <tr key={inv.id}>
                                    <td className={styles.td}><strong>{inv.invoiceNumber}</strong></td>
                                    <td className={styles.td}>
                                        {inv.patient.firstName} {inv.patient.lastName}
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{inv.patient.patientNumber}</div>
                                    </td>
                                    <td className={styles.td}>{inv.totalAmount.toLocaleString()}</td>
                                    <td className={styles.td} style={{ color: "var(--success-color)" }}>{inv.amountPaid.toLocaleString()}</td>
                                    <td className={styles.td} style={{ color: inv.balanceDue > 0 ? "var(--danger-color)" : "inherit" }}>
                                        {inv.balanceDue.toLocaleString()}
                                    </td>
                                    <td className={styles.td}>
                                        <span className={`${styles.badge} ${inv.status === 'Paid' ? styles.paid : inv.status === 'Partial' ? styles.partial : styles.unpaid}`}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <Link href={`/dashboard/billing/${inv.id}`} className={styles.actionBtn}>
                                            View Details
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
