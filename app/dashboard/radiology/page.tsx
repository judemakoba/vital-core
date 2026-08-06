"use client";

import { useState, useEffect } from "react";
import { Scan, Clock, CheckCircle, Loader, AlertCircle } from "lucide-react";
import Link from "next/link";
import styles from "../patients/page.module.css";

export default function RadiologyDashboard() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState("Ordered");

    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/radiology/orders`, { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();

                    // Sort: Emergency/STAT first, then by date
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
                console.error("Failed to fetch radiology orders", err);
            } finally {
                setLoading(false);
            }
        };

        fetchOrders();
    }, [statusFilter]);

    const filteredOrders = orders.filter(o => {
        if (statusFilter === "Ordered") return o.status === "Ordered";
        if (statusFilter === "InProgress") return o.status === "InProgress";
        if (statusFilter === "Completed") return o.status === "Completed";
        return true;
    });

    const getPriorityColor = (priority: string) => {
        if (priority === "Emergency" || priority === "STAT") return "var(--danger-color)";
        if (priority === "Urgent") return "var(--warning-color)";
        return "var(--text-secondary)";
    };

    const getStatusBadge = (status: string) => {
        if (status === "Completed") return <span style={{ color: "var(--success-color)", fontWeight: 700, fontSize: "0.8rem" }}>Completed</span>;
        if (status === "InProgress") return <span style={{ color: "var(--warning-color)", fontWeight: 700, fontSize: "0.8rem" }}>In Progress</span>;
        return <span style={{ color: "var(--primary-color)", fontWeight: 700, fontSize: "0.8rem" }}>Ordered</span>;
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>
                    <Scan size={28} style={{ marginRight: "0.5rem", verticalAlign: "middle" }} />
                    Radiology Department
                </h1>
            </div>

            {/* Status Filter Tabs */}
            <div className="glass-card" style={{ marginBottom: "1.5rem", padding: "1rem", display: "flex", gap: "1rem" }}>
                <button
                    className={`btn ${statusFilter === "Ordered" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setStatusFilter("Ordered")}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                    <Clock size={16} /> Pending Requests
                    <span style={{
                        background: statusFilter === "Ordered" ? "rgba(255,255,255,0.2)" : "var(--primary-color)",
                        color: statusFilter === "Ordered" ? "white" : "white",
                        borderRadius: "12px",
                        padding: "0 8px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        marginLeft: "0.25rem"
                    }}>
                        {orders.filter(o => o.status === "Ordered").length}
                    </span>
                </button>
                <button
                    className={`btn ${statusFilter === "InProgress" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setStatusFilter("InProgress")}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                    <Loader size={16} /> In Progress
                    <span style={{
                        background: statusFilter === "InProgress" ? "rgba(255,255,255,0.2)" : "var(--warning-color)",
                        color: "white",
                        borderRadius: "12px",
                        padding: "0 8px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        marginLeft: "0.25rem"
                    }}>
                        {orders.filter(o => o.status === "InProgress").length}
                    </span>
                </button>
                <button
                    className={`btn ${statusFilter === "Completed" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setStatusFilter("Completed")}
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                >
                    <CheckCircle size={16} /> Completed
                    <span style={{
                        background: statusFilter === "Completed" ? "rgba(255,255,255,0.2)" : "var(--success-color)",
                        color: "white",
                        borderRadius: "12px",
                        padding: "0 8px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        marginLeft: "0.25rem"
                    }}>
                        {orders.filter(o => o.status === "Completed").length}
                    </span>
                </button>
            </div>

            {/* Orders Table */}
            <div className={styles.tableContainer}>
                {loading ? (
                    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                        Loading radiology orders...
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                        <Scan size={48} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
                        <div style={{ fontSize: "1rem", fontWeight: 600 }}>No {statusFilter.toLowerCase()} orders</div>
                        <div style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
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
                            <tr>
                                <th>Patient</th>
                                <th>Exam</th>
                                <th>Category</th>
                                <th>Visit #</th>
                                <th>Priority</th>
                                <th>Status</th>
                                <th>Ordered</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map((order) => (
                                <tr key={order.id}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>
                                            {order.patient?.firstName} {order.patient?.lastName}
                                        </div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                            #{order.patient?.patientNumber}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{order.examName}</div>
                                    </td>
                                    <td>
                                        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                            {order.category}
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{ fontSize: "0.8rem", color: "var(--primary-color)", fontWeight: 600 }}>
                                            {order.visit?.visitNumber}
                                        </span>
                                    </td>
                                    <td>
                                        <span style={{
                                            fontSize: "0.75rem",
                                            fontWeight: 700,
                                            color: getPriorityColor(order.priority),
                                            textTransform: "uppercase"
                                        }}>
                                            {order.priority}
                                        </span>
                                    </td>
                                    <td>{getStatusBadge(order.status)}</td>
                                    <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                        {new Date(order.createdAt).toLocaleDateString("en-UG", {
                                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                                        })}
                                    </td>
                                    <td>
                                        <Link
                                            href={`/dashboard/radiology/${order.id}`}
                                            style={{
                                                padding: "0.4rem 1rem",
                                                background: order.status === "Completed" ? "rgba(34,197,94,0.1)" : "var(--primary-color)",
                                                color: order.status === "Completed" ? "var(--success-color)" : "white",
                                                borderRadius: "8px",
                                                fontSize: "0.8rem",
                                                fontWeight: 600,
                                                textDecoration: "none",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: "0.3rem",
                                                transition: "all 0.2s"
                                            }}
                                        >
                                            {order.status === "Completed" ? (
                                                <><CheckCircle size={13} /> View</>
                                            ) : (
                                                <>Process</>
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
