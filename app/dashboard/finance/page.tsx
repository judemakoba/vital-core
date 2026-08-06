'use client';

import { useState, useEffect } from 'react';
import styles from './finance.module.css';
import ChartOfAccountsTab from './ChartOfAccountsTab';
import JournalEntriesTab from './JournalEntriesTab';
import TaxInvoicesTab from './TaxInvoicesTab';
import ExpensesTab from './ExpensesTab';
import ReportsTab from './ReportsTab';
import AgingPanel from './AgingPanel';
import OverviewCharts from './OverviewTabCharts';

interface TaxInvoiceStat {
    paymentStatus: string;
    _count: number;
    _sum: { totalAmount: number | null; amountPaid: number | null; balanceDue: number | null };
}

interface FinanceSummary {
    summary: { totalRevenue: number; taxInvoiceStats: TaxInvoiceStat[] };
    accounts: any[];
    recentJournals: any[];
}

const TABS = ['Overview', 'Chart of Accounts', 'Journal Entries', 'Tax Invoices', 'Expenses', 'Reports'];

export default function FinancePage() {
    const [activeTab, setActiveTab] = useState('Overview');
    const [data, setData] = useState<FinanceSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warn' } | null>(null);

    // Signals to tell child tabs to open their "new" modal.
    // Incrementing the counter triggers an effect in the receiving tab.
    const [newJournalSignal, setNewJournalSignal] = useState(0);
    const [newInvoiceSignal, setNewInvoiceSignal] = useState(0);
    const [newExpenseSignal, setNewExpenseSignal] = useState(0);
    // Track the desired initial report (income-statement | trial-balance)
    const [initialReportType, setInitialReportType] = useState<'income-statement' | 'trial-balance'>('income-statement');

    useEffect(() => {
        fetch('/api/finance/summary', { credentials: "include" })
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    // Auto-dismiss toast
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    const getStatByStatus = (status: string) => {
        const stat = data?.summary.taxInvoiceStats.find(s => s.paymentStatus === status);
        return { count: stat?._count ?? 0 };
    };

    // Use canonical totals directly (no double-counting across statuses)
    const totalInvoiced = data?.summary.totalInvoiced ?? 0;
    const totalCollected = data?.summary.totalCollected ?? 0;
    const totalOutstanding = data?.summary.totalOutstanding ?? 0;
    const paid = getStatByStatus('PAID');
    const pending = getStatByStatus('PENDING');
    const partial = getStatByStatus('PARTIAL');
    const reconciliation = data?.summary.reconciliation;

    const formatUGX = (n: number) => `UGX ${n.toLocaleString('en-UG', { minimumFractionDigits: 0 })}`;

    // Quick Action handlers
    const qa = {
        newJournal: () => { setActiveTab('Journal Entries'); setNewJournalSignal(s => s + 1); },
        newInvoice: () => { setActiveTab('Tax Invoices'); setNewInvoiceSignal(s => s + 1); },
        newExpense: () => { setActiveTab('Expenses'); setNewExpenseSignal(s => s + 1); },
        trialBalance: () => { setActiveTab('Reports'); setInitialReportType('trial-balance'); },
        closePeriod: () => { setToast({ message: 'Period close is on the roadmap — AccountingService will need a closePeriod() helper first.', type: 'warn' }); },
        vatReturn: () => { setToast({ message: 'VAT Return generation is on the roadmap. It will pull from the TaxInvoice table filtered by tax date range.', type: 'warn' }); },
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Finance Management</h1>
                    <p className={styles.subtitle}>Double-entry accounting · URA compliant · Real-time reporting</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btnSecondary} onClick={() => setActiveTab('Reports')}>📊 Reports</button>
                    <button className={styles.btnPrimary} onClick={qa.newJournal}>+ New Journal Entry</button>
                </div>
            </div>

            {toast && (
                <div
                    style={{
                        position: 'fixed', top: 20, right: 20, zIndex: 9999,
                        padding: '12px 18px', borderRadius: 8, maxWidth: 420,
                        background: toast.type === 'warn' ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)',
                        border: `1px solid ${toast.type === 'warn' ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.4)'}`,
                        color: toast.type === 'warn' ? '#fbbf24' : '#a5b4fc',
                        fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    }}
                >
                    {toast.type === 'warn' ? '⏳ ' : 'ℹ️ '}{toast.message}
                </div>
            )}

            {loading ? (
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <p>Loading financial data…</p>
                </div>
            ) : (
                <>
                    {/* Reconciliation badge */}
                    {reconciliation && (reconciliation.totalInvoiced.match && reconciliation.totalOutstanding.match) ? (
                        <div style={{
                            padding: '8px 14px', borderRadius: 6, marginBottom: 12,
                            background: 'rgba(16, 185, 129, 0.08)', color: '#059669',
                            border: '1px solid rgba(16, 185, 129, 0.2)', fontSize: 13,
                        }}>
                            ✅ Ledger reconciled — journal entries match invoice &amp; payment records
                        </div>
                    ) : (
                        <div style={{
                            padding: '8px 14px', borderRadius: 6, marginBottom: 12,
                            background: 'rgba(245, 158, 11, 0.08)', color: '#d97706',
                            border: '1px solid rgba(245, 158, 11, 0.2)', fontSize: 13,
                        }}>
                            ⚠️ Ledger drift detected — journals and tables disagree. Run <code>node scratch/cleanup-dup-journals.mjs</code> to dedupe legacy payment journals.
                            {reconciliation?.totalInvoiced && !reconciliation.totalInvoiced.match && (
                                <div style={{ marginTop: 4, fontSize: 12 }}>
                                    Invoiced: tables show {formatUGX(reconciliation.totalInvoiced.table)}, journals show {formatUGX(reconciliation.totalInvoiced.journals)}
                                </div>
                            )}
                            {reconciliation?.totalOutstanding && !reconciliation.totalOutstanding.match && (
                                <div style={{ marginTop: 4, fontSize: 12 }}>
                                    Outstanding: tables show {formatUGX(reconciliation.totalOutstanding.table)}, journals show {formatUGX(reconciliation.totalOutstanding.journals)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* KPI Cards */}
                    <div className={styles.kpiGrid}>
                        <div className={`${styles.kpiCard} ${styles.kpiRevenue}`}>
                            <div className={styles.kpiIcon}>📈</div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Total Invoiced</span>
                                <span className={styles.kpiValue}>{formatUGX(totalInvoiced)}</span>
                                <span className={styles.kpiSub}>{paid.count + pending.count + partial.count} invoices total</span>
                            </div>
                        </div>
                        <div className={`${styles.kpiCard} ${styles.kpiCash}`}>
                            <div className={styles.kpiIcon}>💰</div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Amount Collected</span>
                                <span className={styles.kpiValue}>{formatUGX(totalCollected)}</span>
                                <span className={styles.kpiSub}>{paid.count} fully paid</span>
                            </div>
                        </div>
                        <div className={`${styles.kpiCard} ${styles.kpiPending}`}>
                            <div className={styles.kpiIcon}>⏳</div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Outstanding Balance</span>
                                <span className={styles.kpiValue}>{formatUGX(totalOutstanding)}</span>
                                <span className={styles.kpiSub}>{pending.count} pending · {partial.count} partial</span>
                            </div>
                        </div>
                        <div className={`${styles.kpiCard} ${styles.kpiAccounts}`}>
                            <div className={styles.kpiIcon}>📚</div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Chart of Accounts</span>
                                <span className={styles.kpiValue}>{data?.accounts.length ?? 0}</span>
                                <span className={styles.kpiSub}>Active accounts</span>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className={styles.tabs}>
                        {TABS.map(tab => (
                            <button
                                key={tab}
                                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
                                onClick={() => setActiveTab(tab)}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className={styles.tabContent}>
                        {activeTab === 'Overview' && (
                            <OverviewTab
                                recentJournals={data?.recentJournals ?? []}
                                formatUGX={formatUGX}
                                actions={qa}
                            />
                        )}
                        {activeTab === 'Chart of Accounts' && <ChartOfAccountsTab />}
                        {activeTab === 'Journal Entries' && <JournalEntriesTab openNewModalSignal={newJournalSignal} />}
                        {activeTab === 'Tax Invoices' && <TaxInvoicesTab openNewModalSignal={newInvoiceSignal} />}
                        {activeTab === 'Expenses' && <ExpensesTab openNewModalSignal={newExpenseSignal} />}
                        {activeTab === 'Reports' && <ReportsTab initialReportType={initialReportType} />}
                    </div>
                </>
            )}
        </div>
    );
}

function OverviewTab({
    recentJournals,
    formatUGX,
    actions,
}: {
    recentJournals: any[];
    formatUGX: (n: number) => string;
    actions: {
        newJournal: () => void;
        newInvoice: () => void;
        newExpense: () => void;
        trialBalance: () => void;
        closePeriod: () => void;
        vatReturn: () => void;
    };
}) {
    const buttons: Array<{ icon: string; label: string; desc: string; onClick: () => void; soon?: boolean }> = [
        { icon: '📝', label: 'New Journal Entry', desc: 'Post a manual accounting entry', onClick: actions.newJournal },
        { icon: '🧾', label: 'Issue Tax Invoice', desc: 'Generate URA-compliant invoice', onClick: actions.newInvoice },
        { icon: '💸', label: 'Record Expense', desc: 'Log an operating expense', onClick: actions.newExpense },
        { icon: '📊', label: 'Trial Balance', desc: 'Verify ledger integrity', onClick: actions.trialBalance },
        { icon: '📅', label: 'Close Period', desc: 'Lock accounting period', onClick: actions.closePeriod, soon: true },
        { icon: '🗂️', label: 'VAT Return', desc: 'Generate monthly VAT summary', onClick: actions.vatReturn, soon: true },
    ];

    return (
        <div className={styles.overviewGrid}>
            {/* Headline KPIs + extra charts (revenue by service, top accounts, profit bridge) */}
            <div style={{ gridColumn: '1 / -1' }}>
                <OverviewCharts />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
                <AgingPanel />
            </div>
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <h3>Recent Journal Entries</h3>
                    <span className={styles.badge}>{recentJournals.length}</span>
                </div>
                {recentJournals.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>No journal entries yet. Start by recording a transaction.</p>
                    </div>
                ) : (
                    <div className={styles.journalList}>
                        {recentJournals.map((j: any) => (
                            <div key={j.id} className={styles.journalItem}>
                                <div className={styles.journalMeta}>
                                    <span className={styles.journalNumber}>{j.entryNumber}</span>
                                    <span className={`${styles.statusPill} ${styles[`status${j.status}`]}`}>{j.status}</span>
                                </div>
                                <p className={styles.journalDesc}>{j.description}</p>
                                <div className={styles.journalAmounts}>
                                    <span>Dr {formatUGX(j.totalDebit)}</span>
                                    <span>Cr {formatUGX(j.totalCredit)}</span>
                                    <span className={styles.journalDate}>{new Date(j.entryDate).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <h3>Quick Actions</h3>
                    <span style={{ fontSize: 11, color: '#64748b' }}>click to jump</span>
                </div>
                <div className={styles.quickActions}>
                    {buttons.map(action => (
                        <button
                            key={action.label}
                            type="button"
                            className={styles.quickAction}
                            onClick={action.onClick}
                            title={action.soon ? 'On the roadmap' : action.label}
                        >
                            <span className={styles.qaIcon}>{action.icon}</span>
                            <div style={{ flex: 1 }}>
                                <strong>
                                    {action.label}
                                    {action.soon && <span style={{ marginLeft: 6, fontSize: 10, color: '#fbbf24', fontWeight: 400 }}>soon</span>}
                                </strong>
                                <p>{action.desc}</p>
                            </div>
                            <span style={{ color: '#64748b', fontSize: 14 }}>→</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
