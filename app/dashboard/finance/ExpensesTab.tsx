'use client';

import { useState, useEffect } from 'react';
import styles from './finance.module.css';
import { DonutChart, SimpleBarChart } from './FinanceCharts';

interface Expense {
    id: string;
    category: string;
    description: string;
    amount: number;
    date: string;
    paymentMethod: string | null;
    receiptImage: string | null;
    recordedBy: { name: string | null };
    createdAt: string;
}

const CATEGORY_OPTIONS = [
    { value: 'UTILITIES', label: 'Utilities (water, electricity, internet)' },
    { value: 'RENT', label: 'Rent / Lease' },
    { value: 'SALARIES', label: 'Salaries & Wages' },
    { value: 'SUPPLIES', label: 'Office / Medical Supplies' },
    { value: 'MAINTENANCE', label: 'Equipment Maintenance' },
    { value: 'MARKETING', label: 'Marketing & Advertising' },
    { value: 'TRANSPORT', label: 'Transport & Fuel' },
    { value: 'INSURANCE', label: 'Insurance Premiums' },
    { value: 'PROFESSIONAL', label: 'Professional Fees' },
    { value: 'BANK_CHARGES', label: 'Bank Charges & Fees' },
    { value: 'TAX', label: 'Taxes & Statutory' },
    { value: 'OTHER', label: 'Other' },
];

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Card'];

