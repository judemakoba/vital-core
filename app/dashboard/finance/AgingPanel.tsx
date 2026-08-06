'use client';

import { useEffect, useState } from 'react';
import styles from './finance.module.css';
import { Receipt, Building2 } from 'lucide-react';

interface AgingItem {
    id: string;
    invoiceNumber: string;
    type: string;
    patient: string;
    patientNumber?: string;
    invoiceDate: string;
    balanceDue: number;
    daysOverdue: number;
    bucket: '0-30' | '31-60' | '61-90' | '90+';
}

interface AgingData {
    buckets: { '0-30': number; '31-60': number; '61-90': number; '90+': number };
    items: AgingItem[];
    counts: { total: number; legacy: number; tax: number };
    totalOutstanding: number;
}

interface InsuranceAgingItem {
    id: string;
    claimNumber: string;
    daysOld: number;
    outstanding: number;
    bucket: '0-30' | '31-60' | '61-90' | '90+';
    status: string;
    insurance: { name: string; code: string };
    patient: { firstName: string; lastName: string; patientNumber: string };
}

interface InsuranceAgingData {
    buckets: { '0-30': number; '31-60': number; '61-90': number; '90+': number };
    items: InsuranceAgingItem[];
    totalOutstanding: number;
    counts: { total: number; submitted: number; acknowledged: number; approved: number; rejected: number; appealed: number };
}

