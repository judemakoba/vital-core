'use client';

import { useState, useEffect } from 'react';
import styles from './finance.module.css';
import { DonutChart, SimpleBarChart, formatUGX } from './FinanceCharts';

interface IncomeStatement {
    period: { from: string; to: string };
    revenue: { accounts: any[]; total: number };
    expenses: { grouped: Record<string, any[]>; accounts: any[]; total: number };
    invoiceRevenue: any[];
    netIncome: number;
    isProfit: boolean;
}

interface TrialBalance {
    asOf: string;
    rows: any[];
    totals: { totalDebits: number; totalCredits: number; isBalanced: boolean };
}

type ReportType = 'income-statement' | 'trial-balance';

const CATEGORY_LABELS: Record<string, string> = {
    OPERATING_EXPENSE: 'Operating Expenses',
    ADMIN_EXPENSE: 'Administrative & General Expenses',
    OTHER_EXPENSE: 'Other Expenses',
    OPERATING_REVENUE: 'Operating Revenue',
    OTHER_REVENUE: 'Other Revenue',
};

export default function ReportsTab({ initialReportType }: { initialReportType?: ReportType } = {}) {
    const [reportType, setReportType] = useState<ReportType>(initialReportType ?? 'income-statement');
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setMonth(0); d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [toDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [incomeData, setIncomeData] = useState<IncomeStatement | null>(null);
    const [trialData, setTrialData] = useState<TrialBalance | null>(null);
    const [loading, setLoading] = useState(false);

    const fmt = (n: number) => `UGX ${Math.abs(n).toLocaleString('en-UG', { minimumFractionDigits: 0 })}`;

    const loadReport = () => {
        setLoading(true);
        if (reportType === 'income-statement') {
            fetch(`/api/finance/reports/income-statement?from=${fromDate}&to=${toDate}`)
                .then(r => r.json()).then(d => { setIncomeData(d); setLoading(false); })
                .catch(() => setLoading(false));
        } else {
            fetch(`/api/finance/reports/trial-balance?asOf=${toDate}`)
                .then(r => r.json()).then(d => { setTrialData(d); setLoading(false); })
                .catch(() => setLoading(false));
        }
    };

    useEffect(() => { loadReport(); }, [reportType]);

    return (
        <div>
            <div className={styles.toolbarRow}>
                <div className={styles.reportTypeTabs}>
                    {(['income-statement', 'trial-balance'] as ReportType[]).map(t => (
                        <button key={t} className={`${styles.reportTypeBtn} ${reportType === t ? styles.reportTypeBtnActive : ''}`}
                            onClick={() => setReportType(t)}>
                            {t === 'income-statement' ? '📊 Income Statement (P&L)' : '⚖️ Trial Balance'}
                        </button>
                    ))}
                </div>
                <div className={styles.dateRange}>
                    {reportType === 'income-statement' && (
                        <><label>From: <input type="date" className={styles.dateInput} value={fromDate} onChange={e => setFromDate(e.target.value)} /></label></>
                    )}
                    <label>To: <span className={styles.datePlain}>{new Date(toDate).toLocaleDateString()}</span></label>
                </div>
                <button className={styles.btnPrimary} onClick={loadReport}>🔄 Refresh</button>
                <button className={styles.btnSecondary}>📥 Export</button>
            </div>

            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} /></div>
            ) : reportType === 'income-statement' && incomeData ? (
                <IncomeStatementView data={incomeData} fmt={fmt} />
            ) : reportType === 'trial-balance' && trialData ? (
                <TrialBalanceView data={trialData} fmt={fmt} />
            ) : (
                <div className={styles.emptyState}><p>Click Refresh to load the report.</p></div>
            )}
        </div>
    );
}

