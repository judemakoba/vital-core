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
    Calendar as CalendarIcon,
    Stethoscope,
    Microscope,
    ScanLine
} from "lucide-react";
import styles from "./page.module.css";

// Human-readable labels + icon hints for each itemType in InvoiceItem.
// The dispense route writes itemType: "Pharmacy", lab orders write "Lab",
// radiology writes "Radiology", consultation fee writes "Consultation".
const SECTION_META: Record<string, { label: string; color: string; Icon: React.ComponentType<{ size?: number }> }> = {
    Consultation: { label: "Consultation", color: "#0047AB", Icon: Stethoscope },
    Lab:          { label: "Laboratory",   color: "#10B981", Icon: Microscope },
    Radiology:    { label: "Radiology",    color: "#8B5CF6", Icon: ScanLine },
    Pharmacy:     { label: "Pharmacy",     color: "#F59E0B", Icon: Pill },
    Drug:         { label: "Pharmacy",     color: "#F59E0B", Icon: Pill },
    OTHER:        { label: "Other",        color: "#6B7280", Icon: BarChart3 },
};

export default function ReportsPage() {
    const today = new Date().toISOString().split('T')[0];
    const lastMonth = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(lastMonth);
    const [endDate, setEndDate] = useState(today);
    const [stats, setStats] = useState<any>(null);
    const [pharmacyData, setPharmacyData] = useState<any[]>([]);
    const [deptPerformance, setDeptPerformance] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [overviewRes, pharmacyRes] = await Promise.all([
                fetch(`/api/reports/dynamic?type=overview&startDate=${startDate}&endDate=${endDate}`),
                fetch(`/api/reports/dynamic?type=pharmacy&startDate=${startDate}&endDate=${endDate}`)
            ]);

            // API returns { success, data: { ... } } — unwrap to data (fallback to
            // the raw payload in case the envelope shape ever changes).
            if (overviewRes.ok) {
                const payload = await overviewRes.json();
                const body = payload?.data ?? payload;
                setStats(body?.summary ?? null);
                setDeptPerformance(Array.isArray(body?.departmentalPerformance) ? body.departmentalPerformance : []);
            }
            if (pharmacyRes.ok) {
                const payload = await pharmacyRes.json();
                const body = payload?.data ?? payload;
                setPharmacyData(Array.isArray(body?.topMedications) ? body.topMedications : []);
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

            {/* Revenue by Service Line (R53 per-section invoices) */}
            <div className={styles.tableCard}>
                <h3 className={styles.tableTitle}><BarChart3 size={20} /> Revenue by Service Line</h3>
                {loading ? (
                    <p style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>Loading service-line breakdown…</p>
                ) : deptPerformance.length === 0 ? (
                    <p style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No revenue activity in this period.</p>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", padding: "1rem 0" }}>
                        {deptPerformance.map((d) => {
                            const meta = SECTION_META[d.department] ?? SECTION_META.OTHER;
                            const label = meta.label;
                            const color = meta.color;
                            const Icon = meta.Icon;
                            const pct = Math.min(100, Number(d.percentage) || 0);
                            return (
                                <div key={d.department}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", fontSize: "0.9rem" }}>
                                        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
                                            <Icon size={16} color={color} />
                                            {label}
                                        </span>
                                        <span style={{ color: "var(--text-muted)" }}>
                                            {(d.revenue || 0).toLocaleString()} UGX
                                            <span style={{ marginLeft: "0.5rem", fontWeight: 600, color }}>
                                                ({pct.toFixed(1)}%)
                                            </span>
                                        </span>
                                    </div>
                                    <div style={{ height: "10px", background: "var(--bg-muted, rgba(0,0,0,0.08))", borderRadius: "6px", overflow: "hidden" }}>
                                        <div
                                            style={{
                                                height: "100%",
                                                width: `${pct}%`,
                                                background: color,
                                                borderRadius: "6px",
                                                transition: "width 0.4s ease",
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
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
                                        <td className={styles.td}>{item.drugName ?? item.name ?? "—"}</td>
                                        <td className={styles.td}>{item.quantityDispensed ?? item._sum?.quantity ?? 0}</td>
                                        <td className={styles.td}>{(item.revenueGenerated ?? item._sum?.totalPrice ?? 0).toLocaleString()}</td>
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
