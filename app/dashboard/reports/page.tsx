"use client";

import { useState, useEffect } from "react";
import {
    BarChart3,
    Download,
    Filter,
    TrendingUp,
    Users,
    Pill,
    DollarSign,
    Calendar as CalendarIcon
} from "lucide-react";
import styles from "./page.module.css";

export default function ReportsPage() {
    const today = new Date().toISOString().split('T')[0];
    const lastMonth = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(lastMonth);
    const [endDate, setEndDate] = useState(today);
    const [stats, setStats] = useState<any>(null);
    const [pharmacyData, setPharmacyData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [overviewRes, pharmacyRes] = await Promise.all([
                fetch(`/api/reports/dynamic?type=overview&startDate=${startDate}&endDate=${endDate}`),
                fetch(`/api/reports/dynamic?type=pharmacy&startDate=${startDate}&endDate=${endDate}`)
            ]);

            if (overviewRes.ok) {
                const data = await overviewRes.json();
                setStats(data.stats);
            }
            if (pharmacyRes.ok) {
                setPharmacyData(await pharmacyRes.json());
            }
        } catch (err) {
            console.error("Failed to fetch report data");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    const handleExportCSV = () => {
        // Basic CSV export logic
        const headers = ["Drug Name", "Quantity Sold", "Total Revenue"];
        const rows = pharmacyData.map(d => [d.name, d._sum.quantity, d._sum.totalPrice]);

        const csvContent = [
            headers.join(","),
            ...rows.map(e => e.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `VitalCore_Pharmacy_Report_${startDate}_to_${endDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className={styles.container}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h1 className="title">Advanced Reporting</h1>
                <button onClick={handleExportCSV} className={styles.exportBtn}>
                    <Download size={18} /> Export CSV
                </button>
            </div>

            {/* Filters */}
            <div className={styles.controls}>
                <div className={styles.filterGroup}>
                    <Filter size={18} color="var(--primary-color)" />
                    <span style={{ fontWeight: 600 }}>Timeframe:</span>
                    <input
                        type="date"
                        className={styles.dateInput}
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                    <span>to</span>
                    <input
                        type="date"
                        className={styles.dateInput}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                    Showing data from {new Date(startDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
                </div>
            </div>

            {/* Overview Cards */}
            <div className={styles.grid}>
                <div className={styles.statCard}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className={styles.statLabel}>Total Patients</span>
                        <Users size={20} color="var(--primary-color)" />
                    </div>
                    <div className={styles.statValue}>{loading ? "..." : stats?.totalPatients || 0}</div>
                </div>
                <div className={styles.statCard}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className={styles.statLabel}>Dynamic Visits</span>
                        <CalendarIcon size={20} color="var(--info-color)" />
                    </div>
                    <div className={styles.statValue}>{loading ? "..." : stats?.totalVisits || 0}</div>
                </div>
                <div className={styles.statCard}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className={styles.statLabel}>Revenue (UGX)</span>
                        <DollarSign size={20} color="var(--success-color)" />
                    </div>
                    <div className={styles.statValue}>{loading ? "..." : stats?.totalRevenue?.toLocaleString() || 0}</div>
                </div>
                <div className={styles.statCard}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className={styles.statLabel}>Expenses (UGX)</span>
                        <TrendingUp size={20} color="var(--danger-color)" />
                    </div>
                    <div className={styles.statValue}>{loading ? "..." : stats?.totalExpenses?.toLocaleString() || 0}</div>
                </div>
            </div>

            <div className={styles.mainSection}>
                {/* Pharmacy Top Items */}
                <div className={styles.tableCard}>
                    <h3 className={styles.tableTitle}><Pill size={20} /> Top Performing Medications</h3>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th className={styles.th}>Medication</th>
                                <th className={styles.th}>Qty Sold</th>
                                <th className={styles.th}>Revenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={3} style={{ textAlign: "center", padding: "2rem" }}>Analyzing stock data...</td></tr>
                            ) : pharmacyData.length === 0 ? (
                                <tr><td colSpan={3} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No pharmacy activity in this period.</td></tr>
                            ) : (
                                pharmacyData.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className={styles.td}>{item.name}</td>
                                        <td className={styles.td}>{item._sum.quantity}</td>
                                        <td className={styles.td}>{item._sum.totalPrice.toLocaleString()}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Business Intelligence */}
                <div className={styles.tableCard}>
                    <h3 className={styles.tableTitle}><BarChart3 size={20} /> Performance Analysis</h3>
                    <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <div className="glass-card" style={{ padding: "1rem" }}>
                            <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Net Flow</div>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: (stats?.totalRevenue - stats?.totalExpenses) >= 0 ? "var(--success-color)" : "var(--danger-color)" }}>
                                {loading ? "..." : (stats?.totalRevenue - stats?.totalExpenses)?.toLocaleString()} UGX
                            </div>
                        </div>
                        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                            Analysis suggests {stats?.totalVisits > 20 ? 'moderate' : 'low'} patient traffic.
                            {stats?.totalRevenue > stats?.totalExpenses ? ' Profit margins are stable.' : ' Expenses are currently exceeding revenue.'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
