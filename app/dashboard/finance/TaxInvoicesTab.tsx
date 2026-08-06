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
    insurance: { name: string } | null;
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
    const [showCreditNoteModal, setShowCreditNoteModal] = useState<TaxInvoice | null>(null);
    const [printInvoice, setPrintInvoice] = useState<TaxInvoice | null>(null);
    // Clinic/Hospital identity (from Admin → Clinic/Hospital Settings).
    // Drives the invoice print template header, address, TIN, regulatory
    // text, and the email signature — no hardcoded clinic strings anywhere.
    const [tenant, setTenant] = useState<{
        name?: string; shortName?: string; address?: string; city?: string; region?: string;
        phone?: string; email?: string; taxId?: string; registrationNumber?: string; logoUrl?: string;
    } | null>(null);

    useEffect(() => {
        if (openNewModalSignal && openNewModalSignal > 0) setShowNewModal(true);
    }, [openNewModalSignal]);

    // Pull clinic/hospital identity once on mount
    useEffect(() => {
        fetch('/api/admin/tenant', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setTenant(d); })
            .catch(() => { /* fallback to "—" placeholders */ });
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

    const refreshAfter = () => { setShowNewModal(false); setShowPaymentModal(null); setShowCreditNoteModal(null); load(); };

    // Build chart data from current invoice list
    const statusBreakdown = aggregateByStatus(invoices);
    const topCustomers = topByBalance(invoices, 5);

    return (
        <div>
            <div className={styles.toolbarRow}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flex: 1 }}>
                    <input className={styles.searchInput} placeholder="Search by invoice #, patient…"
                        value={search} onChange={e => setSearch(e.target.value)} />
                    <button type="submit" className={styles.btnSecondary}>🔍</button>
                </form>
                <select className={styles.filterSelect} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
                    <option value="">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="PAID">Paid</option>
                    <option value="OVERDUE">Overdue</option>
                    <option value="CANCELLED">Cancelled</option>
                </select>
                <select className={styles.filterSelect} value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
                    <option value="">All Types</option>
                    <option value="TAX_INVOICE">Tax Invoice</option>
                    <option value="RECEIPT">Receipt</option>
                    <option value="PROFORMA_INVOICE">Proforma</option>
                    <option value="CREDIT_NOTE">Credit Note</option>
                    <option value="DEBIT_NOTE">Debit Note</option>
                </select>
                <button className={styles.btnSecondary} onClick={() => handleExport('csv')} title="Export to CSV">📊 CSV</button>
                <button className={styles.btnSecondary} onClick={() => handleExport('xml')} title="Export to XML (URA)">📄 XML</button>
                <span className={styles.totalBadge}>{total} invoices</span>
                <button className={styles.btnPrimary} onClick={() => setShowNewModal(true)}>+ New Invoice</button>
            </div>

            {/* Visual summary — only show if we have any invoices */}
            {!loading && invoices.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12, marginBottom: 16 }}>
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8' }}>📊 Status Breakdown (by total amount)</h4>
                        <DonutChart
                            data={statusBreakdown}
                            height={200}
                            innerRadius={45}
                            outerRadius={80}
                        />
                    </div>
                    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#94a3b8' }}>⏳ Top 5 Outstanding (by balance)</h4>
                        <SimpleBarChart
                            data={topCustomers}
                            color="#f59e0b"
                            height={200}
                            layout="vertical"
                        />
                    </div>
                </div>
            )}


            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} /></div>
            ) : invoices.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>No tax invoices found. Create your first invoice to get started.</p>
                </div>
            ) : (
                <div className={styles.tableWrapper}>
                    <table className={styles.journalsTable}>
                        <thead>
                            <tr>
                                <th />
                                <th>Invoice #</th>
                                <th>Type</th>
                                <th>Client</th>
                                <th>Date</th>
                                <th className={styles.numCell}>Total</th>
                                <th className={styles.numCell}>Paid</th>
                                <th className={styles.numCell}>Balance</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map(inv => (
                                <>
                                    <tr key={inv.id} className={styles.journalTableRow}
                                        onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}>
                                        <td className={styles.expandCell}>{expanded === inv.id ? '▼' : '▶'}</td>
                                        <td className={styles.entryNum}>{inv.invoiceNumber}</td>
                                        <td><span className={styles.typeBadgeSmall}>{TYPE_LABELS[inv.invoiceType] ?? inv.invoiceType}</span></td>
                                        <td>{patientName(inv)}</td>
                                        <td>{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                                        <td className={styles.numCell}>{fmt(inv.totalAmount)}</td>
                                        <td className={`${styles.numCell} ${styles.creditCol}`}>{fmt(inv.amountPaid)}</td>
                                        <td className={`${styles.numCell} ${inv.balanceDue > 0 ? styles.debitCol : styles.creditCol}`}>{fmt(inv.balanceDue)}</td>
                                        <td><span className={`${styles.statusPill} ${STATUS_CLASS[inv.paymentStatus] ?? ''}`}>{inv.paymentStatus}</span></td>
                                    </tr>
                                    {expanded === inv.id && (
                                        <tr key={`${inv.id}-lines`} className={styles.linesRow}>
                                            <td colSpan={9}>
                                                <div className={styles.invoiceDetail}>
                                                    <div className={styles.invoiceMeta}>
                                                        <span>Issued by: <strong>{inv.createdBy?.name ?? '—'}</strong></span>
                                                        {inv.dueDate && <span>Due: <strong>{new Date(inv.dueDate).toLocaleDateString()}</strong></span>}
                                                        {inv.insurance && <span>Insurance: <strong>{inv.insurance.name}</strong></span>}
                                                        {inv.journalEntryId && <span style={{ color: '#10b981' }}>✓ Posted to ledger</span>}
                                                        {inv.originalInvoiceId && <span>Ref: <strong>{inv.originalInvoiceId.slice(-8)}</strong></span>}
                                                    </div>
                                                    <table className={styles.linesTable}>
                                                        <thead>
                                                            <tr>
                                                                <th>#</th>
                                                                <th>Item</th>
                                                                <th className={styles.numCell}>Qty</th>
                                                                <th className={styles.numCell}>Unit Price</th>
                                                                <th className={styles.numCell}>Discount</th>
                                                                <th className={styles.numCell}>Tax</th>
                                                                <th className={styles.numCell}>Total</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {inv.lines.map((l: any) => (
                                                                <tr key={l.id}>
                                                                    <td>{l.lineNumber}</td>
                                                                    <td>{l.itemName}<br /><small style={{ color: '#64748b' }}>{l.description}</small></td>
                                                                    <td className={styles.numCell}>{l.quantity}</td>
                                                                    <td className={styles.numCell}>{fmt(l.unitPrice)}</td>
                                                                    <td className={`${styles.numCell} ${styles.debitCol}`}>{l.discountAmount > 0 ? fmt(l.discountAmount) : '—'}</td>
                                                                    <td className={styles.numCell}>{l.taxAmount > 0 ? fmt(l.taxAmount) : '—'}</td>
                                                                    <td className={`${styles.numCell} ${styles.creditCol}`}>{fmt(l.lineTotal)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                        <tfoot>
                                                            <tr>
                                                                <td colSpan={6} style={{ textAlign: 'right', padding: '8px 14px', color: '#94a3b8' }}>Subtotal</td>
                                                                <td className={styles.numCell} style={{ padding: '8px 14px' }}>{fmt(inv.totalAmount)}</td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                    {inv.creditReason && (
                                                        <div style={{ margin: '8px 0', padding: '8px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, fontSize: 13, color: '#fbbf24' }}>
                                                            <strong>Credit reason:</strong> {inv.creditReason}
                                                        </div>
                                                    )}
                                                    <div className={styles.invoiceActions}>
                                                        <button className={styles.btnSecondary} onClick={(e) => { e.stopPropagation(); setPrintInvoice(inv); }}>🖨️ Print</button>
                                                        <button className={styles.btnSecondary} onClick={(e) => { e.stopPropagation(); emailInvoice(inv, tenant); }} disabled={!inv.customerEmail && !inv.patient}>📧 Email</button>
                                                        {inv.invoiceType !== 'CREDIT_NOTE' && inv.paymentStatus !== 'PAID' && inv.paymentStatus !== 'CANCELLED' && (
                                                            <button className={styles.btnPrimary} onClick={(e) => { e.stopPropagation(); setShowPaymentModal(inv); }}>💳 Record Payment</button>
                                                        )}
                                                        {inv.invoiceType === 'TAX_INVOICE' && inv.paymentStatus !== 'CANCELLED' && (
                                                            <button className={styles.btnSecondary} onClick={(e) => { e.stopPropagation(); setShowCreditNoteModal(inv); }} title="Issue a credit note reversing this invoice">↩️ Issue Credit Note</button>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {total > 20 && (
                <div className={styles.pagination}>
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                    <span>Page {page} of {Math.ceil(total / 20)}</span>
                    <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>Next →</button>
                </div>
            )}

            {showNewModal && (
                <NewInvoiceModal
                    onClose={() => setShowNewModal(false)}
                    onSuccess={refreshAfter}
                />
            )}

            {showPaymentModal && (
                <RecordPaymentModal
                    invoice={showPaymentModal}
                    onClose={() => setShowPaymentModal(null)}
                    onSuccess={refreshAfter}
                />
            )}

            {showCreditNoteModal && (
                <CreditNoteModal
                    invoice={showCreditNoteModal}
                    onClose={() => setShowCreditNoteModal(null)}
                    onSuccess={refreshAfter}
                />
            )}

            {printInvoice && (
                <PrintableInvoice
                    invoice={printInvoice}
                    tenant={tenant}
                    onClose={() => setPrintInvoice(null)}
                />
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Chart data helpers
// ──────────────────────────────────────────────────────────────────────────
function aggregateByStatus(invoices: TaxInvoice[]): { name: string; value: number }[] {
    const buckets: Record<string, number> = {};
    for (const inv of invoices) {
        const status = inv.paymentStatus || 'UNKNOWN';
        buckets[status] = (buckets[status] ?? 0) + Number(inv.totalAmount || 0);
    }
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
}

function topByBalance(invoices: TaxInvoice[], n: number): { name: string; value: number }[] {
    return [...invoices]
        .filter(i => Number(i.balanceDue) > 0)
        .sort((a, b) => Number(b.balanceDue) - Number(a.balanceDue))
        .slice(0, n)
        .map(inv => ({
            name: inv.invoiceNumber,
            value: Number(inv.balanceDue),
        }));
}

/**
 * Format a single-line address from the Tenant row. Used by the invoice
 * print template subheader and the email signature. Falls back to a
 * neutral placeholder when fields are empty.
 */
function formatClinicAddress(t: { address?: string; city?: string; region?: string } | null | undefined): string {
    if (!t) return '';
    return [t.address, t.city, t.region].filter(Boolean).join(', ');
}

/**
 * Format the regulatory line (Reg. No: ... · TIN: ...) from the Tenant row.
 * Mirrors the same logic used by the lab/radiology render routes.
 */
function formatClinicRegulatory(t: { registrationNumber?: string; taxId?: string } | null | undefined): string {
    if (!t) return '';
    const parts: string[] = [];
    if (t.registrationNumber) parts.push(`Reg. No: ${t.registrationNumber}`);
    if (t.taxId) parts.push(`TIN: ${t.taxId}`);
    return parts.join(' · ');
}

function emailInvoice(inv: TaxInvoice, tenant: { name?: string } | null) {
    const to = inv.customerEmail || '';
    const clinicName = tenant?.name || 'the clinic';
    const subject = encodeURIComponent(`Invoice ${inv.invoiceNumber} — ${clinicName}`);
    const body = encodeURIComponent(
        `Dear ${inv.customerName || (inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : 'Valued Client')},\n\n` +
        `Please find your invoice details below:\n\n` +
        `Invoice Number: ${inv.invoiceNumber}\n` +
        `Date: ${new Date(inv.invoiceDate).toLocaleDateString()}\n` +
        `Total: UGX ${inv.totalAmount.toLocaleString()}\n` +
        `Balance Due: UGX ${inv.balanceDue.toLocaleString()}\n\n` +
        `Login to view the full invoice: http://localhost:3000/dashboard/finance\n\n` +
        `Thank you,\n${clinicName}`
    );
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
}

function NewInvoiceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [patientSearch, setPatientSearch] = useState('');
    const [patients, setPatients] = useState<any[]>([]);
    const [selectedPatient, setSelectedPatient] = useState<any>(null);
    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerTin, setCustomerTin] = useState('');
    const [invoiceType, setInvoiceType] = useState('TAX_INVOICE');
    const [lines, setLines] = useState<any[]>([{ itemName: '', quantity: 1, unitPrice: 0, taxRateId: '' }]);
    const [taxRates, setTaxRates] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/finance/tax-rates').then(r => r.json()).then(d => setTaxRates(d ?? [])).catch(() => setTaxRates([]));
    }, []);

    const searchPatients = (q: string) => {
        setPatientSearch(q);
        if (q.length < 2) { setPatients([]); return; }
        fetch(`/api/patients?search=${q}`).then(r => r.json()).then(setPatients).catch(() => setPatients([]));
    };

    const addLine = () => setLines([...lines, { itemName: '', quantity: 1, unitPrice: 0, taxRateId: '' }]);
    const removeLine = (i: number) => setLines(lines.length > 1 ? lines.filter((_, idx) => idx !== i) : lines);
    const updateLine = (i: number, field: string, val: any) => {
        const n = [...lines];
        (n[i] as any)[field] = val;
        setLines(n);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            const res = await fetch('/api/finance/tax-invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoiceType,
                    patientId: selectedPatient?.id,
                    customerName: selectedPatient ? null : customerName,
                    customerEmail: selectedPatient ? null : customerEmail || null,
                    customerTin: selectedPatient ? null : customerTin || null,
                    invoiceDate: new Date().toISOString().slice(0, 10),
                    lines: lines.filter(l => l.itemName).map((l, idx) => ({
                        ...l,
                        lineNumber: idx + 1,
                        description: l.itemName,
                    })),
                }),
            });
            if (res.ok) onSuccess();
            else {
                const j = await res.json().catch(() => ({}));
                setError(j.error || 'Failed to create invoice');
            }
        } catch (err) {
            setError('Network error creating invoice');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: 800 }}>
                <div className={styles.modalHeader}>
                    <h3>Create New Invoice</h3>
                    <button className={styles.btnClose} onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label>Invoice Type</label>
                            <select value={invoiceType} onChange={e => setInvoiceType(e.target.value)}>
                                <option value="TAX_INVOICE">Tax Invoice</option>
                                <option value="PROFORMA_INVOICE">Proforma Invoice</option>
                                <option value="RECEIPT">Receipt</option>
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Patient/Client</label>
                            {selectedPatient ? (
                                <div className={styles.selectedItem}>
                                    <span>{selectedPatient.firstName} {selectedPatient.lastName} ({selectedPatient.patientNumber})</span>
                                    <button type="button" onClick={() => setSelectedPatient(null)}>&times;</button>
                                </div>
                            ) : (
                                <div>
                                    <input placeholder="Search patient..." value={patientSearch} onChange={e => searchPatients(e.target.value)} />
                                    {patients.length > 0 && (
                                        <div className={styles.dropdown}>
                                            {patients.slice(0, 6).map(p => (
                                                <div key={p.id} onClick={() => { setSelectedPatient(p); setPatients([]); setPatientSearch(''); }}>
                                                    {p.firstName} {p.lastName} {p.patientNumber && `(${p.patientNumber})`}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div style={{ marginTop: 8 }}>
                                        <input placeholder="Or enter Walk-in Client Name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                                    </div>
                                </div>
                            )}
                        </div>
                        {!selectedPatient && (
                            <>
                                <div className={styles.formGroup}>
                                    <label>Email (optional)</label>
                                    <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="client@example.com" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>TIN (optional, for VAT receipt)</label>
                                    <input value={customerTin} onChange={e => setCustomerTin(e.target.value)} placeholder="e.g. 100012345" />
                                </div>
                            </>
                        )}
                    </div>

                    <div className={styles.linesSection}>
                        <h4>Line Items</h4>
                        <table className={styles.linesTable}>
                            <thead>
                                <tr>
                                    <th>Item Name</th>
                                    <th style={{ width: 80 }}>Qty</th>
                                    <th style={{ width: 120 }}>Unit Price</th>
                                    <th style={{ width: 120 }}>Tax</th>
                                    <th style={{ width: 40 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((l, i) => (
                                    <tr key={i}>
                                        <td><input value={l.itemName} onChange={e => updateLine(i, 'itemName', e.target.value)} required /></td>
                                        <td><input type="number" min="0" step="0.01" value={l.quantity} onChange={e => updateLine(i, 'quantity', Number(e.target.value))} required /></td>
                                        <td><input type="number" min="0" step="0.01" value={l.unitPrice} onChange={e => updateLine(i, 'unitPrice', Number(e.target.value))} required /></td>
                                        <td>
                                            <select value={l.taxRateId} onChange={e => updateLine(i, 'taxRateId', e.target.value)}>
                                                <option value="">No Tax</option>
                                                {taxRates.map(tr => <option key={tr.id} value={tr.id}>{tr.name} ({tr.rate}%)</option>)}
                                            </select>
                                        </td>
                                        <td>{lines.length > 1 && <button type="button" onClick={() => removeLine(i)}>&times;</button>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button type="button" onClick={addLine} className={styles.btnSecondary} style={{ marginTop: 8 }}>+ Add Line</button>
                    </div>

                    {error && <div className={styles.errorMsg}>{error}</div>}

                    <div className={styles.modalFooter}>
                        <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
                        <button type="submit" disabled={saving} className={styles.btnPrimary}>
                            {saving ? 'Creating...' : 'Create Invoice'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function RecordPaymentModal({ invoice, onClose, onSuccess }: { invoice: TaxInvoice; onClose: () => void; onSuccess: () => void }) {
    const [amount, setAmount] = useState(invoice.balanceDue);
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [transactionId, setTransactionId] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (amount <= 0 || amount > invoice.balanceDue + 0.01) {
            setError(`Amount must be between 0 and ${invoice.balanceDue.toLocaleString()}`);
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/finance/tax-invoices/${invoice.id}/payments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: Number(amount),
                    paymentMethod,
                    transactionId: transactionId || null,
                    notes: notes || null,
                }),
            });
            if (res.ok) onSuccess();
            else {
                const j = await res.json().catch(() => ({}));
                setError(j.error || 'Failed to record payment');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: 500 }}>
                <div className={styles.modalHeader}>
                    <h3>Record Payment — {invoice.invoiceNumber}</h3>
                    <button className={styles.btnClose} onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    <div style={{ padding: '12px 16px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                            <span>Invoice total:</span><strong>UGX {invoice.totalAmount.toLocaleString()}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                            <span>Already paid:</span><strong style={{ color: '#10b981' }}>UGX {invoice.amountPaid.toLocaleString()}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(99,102,241,0.2)' }}>
                            <span>Balance due:</span><strong style={{ color: '#f87171' }}>UGX {invoice.balanceDue.toLocaleString()}</strong>
                        </div>
                    </div>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label>Amount (UGX) *</label>
                            <input type="number" min="0" max={invoice.balanceDue} step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Payment Method *</label>
                            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                <option value="Cash">Cash (UGX)</option>
                                <option value="Cash (UGX)">Cash</option>
                                <option value="Mobile_Money">Mobile Money</option>
                                <option value="Bank Transfer">Bank Transfer</option>
                                <option value="Card">Card</option>
                                <option value="Cheque">Cheque</option>
                                <option value="Insurance">Insurance</option>
                            </select>
                        </div>
                        <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                            <label>Transaction ID (optional)</label>
                            <input value={transactionId} onChange={e => setTransactionId(e.target.value)} placeholder="e.g. MM-20260727-12345" />
                        </div>
                        <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                            <label>Notes (optional)</label>
                            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Partial payment, balance due next month" />
                        </div>
                    </div>
                    {error && <div className={styles.errorMsg}>{error}</div>}
                    <div className={styles.modalFooter}>
                        <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
                        <button type="submit" disabled={saving} className={styles.btnPrimary}>
                            {saving ? 'Recording…' : `Record UGX ${Number(amount).toLocaleString()}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function CreditNoteModal({ invoice, onClose, onSuccess }: { invoice: TaxInvoice; onClose: () => void; onSuccess: () => void }) {
    const [reason, setReason] = useState('');
    const [refundAmount, setRefundAmount] = useState(invoice.balanceDue || invoice.totalAmount);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!reason.trim()) {
            setError('Please provide a reason for the credit note');
            return;
        }
        if (refundAmount <= 0 || refundAmount > invoice.totalAmount + 0.01) {
            setError(`Refund amount must be between 0 and ${invoice.totalAmount.toLocaleString()}`);
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/finance/tax-invoices/${invoice.id}/credit-note`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reason: reason.trim(),
                    refundAmount: Number(refundAmount),
                }),
            });
            if (res.ok) onSuccess();
            else {
                const j = await res.json().catch(() => ({}));
                setError(j.error || 'Failed to issue credit note');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: 500 }}>
                <div className={styles.modalHeader}>
                    <h3>Issue Credit Note — {invoice.invoiceNumber}</h3>
                    <button className={styles.btnClose} onClick={onClose}>&times;</button>
                </div>
                <form onSubmit={handleSubmit} className={styles.modalForm}>
                    <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                        ⚠️ A credit note reverses the original invoice. The patient receives a refund or credit balance, and the ledger is updated to reduce revenue and AR.
                    </div>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                            <label>Reason *</label>
                            <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={3} placeholder="e.g. Service cancelled by patient, billing error, duplicate charge…" />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Refund / Credit Amount (UGX) *</label>
                            <input type="number" min="0" max={invoice.totalAmount} step="0.01" value={refundAmount} onChange={e => setRefundAmount(Number(e.target.value))} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Original Amount</label>
                            <input value={invoice.totalAmount.toLocaleString()} readOnly disabled />
                        </div>
                    </div>
                    {error && <div className={styles.errorMsg}>{error}</div>}
                    <div className={styles.modalFooter}>
                        <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancel</button>
                        <button type="submit" disabled={saving} className={styles.btnPrimary} style={{ background: '#f59e0b' }}>
                            {saving ? 'Issuing…' : 'Issue Credit Note'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function PrintableInvoice({
    invoice,
    tenant,
    onClose,
}: {
    invoice: TaxInvoice;
    tenant: { name?: string; shortName?: string; address?: string; city?: string; region?: string; phone?: string; email?: string; taxId?: string; registrationNumber?: string; logoUrl?: string } | null;
    onClose: () => void;
}) {
    const fmt = (n: number) => `UGX ${n.toLocaleString('en-UG')}`;
    const client = invoice.customerName || (invoice.patient ? `${invoice.patient.firstName} ${invoice.patient.lastName}` : 'Walk-in');
    const isCreditNote = invoice.invoiceType === 'CREDIT_NOTE';

    // Pull clinic identity from the Tenant row. Falls back gracefully if
    // the request hasn't completed yet or the tenant row is missing.
    const clinicName = (tenant?.name || tenant?.shortName || '').toUpperCase() || '—';
    const clinicAddress = formatClinicAddress(tenant);
    const clinicPhone = tenant?.phone || '';
    const clinicEmail = tenant?.email || '';
    const clinicRegulatory = formatClinicRegulatory(tenant);
    // The subheader composes "address · TIN: ..." — only show TIN if present.
    const clinicSubheaderParts: string[] = [];
    if (clinicAddress) clinicSubheaderParts.push(clinicAddress);
    if (tenant?.taxId) clinicSubheaderParts.push(`TIN: ${tenant.taxId}`);
    if (clinicPhone) clinicSubheaderParts.push(`Tel: ${clinicPhone}`);
    const clinicSubheader = clinicSubheaderParts.join(' · ');

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: 800, padding: 0, background: 'white', color: '#1a1a1a' }}>
                <div className={styles.modalHeader} style={{ background: '#f1f5f9', color: '#1a1a1a', borderBottom: '1px solid #cbd5e1' }}>
                    <h3>{isCreditNote ? 'Credit Note Preview' : 'Invoice Preview'} — {invoice.invoiceNumber}</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className={styles.btnSecondary} onClick={handlePrint}>🖨️ Print</button>
                        <button className={styles.btnClose} onClick={onClose}>&times;</button>
                    </div>
                </div>
                <div style={{ padding: 32 }} className="printable-invoice">
                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                        {tenant?.logoUrl ? (
                            <img src={tenant.logoUrl} alt={clinicName} style={{ maxHeight: 60, marginBottom: 4 }} />
                        ) : null}
                        <h1 style={{ margin: 0, fontSize: 22 }}>{clinicName}</h1>
                        {clinicSubheader && (
                            <p style={{ margin: '4px 0', fontSize: 12, color: '#64748b' }}>{clinicSubheader}</p>
                        )}
                        {clinicEmail && (
                            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b' }}>{clinicEmail}</p>
                        )}
                        {clinicRegulatory && (
                            <p style={{ margin: '0 0 8px', fontSize: 11, color: '#94a3b8' }}>{clinicRegulatory}</p>
                        )}
                        <h2 style={{ margin: '12px 0 0', fontSize: 16, letterSpacing: 2, textTransform: 'uppercase' }}>
                            {isCreditNote ? 'CREDIT NOTE' : (invoice.invoiceType === 'RECEIPT' ? 'RECEIPT' : 'TAX INVOICE')}
                        </h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16, fontSize: 13 }}>
                        <div>
                            <strong>Bill To:</strong><br />
                            {client}<br />
                            {invoice.customerTin && <>TIN: {invoice.customerTin}<br /></>}
                            {invoice.customerAddress && <>{invoice.customerAddress}<br /></>}
                            {invoice.customerEmail && <>{invoice.customerEmail}</>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <strong>Invoice #:</strong> {invoice.invoiceNumber}<br />
                            <strong>Date:</strong> {new Date(invoice.invoiceDate).toLocaleDateString()}<br />
                            {invoice.dueDate && <><strong>Due:</strong> {new Date(invoice.dueDate).toLocaleDateString()}<br /></>}
                            {invoice.insurance && <><strong>Insurance:</strong> {invoice.insurance.name}<br /></>}
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>#</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Item</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Qty</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Unit</th>
                                <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.lines.map((l: any) => (
                                <tr key={l.id}>
                                    <td style={{ padding: '6px 12px', borderBottom: '1px solid #e2e8f0' }}>{l.lineNumber}</td>
                                    <td style={{ padding: '6px 12px', borderBottom: '1px solid #e2e8f0' }}>{l.itemName}</td>
                                    <td style={{ padding: '6px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>{l.quantity}</td>
                                    <td style={{ padding: '6px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>{fmt(l.unitPrice)}</td>
                                    <td style={{ padding: '6px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>{fmt(l.lineTotal)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={4} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Subtotal</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(invoice.totalAmount)}</td>
                            </tr>
                            <tr>
                                <td colSpan={4} style={{ padding: '8px 12px', textAlign: 'right' }}>Amount Paid</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#059669' }}>{fmt(invoice.amountPaid)}</td>
                            </tr>
                            <tr style={{ borderTop: '2px solid #1a1a1a' }}>
                                <td colSpan={4} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14 }}>Balance Due</td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: invoice.balanceDue > 0 ? '#dc2626' : '#059669' }}>{fmt(invoice.balanceDue)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    {isCreditNote && invoice.creditReason && (
                        <div style={{ marginBottom: 16, padding: 12, background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, fontSize: 13 }}>
                            <strong>Reason:</strong> {invoice.creditReason}
                        </div>
                    )}

                    <div style={{ marginTop: 32, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
                        Thank you for choosing {clinicName}. This is a {isCreditNote ? 'credit note' : 'computer-generated invoice'}.
                    </div>
                </div>
            </div>
        </div>
    );
}
