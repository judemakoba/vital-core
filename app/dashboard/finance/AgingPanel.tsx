'use client';

import { useEffect, useState } from 'react';
import styles from './finance.module.css';
import { Receipt } from 'lucide-react';

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



const BUCKET_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
    '0-30': { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)', text: '#10b981', label: 'Current' },
    '31-60': { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', text: '#f59e0b', label: '31-60 days' },
    '61-90': { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)', text: '#f97316', label: '61-90 days' },
    '90+': { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: '#ef4444', label: '90+ days' },
};

const fmt = (n: number) => `UGX ${n.toLocaleString('en-UG')}`;

export default function AgingPanel() {
    const [patient, setPatient] = useState<AgingData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/finance/aging')
            .then(r => r.json())
            .then(data => { setPatient(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className={styles.card}>
                <div className={styles.cardHeader}><h3>⏰ Receivables Aging</h3></div>
                <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>
            </div>
        );
    }

    const patientEmpty = !patient || patient.items.length === 0;

    if (patientEmpty) {
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

