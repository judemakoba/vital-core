"use client";

import { useState, useEffect, useMemo } from "react";
import { Scan, Clock, CheckCircle, Loader, Search, RefreshCw } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

type Order = {
    id: string;
    examName: string;
    category: string;
    status: string;
    priority: string;
    createdAt: string;
    patient?: { firstName?: string; lastName?: string; patientNumber?: string };
    visit?: { visitNumber?: string };
};

export default function RadiologyDashboard() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("Ordered");
    const [search, setSearch] = useState("");

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/radiology/orders`, { credentials: "include" });
            if (res.ok) {
                const data: Order[] = await res.json();
                // Emergency/STAT first, then by date
                const pMap: Record<string, number> = { Emergency: 3, Urgent: 2, STAT: 3, Routine: 1 };
                data.sort((a, b) => {
                    const sA = pMap[a.priority] || 0;
                    const sB = pMap[b.priority] || 0;
                    if (sA !== sB) return sB - sA;
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                });
                setOrders(data);
            }
        } catch (err) {
            console.error("Failed to fetch radiology orders", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrders(); }, []);

    const counts = useMemo(() => ({
        Ordered: orders.filter(o => o.status === "Ordered").length,
        InProgress: orders.filter(o => o.status === "InProgress").length,
        Completed: orders.filter(o => o.status === "Completed").length,
    }), [orders]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return orders.filter(o => {
            if (o.status !== statusFilter) return false;
            if (!q) return true;
            return (
                o.examName?.toLowerCase().includes(q) ||
                o.category?.toLowerCase().includes(q) ||
                o.patient?.firstName?.toLowerCase().includes(q) ||
                o.patient?.lastName?.toLowerCase().includes(q) ||
                o.patient?.patientNumber?.toLowerCase().includes(q) ||
                o.visit?.visitNumber?.toLowerCase().includes(q)
            );
        });
    }, [orders, statusFilter, search]);

    const getPriorityClass = (priority: string) => {
        if (priority === "Emergency" || priority === "STAT") return styles.priorityEmergency;
        if (priority === "Urgent") return styles.priorityUrgent;
        return styles.priorityRoutine;
    };

    const getStatusBadgeClass = (status: string) => {
        if (status === "Completed") return `${styles.statusBadge} ${styles.statusBadgeCompleted}`;
        if (status === "InProgress") return `${styles.statusBadge} ${styles.statusBadgeInProgress}`;
        return `${styles.statusBadge} ${styles.statusBadgeOrdered}`;
    };

    const getFilterBadgeClass = (status: string) => {
        if (status === "Completed") return `${styles.filterBadge} ${styles.filterBadgeGreen}`;
        if (status === "InProgress") return `${styles.filterBadge} ${styles.filterBadgeAmber}`;
        return styles.filterBadge;
    };

    return (
        <div className={styles.container}>
            {/* Back link */}
            <Link href="/dashboard" className={styles.backLink}>
                ← Back to Dashboard
            </Link>

            {/* Page header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h1 className={styles.title}>
                        <span className={styles.titleIcon}>
                            <Scan size={24} />
                        </span>
                        Radiology Department
                    </h1>
                </div>
                <button
                    className={styles.refreshBtn}
                    onClick={fetchOrders}
                    disabled={loading}
                    title="Refresh orders"
                >
                    <RefreshCw size={14} className={loading ? styles.spin : ""} />
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {/* Filter bar: status tabs + search */}
            <div className={styles.filterBar}>
                {([
                    { key: "Ordered", label: "Pending Requests", icon: Clock },
                    { key: "InProgress", label: "In Progress", icon: Loader },
                    { key: "Completed", label: "Completed", icon: CheckCircle },
                ] as const).map(({ key, label, icon: Icon }) => {
                    const active = statusFilter === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setStatusFilter(key)}
                            className={`${styles.filterTab} ${active ? styles.filterTabActive : ""}`}
                        >
                            <Icon size={15} /> {label}
                            <span className={getFilterBadgeClass(key)}>
                                {counts[key as keyof typeof counts]}
                            </span>
                        </button>
                    );
                })}

                <div className={styles.searchBox}>
                    <Search size={16} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search patient, exam, visit #…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>
            </div>

            {/* Orders table */}
            <div className={styles.tableWrap}>
                {loading && orders.length === 0 ? (
                    <div className={styles.empty}>Loading radiology orders…</div>
                ) : filtered.length === 0 ? (
                    <div className={styles.empty}>
                        <Scan size={48} className={styles.emptyIcon} />
                        <div className={styles.emptyTitle}>
                            No {statusFilter.toLowerCase()} orders
                        </div>
                        <div className={styles.emptySub}>
                            {statusFilter === "Ordered"
                                ? "All radiology requests are being handled."
                                : statusFilter === "InProgress"
                                    ? "No exams currently being processed."
                                    : "No completed exams yet."}
                        </div>
                    </div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr className={styles.tr}>
                                {["Patient", "Exam", "Category", "Visit #", "Priority", "Status", "Ordered", "Action"].map(h => (
                                    <th key={h} className={styles.th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(order => (
                                <tr key={order.id} className={styles.tr}>
                                    <td className={styles.td}>
                                        <div className={styles.patientName}>
                                            {order.patient?.firstName} {order.patient?.lastName}
                                        </div>
                                        <div className={styles.patientNumber}>
                                            #{order.patient?.patientNumber}
                                        </div>
                                    </td>
                                    <td className={styles.td}>
                                        <div className={styles.examName}>{order.examName}</div>
                                    </td>
                                    <td className={styles.td}>
                                        <span className={styles.examCategory}>{order.category}</span>
                                    </td>
                                    <td className={styles.td}>
                                        <span className={styles.visitNumber}>{order.visit?.visitNumber}</span>
                                    </td>
                                    <td className={styles.td}>
                                        <span className={`${styles.priorityChip} ${getPriorityClass(order.priority)}`}>
                                            {order.priority}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <span className={getStatusBadgeClass(order.status)}>
                                            {order.status === "InProgress" ? "In Progress" : order.status}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <div className={styles.orderedAt}>
                                            {new Date(order.createdAt).toLocaleDateString("en-UG", {
                                                day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                                            })}
                                        </div>
                                    </td>
                                    <td className={styles.td}>
                                        <Link
                                            href={`/dashboard/radiology/${order.id}`}
                                            className={`${styles.actionBtn} ${order.status === "Completed" ? styles.actionBtnComplete : ""}`}
                                        >
                                            {order.status === "Completed" ? (
                                                <><CheckCircle size={13} /> View</>
                                            ) : (
                                                "Process"
                                            )}
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
