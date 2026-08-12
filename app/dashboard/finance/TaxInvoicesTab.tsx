'use client';

import { useState, useEffect } from 'react';
import styles from './finance.module.css';
import { DonutChart, SimpleBarChart, formatUGX } from './FinanceCharts';

interface TaxInvoice {
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    invoiceDate: string;
    dueDate: string | null;
    totalAmount: number;
    amountPaid: number;
    balanceDue: number;
    paymentStatus: string;
    customerName: string | null;
    customerEmail: string | null;
    customerTin: string | null;
    customerAddress: string | null;
    patient: { firstName: string; lastName: string; patientNumber: string } | null;
    lines: any[];
    createdBy: { name: string | null };
    journalEntryId?: string | null;
    originalInvoiceId?: string | null;
    creditReason?: string | null;
}

const STATUS_CLASS: Record<string, string> = {
    PAID: styles.statusPOSTED,
    PARTIAL: styles.statusAPPROVED,
    PENDING: styles.statusDRAFT,
    OVERDUE: styles.statusREVERSED,
    CANCELLED: styles.statusREVERSED,
};

const TYPE_LABELS: Record<string, string> = {
    TAX_INVOICE: '🧾 Tax Invoice',
    RECEIPT: '✅ Receipt',
    PROFORMA_INVOICE: '📋 Proforma',
    CREDIT_NOTE: '↩️ Credit Note',
    DEBIT_NOTE: '↗️ Debit Note',
};

