"use client";

import { useState, useEffect, useMemo } from "react";
import {
    Receipt, Search, Filter, Plus, TrendingUp, Wallet, AlertCircle,
    X, ArrowUpDown, CalendarDays
} from "lucide-react";
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

type SortOrder = "latest" | "earliest";

export default function BillingPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [sortOrder, setSortOrder] = useState<SortOrder>("latest");

    useEffect(() => {
        const fetchInvoices = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/billing/invoices?status=${statusFilter}`, { credentials: "include" });
                if (res.ok) setInvoices(await res.json());
            } catch (err) {
                console.error("Failed to fetch invoices");
            }
            setLoading(false);
        };
        fetchInvoices();
    }, [statusFilter]);

    // Client-side filtering + sorting. Cheap for typical billing datasets
    // (hundreds of invoices) and avoids a roundtrip on every keystroke.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const fromMs = dateFrom ? new Date(dateFrom).setHours(0, 0, 0, 0) : null;
        const toMs = dateTo ? new Date(dateTo).setHours(23, 59, 59, 999) : null;

        let rows = invoices;
        if (q) {
            rows = rows.filter((inv) => {
                const num = (inv.invoiceNumber || "").toLowerCase();
                const pname = `${inv.patient.firstName} ${inv.patient.lastName}`.toLowerCase();
                const pno = (inv.patient.patientNumber || "").toLowerCase();
                return num.includes(q) || pname.includes(q) || pno.includes(q);
            });
        }
        if (fromMs !== null) {
            rows = rows.filter((inv) => new Date(inv.createdAt).getTime() >= fromMs);
        }
        if (toMs !== null) {
            rows = rows.filter((inv) => new Date(inv.createdAt).getTime() <= toMs);
        }
        // Sort by createdAt. Don't mutate the input array.
        const sorted = [...rows].sort((a, b) => {
            const ta = new Date(a.createdAt).getTime();
            const tb = new Date(b.createdAt).getTime();
            return sortOrder === "latest" ? tb - ta : ta - tb;
        });
        return sorted;
    }, [invoices, search, dateFrom, dateTo, sortOrder]);

    // Aggregates over the currently filtered view (so the stats
    // cards reflect what the user is actually looking at, not the
    // whole dataset). This is the useful number for the user.
    const totalRevenue = filtered.reduce((sum, inv) => sum + inv.amountPaid, 0);
    const totalOutstanding = filtered.reduce((sum, inv) => sum + inv.balanceDue, 0);

    const hasActiveFilters = !!search || !!dateFrom || !!dateTo || statusFilter !== "all";
    const clearFilters = () => {
        setSearch("");
        setDateFrom("");
        setDateTo("");
        setStatusFilter("all");
    };

    // Format a date string as "02 Sep 2026, 14:35" (locale-independent)
    const formatDateTime = (iso: string) => {
        if (!iso) return "—";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        const day = String(d.getDate()).padStart(2, "0");
        const month = d.toLocaleString("en-GB", { month: "short" });
        const year = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${day} ${month} ${year}, ${hh}:${mm}`;
    };

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
                        Showing Invoices
                    </div>
                    <div className={styles.statValue}>{filtered.length}</div>
                </div>
            </div>

            {/* Filter bar: status + date range + search + sort + clear */}
            <div className="glass-card" style={{ padding: "1rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Filter size={18} color="var(--text-muted)" />
                    <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>Status:</span>
                </div>
                <select
                    className="search-input"
                    style={{ width: "160px" }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="all">All</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                    <option value="Paid">Paid</option>
                </select>

                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <CalendarDays size={18} color="var(--text-muted)" />
                    <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>From:</span>
                </div>
                <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    max={dateTo || undefined}
                    className="search-input"
                    style={{ width: "160px" }}
                />

                <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>to</span>
                <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    min={dateFrom || undefined}
                    className="search-input"
                    style={{ width: "160px" }}
                />

                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <ArrowUpDown size={18} color="var(--text-muted)" />
                    <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontWeight: 500 }}>Sort:</span>
                </div>
                <select
                    className="search-input"
                    style={{ width: "160px" }}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                >
                    <option value="latest">Latest first</option>
                    <option value="earliest">Earliest first</option>
                </select>

                <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
                    <Search size={16} style={{ position: "absolute", left: 10, top: 10, color: "var(--text-muted)" }} />
                    <input
                        type="text"
                        placeholder="Search invoice #, patient name, or patient #"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="search-input"
                        style={{ width: "100%", paddingLeft: 32 }}
                    />
                </div>

                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className={styles.actionBtn}
                        style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-color)", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                        title="Clear all filters"
                    >
                        <X size={14} />
                        Clear
                    </button>
                )}
            </div>

            <div className={styles.tableContainer} style={{ overflowX: "auto" }}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Invoice #</th>
                            <th className={styles.th}>Patient</th>
                            <th className={styles.th} style={{ textAlign: "right" }}>Total</th>
                            <th className={styles.th} style={{ textAlign: "right" }}>Paid</th>
                            <th className={styles.th} style={{ textAlign: "right" }}>Balance</th>
                            <th className={styles.th}>Status</th>
                            <th className={styles.th}>
                                <button
                                    onClick={() => setSortOrder((s) => s === "latest" ? "earliest" : "latest")}
                                    title="Click to toggle sort"
                                    style={{
                                        background: "transparent",
                                        border: "none",
                                        padding: 0,
                                        color: "inherit",
                                        font: "inherit",
                                        textTransform: "inherit",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.3rem",
                                    }}
                                >
                                    <CalendarDays size={12} />
                                    Date & Time
                                    <ArrowUpDown size={12} />
                                </button>
                            </th>
                            <th className={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ textAlign: "center", padding: "2rem" }}>Loading billing records...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                    {invoices.length === 0
                                        ? "No invoices found."
                                        : "No invoices match the current filters."}
                                </td>
                            </tr>
                        ) : (
                            filtered.map((inv) => (
                                <tr key={inv.id}>
                                    <td className={styles.td}><strong>{inv.invoiceNumber}</strong></td>
                                    <td className={styles.td}>
                                        {inv.patient.firstName} {inv.patient.lastName}
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{inv.patient.patientNumber}</div>
                                    </td>
                                    <td className={styles.td} style={{ textAlign: "right" }}>{inv.totalAmount.toLocaleString()}</td>
                                    <td className={styles.td} style={{ textAlign: "right", color: "var(--success-color)" }}>{inv.amountPaid.toLocaleString()}</td>
                                    <td className={styles.td} style={{ textAlign: "right", color: inv.balanceDue > 0 ? "var(--danger-color)" : "inherit" }}>
                                        {inv.balanceDue.toLocaleString()}
                                    </td>
                                    <td className={styles.td}>
                                        <span className={`${styles.badge} ${inv.status === 'Paid' ? styles.paid : inv.status === 'Partial' ? styles.partial : styles.unpaid}`}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className={styles.td} style={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                                        {formatDateTime(inv.createdAt)}
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