const BUCKET_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
    '0-30': { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', text: '#10b981', label: 'Current' },
    '31-60': { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', text: '#f59e0b', label: '31-60 days' },
    '61-90': { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)', text: '#f97316', label: '61-90 days' },
    '90+': { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: '#ef4444', label: '90+ days' },
};

const fmt = (n: number) => `UGX ${n.toLocaleString('en-UG')}`;

export default function AgingPanel() {
    const [patient, setPatient] = useState<AgingData | null>(null);
    const [insurance, setInsurance] = useState<InsuranceAgingData | null>(null);
    const [loading, setLoading] = useState(true);

    // R49: insurance feature flag. When OFF, skip the insurance aging
    // fetch entirely and don't render the section. The patient AR
    // aging section is unaffected.
    const [insuranceEnabled, setInsuranceEnabled] = useState(true);
    useEffect(() => {
        fetch("/api/insurance/enabled", { credentials: "include" })
            .then(r => r.ok ? r.json() : { enabled: true })
            .then(data => setInsuranceEnabled(data.enabled !== false))
            .catch(() => setInsuranceEnabled(true));
    }, []);

    useEffect(() => {
        const fetches: Promise<any>[] = [fetch('/api/finance/aging').then(r => r.json())];
        // R49: only fetch the insurance aging bucket when the feature is on
        if (insuranceEnabled) {
            fetches.push(fetch('/api/finance/aging/insurance').then(r => r.json()));
        }
        Promise.all(fetches)
            .then((results) => {
                setPatient(results[0]);
                if (insuranceEnabled) {
                    setInsurance(results[1]);
                } else {
                    setInsurance(null);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [insuranceEnabled]);

    if (loading) {
        return (
            <div className={styles.card}>
                <div className={styles.cardHeader}><h3>⏰ Receivables Aging</h3></div>
                <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>
            </div>
        );
    }

    const patientEmpty = !patient || patient.items.length === 0;
    const insuranceEmpty = !insurance || insurance.items.length === 0;

    if (patientEmpty && insuranceEmpty) {
        return (
            <div className={styles.card}>
                <div className={styles.cardHeader}><h3>⏰ Receivables Aging</h3></div>
                <div className={styles.emptyState}>
                    <p>✅ No outstanding receivables — all invoices paid up.</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!patientEmpty && <PatientAgingSection data={patient!} />}
            {!insuranceEmpty && <InsuranceAgingSection data={insurance!} />}
        </div>
    );
}

function PatientAgingSection({ data }: { data: AgingData }) {
    const maxBucket = Math.max(...Object.values(data.buckets), 1);
    const oldest = data.items[0];
    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}>
                <h3>
                    <Receipt size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    Patient AR Aging
                </h3>
                <span className={styles.badge}>{data.counts.total} open · {fmt(data.totalOutstanding)}</span>
            </div>

            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {(['0-30', '31-60', '61-90', '90+'] as const).map(b => {
                    const c = BUCKET_COLORS[b];
                    const amount = data.buckets[b];
                    const pct = (amount / maxBucket) * 100;
                    return (
                        <div key={b} style={{
                            padding: 10, background: c.bg, border: `1px solid ${c.border}`,
                            borderRadius: 6,
                        }}>
                            <div style={{ fontSize: 10, color: c.text, textTransform: 'uppercase', fontWeight: 600 }}>
                                {c.label}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: c.text, fontFamily: 'monospace', margin: '4px 0' }}>
                                {amount > 0 ? fmt(amount) : '—'}
                            </div>
                            <div style={{ height: 3, background: 'var(--border-color)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: c.text, borderRadius: 2 }} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {oldest && oldest.daysOverdue > 90 && (
                <div style={{
                    margin: '0 16px 12px', padding: '8px 12px', borderRadius: 6,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: 12, color: '#ef4444',
                }}>
                    ⚠️ Oldest overdue: <strong>{oldest.invoiceNumber}</strong> ({oldest.patient}) — {oldest.daysOverdue} days · {fmt(oldest.balanceDue)}
                </div>
            )}

            <div style={{ padding: '0 16px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Invoice</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Patient</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Age</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.slice(0, 6).map(item => {
                            const c = BUCKET_COLORS[item.bucket];
                            return (
                                <tr key={item.id}>
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11 }}>{item.invoiceNumber}</td>
                                    <td style={{ padding: '6px 8px' }}>{item.patient}</td>
                                    <td style={{ padding: '6px 8px', color: c.text, fontWeight: 600 }}>{item.daysOverdue}d</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: c.text }}>{fmt(item.balanceDue)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {data.items.length > 6 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
                        +{data.items.length - 6} more — see Tax Invoices tab
                    </div>
                )}
            </div>
        </div>
    );
}

function InsuranceAgingSection({ data }: { data: InsuranceAgingData }) {
    const maxBucket = Math.max(...Object.values(data.buckets), 1);
    const oldest = data.items[0];
    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}>
                <h3>
                    <Building2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    Insurance AR Aging
                </h3>
                <span className={styles.badge}>
                    {data.counts.total} claims · {fmt(data.totalOutstanding)}
                    {data.counts.rejected > 0 && <span style={{ color: 'var(--danger-color)', marginLeft: 6 }}>· {data.counts.rejected} denied</span>}
                </span>
            </div>

            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {(['0-30', '31-60', '61-90', '90+'] as const).map(b => {
                    const c = BUCKET_COLORS[b];
                    const amount = data.buckets[b];
                    const pct = (amount / maxBucket) * 100;
                    return (
                        <div key={b} style={{
                            padding: 10, background: c.bg, border: `1px solid ${c.border}`,
                            borderRadius: 6,
                        }}>
                            <div style={{ fontSize: 10, color: c.text, textTransform: 'uppercase', fontWeight: 600 }}>
                                {c.label}
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: c.text, fontFamily: 'monospace', margin: '4px 0' }}>
                                {amount > 0 ? fmt(amount) : '—'}
                            </div>
                            <div style={{ height: 3, background: 'var(--border-color)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: c.text, borderRadius: 2 }} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {oldest && oldest.daysOld > 60 && (
                <div style={{
                    margin: '0 16px 12px', padding: '8px 12px', borderRadius: 6,
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                    fontSize: 12, color: '#f59e0b',
                }}>
                    ⏰ Oldest claim: <strong>{oldest.claimNumber}</strong> ({oldest.patient.firstName} {oldest.patient.lastName}) — {oldest.daysOld} days · {fmt(oldest.outstanding)} outstanding
                </div>
            )}

            <div style={{ padding: '0 16px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Claim</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Insurance</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Status</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Age</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Outstanding</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.slice(0, 6).map(item => {
                            const c = BUCKET_COLORS[item.bucket];
                            return (
                                <tr key={item.id}>
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11 }}>{item.claimNumber}</td>
                                    <td style={{ padding: '6px 8px', fontSize: 11 }}>{item.insurance.name}</td>
                                    <td style={{ padding: '6px 8px', fontSize: 11 }}>{item.status}</td>
                                    <td style={{ padding: '6px 8px', color: c.text, fontWeight: 600 }}>{item.daysOld}d</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: c.text }}>{fmt(item.outstanding)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {data.items.length > 6 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
                        +{data.items.length - 6} more — see /dashboard/admin/insurance/claims → AR-Insurance Aging
                    </div>
                )}
            </div>
        </div>
    );
}