export default function ExpensesTab({ openNewModalSignal }: { openNewModalSignal?: number } = {}) {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNewModal, setShowNewModal] = useState(false);

    // Filters
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (openNewModalSignal && openNewModalSignal > 0) setShowNewModal(true);
    }, [openNewModalSignal]);

    const load = () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
        if (categoryFilter) params.set('category', categoryFilter);
        if (search) params.set('search', search);
        fetch(`/api/finance/expenses?${params}`)
            .then(r => r.json())
            .then(d => { setExpenses(d.expenses ?? d ?? []); setLoading(false); })
            .catch(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const applyFilters = () => load();

    const clearFilters = () => { setFromDate(''); setToDate(''); setCategoryFilter(''); setSearch(''); setTimeout(load, 0); };

    const activeFilters = [fromDate, toDate, categoryFilter, search].filter(Boolean).length;

    const fmt = (n: number) => `UGX ${n.toLocaleString('en-UG')}`;
    const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

    // Build chart data
    const categoryTotals = aggregateByCategory(expenses);
    const topExpenses = topExpensesByAmount(expenses, 6);

    return (
        <div>
            <div className={styles.toolbarRow}>
                <span className={styles.totalBadge}>{expenses.length} expenses · Total {fmt(totalAmount)}</span>
                <button className={styles.btnPrimary} onClick={() => setShowNewModal(true)}>+ Record Expense</button>
            </div>

            <div className={styles.toolbarRow} style={{ marginTop: 8 }}>
                <input type="date" className={styles.dateInput} value={fromDate} onChange={e => setFromDate(e.target.value)} title="From" />
                <span style={{ color: '#94a3b8' }}>→</span>
                <input type="date" className={styles.dateInput} value={toDate} onChange={e => setToDate(e.target.value)} title="To" />
                <select className={styles.filterSelect} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                    <option value="">All Categories</option>
                    {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <input
                    className={styles.searchInput}
                    placeholder="Search description…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyFilters()}
                />
                <button className={styles.btnSecondary} onClick={applyFilters}>🔍 Apply</button>
                {activeFilters > 0 && <button className={styles.btnSecondary} onClick={clearFilters}>✕ Clear ({activeFilters})</button>}
            </div>

            {/* Visual summary */}
            {!loading && expenses.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12, marginBottom: 16 }}>
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8' }}>📊 By Category</h4>
                        <DonutChart
                            data={categoryTotals.map(c => ({ name: c.name, value: c.value }))}
                            height={220}
                            innerRadius={50}
                            outerRadius={85}
                        />
                    </div>
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8' }}>💸 Largest Expenses</h4>
                        <SimpleBarChart
                            data={topExpenses}
                            color="#ef4444"
                            height={220}
                        />
                    </div>
                </div>
            )}

            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} /></div>
            ) : expenses.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>{activeFilters > 0 ? 'No expenses match the current filters.' : 'No expenses recorded yet. Click "Record Expense" to add one.'}</p>
                </div>
            ) : (
                <div className={styles.tableWrapper}>
                    <table className={styles.journalsTable}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Payment Method</th>
                                <th>Recorded By</th>
                                <th className={styles.numCell}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses.map(e => (
                                <tr key={e.id} className={styles.journalTableRow}>
                                    <td>{new Date(e.date).toLocaleDateString()}</td>
                                    <td>
                                        <span className={styles.typeBadgeSmall}>
                                            {CATEGORY_OPTIONS.find(c => c.value === e.category)?.label ?? e.category}
                                        </span>
                                    </td>
                                    <td>{e.description}</td>
                                    <td>{e.paymentMethod ?? '—'}</td>
                                    <td>{e.recordedBy?.name ?? '—'}</td>
                                    <td className={`${styles.numCell} ${styles.expenseCol}`}>{fmt(e.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                        {expenses.length > 1 && (
                            <tfoot>
                                <tr>
                                    <td colSpan={5} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#94a3b8' }}>Total</td>
                                    <td className={styles.numCell} style={{ padding: '10px 14px', fontWeight: 700, color: '#f87171' }}>{fmt(totalAmount)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}

            {showNewModal && (
                <NewExpenseModal
                    onClose={() => setShowNewModal(false)}
                    onSuccess={() => { setShowNewModal(false); load(); }}
                />
            )}
        </div>
    );
}

function NewExpenseModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [category, setCategory] = useState('UTILITIES');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!description.trim()) { setError('Description is required'); return; }
        if (!amount || Number(amount) <= 0) { setError('Amount must be positive'); return; }
        setSaving(true);
        try {
            const res = await fetch('/api/finance/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category,
                    description: description.trim(),
                    amount: Number(amount),
                    date,
                    paymentMethod,
                }),
            });
            if (res.ok) onSuccess();
            else {
                const j = await res.json().catch(() => ({}));
                setError(j.error || 'Failed to record expense');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: 540 }}>
                <div className={styles.modalHeader}>
                    <h3>Record New Expense</h3>
                    <button className={styles.btnClose} onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label>Date *</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Amount (UGX) *</label>
                            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0" />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Category *</label>
                            <select value={category} onChange={e => setCategory(e.target.value)}>
                                {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Payment Method *</label>
                            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                            <label>Description *</label>
                            <input value={description} onChange={e => setDescription(e.target.value)} required placeholder="e.g. Electricity bill — July 2026" />
                        </div>
                    </div>
                    {error && <div className={styles.errorMsg}>{error}</div>}
                    <div className={styles.modalFooter}>
                        <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
                        <button type="submit" disabled={saving} className={styles.btnPrimary}>
                            {saving ? 'Recording…' : 'Record Expense'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Chart data helpers
// ──────────────────────────────────────────────────────────────────────────
function aggregateByCategory(expenses: Expense[]): { name: string; value: number }[] {
    const map: Record<string, number> = {};
    for (const e of expenses) {
        const key = e.category || 'OTHER';
        map[key] = (map[key] ?? 0) + Number(e.amount || 0);
    }
    return Object.entries(map)
        .map(([k, v]) => ({
            name: CATEGORY_OPTIONS.find(c => c.value === k)?.label ?? k,
            value: v,
        }))
        .sort((a, b) => b.value - a.value);
}

function topExpensesByAmount(expenses: Expense[], n: number): { name: string; value: number }[] {
    return [...expenses]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, n)
        .map(e => ({
            name: e.description.length > 30 ? e.description.slice(0, 28) + '…' : e.description,
            value: Number(e.amount),
        }));
}
