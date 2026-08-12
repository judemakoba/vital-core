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
