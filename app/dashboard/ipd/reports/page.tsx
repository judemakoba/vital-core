"use client";

import { useState, useEffect } from "react";
import { FileText, Download, TrendingUp, Search, Calendar, Landmark, Shield } from "lucide-react";
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

    // R49: insurance feature flag. When OFF, hide the "Insurance
    // Performance" tab in this report and skip the INSURANCE branch
    // entirely. Default to REVENUE if the user happened to be on
    // INSURANCE when the flag was flipped.
    const [insuranceEnabled, setInsuranceEnabled] = useState(true);
    useEffect(() => {
        fetch("/api/insurance/enabled", { credentials: "include" })
            .then(r => r.ok ? r.json() : { enabled: true })
            .then(data => {
                const enabled = data.enabled !== false;
                setInsuranceEnabled(enabled);
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
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="text-primary" /> IPD Financial Reports
                    </h2>
                    <p className="text-sm text-gray-500">Analyze Inpatient Department revenue, costs, and insurance performance.</p>
                </div>
            </div>

            <div className="glass-panel p-6 mb-8 flex flex-wrap gap-4 items-end">
                <div className="form-group flex-1 min-w-[200px]">
                    <label>Start Date</label>
                    <div className="relative">
                        <Calendar size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                        <input 
                            type="date" 
                            className="input-field pl-10" 
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                </div>
                <div className="form-group flex-1 min-w-[200px]">
                    <label>End Date</label>
                    <div className="relative">
                        <Calendar size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                        <input 
                            type="date" 
                            className="input-field pl-10" 
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                </div>
                <button 
                    className="btn-primary py-3 px-6 h-[42px] flex items-center"
                    onClick={generateReport}
                    disabled={isLoading}
                >
                    {isLoading ? "Generating..." : "Generate Report"}
                </button>
            </div>

            <div className="flex border-b mb-6">
                <button 
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === "REVENUE" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    onClick={() => setActiveTab("REVENUE")}
                >
                    <TrendingUp size={16} /> Revenue Breakdown
                </button>
                <button
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === "COST" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    onClick={() => setActiveTab("COST")}
                >
                    <Landmark size={16} /> Cost & LoS Analysis
                </button>
                {insuranceEnabled && (
                    <button
                        className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === "INSURANCE" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                        onClick={() => setActiveTab("INSURANCE")}
                    >
                        <Shield size={16} /> Insurance Performance
                    </button>
                )}
            </div>

            <div className="animate-fade-in">
                {isLoading && (
                    <div className="h-64 flex flex-col items-center justify-center text-primary">
                        <div className="animate-spin mb-4"><Search size={32} /></div>
                        <p className="font-medium animate-pulse">Running financial calculations...</p>
                    </div>
                )}

                {!isLoading && activeTab === "REVENUE" && revenueData && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 space-y-4">
                            <div className="glass-panel p-6 bg-primary/5 border border-primary/20">
                                <h4 className="text-gray-500 text-sm font-semibold mb-1 uppercase tracking-wider">Gross IPD Revenue</h4>
                                <div className="text-4xl font-bold text-primary-dark">{currency} {revenueData.summary.totalRevenue.toFixed(2)}</div>
                            </div>
                            <div className="glass-panel p-6">
                                <h4 className="text-gray-500 text-sm font-semibold mb-1 uppercase tracking-wider">Cost Burden Split</h4>
                                <div className="mt-4 space-y-4">
                                    <div>
                                        <div className="flex justify-between mb-1 text-sm font-medium">
                                            <span>Patient Self-Pay</span>
                                            <span>{currency} {revenueData.summary.totalPatientShare.toFixed(2)}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div className="bg-warning h-2 rounded-full" style={{ width: `${(revenueData.summary.totalPatientShare / Math.max(revenueData.summary.totalRevenue, 1)) * 100}%` }}></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between mb-1 text-sm font-medium">
                                            <span>Insurance Claims</span>
                                            <span>{currency} {revenueData.summary.totalInsuranceShare.toFixed(2)}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div className="bg-success h-2 rounded-full" style={{ width: `${(revenueData.summary.totalInsuranceShare / Math.max(revenueData.summary.totalRevenue, 1)) * 100}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="lg:col-span-2 glass-panel p-6">
                            <h3 className="text-lg font-bold mb-6">Revenue by Category</h3>
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
                            <h4 className="text-gray-500 text-sm font-semibold mb-1 uppercase tracking-wider">Total Discharges</h4>
                            <div className="text-3xl font-bold">{costData.metrics.totalDischarges}</div>
                            <p className="text-xs text-gray-400 mt-2">In selected period</p>
                        </div>
                        <div className="glass-panel p-6 border-l-4 border-primary">
                            <h4 className="text-gray-500 text-sm font-semibold mb-1 uppercase tracking-wider">Avg. Length of Stay</h4>
                            <div className="text-3xl font-bold">{costData.metrics.averageLengthOfStay} <span className="text-lg text-gray-500 font-normal">days</span></div>
                            <p className="text-xs text-gray-400 mt-2">Metric indicator</p>
                        </div>
                        <div className="glass-panel p-6 border-l-4 border-warning">
                            <h4 className="text-gray-500 text-sm font-semibold mb-1 uppercase tracking-wider">Avg. Cost Per Day</h4>
                            <div className="text-3xl font-bold">{currency} {costData.metrics.averageCostPerDay}</div>
                            <p className="text-xs text-gray-400 mt-2">Total revenue / Total patient days</p>
                        </div>
                        <div className="glass-panel p-6 border-l-4 border-success">
                            <h4 className="text-gray-500 text-sm font-semibold mb-1 uppercase tracking-wider">Avg. Cost Per Admission</h4>
                            <div className="text-3xl font-bold">{currency} {costData.metrics.averageCostPerAdmission}</div>
                            <p className="text-xs text-gray-400 mt-2">Total revenue / Total discharges</p>
                        </div>

                        <div className="col-span-full glass-panel p-6 flex flex-col items-center justify-center min-h-[200px] text-gray-500 border border-dashed text-center">
                             <Landmark size={48} className="mb-4 text-gray-300" />
                             <h4 className="font-semibold text-lg text-gray-700">Financial Insights</h4>
                             <p className="max-w-xl mt-2 text-sm">
                                 The Average Length of Stay (LoS) is widely used to evaluate the efficiency of hospital management. Reducing LoS typically reduces the cost per discharge and moves the margin of profit to a higher scale per bed in the facility. Your current Average Cost per Admission is <strong>{currency} {costData.metrics.averageCostPerAdmission}</strong>.
                             </p>
                        </div>
                    </div>
                )}

                {!isLoading && activeTab === "INSURANCE" && insuranceData && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 space-y-6">
                            <div className="glass-panel p-6 bg-success/10 border border-success/20">
                                <h4 className="text-success-dark text-sm font-semibold mb-1 uppercase tracking-wider">Total Claims Value</h4>
                                <div className="text-4xl font-bold text-success-dark">{currency} {insuranceData.totalInsuranceRevenue.toFixed(2)}</div>
                                <p className="text-xs text-success-dark mt-2 opacfity-80">Pending claim authorization value for the period</p>
                            </div>
                        </div>
                        <div className="lg:col-span-2 glass-panel p-6">
                             <h3 className="text-lg font-bold mb-6">Insurance Payer Breakdown</h3>
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
