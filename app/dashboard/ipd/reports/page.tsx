"use client";

import { useState, useEffect } from "react";
const toast = { success: (msg: string) => alert(msg), error: (msg: string) => alert(msg) };
import styles from "../ipd.module.css";

export default function IPDReportsPage() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const [startDate, setStartDate] = useState(thirtyDaysAgo.toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

    const [activeTab, setActiveTab] = useState("REVENUE"); // REVENUE | COST
    const [isLoading, setIsLoading] = useState(false);

    const [revenueData, setRevenueData] = useState<any>(null);
    const [costData, setCostData] = useState<any>(null);
    const [currency, setCurrency] = useState("UGX");

    useEffect(() => {
        fetch('/api/admin/settings')
            .then(res => res.json())
            .then(data => {
                if (data.currency) setCurrency(data.currency);
            })
            .catch(() => {});
    }, []);

    const generateReport = async () => {
        setIsLoading(true);
        try {
            if (activeTab === "REVENUE") {
                const res = await fetch(`/api/ipd/reports/revenue?startDate=${startDate}&endDate=${endDate}`);
                if (res.ok) setRevenueData(await res.json());
            } else if (activeTab === "COST") {
                const res = await fetch(`/api/ipd/reports/average-cost?startDate=${startDate}&endDate=${endDate}`);
                if (res.ok) setCostData(await res.json());
            }
            toast.success("Report generated successfully");
        } catch (error) {
            toast.error("Failed to generate report");
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-load on mount or tab change
    useEffect(() => {
        generateReport();
    }, [activeTab]);

    return (
        <div className="pb-12">
            <div className={styles.pageHeader}>
                <div>
                    <h1>IPD Reports</h1>
                </div>
            </div>

            <div className="flex gap-2 mb-4">
                <button
                    className={activeTab === "REVENUE" ? "btn-primary" : "btn-secondary"}
                    onClick={() => setActiveTab("REVENUE")}
                >
                    Revenue
                </button>
                <button
                    className={activeTab === "COST" ? "btn-primary" : "btn-secondary"}
                    onClick={() => setActiveTab("COST")}
                >
                    Average Cost
                </button>
            </div>

            <div className="flex gap-2 mb-6 items-center">
                <label>From:</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
                <label>To:</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input" />
                <button onClick={generateReport} disabled={isLoading} className="btn-primary">
                    {isLoading ? "Generating…" : "Generate"}
                </button>
            </div>

            {isLoading && <div className="text-center p-8 text-gray-500">Loading report…</div>}

            {!isLoading && activeTab === "REVENUE" && revenueData && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="glass-panel p-6">
                        <h3 className="text-sm font-medium text-gray-500 mb-2">Total Revenue</h3>
                        <div className="text-4xl font-bold text-primary-dark">
                            {currency} {revenueData.summary.totalRevenue.toFixed(2)}
                        </div>
                    </div>
                    <div className="glass-panel p-6 border-l-4 border-info" style={{ gridColumn: "span 3" }}>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Category</th>
                                        <th className="text-right">Generated Revenue</th>
                                        <th className="text-right">% of Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(revenueData.revenueByCategory)
                                        .sort((a: any, b: any) => b[1] - a[1])
                                        .map(([category, amount]: [string, any]) => (
                                            <tr key={category}>
                                                <td className="font-medium">{String(category).replace(/_/g, ' ')}</td>
                                                <td className="text-right">{currency} {Number(amount).toFixed(2)}</td>
                                                <td className="text-right">
                                                    <span className="badge badge-secondary">
                                                        {((Number(amount) / revenueData.summary.totalRevenue) * 100).toFixed(1)}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {!isLoading && activeTab === "COST" && costData && (
                <div className="glass-panel p-6">
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Average cost</h3>
                    <pre style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {JSON.stringify(costData, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
