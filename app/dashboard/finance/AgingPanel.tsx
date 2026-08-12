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
    const [data, setData] = useState<AgingData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/finance/aging')
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <Receipt size={18} /> Accounts Receivable Aging
                </div>
                <div style={{ padding: 16 }}>Loading…</div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <Receipt size={18} /> Accounts Receivable Aging
                </div>
                <div style={{ padding: 16 }}>No data available.</div>
            </div>
        );
    }

    const maxBucket = Math.max(data.buckets['0-30'], data.buckets['31-60'], data.buckets['61-90'], data.buckets['90+'], 1);

    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}>
                <Receipt size={18} /> Accounts Receivable Aging
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
                            <div style={{ height: 4, background: c.border, borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: c.text }} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {data.items.length > 0 && (
                <div style={{ padding: '0 16px 16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Invoice</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Patient</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Date</th>
                                <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.items.slice(0, 6).map(item => {
                                const c = BUCKET_COLORS[item.bucket];
                                return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11 }}>{item.invoiceNumber}</td>
                                        <td style={{ padding: '6px 8px', fontSize: 11 }}>{item.patient}</td>
                                        <td style={{ padding: '6px 8px', fontSize: 11 }}>{item.invoiceDate} <span style={{ color: c.text }}>({item.daysOverdue}d)</span></td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: c.text }}>{fmt(item.balanceDue)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {data.items.length > 6 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
                            +{data.items.length - 6} more
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
