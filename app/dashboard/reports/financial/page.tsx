"use client";

import { useState, useEffect } from "react";
import { DollarSign, ArrowDownCircle, ArrowUpCircle, TrendingUp, TrendingDown } from "lucide-react";
import styles from "./page.module.css";
import { DonutChart, SimpleBarChart, StackedBarChart, formatUGX, formatUGXFull } from "../../finance/FinanceCharts";

export default function FinancialReportsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/reports/financial").then(res => res.json()).then(d => setData(d.data ?? d)).finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ padding: "2rem" }}>Calculating financial data...</div>;
    if (!data) return <div style={{ padding: "2rem" }}>No data available.</div>;

    const { summary = {}, trends = {}, breakdowns = {}, cashFlow = {}, keyPerformanceIndicators = {} } = data;

    // Build payment-method donut data
    const paymentMethodData = (breakdowns.paymentsByMethod ?? []).map((m: any) => ({
        name: m.method === 'CASH' ? 'Cash' : m.method === 'MOBILE_MONEY' ? 'Mobile Money' : m.method === 'BANK' ? 'Bank' : m.method === 'CARD' ? 'Card' : m.method === 'INSURANCE' ? 'Insurance' : m.method || 'Other',
        value: Number(m.amount) || 0,
        count: m.count,
    }));

    // Build revenue-by-category bar data
    const revenueByCategory = (breakdowns.revenueByCategory ?? []).map((c: any) => ({
        name: c.category === 'CONSULTATION' ? 'Consultation' : c.category === 'PHARMACY' ? 'Pharmacy' : c.category === 'LAB' ? 'Lab' : c.category === 'RADIOLOGY' ? 'Radiology' : c.category === 'SERVICE' ? 'Service' : c.category === 'PRODUCT' ? 'Product' : c.category === 'FEE' ? 'Fee' : c.category,
        value: Number(c.amount) || 0,
    }));

    // Build expense-by-category data
    const expenseByCategory = (breakdowns.expensesByCategory ?? []).map((c: any) => ({
        name: c.category || 'Other',
        value: Number(c.amount) || 0,
    }));

    // Build monthly trend (revenue vs expenses) for stacked/line chart
    const monthlyTrend = mergeMonthlyTrends(trends.monthlyRevenue ?? [], trends.monthlyExpenses ?? []);

    // Build invoice status data
    const invoiceStatus = (breakdowns.invoicesByStatus ?? []).map((s: any) => ({
        name: s.status || 'Unknown',
        value: Number(s.amount) || 0,
        count: s.count,
    }));

    // Build aging data
    const agingData = (breakdowns.invoicesAging ?? []).map((b: any) => ({
        name: b.period,
        value: Number(b.amountDue) || 0,
    }));

    const isProfit = (summary.netIncome ?? 0) >= 0;
    const mom = keyPerformanceIndicators.revenueGrowthMom ?? 0;

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Financial Performance</h1>

            {/* Top KPI cards */}
            <div className={styles.topCards}>
                <div className={styles.card}>
                    <div className={styles.label}><ArrowUpCircle size={16} color="var(--success-color)" /> Total Revenue</div>
                    <div className={styles.value}>UGX {(summary.totalRevenue ?? 0).toLocaleString()}</div>
                    {mom !== 0 && (
                        <div style={{ fontSize: 11, color: mom >= 0 ? 'var(--success-color)' : 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            {mom >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {Math.abs(mom).toFixed(1)}% MoM
                        </div>
                    )}
                </div>
                <div className={styles.card}>
                    <div className={styles.label}><ArrowDownCircle size={16} color="var(--danger-color)" /> Total Expenses</div>
                    <div className={styles.value}>UGX {(summary.totalExpenses ?? 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {summary.expenseTransactionCount ?? 0} expense entries
                    </div>
                </div>
                <div className={styles.card}>
                    <div className={styles.label}><DollarSign size={16} color="var(--primary-color)" /> Net Profit</div>
                    <div className={styles.value} style={{ color: isProfit ? "var(--success-color)" : "var(--danger-color)" }}>
                        UGX {(summary.netIncome ?? 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Gross Margin: {(keyPerformanceIndicators.grossProfitMargin ?? 0).toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* Secondary KPI row */}
            <div className={styles.topCards} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className={styles.card}>
                    <div className={styles.label}>📊 Outstanding Receivables</div>
                    <div className={styles.value} style={{ fontSize: '1.1rem' }}>UGX {(summary.totalOutstanding ?? 0).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {summary.outstandingInvoiceCount ?? 0} unpaid invoices · avg UGX {Math.round(summary.averageOutstanding ?? 0).toLocaleString()}
                    </div>
                </div>
                <div className={styles.card}>
                    <div className={styles.label}>💰 Cash Inflow (30d)</div>
                    <div className={styles.value} style={{ fontSize: '1.1rem', color: 'var(--success-color)' }}>UGX {(cashFlow.inflow30d ?? 0).toLocaleString()}</div>
                </div>
                <div className={styles.card}>
                    <div className={styles.label}>💸 Cash Outflow (30d)</div>
                    <div className={styles.value} style={{ fontSize: '1.1rem', color: 'var(--danger-color)' }}>UGX {(cashFlow.outflow30d ?? 0).toLocaleString()}</div>
                </div>
                <div className={styles.card}>
                    <div className={styles.label}>📈 Net Cash Flow (30d)</div>
                    <div className={styles.value} style={{ fontSize: '1.1rem', color: (cashFlow.netFlow30d ?? 0) >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                        UGX {(cashFlow.netFlow30d ?? 0).toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Main chart grid */}
            <div className={styles.reportLayout} style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>📊 Revenue by Service</h3>
                    {revenueByCategory.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No invoice items yet.</p>
                    ) : (
                        <SimpleBarChart data={revenueByCategory} color="#6366f1" height={260} />
                    )}
                </div>

                <div className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>💳 Payment Methods</h3>
                    {paymentMethodData.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No payments yet.</p>
                    ) : (
                        <DonutChart data={paymentMethodData} height={260} innerRadius={55} outerRadius={95} />
                    )}
                </div>
            </div>

            <div className={styles.reportLayout} style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>📉 Expenses by Category</h3>
                    {expenseByCategory.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No expenses recorded.</p>
                    ) : (
                        <DonutChart data={expenseByCategory} height={260} innerRadius={55} outerRadius={95} />
                    )}
                </div>

                <div className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>⏳ Outstanding by Age</h3>
                    {agingData.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No outstanding invoices. ✅</p>
                    ) : (
                        <SimpleBarChart data={agingData} color="#f59e0b" height={260} />
                    )}
                </div>
            </div>

            <div className={styles.chartCard} style={{ width: '100%' }}>
                <h3 className={styles.chartTitle}>📈 Monthly Revenue vs Expenses</h3>
                {monthlyTrend.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Not enough data for a 12-month trend.</p>
                ) : (
                    <StackedBarChart
                        data={monthlyTrend}
                        series={[
                            { key: 'revenue', name: 'Revenue', color: '#10b981' },
                            { key: 'expenses', name: 'Expenses', color: '#ef4444' },
                        ]}
                        xKey="label"
                        height={300}
                    />
                )}
            </div>

            <div className={styles.chartCard} style={{ width: '100%' }}>
                <h3 className={styles.chartTitle}>🧾 Invoice Status Breakdown</h3>
                {invoiceStatus.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No invoices yet.</p>
                ) : (
                    <DonutChart data={invoiceStatus} height={260} innerRadius={50} outerRadius={90} />
                )}
            </div>
        </div>
    );
}

// Merge revenue + expenses into one series aligned by month label
function mergeMonthlyTrends(rev: any[], exp: any[]): any[] {
    const map = new Map<string, { label: string; revenue: number; expenses: number; revenueCount: number; expenseCount: number }>();
    for (const r of rev) {
        const label = formatMonthLabel(r.month);
        const entry = map.get(label) ?? { label, revenue: 0, expenses: 0, revenueCount: 0, expenseCount: 0 };
        entry.revenue += Number(r.revenue) || 0;
        entry.revenueCount += Number(r.transactionCount) || 0;
        map.set(label, entry);
    }
    for (const e of exp) {
        const label = formatMonthLabel(e.month);
        const entry = map.get(label) ?? { label, revenue: 0, expenses: 0, revenueCount: 0, expenseCount: 0 };
        entry.expenses += Number(e.expenses) || 0;
        entry.expenseCount += Number(e.transactionCount) || 0;
        map.set(label, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function formatMonthLabel(month: string): string {
    if (!month) return '';
    // month is "YYYY-MM" — return "MMM YY"
    const [y, m] = month.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(m, 10) - 1] ?? m} ${y.slice(2)}`;
}