function IncomeStatementView({ data, fmt }: { data: any; fmt: (n: number) => string }) {
    const margin = data.revenue.total > 0 ? ((data.netIncome / data.revenue.total) * 100).toFixed(1) : '0.0';
    const grossMargin = data.revenue.total > 0 ? ((data.grossProfit / data.revenue.total) * 100).toFixed(1) : '0.0';

    return (
        <div className={styles.reportContainer}>
            <div className={styles.reportHeader}>
                <h2>Income Statement (Profit & Loss)</h2>
                <p>Period: {new Date(data.period.from).toLocaleDateString()} — {new Date(data.period.to).toLocaleDateString()}</p>
            </div>

            {/* Visual breakdown of revenue + expenses */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8' }}>📊 Revenue Mix (by account)</h4>
                    <DonutChart
                        data={data.revenue.accounts.map((a: any) => ({ name: `${a.accountCode} ${a.accountName}`, value: a.balance }))}
                        height={220}
                        innerRadius={50}
                        outerRadius={85}
                        showLegend
                    />
                </div>
                <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8' }}>📉 Expense Breakdown (by account)</h4>
                    <SimpleBarChart
                        data={data.expenses.accounts
                            .filter((a: any) => a.balance > 0)
                            .sort((a: any, b: any) => b.balance - a.balance)
                            .slice(0, 8)
                            .map((a: any) => ({ name: `${a.accountCode}`, value: a.balance }))}
                        color="#ef4444"
                        height={220}
                    />
                </div>
            </div>

            {/* Revenue Section */}
            <div className={styles.reportSection}>
                <div className={styles.reportSectionHeader}>
                    <span className={styles.reportSectionTitle}>📈 REVENUE</span>
                    <span className={`${styles.reportTotal} ${styles.revenueColor}`}>{fmt(data.revenue.total)}</span>
                </div>
                {data.revenue.accounts.length === 0 ? (
                    <p className={styles.reportEmpty}>No revenue recorded from journal entries in this period.</p>
                ) : (
                    <table className={styles.reportTable}>
                        <tbody>
                            {data.revenue.accounts.map((acc: any) => (
                                <tr key={acc.id}>
                                    <td className={styles.reportAccCode}>{acc.accountCode}</td>
                                    <td>{acc.accountName}{acc.isControlAccount ? ' (control)' : ''}</td>
                                    <td className={`${styles.reportAmt} ${styles.revenueColor}`}>{fmt(acc.balance)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* COGS Section */}
            {data.cogs && data.cogs.total > 0 && (
                <div className={styles.reportSection}>
                    <div className={styles.reportSectionHeader}>
                        <span className={styles.reportSectionTitle}>📦 COST OF GOODS SOLD</span>
                        <span className={`${styles.reportTotal} ${styles.expenseColor}`}>{fmt(data.cogs.total)}</span>
                    </div>
                    <table className={styles.reportTable}>
                        <tbody>
                            {data.cogs.accounts.map((acc: any) => (
                                <tr key={acc.id}>
                                    <td className={styles.reportAccCode}>{acc.accountCode}</td>
                                    <td>{acc.accountName}</td>
                                    <td className={`${styles.reportAmt} ${styles.expenseColor}`}>{fmt(acc.balance)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Gross Profit */}
            {data.cogs && (
                <div className={styles.grossProfitBar}>
                    <span>💎 GROSS PROFIT</span>
                    <span className={styles.grossProfitValue}>{fmt(data.grossProfit)}</span>
                    <span className={styles.marginLabel}>Gross Margin: {grossMargin}%</span>
                </div>
            )}

            {/* Operating Expenses Section */}
            <div className={styles.reportSection}>
                <div className={styles.reportSectionHeader}>
                    <span className={styles.reportSectionTitle}>📉 OPERATING EXPENSES</span>
                    <span className={`${styles.reportTotal} ${styles.expenseColor}`}>{fmt(data.operatingExpenses?.total ?? data.expenses.total)}</span>
                </div>
                {Object.entries((data.operatingExpenses?.grouped ?? data.expenses.grouped) as Record<string, any[]>).map(([cat, accs]) => (
                    <div key={cat} className={styles.expenseGroup}>
                        <div className={styles.expenseGroupHeader}>{CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ')}</div>
                        <table className={styles.reportTable}>
                            <tbody>
                                {accs.map((acc: any) => (
                                    <tr key={acc.id}>
                                        <td className={styles.reportAccCode}>{acc.accountCode}</td>
                                        <td>{acc.accountName}</td>
                                        <td className={`${styles.reportAmt} ${styles.expenseColor}`}>{fmt(acc.balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
                {Object.keys((data.operatingExpenses?.grouped ?? data.expenses.grouped) as Record<string, any>).length === 0 && (
                    <p className={styles.reportEmpty}>No operating expenses recorded in this period.</p>
                )}
            </div>

            {/* Net Income */}
            <div className={`${styles.netIncomeBar} ${data.isProfit ? styles.profitBar : styles.lossBar}`}>
                <span>{data.isProfit ? '✅ NET PROFIT' : '⚠️ NET LOSS'}</span>
                <span className={styles.netIncomeValue}>{fmt(data.netIncome)}</span>
                <span className={styles.marginLabel}>Net Margin: {margin}%</span>
            </div>
        </div>
    );
}

function TrialBalanceView({ data, fmt }: { data: TrialBalance; fmt: (n: number) => string }) {
    const { rows, totals } = data;
    const byType: Record<string, typeof rows> = {};
    for (const r of rows) {
        if (!byType[r.accountType]) byType[r.accountType] = [];
        byType[r.accountType].push(r);
    }

    return (
        <div className={styles.reportContainer}>
            <div className={styles.reportHeader}>
                <h2>Trial Balance</h2>
                <p>As of {new Date(data.asOf).toLocaleDateString()}</p>
                <span className={`${styles.statusPill} ${totals.isBalanced ? styles.statusPOSTED : styles.statusREVERSED}`}>
                    {totals.isBalanced ? '✅ Balanced' : '⚠️ Unbalanced'}
                </span>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.reportTable} style={{ width: '100%' }}>
                    <thead>
                        <tr className={styles.trHeader}>
                            <th>Code</th>
                            <th>Account Name</th>
                            <th>Type</th>
                            <th className={styles.numCell}>Debit (UGX)</th>
                            <th className={styles.numCell}>Credit (UGX)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(byType).map(([type, accs]) => (
                            <>
                                <tr key={type} className={styles.reportGroupRow}>
                                    <td colSpan={5}>{type}</td>
                                </tr>
                                {accs.map((r: any) => (
                                    <tr key={r.id}>
                                        <td className={styles.reportAccCode}>{r.accountCode}</td>
                                        <td>{r.accountName}</td>
                                        <td><span className={styles.typeBadge}>{r.accountType}</span></td>
                                        <td className={`${styles.numCell} ${r.totalDebit > 0 ? styles.debitCol : ''}`}>
                                            {r.totalDebit > 0 ? fmt(r.totalDebit) : '—'}
                                        </td>
                                        <td className={`${styles.numCell} ${r.totalCredit > 0 ? styles.creditCol : ''}`}>
                                            {r.totalCredit > 0 ? fmt(r.totalCredit) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className={styles.tbTotals}>
                            <td colSpan={3}>TOTALS</td>
                            <td className={`${styles.numCell} ${styles.debitCol}`}>{fmt(totals.totalDebits)}</td>
                            <td className={`${styles.numCell} ${styles.creditCol}`}>{fmt(totals.totalCredits)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