export default function TaxInvoicesTab({ openNewModalSignal }: { openNewModalSignal?: number } = {}) {
    const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [showNewModal, setShowNewModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState<TaxInvoice | null>(null);
    const [printInvoice, setPrintInvoice] = useState<TaxInvoice | null>(null);
    const [tenant, setTenant] = useState<{
        name?: string; shortName?: string; address?: string; city?: string; region?: string;
        phone?: string; email?: string; taxId?: string; registrationNumber?: string; logoUrl?: string;
    } | null>(null);

    useEffect(() => {
        if (openNewModalSignal && openNewModalSignal > 0) setShowNewModal(true);
    }, [openNewModalSignal]);

    useEffect(() => {
        fetch('/api/admin/tenant', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setTenant(d); })
            .catch(() => { });
    }, []);

    const load = () => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page), limit: '20' });
        if (search) params.set('search', search);
        if (statusFilter) params.set('status', statusFilter);
        if (typeFilter) params.set('type', typeFilter);
        fetch(`/api/finance/tax-invoices?${params}`)
            .then(r => r.json())
            .then(d => { setInvoices(d.invoices ?? []); setTotal(d.total ?? 0); setLoading(false); })
            .catch(() => setLoading(false));
    };

    useEffect(() => { load(); }, [page, statusFilter, typeFilter]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        load();
    };

    const handleExport = (type: 'csv' | 'xml') => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (statusFilter) params.set('status', statusFilter);
        window.open(`/api/finance/tax-invoices/export/${type}?${params.toString()}`, '_blank');
    };

    const fmt = (n: number) => `UGX ${n.toLocaleString('en-UG')}`;
    const patientName = (inv: TaxInvoice) => inv.patient
        ? `${inv.patient.firstName} ${inv.patient.lastName}`
        : (inv.customerName ?? 'Walk-in Client');

    const refreshAfter = () => { setShowNewModal(false); setShowPaymentModal(null); load(); };

    const statusBreakdown = (() => {
        const map: Record<string, { count: number; total: number }> = {};
        for (const inv of invoices) {
            if (!map[inv.paymentStatus]) map[inv.paymentStatus] = { count: 0, total: 0 };
            map[inv.paymentStatus].count++;
            map[inv.paymentStatus].total += inv.totalAmount;
        }
        return Object.entries(map).map(([status, v]) => ({ status, count: v.count, total: v.total }));
    })();
    const topCustomers = (() => {
        const map = new Map<string, { name: string; total: number; balance: number }>();
        for (const inv of invoices) {
            const name = inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : (inv.customerName ?? 'Walk-in');
            const existing = map.get(name) ?? { name, total: 0, balance: 0 };
            existing.total += inv.totalAmount;
            existing.balance += inv.balanceDue;
            map.set(name, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.balance - a.balance).slice(0, 5);
    })();

    return (
        <div>
            <div className={styles.toolbarRow}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flex: 1 }}>
                    <input className={styles.searchInput} placeholder="Search by invoice #, patient…"
                        value={search} onChange={e => setSearch(e.target.value)} />
                    <button type="submit" className={styles.btnSecondary}>🔍</button>
                </form>
                <select className={styles.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="PAID">Paid</option>
                    <option value="OVERDUE">Overdue</option>
                </select>
                <select className={styles.select} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                    <option value="">All types</option>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className={styles.btnSecondary} onClick={() => handleExport('csv')}>📄 CSV</button>
                <button className={styles.btnSecondary} onClick={() => handleExport('xml')}>📋 XML</button>
                <button className={styles.btnPrimary} onClick={() => setShowNewModal(true)}>＋ New</button>
            </div>

            {loading ? (
                <div className={styles.card} style={{ padding: 16 }}>Loading…</div>
            ) : invoices.length === 0 ? (
                <div className={styles.card} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No tax invoices yet. Click "＋ New" to create one.
                </div>
            ) : (
                <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-elevated)' }}>
                                <th style={th}>Invoice #</th>
                                <th style={th}>Type</th>
                                <th style={th}>Customer / Patient</th>
                                <th style={th}>Date</th>
                                <th style={thRight}>Total</th>
                                <th style={thRight}>Balance</th>
                                <th style={th}>Status</th>
                                <th style={th}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map(inv => (
                                <tr key={inv.id} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={td}><strong>{inv.invoiceNumber}</strong></td>
                                    <td style={td}>{TYPE_LABELS[inv.invoiceType] ?? inv.invoiceType}</td>
                                    <td style={td}>{patientName(inv)}</td>
                                    <td style={td}>{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                                    <td style={tdRight}>{fmt(inv.totalAmount)}</td>
                                    <td style={{ ...tdRight, color: inv.balanceDue > 0 ? '#dc2626' : '#059669' }}>{fmt(inv.balanceDue)}</td>
                                    <td style={td}>
                                        <span className={STATUS_CLASS[inv.paymentStatus] ?? ''}>
                                            {inv.paymentStatus}
                                        </span>
                                    </td>
                                    <td style={td}>
                                        <button className={styles.btnSecondary} onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}>
                                            {expanded === inv.id ? '▾' : '▸'} Lines
                                        </button>
                                        <button className={styles.btnSecondary} onClick={() => setPrintInvoice(inv)}>🖨️</button>
                                        {inv.balanceDue > 0 && inv.invoiceType !== 'CREDIT_NOTE' && (
                                            <button className={styles.btnPrimary} onClick={() => setShowPaymentModal(inv)}>Pay</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Inline charts (only when we have data) */}
            {!loading && invoices.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                    <div className={styles.card} style={{ padding: 16 }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>By status</h3>
                        <SimpleBarChart data={statusBreakdown.map(s => ({ name: s.status, value: s.total }))} />
                    </div>
                    <div className={styles.card} style={{ padding: 16 }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Top customers (by balance)</h3>
                        <SimpleBarChart data={topCustomers.map(c => ({ name: c.name, value: c.balance }))} />
                    </div>
                </div>
            )}

            {/* New-invoice modal — placeholder for future expansion */}
            {showNewModal && (
                <div className={styles.modalBackdrop} onClick={() => setShowNewModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ padding: 16 }}>
                        <h3>New Tax Invoice</h3>
                        <p>Invoice creation flow is part of the dispense / billing module.
                           Open an Invoice from the patient flow to generate a tax invoice.</p>
                        <button className={styles.btnSecondary} onClick={() => setShowNewModal(false)}>Close</button>
                    </div>
                </div>
            )}

            {showPaymentModal && (
                <div className={styles.modalBackdrop} onClick={() => setShowPaymentModal(null)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ padding: 16 }}>
                        <h3>Record Payment — {showPaymentModal.invoiceNumber}</h3>
                        <p>Use POST /api/finance/tax-invoices/{showPaymentModal.id}/payment to record the payment.
                           (UI hook to be wired in a follow-up.)</p>
                        <button className={styles.btnSecondary} onClick={() => setShowPaymentModal(null)}>Close</button>
                    </div>
                </div>
            )}

            {printInvoice && (
                <div className={styles.modalBackdrop} onClick={() => setPrintInvoice(null)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ padding: 16, maxWidth: 720 }}>
                        <h3>Print Preview — {printInvoice.invoiceNumber}</h3>
                        <pre style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 400, overflow: 'auto' }}>
                            {JSON.stringify(printInvoice, null, 2)}
                        </pre>
                        <button className={styles.btnSecondary} onClick={() => setPrintInvoice(null)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' };
const thRight: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13 };
const tdRight: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'monospace' };
