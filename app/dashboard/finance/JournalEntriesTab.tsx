'use client';

import { useState, useEffect } from 'react';
import styles from './finance.module.css';

interface JournalLine {
    account: { accountCode: string; accountName: string };
    debitAmount: number;
    creditAmount: number;
    description: string | null;
}

interface JournalEntry {
    id: string;
    entryNumber: string;
    entryDate: string;
    description: string;
    reference: string | null;
    referenceType: string;
    status: string;
    totalDebit: number;
    totalCredit: number;
    createdBy: { name: string | null };
    lines: JournalLine[];
}

const STATUS_CLASS: Record<string, string> = {
    POSTED: styles.statusPOSTED,
    DRAFT: styles.statusDRAFT,
    REVERSED: styles.statusREVERSED,
    APPROVED: styles.statusAPPROVED,
};

export default function JournalEntriesTab({ openNewModalSignal }: { openNewModalSignal?: number } = {}) {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [expanded, setExpanded] = useState<string | null>(null);

    // Filters
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showNewModal, setShowNewModal] = useState(false);

    // Open the new-entry modal when parent requests it (e.g. Quick Action)
    useEffect(() => {
        if (openNewModalSignal && openNewModalSignal > 0) setShowNewModal(true);
    }, [openNewModalSignal]);

    const load = (p: number) => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(p), limit: '20' });
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
        if (search) params.set('search', search);
        if (statusFilter) params.set('status', statusFilter);
        fetch(`/api/finance/journal-entries?${params}`)
            .then(r => r.json())
            .then(d => {
                setEntries(d.entries ?? []);
                setTotal(d.total ?? 0);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => { load(page); }, [page, statusFilter]);

    const applyFilters = () => {
        setPage(1);
        load(1);
    };

    const clearFilters = () => {
        setFromDate('');
        setToDate('');
        setSearch('');
        setStatusFilter('');
        setPage(1);
        setTimeout(() => load(1), 0);
    };

    const handleExport = () => {
        const params = new URLSearchParams();
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
        if (search) params.set('search', search);
        if (statusFilter) params.set('status', statusFilter);
        window.open(`/api/finance/journal-entries/export/csv?${params.toString()}`, '_blank');
    };

    const fmt = (n: number) => n > 0 ? `UGX ${n.toLocaleString()}` : '—';
    const totalPages = Math.ceil(total / 20);

    // Show a useful quick range label
    const activeFilters = [fromDate, toDate, search, statusFilter].filter(Boolean).length;

    return (
        <div>
            <div className={styles.toolbarRow}>
                <span className={styles.totalBadge}>{total} entries</span>
                <button className={styles.btnPrimary} onClick={() => setShowNewModal(true)}>+ New Journal Entry</button>
            </div>

            <div className={styles.toolbarRow} style={{ marginTop: 8 }}>
                <input
                    type="date"
                    className={styles.dateInput}
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    title="From date"
                    placeholder="From"
                />
                <span style={{ color: '#94a3b8' }}>→</span>
                <input
                    type="date"
                    className={styles.dateInput}
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    title="To date"
                    placeholder="To"
                />
                <input
                    className={styles.searchInput}
                    placeholder="Search description, ref…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyFilters()}
                />
                <select
                    className={styles.filterSelect}
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                >
                    <option value="">All Statuses</option>
                    <option value="POSTED">Posted</option>
                    <option value="DRAFT">Draft</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REVERSED">Reversed</option>
                </select>
                <button className={styles.btnSecondary} onClick={applyFilters}>🔍 Apply</button>
                {activeFilters > 0 && (
                    <button className={styles.btnSecondary} onClick={clearFilters} title="Clear filters">✕ Clear ({activeFilters})</button>
                )}
                <button className={styles.btnSecondary} onClick={handleExport} title="Export to CSV">📊 CSV</button>
            </div>

            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} /></div>
            ) : entries.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>{activeFilters > 0 ? 'No journal entries match the current filters.' : 'No journal entries yet. Post your first entry to get started.'}</p>
                </div>
            ) : (
                <div className={styles.tableWrapper}>
                    <table className={styles.journalsTable}>
                        <thead>
                            <tr>
                                <th />
                                <th>Entry #</th>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Ref Type</th>
                                <th>Reference</th>
                                <th className={styles.numCell}>Debit (UGX)</th>
                                <th className={styles.numCell}>Credit (UGX)</th>
                                <th>Status</th>
                                <th>By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(e => (
                                <>
                                    <tr key={e.id} className={styles.journalTableRow}
                                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                                        <td className={styles.expandCell}>{expanded === e.id ? '▼' : '▶'}</td>
                                        <td className={styles.entryNum}>{e.entryNumber}</td>
                                        <td>{new Date(e.entryDate).toLocaleDateString()}</td>
                                        <td>{e.description}</td>
                                        <td><span className={styles.typeBadgeSmall}>{e.referenceType}</span></td>
                                        <td className={styles.refCell}>{e.reference ? e.reference.slice(-8) : '—'}</td>
                                        <td className={`${styles.numCell} ${styles.debitCol}`}>{fmt(e.totalDebit)}</td>
                                        <td className={`${styles.numCell} ${styles.creditCol}`}>{fmt(e.totalCredit)}</td>
                                        <td><span className={`${styles.statusPill} ${STATUS_CLASS[e.status] ?? ''}`}>{e.status}</span></td>
                                        <td>{e.createdBy?.name ?? '—'}</td>
                                    </tr>
                                    {expanded === e.id && (
                                        <tr key={`${e.id}-lines`} className={styles.linesRow}>
                                            <td colSpan={10}>
                                                <table className={styles.linesTable}>
                                                    <thead>
                                                        <tr>
                                                            <th>Account Code</th>
                                                            <th>Account Name</th>
                                                            <th>Description</th>
                                                            <th className={styles.numCell}>Debit</th>
                                                            <th className={styles.numCell}>Credit</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {e.lines.map((l, i) => (
                                                            <tr key={i}>
                                                                <td>{l.account.accountCode}</td>
                                                                <td>{l.account.accountName}</td>
                                                                <td>{l.description ?? '—'}</td>
                                                                <td className={`${styles.numCell} ${styles.debitCol}`}>{fmt(l.debitAmount)}</td>
                                                                <td className={`${styles.numCell} ${styles.creditCol}`}>{fmt(l.creditAmount)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                    <span>Page {page} of {totalPages}</span>
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
            )}

            {showNewModal && (
                <NewJournalModal
                    onClose={() => setShowNewModal(false)}
                    onSuccess={() => { setShowNewModal(false); load(page); }}
                />
            )}
        </div>
    );
}

function NewJournalModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
    const [description, setDescription] = useState('');
    const [referenceType, setReferenceType] = useState('ADJUSTMENT');
    const [reference, setReference] = useState('');
    const [lines, setLines] = useState<any[]>([
        { accountId: '', debitAmount: 0, creditAmount: 0, description: '' },
        { accountId: '', debitAmount: 0, creditAmount: 0, description: '' },
    ]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/finance/accounts')
            .then(r => r.json())
            .then(d => setAccounts(flattenAccounts(d)));
    }, []);

    const flattenAccounts = (accs: any[]): any[] => {
        const result: any[] = [];
        for (const a of accs) {
            result.push({ id: a.id, code: a.accountCode, name: a.accountName, type: a.accountType });
            if (a.children && a.children.length) {
                result.push(...flattenAccounts(a.children));
            }
        }
        return result;
    };

    const addLine = () => setLines([...lines, { accountId: '', debitAmount: 0, creditAmount: 0, description: '' }]);
    const removeLine = (i: number) => setLines(lines.length > 2 ? lines.filter((_, idx) => idx !== i) : lines);
    const updateLine = (i: number, field: string, val: any) => {
        const n = [...lines];
        (n[i] as any)[field] = val;
        setLines(n);
    };

    const totalDebit = lines.reduce((s, l) => s + (Number(l.debitAmount) || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (Number(l.creditAmount) || 0), 0);
    const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!balanced) {
            setError(`Debits (${totalDebit.toFixed(2)}) must equal Credits (${totalCredit.toFixed(2)})`);
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/finance/journal-entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entryDate,
                    description,
                    reference: reference || null,
                    referenceType,
                    lines: lines.filter(l => l.accountId),
                }),
            });
            if (res.ok) onSuccess();
            else {
                const j = await res.json();
                setError(j.error || 'Failed to create journal entry');
            }
        } catch (err) {
            setError('Network error creating journal entry');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: 900 }}>
                <div className={styles.modalHeader}>
                    <h3>New Journal Entry</h3>
                    <button className={styles.btnClose} onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label>Date *</label>
                            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Reference Type</label>
                            <select value={referenceType} onChange={e => setReferenceType(e.target.value)}>
                                <option value="ADJUSTMENT">Adjustment</option>
                                <option value="INVOICE">Invoice</option>
                                <option value="PAYMENT">Payment</option>
                                <option value="EXPENSE">Expense</option>
                                <option value="PURCHASE">Purchase</option>
                                <option value="CREDIT_NOTE">Credit Note</option>
                                <option value="DEBIT_NOTE">Debit Note</option>
                            </select>
                        </div>
                        <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                            <label>Description *</label>
                            <input value={description} onChange={e => setDescription(e.target.value)} required placeholder="e.g. Bank charges for July 2026" />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Reference (optional)</label>
                            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="External ref number" />
                        </div>
                    </div>

                    <div className={styles.linesSection}>
                        <h4>Journal Lines</h4>
                        <table className={styles.linesTable}>
                            <thead>
                                <tr>
                                    <th>Account *</th>
                                    <th style={{ width: 140 }}>Description</th>
                                    <th style={{ width: 100 }}>Debit (UGX)</th>
                                    <th style={{ width: 100 }}>Credit (UGX)</th>
                                    <th style={{ width: 32 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((l, i) => (
                                    <tr key={i}>
                                        <td>
                                            <select value={l.accountId} onChange={e => updateLine(i, 'accountId', e.target.value)} required style={{ width: '100%' }}>
                                                <option value="">Select account…</option>
                                                {accounts.map(a => (
                                                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td><input value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} /></td>
                                        <td><input type="number" min="0" step="0.01" value={l.debitAmount} onChange={e => updateLine(i, 'debitAmount', e.target.value)} /></td>
                                        <td><input type="number" min="0" step="0.01" value={l.creditAmount} onChange={e => updateLine(i, 'creditAmount', e.target.value)} /></td>
                                        <td>{lines.length > 2 && <button type="button" onClick={() => removeLine(i)}>&times;</button>}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={2} style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: balanced ? '#10b981' : '#f87171' }}>
                                        {balanced ? '✅ Balanced' : '⚠️ Unbalanced'}
                                    </td>
                                    <td className={styles.numCell} style={{ padding: '8px 12px', fontWeight: 700 }}>{totalDebit.toLocaleString()}</td>
                                    <td className={styles.numCell} style={{ padding: '8px 12px', fontWeight: 700 }}>{totalCredit.toLocaleString()}</td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                        <button type="button" onClick={addLine} className={styles.btnSecondary} style={{ marginTop: 8 }}>+ Add Line</button>
                    </div>

                    {error && <div className={styles.errorMsg}>{error}</div>}

                    <div className={styles.modalFooter}>
                        <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
                        <button type="submit" disabled={saving || !balanced} className={styles.btnPrimary}>
                            {saving ? 'Posting…' : 'Post Journal Entry'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
