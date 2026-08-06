"use client";

import { useState, useEffect } from "react";
import { Search, TestTube, CheckCircle, Clock } from "lucide-react";
import Link from "next/link";
import styles from "../patients/page.module.css"; // Reuse table container styles

export default function LabDashboard() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("Ordered");

    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            try {
                // Fetch orders based on active tab
                const res = await fetch(`/api/lab/pending?status=${statusFilter}`, { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();

                    // Simple manual sort since Prisma enum sorting is strict/limited
                    // Emergency -> Urgent -> Routine
                    const prioritySort = (a: any, b: any) => {
                        const pMap: Record<string, number> = { "Emergency": 3, "Urgent": 2, "STAT": 3, "Routine": 1 };
                        const scoreA = pMap[a.priority] || 0;
                        const scoreB = pMap[b.priority] || 0;
                        if (scoreA !== scoreB) return scoreB - scoreA;
                        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    };

                    setOrders(data.sort(prioritySort));
                }
            } catch (err) {
                console.error("Failed to fetch lab orders", err);
            } finally {
                setLoading(false);
            }
        };

        fetchOrders();
    }, [statusFilter]);

    const getPriorityColor = (priority: string) => {
        if (priority === 'Emergency' || priority === 'STAT') return 'var(--danger-color)';
        if (priority === 'Urgent') return 'var(--warning-color)';
        return 'var(--text-secondary)';
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Laboratory Dashboard</h1>
            </div>

            <div className="glass-card" style={{ marginBottom: "1.5rem", padding: "1rem", display: "flex", gap: "1rem" }}>
                <button
                    className={`btn ${statusFilter === "Ordered" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setStatusFilter("Ordered")}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                    <Clock size={16} /> Pending Requests
                </button>
                <button
                    className={`btn ${statusFilter === "InProgress" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setStatusFilter("InProgress")}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                    <TestTube size={16} /> In Progress
                </button>
                <button
                    className={`btn ${statusFilter === "Completed" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setStatusFilter("Completed")}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                    <CheckCircle size={16} /> Completed
                </button>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Patient</th>
                            <th className={styles.th}>Test Details</th>
                            <th className={styles.th}>Priority</th>
                            <th className={styles.th}>Requested By</th>
                            <th className={styles.th}>Date & Time</th>
                            <th className={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem" }}>
                                    Loading orders...
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                    No lab requests found for the selected filter.
                                </td>
                            </tr>
                        ) : (
                            orders.map(order => (
                                <tr key={order.id} className={styles.tr}>
                                    <td className={styles.td}>
                                        <div style={{ fontWeight: 600 }}>{order.patient.firstName} {order.patient.lastName}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{order.patient.patientNumber}</div>
                                    </td>
                                    <td className={styles.td}>
                                        <div style={{ fontWeight: 500, color: "var(--primary-color)" }}>{order.testName}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{order.testCategory}</div>
                                    </td>
                                    <td className={styles.td}>
                                        <span style={{
                                            fontSize: "0.75rem",
                                            fontWeight: 600,
                                            padding: "0.2rem 0.5rem",
                                            borderRadius: "999px",
                                            background: `color-mix(in srgb, ${getPriorityColor(order.priority)} 15%, transparent)`,
                                            color: getPriorityColor(order.priority)
                                        }}>
                                            {order.priority}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        Dr. {order.doctor?.name || "Unknown"}
                                    </td>
                                    <td className={styles.td}>
                                        <div style={{ fontSize: "0.875rem" }}>
                                            {new Date(order.createdAt).toLocaleDateString()}
                                        </div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                            {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </td>
                                    <td className={styles.td}>
                                        <Link
                                            href={`/dashboard/lab/${order.id}`}
                                            className={styles.addBtn}
                                            style={{ padding: "0.4rem 0.8rem", fontSize: "0.875rem" }}
                                        >
                                            {order.status === "Completed" ? "View Results" : "Process Test"}
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
