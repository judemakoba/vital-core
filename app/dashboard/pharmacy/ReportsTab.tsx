'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    Calendar, Download, Printer, TrendingUp, TrendingDown, Package,
    DollarSign, Wallet, Activity, Pill, BarChart3, FileText,
    AlertCircle, RefreshCw, ChevronRight
} from 'lucide-react';
import styles from './pharmacy.module.css';

type Period = 'day' | 'week' | 'month' | 'quarter' | 'halfyear' | 'year' | 'custom';

const PERIODS: { value: Period; label: string; short: string }[] = [
    { value: 'day',       label: 'Daily',       short: 'Day' },
    { value: 'week',      label: 'Weekly',      short: 'Week' },
    { value: 'month',     label: 'Monthly',     short: 'Month' },
    { value: 'quarter',   label: 'Quarterly',   short: 'Quarter' },
    { value: 'halfyear',  label: 'Half-Yearly', short: 'Half-Year' },
    { value: 'year',      label: 'Annual',      short: 'Year' },
    { value: 'custom',    label: 'Custom Range', short: 'Custom' },
];

const fmtUGX = (n: number | null | undefined) => {
    if (n == null || isNaN(n)) return 'UGX 0';
    return `UGX ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};
const fmtNum = (n: number | null | undefined) => {
    if (n == null || isNaN(n)) return '0';
    return n.toLocaleString();
};

interface ReportData {
    period: { type: string; start: string; end: string; label: string; shortLabel: string };
    dispense: {
        summary: {
            totalQuantity: number;
            totalRevenue: number;
            patientRevenue: number;
            uniqueDrugs: number;
            dispenseCount: number;
        };
        topDrugs: Array<{
            drugId: string;
            drugCode: string;
            drugName: string;
            strength: string;
            dosageForm: string;
            quantity: number;
            revenue: number;
            patientPay: number;
            count: number;
        }>;
    };
    stockAtEnd: {
        batchCount: number;
        totalUnits: number;
        totalValue: number;
        drugCount: number;
        byForm: Array<{ form: string; units: number; value: number }>;
    };
    incomes: { dispensing: { total: number; patientPay: number } };
    totalIncome: number;
    expenses: {
        purchase: { total: number; units: number; batches: number };
        adjustments: { total: number; count: number };
    };
    totalExpenses: number;
    netProfit: number;
}

export default function ReportsTab() {
    const [period, setPeriod] = useState<Period>('day');
    const [anchorDate, setAnchorDate] = useState<string>(new Date().toISOString().slice(0, 10));
    const [customStart, setCustomStart] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 29); // last 30 days
        return d.toISOString().slice(0, 10);
    });
    const [customEnd, setCustomEnd] = useState<string>(new Date().toISOString().slice(0, 10));
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const fetchReport = async () => {
        setLoading(true);
        setErrorMsg('');
        try {
            const params = new URLSearchParams({ period });
            if (period === 'custom') {
                if (!customStart || !customEnd) {
                    setErrorMsg('Please select both a start and end date for the custom range');
                    setLoading(false);
                    return;
                }
                if (new Date(customStart) > new Date(customEnd)) {
                    setErrorMsg('Start date must be on or before end date');
                    setLoading(false);
                    return;
                }
                params.set('startDate', customStart);
                params.set('endDate', customEnd);
            } else {
                params.set('date', anchorDate);
            }
            const res = await fetch(`/api/pharmacy/reports?${params.toString()}`, {
                credentials: 'include'
            });
            if (res.ok) {
                const j = await res.json();
                setData(j);
            } else if (res.status === 401) {
                setErrorMsg('Unauthorized — your role does not have access to pharmacy reports');
            } else {
                const body = await res.json().catch(() => ({}));
                setErrorMsg(body.error || `Failed to compile report (HTTP ${res.status})`);
            }
        } catch (e) {
            setErrorMsg('Network error while compiling report');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (period === 'custom') return; // custom range needs explicit refresh
        fetchReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, anchorDate]);

    // For custom range, refetch when custom dates change
    useEffect(() => {
        if (period !== 'custom') return;
        // Only auto-refetch if both dates are valid
        if (customStart && customEnd && new Date(customStart) <= new Date(customEnd)) {
            fetchReport();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customStart, customEnd, period]);

    const handleRefresh = () => {
        fetchReport();
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExportCSV = () => {
        if (!data) return;
        const rows: string[] = [];
        rows.push(`Pharmacy Report — ${data.period.label}`);
        rows.push(`Period: ${new Date(data.period.start).toLocaleDateString()} – ${new Date(data.period.end).toLocaleDateString()}`);
        rows.push('');
        rows.push('=== Dispensed Drugs (Top 25) ===');
        rows.push('Drug Code,Name,Strength,Form,Quantity Dispensed,Revenue (UGX),Dispense Events');
        for (const d of data.dispense.topDrugs) {
            rows.push(`${d.drugCode},"${d.drugName}",${d.strength},${d.dosageForm},${d.quantity},${d.revenue},${d.count}`);
        }
        rows.push('');
        rows.push('=== Stock Snapshot at End of Period ===');
        rows.push(`Total Units,${data.stockAtEnd.totalUnits}`);
        rows.push(`Total Value,${data.stockAtEnd.totalValue.toFixed(0)}`);
        rows.push(`Drugs in Stock,${data.stockAtEnd.drugCount}`);
        rows.push('');
        rows.push('Form,Units,Value (UGX)');
        for (const f of data.stockAtEnd.byForm) {
            rows.push(`${f.form},${f.units},${f.value.toFixed(0)}`);
        }
        rows.push('');
        rows.push('=== Income ===');
        rows.push(`Dispensing Revenue,${data.incomes.dispensing.total.toFixed(0)}`);
        rows.push(`Patient Pay,${data.incomes.dispensing.patientPay.toFixed(0)}`);
        rows.push(`Total Income,${data.totalIncome.toFixed(0)}`);
        rows.push('');
        rows.push('=== Expenses ===');
        rows.push(`Purchases,${data.expenses.purchase.total.toFixed(0)}`);
        rows.push(`Adjustments/Write-offs,${data.expenses.adjustments.total.toFixed(0)}`);
        rows.push(`Total Expenses,${data.totalExpenses.toFixed(0)}`);
        rows.push('');
        rows.push(`=== Net Profit,${data.netProfit.toFixed(0)} ===`);

        const csv = rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pharmacy-${data.period.type}-${data.period.shortLabel.replace(/[^a-zA-Z0-9-]/g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className={styles.tabContent}>
            {/* Period controls */}
            <div className={styles.tabActions} style={{ alignItems: 'flex-end' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Pharmacy Reports</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                        Daily dispensed drugs · End-of-period stock snapshot · Income & expense statements
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>Period</label>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {PERIODS.map(p => (
                                <button
                                    key={p.value}
                                    onClick={() => setPeriod(p.value)}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: period === p.value ? '#0ea5e9' : '#f1f5f9',
                                        color: period === p.value ? 'white' : '#475569',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {p.short}
                                </button>
                            ))}
                        </div>
                    </div>
                    {period !== 'custom' ? (
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>Anchor Date</label>
                            <input
                                type="date"
                                value={anchorDate}
                                onChange={(e) => setAnchorDate(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #d1d5db',
                                    fontSize: '13px',
                                    background: 'white',
                                    cursor: 'pointer'
                                }}
                            />
                        </div>
                    ) : (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>From</label>
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                    max={customEnd}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #0ea5e9',
                                        fontSize: '13px',
                                        background: '#f0f9ff',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        color: '#0369a1'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>To</label>
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    min={customStart}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #0ea5e9',
                                        fontSize: '13px',
                                        background: '#f0f9ff',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        color: '#0369a1'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>Quick range</label>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {[
                                        { label: '7d',  days: 6  },
                                        { label: '30d', days: 29 },
                                        { label: '90d', days: 89 },
                                        { label: '6m',  days: 182 },
                                        { label: '1y',  days: 364 },
                                    ].map(p => (
                                        <button
                                            key={p.label}
                                            onClick={() => {
                                                const end = new Date();
                                                const start = new Date();
                                                start.setDate(end.getDate() - p.days);
                                                setCustomEnd(end.toISOString().slice(0, 10));
                                                setCustomStart(start.toISOString().slice(0, 10));
                                            }}
                                            style={{
                                                padding: '8px 10px',
                                                borderRadius: '6px',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                background: 'white',
                                                color: '#475569'
                                            }}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                    <button onClick={handleRefresh} disabled={loading} className={styles.btnSecondary} style={{ marginLeft: '8px' }}>
                        <RefreshCw size={14} style={{ marginRight: '6px' }} className={loading ? styles.spin : ''} />
                        Refresh
                    </button>
                    {data && (
                        <>
                            <button onClick={handleExportCSV} className={styles.btnSecondary}>
                                <Download size={14} style={{ marginRight: '6px' }} />
                                CSV
                            </button>
                            <button onClick={handlePrint} className={styles.btnSecondary}>
                                <Printer size={14} style={{ marginRight: '6px' }} />
                                Print
                            </button>
                        </>
                    )}
                </div>
            </div>

            {errorMsg && <div className={styles.errorBanner} style={{ marginBottom: '14px' }}><AlertCircle size={16} />{errorMsg}</div>}

            {loading && !data ? (
                <div className={styles.loading}><div className={styles.spinner} /><p>Compiling report…</p></div>
            ) : !data ? null : (
                <>
                    {/* Period header */}
                    <div style={{
                        padding: '16px 22px',
                        background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                        borderRadius: '12px',
                        color: 'white',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Reporting Period
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px' }}>{data.period.label}</div>
                            <div style={{ fontSize: '12.5px', opacity: 0.85, marginTop: '2px' }}>
                                {new Date(data.period.start).toLocaleDateString()} → {new Date(data.period.end).toLocaleDateString()}
                            </div>
                        </div>
                        <FileText size={42} style={{ opacity: 0.3 }} />
                    </div>

                    {/* KPI summary row */}
                    <div className={styles.kpiGrid} style={{ marginBottom: '18px' }}>
                        <div className={`${styles.kpiCard} ${styles.kpiDispensed}`}>
                            <div className={styles.kpiIcon}><Pill /></div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Units Dispensed</span>
                                <span className={styles.kpiValue}>{fmtNum(data.dispense.summary.totalQuantity)}</span>
                                <span className={styles.kpiSub}>{data.dispense.summary.uniqueDrugs} drugs · {data.dispense.summary.dispenseCount} events</span>
                            </div>
                        </div>
                        <div className={`${styles.kpiCard} ${styles.kpiInventory}`}>
                            <div className={styles.kpiIcon}><Wallet /></div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Total Income</span>
                                <span className={styles.kpiValue} style={{ fontSize: '18px' }}>{fmtUGX(data.totalIncome)}</span>
                                <span className={styles.kpiSub}>Dispensing revenue (all from patients)</span>
                            </div>
                        </div>
                        <div className={`${styles.kpiCard} ${styles.kpiAlerts}`}>
                            <div className={styles.kpiIcon}><TrendingDown /></div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Total Expenses</span>
                                <span className={styles.kpiValue} style={{ fontSize: '18px' }}>{fmtUGX(data.totalExpenses)}</span>
                                <span className={styles.kpiSub}>Purchases + adjustments</span>
                            </div>
                        </div>
                        <div className={styles.kpiCard} style={{
                            background: data.netProfit >= 0 ? '#f0fdf4' : '#fef2f2',
                            borderColor: data.netProfit >= 0 ? '#86efac' : '#fca5a5'
                        }}>
                            <div className={styles.kpiIcon} style={{
                                background: data.netProfit >= 0 ? '#dcfce7' : '#fee2e2',
                                color: data.netProfit >= 0 ? '#16a34a' : '#dc2626'
                            }}>
                                {data.netProfit >= 0 ? <TrendingUp /> : <TrendingDown />}
                            </div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Net Profit</span>
                                <span className={styles.kpiValue} style={{
                                    fontSize: '18px',
                                    color: data.netProfit >= 0 ? '#15803d' : '#dc2626'
                                }}>{fmtUGX(data.netProfit)}</span>
                                <span className={styles.kpiSub}>Income − expenses</span>
                            </div>
                        </div>
                    </div>

                    {/* Two-column section: Dispensed drugs + Stock snapshot */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        {/* Dispensed drugs */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h3>📋 Daily Dispensed Drugs</h3>
                                <span className={styles.badge}>{data.dispense.summary.uniqueDrugs}</span>
                            </div>
                            {data.dispense.topDrugs.length === 0 ? (
                                <div className={styles.emptyState}>No drugs dispensed in this period.</div>
                            ) : (
                                <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
                                            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                                <th style={{ ...thCell, textAlign: 'left' }}>Drug</th>
                                                <th style={{ ...thCell, textAlign: 'right' }}>Qty</th>
                                                <th style={{ ...thCell, textAlign: 'right' }}>Revenue</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.dispense.topDrugs.map(d => (
                                                <tr key={d.drugId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                    <td style={{ ...tdCell, fontWeight: 600 }}>
                                                        {d.drugName}
                                                        <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 400 }}>
                                                            {d.drugCode} · {d.strength} {d.dosageForm}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: '#0369a1' }}>{fmtNum(d.quantity)}</td>
                                                    <td style={{ ...tdCell, textAlign: 'right', fontWeight: 600, color: '#15803d' }}>{fmtUGX(d.revenue)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Stock snapshot */}
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h3>📦 Available Stock at End of Period</h3>
                                <span className={styles.badge}>{fmtNum(data.stockAtEnd.totalUnits)} units</span>
                            </div>
                            <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                                <div>
                                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Total Value</div>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0c4a6e', marginTop: '2px' }}>{fmtUGX(data.stockAtEnd.totalValue)}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>Drugs in Stock</div>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0c4a6e', marginTop: '2px' }}>{fmtNum(data.stockAtEnd.drugCount)}</div>
                                </div>
                            </div>
                            <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                {data.stockAtEnd.byForm.length === 0 ? (
                                    <div className={styles.emptyState}>No stock on hand at end of period.</div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
                                            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                                <th style={thCell}>Dosage Form</th>
                                                <th style={{ ...thCell, textAlign: 'right' }}>Units</th>
                                                <th style={{ ...thCell, textAlign: 'right' }}>Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.stockAtEnd.byForm.map(f => (
                                                <tr key={f.form} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                    <td style={{ ...tdCell, fontWeight: 600 }}>{f.form}</td>
                                                    <td style={{ ...tdCell, textAlign: 'right' }}>{fmtNum(f.units)}</td>
                                                    <td style={{ ...tdCell, textAlign: 'right', color: '#475569' }}>{fmtUGX(f.value)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Income + Expense statement (full width) */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h3>💰 Income & Expense Statement</h3>
                            <span className={styles.badge} style={{
                                background: data.netProfit >= 0 ? '#dcfce7' : '#fee2e2',
                                color: data.netProfit >= 0 ? '#15803d' : '#991b1b'
                            }}>
                                Net: {fmtUGX(data.netProfit)}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#e5e7eb' }}>
                            {/* Income column */}
                            <div style={{ background: 'white', padding: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                    <TrendingUp size={18} color="#16a34a" />
                                    <h4 style={{ margin: 0, fontSize: '14px', color: '#15803d' }}>Income</h4>
                                </div>
                                <IncomeRow label="Dispensing revenue" value={data.incomes.dispensing.patientPay} />
                                <div style={{
                                    marginTop: '10px', paddingTop: '10px',
                                    borderTop: '2px solid #16a34a',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <span style={{ fontWeight: 700, color: '#15803d' }}>Total Income</span>
                                    <span style={{ fontWeight: 800, color: '#15803d', fontSize: '15px' }}>{fmtUGX(data.totalIncome)}</span>
                                </div>
                            </div>
                            {/* Expense column */}
                            <div style={{ background: 'white', padding: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                    <TrendingDown size={18} color="#dc2626" />
                                    <h4 style={{ margin: 0, fontSize: '14px', color: '#991b1b' }}>Expenses</h4>
                                </div>
                                <IncomeRow label={`Stock purchases (${data.expenses.purchase.batches} batches)`} value={data.expenses.purchase.total} />
                                <IncomeRow label={`Adjustments / write-offs (${data.expenses.adjustments.count} events)`} value={data.expenses.adjustments.total} />
                                <div style={{
                                    marginTop: '10px', paddingTop: '10px',
                                    borderTop: '2px solid #dc2626',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <span style={{ fontWeight: 700, color: '#991b1b' }}>Total Expenses</span>
                                    <span style={{ fontWeight: 800, color: '#991b1b', fontSize: '15px' }}>{fmtUGX(data.totalExpenses)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function IncomeRow({ label, value }: { label: string; value: number }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <span style={{ fontSize: '13px', color: '#475569' }}>{label}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{fmtUGX(value)}</span>
        </div>
    );
}

const thCell: React.CSSProperties = {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
};
const tdCell: React.CSSProperties = {
    padding: '10px 12px',
    color: '#1e293b',
    verticalAlign: 'top'
};
