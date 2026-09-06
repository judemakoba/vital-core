"use client";

import { useState, useEffect, useMemo } from "react";
import {
    Receipt, Search, Filter, Plus, TrendingUp, Wallet, AlertCircle,
    X, ArrowDownNarrowWide, ArrowUpNarrowWide, CalendarDays, Eye
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

const formatDate = (iso: string) => {
    if (!iso) return { day: "—", time: "" };
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { day: "—", time: "" };
    const day = `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { day, time };
};

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
    // cards reflect what the user is actually looking at).
    const totalRevenue = filtered.reduce((sum, inv) => sum + inv.amountPaid, 0);
    const totalOutstanding = filtered.reduce((sum, inv) => sum + inv.balanceDue, 0);

    const hasActiveFilters = !!search || !!dateFrom || !!dateTo || statusFilter !== "all";
    const clearFilters = () => {
        setSearch("");
        setDateFrom("");
        setDateTo("");
        setStatusFilter("all");
    };

    const SortIcon = sortOrder === "latest" ? ArrowDownNarrowWide : ArrowUpNarrowWide;

    return (
        <div className={styles.container}>
            {/* Page header */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Billing & Invoices</h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: "0.25rem 0 0" }}>
                        All cash receipts and outstanding balances, with date filtering and reordering.
                    </p>
                </div>
                <Link href="/dashboard/billing/new" className={styles.actionBtn} style={{ padding: "0.6rem 1.25rem" }}>
                    <Plus size={18} style={{ marginRight: "0.5rem", verticalAlign: "middle" }} />
                    Create Invoice
                </Link>
            </div>

            {/* Stats — over the filtered view */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>
                        <TrendingUp size={14} color="var(--success-color)" style={{ marginRight: "0.4rem" }} />
                        Total Collected
                    </div>
                    <div className={styles.statValue}>
                        UGX {totalRevenue.toLocaleString()}
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>
                        <AlertCircle size={14} color={totalOutstanding > 0 ? "var(--danger-color)" : "var(--text-muted)"} style={{ marginRight: "0.4rem" }} />
                        Outstanding Debt
                    </div>
                    <div className={styles.statValue} style={{ color: totalOutstanding > 0 ? "var(--danger-color)" : "var(--text-primary)" }}>
                        UGX {totalOutstanding.toLocaleString()}
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statLabel}>
                        <Receipt size={14} color="var(--primary-color)" style={{ marginRight: "0.4rem" }} />
                        {hasActiveFilters ? "Showing (filtered)" : "Total Invoices"}
                    </div>
                    <div className={styles.statValue}>
                        {filtered.length}
                        {hasActiveFilters && invoices.length !== filtered.length && (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.875rem", fontWeight: 500, marginLeft: "0.4rem" }}>
                                / {invoices.length}
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
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">All</option>
                        <option value="Unpaid">Unpaid</option>
                        <option value="Partial">Partial</option>
                        <option value="Paid">Paid</option>
                    </select>
                </div>

                <span className={styles.filterDivider} aria-hidden="true" />

                {/* Group 2: date range */}
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>
                        <CalendarDays size={14} />
                        Date
                    </label>
                    <div className={styles.dateRange}>
                        <input
                            type="date"
                            className={styles.filterDate}
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            max={dateTo || undefined}
                            aria-label="From date"
                        />
                        <span className={styles.dateRangeConnector}>to</span>
                        <input
                            type="date"
                            className={styles.filterDate}
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            min={dateFrom || undefined}
                            aria-label="To date"
                        />
                    </div>
                </div>

                <span className={styles.filterDivider} aria-hidden="true" />

                {/* Group 3: sort */}
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>
                        <SortIcon size={14} />
                        Sort
                    </label>
                    <select
                        className={styles.filterSelect}
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                    >
                        <option value="latest">Latest first</option>
                        <option value="earliest">Earliest first</option>
                    </select>
                </div>

                {/* Group 4: search (takes remaining width) */}
                <div className={styles.searchWrap}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search invoice #, patient name, or patient #"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className={styles.clearBtn}
                        title="Clear all filters"
                    >
                        <X size={14} />
                        Clear
                    </button>
                )}
            </div>

            {/* Result-count strip */}
            <div className={styles.resultCount}>
                <div>
                    {hasActiveFilters ? (
                        <span className={styles.resultCountActive}>
                            Showing {filtered.length} of {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
                            {(!!search || !!dateFrom || !!dateTo) && (
                                <span className={styles.resultCountInactive} style={{ marginLeft: "0.5rem" }}>
                                    (with active filters)
                                </span>
                            )}
                        </span>
                    ) : (
                        <span className={styles.resultCountInactive}>
                            Showing all {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
                        </span>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className={styles.tableContainer} style={{ overflowX: "auto" }}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Invoice #</th>
                            <th className={styles.th}>Patient</th>
                            <th className={`${styles.th} ${styles.thRight}`}>Total</th>
                            <th className={`${styles.th} ${styles.thRight}`}>Paid</th>
                            <th className={`${styles.th} ${styles.thRight}`}>Balance</th>
                            <th className={styles.th}>Status</th>
                            <th className={styles.th}>
                                <button
                                    onClick={() => setSortOrder((s) => s === "latest" ? "earliest" : "latest")}
                                    className={`${styles.thSortable} ${sortOrder === "latest" || sortOrder === "earliest" ? styles.thSortableActive : ""}`}
                                    title="Click to flip sort order"
                                >
                                    <CalendarDays size={12} className={styles.thSortIcon} />
                                    Date & Time
                                    <SortIcon size={12} className={styles.thSortIcon} />
                                </button>
                            </th>
                            <th className={`${styles.th} ${styles.thRight}`}>View</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>Loading billing records…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                    {invoices.length === 0
                                        ? "No invoices found."
                                        : "No invoices match the current filters."}
                                </td>
                            </tr>
                        ) : (
                            filtered.map((inv) => {
                                const { day, time } = formatDate(inv.createdAt);
                                return (
                                    <tr key={inv.id}>
                                        <td className={`${styles.td} ${styles.tdPrimary}`}>{inv.invoiceNumber}</td>
                                        <td className={styles.td}>
                                            {inv.patient.firstName} {inv.patient.lastName}
                                            <div className={styles.tdMuted}>{inv.patient.patientNumber}</div>
                                        </td>
                                        <td className={`${styles.td} ${styles.tdRight}`}>{inv.totalAmount.toLocaleString()}</td>
                                        <td className={`${styles.td} ${styles.tdRight}`} style={{ color: "var(--success-color)" }}>{inv.amountPaid.toLocaleString()}</td>
                                        <td className={`${styles.td} ${styles.tdRight}`} style={{ color: inv.balanceDue > 0 ? "var(--danger-color)" : "inherit" }}>
                                            {inv.balanceDue.toLocaleString()}
                                        </td>
                                        <td className={styles.td}>
                                            <span className={`${styles.badge} ${inv.status === 'Paid' ? styles.paid : inv.status === 'Partial' ? styles.partial : styles.unpaid}`}>
                                                {inv.status}
                                            </span>
                                        </td>
                                        <td className={styles.td}>
                                            <div className={styles.tdDate}>
                                                <div className={styles.tdDateDay}>{day}</div>
                                                {time && <div className={styles.tdDateTime}>{time}</div>}
                                            </div>
                                        </td>
                                        <td className={styles.tdActions}>
                                            <Link
                                                href={`/dashboard/billing/${inv.id}`}
                                                className={styles.iconBtn}
                                                title="View invoice details"
                                                aria-label={`View invoice ${inv.invoiceNumber}`}
                                            >
                                                <Eye size={16} />
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
