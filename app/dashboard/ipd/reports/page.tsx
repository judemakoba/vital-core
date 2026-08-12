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
    
    const [activeTab, setActiveTab] = useState("REVENUE"); // REVENUE, COST, INSURANCE
    const [isLoading, setIsLoading] = useState(false);
    
    const [revenueData, setRevenueData] = useState<any>(null);
    const [costData, setCostData] = useState<any>(null);
    const [insuranceData, setInsuranceData] = useState<any>(null);
    const [currency, setCurrency] = useState("UGX");
    // Performance" tab in this report and skip the INSURANCE branch
    // entirely. Default to REVENUE if the user happened to be on
    // INSURANCE when the flag was flipped.
    useEffect(() => {
                if (!enabled && activeTab === "INSURANCE") {
                    setActiveTab("REVENUE");
                }
            })
            .catch(() => setInsuranceEnabled(true));
    }, []);

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
            } else if (activeTab === "INSURANCE") {
                const res = await fetch(`/api/ipd/reports/insurance-analysis?startDate=${startDate}&endDate=${endDate}`);
                if (res.ok) setInsuranceData(await res.json());
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
                                                    <div className="text-4xl font-bold text-primary-dark">{currency} {revenueData.summary.totalRevenue.toFixed(2)}</div>
                            </div>
                            <div className="glass-panel p-6">
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
                                                    <td className="font-medium">{category.replace(/_/g, ' ')}</td>
                                                    <td className="text-right">{currency} {amount.toFixed(2)}</td>
                                                    <td className="text-right">
                                                        <span className="badge badge-secondary">
                                                            {((amount / revenueData.summary.totalRevenue) * 100).toFixed(1)}%
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                         <div className="glass-panel p-6 border-l-4 border-info">
                                                         {insuranceData.breakdown.length === 0 ? (
                                 <div className="text-center p-8 text-gray-500 border border-dashed rounded-lg">
                                     No insurance claims recorded in this period.
                                 </div>
                             ) : (
                                <div className="table-container">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Insurance Provider</th>
                                                <th className="text-center">Active IPD Claims</th>
                                                <th className="text-right">Claim Value</th>
                                                <th className="text-right">% of Insurance Mix</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {insuranceData.breakdown.map((item: any, idx: number) => (
                                                <tr key={idx}>
                                                    <td className="font-semibold text-primary">{item.companyName}</td>
                                                    <td className="text-center">{item.totalClaims}</td>
                                                    <td className="text-right font-bold">{currency} {item.totalAmount.toFixed(2)}</td>
                                                    <td className="text-right">
                                                        <span className="badge badge-success">
                                                            {((item.totalAmount / insuranceData.totalInsuranceRevenue) * 100).toFixed(1)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                             )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
