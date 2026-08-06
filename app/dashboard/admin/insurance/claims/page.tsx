'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, Search, Filter, FileText, CheckCircle, XCircle, Clock,
    DollarSign, Activity, AlertCircle, ChevronRight, X, Send,
    Ban, RotateCcw, ThumbsUp, ThumbsDown, BarChart3, Layers, Receipt,
    TrendingUp, AlertTriangle, RefreshCw
} from 'lucide-react';
import styles from './page.module.css';

interface Claim {
    id: string;
    claimNumber: string;
    status: string;
    claimDate: string;
    submissionDate?: string | null;
    approvalDate?: string | null;
    paymentDate?: string | null;
    denialDate?: string | null;
    totalAmount: number;
    eligibleAmount: number;
    approvedAmount?: number | null;
    allowedAmount?: number | null;
    contractualAdjAmount?: number | null;
    denialReasonCode?: string | null;
    denialCategory?: string | null;
    denialReason?: string | null;
    denialWriteOffAmount?: number | null;
    appealStatus?: string | null;
    appealReason?: string | null;
    originalClaimId?: string | null;
    isResubmission?: boolean;
    resubmissionCount: number;
    postedToLedger: boolean;
    writeOffPostedToLedger: boolean;
    insurance: { name: string; code: string };
    patient: { firstName: string; lastName: string; patientNumber: string };
    invoice?: { invoiceNumber: string; totalAmount: number };
}

type Tab = 'claims' | 'denials' | 'aging';

export default function ClaimsDashboardPage() {
    const [tab, setTab] = useState<Tab>('claims');
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <Link href="/dashboard/admin/insurance" className={styles.backLink}>
                        <ArrowLeft size={16} /> Back to Insurance Settings
                    </Link>
                    <h1 className={styles.title}>Claims & Adjudication</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Submit, adjudicate, appeal, and write off insurance claims</p>
                </div>
            </header>

            <div className={styles.tabs}>
                <button onClick={() => setTab('claims')} className={tab === 'claims' ? styles.tabActive : styles.tab}>
                    <Receipt size={16} /> Claims
                </button>
                <button onClick={() => setTab('denials')} className={tab === 'denials' ? styles.tabActive : styles.tab}>
                    <BarChart3 size={16} /> Denial Analytics
                </button>
                <button onClick={() => setTab('aging')} className={tab === 'aging' ? styles.tabActive : styles.tab}>
                    <Layers size={16} /> AR-Insurance Aging
                </button>
            </div>

            {tab === 'claims' && <ClaimsList />}
            {tab === 'denials' && <DenialAnalytics />}
            {tab === 'aging' && <InsuranceAging />}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Claims List                                                                */
/* ──────────────────────────────────────────────────────────────────────────── */

function ClaimsList() {
    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeClaim, setActiveClaim] = useState<Claim | null>(null);

    const fetchClaims = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/admin/insurance/claims?status=${statusFilter}&limit=100`);
            if (!res.ok) throw new Error('Failed to load claims');
            const data = await res.json();
            setClaims(data.claims);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { fetchClaims(); }, [fetchClaims]);

    const filtered = claims.filter(c =>
        c.claimNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        `${c.patient.firstName} ${c.patient.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.insurance.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <>
            <div className={`glass-card ${styles.filtersCard}`}>
                <div className={styles.searchBox}>
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search claim #, patient, or provider…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className={styles.filterGroup}>
                    <Filter size={18} color="var(--text-muted)" />
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="ALL">All Statuses</option>
                        <option value="DRAFT">Drafts (Unsubmitted)</option>
                        <option value="SUBMITTED">Submitted (Awaiting Ack)</option>
                        <option value="ACKNOWLEDGED">Acknowledged (Awaiting Decision)</option>
                        <option value="APPROVED">Approved (Awaiting Payment)</option>
                        <option value="PAID">Paid</option>
                        <option value="REJECTED">Rejected</option>
                        <option value="PENDING_REPROCESSING">Pending Reprocessing</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className={styles.centerState}><Activity className="spin" size={32} /><p>Loading claims…</p></div>
            ) : error ? (
                <div className={styles.centerState}>
                    <AlertCircle size={32} color="var(--danger-color)" />
                    <p>{error}</p>
                    <button onClick={fetchClaims} className="btn-secondary">Retry</button>
                </div>
            ) : (
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Claim #</th>
                                <th>Date</th>
                                <th>Insurance</th>
                                <th>Patient</th>
                                <th style={{ textAlign: 'right' }}>Billed</th>
                                <th style={{ textAlign: 'right' }}>Approved</th>
                                <th style={{ textAlign: 'center' }}>Status</th>
                                <th style={{ textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }}>
                                    <p style={{ color: 'var(--text-muted)' }}>No claims match the current filter.</p>
                                </td></tr>
                            ) : filtered.map(claim => (
                                <tr key={claim.id} onClick={() => setActiveClaim(claim)} style={{ cursor: 'pointer' }}>
                                    <td>
                                        <strong>{claim.claimNumber}</strong>
                                        {claim.isResubmission && <span className={styles.resubBadge}> ↻</span>}
                                    </td>
                                    <td>{new Date(claim.claimDate).toLocaleDateString()}</td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{claim.insurance.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{claim.insurance.code}</div>
                                    </td>
                                    <td>
                                        <div>{claim.patient.firstName} {claim.patient.lastName}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{claim.patient.patientNumber}</div>
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(claim.totalAmount)}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                        {claim.approvedAmount ? fmt(claim.approvedAmount) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <StatusBadge status={claim.status} appealStatus={claim.appealStatus} />
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <ChevronRight size={16} color="var(--text-muted)" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeClaim && (
                <ClaimDetailModal
                    claim={activeClaim}
                    onClose={() => setActiveClaim(null)}
                    onChange={() => { setActiveClaim(null); fetchClaims(); }}
                />
            )}
        </>
    );
}

function StatusBadge({ status, appealStatus }: { status: string; appealStatus?: string | null }) {
    const cls = styles[`status_${status.toLowerCase()}`] ?? '';
    let label = status;
    if (status === 'REJECTED' && appealStatus === 'APPEALED') label = 'APPEALED';
    if (status === 'PENDING_REPROCESSING') label = 'PENDING APPEAL';
    return <span className={`${styles.statusBadge} ${cls}`}>{label}</span>;
}

function fmt(n: number) {
    return `UGX ${Number(n ?? 0).toLocaleString()}`;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Claim Detail Modal                                                          */
/* ──────────────────────────────────────────────────────────────────────────── */

function ClaimDetailModal({ claim, onClose, onChange }: { claim: Claim; onClose: () => void; onChange: () => void }) {
    const [detail, setDetail] = useState<any>(null);
    const [busy, setBusy] = useState(false);
    const [action, setAction] = useState<string | null>(null);
    const [codes, setCodes] = useState<any[]>([]);
    const [form, setForm] = useState<any>({});

    const load = useCallback(async () => {
        const res = await fetch(`/api/admin/insurance/claims/${claim.id}`);
        const data = await res.json();
        setDetail(data);
    }, [claim.id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        // Pre-fetch CARC codes for the reject dropdown
        fetch('/api/admin/insurance/claims/denials/codes').then(r => r.json()).then(d => setCodes(d.codes ?? []));
    }, []);

    const submit = async (act: string, body: any) => {
        try {
            setBusy(true);
            const res = await fetch(`/api/admin/insurance/claims/${claim.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: act, ...body }),
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.error || 'Action failed');
                return;
            }
            setAction(null);
            setForm({});
            await load();
            onChange();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setBusy(false);
        }
    };

    const c = detail ?? claim;
    const transitions: Record<string, string[]> = {
        DRAFT: ['transition:SUBMITTED'],
        SUBMITTED: ['adjudicate', 'reject'],
        ACKNOWLEDGED: ['adjudicate', 'reject'],
        APPROVED: ['transition:PAID'],
        REJECTED: ['appeal', 'resubmit'],
        PENDING_REPROCESSING: ['appealDecision', 'resubmit'],
    };
    const availableActions = transitions[c.status] ?? [];

    return (
        <div className={styles.modalBackdrop} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <div>
                        <h2>{c.claimNumber}</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                            {c.insurance?.name} · {c.patient?.firstName} {c.patient?.lastName} ({c.patient?.patientNumber})
                        </p>
                    </div>
                    <button onClick={onClose} className={styles.iconBtn}><X size={18} /></button>
                </div>

                {/* Action bar */}
                {availableActions.length > 0 && !action && (
                    <div className={styles.actionBar}>
                        {availableActions.includes('transition:SUBMITTED') && (
                            <button disabled={busy} onClick={() => submit('transition', { toStatus: 'SUBMITTED' })} className="btn-primary">
                                <Send size={14} /> Submit Claim
                            </button>
                        )}
                        {availableActions.includes('adjudicate') && (
                            <button disabled={busy} onClick={() => setAction('adjudicate')} className="btn-primary" style={{ background: 'var(--success-color)' }}>
                                <ThumbsUp size={14} /> Adjudicate (EOB)
                            </button>
                        )}
                        {availableActions.includes('reject') && (
                            <button disabled={busy} onClick={() => setAction('reject')} className="btn-secondary" style={{ color: 'var(--danger-color)' }}>
                                <Ban size={14} /> Reject
                            </button>
                        )}
                        {availableActions.includes('transition:PAID') && (
                            <button disabled={busy} onClick={() => submit('transition', { toStatus: 'PAID' })} className="btn-primary" style={{ background: 'var(--success-color)' }}>
                                <DollarSign size={14} /> Mark Paid
                            </button>
                        )}
                        {availableActions.includes('appeal') && (
                            <button disabled={busy} onClick={() => setAction('appeal')} className="btn-primary">
                                <RotateCcw size={14} /> File Appeal
                            </button>
                        )}
                        {availableActions.includes('appealDecision') && (
                            <>
                                <button disabled={busy} onClick={() => submit('appealDecision', { won: true })} className="btn-primary" style={{ background: 'var(--success-color)' }}>
                                    <ThumbsUp size={14} /> Appeal Won
                                </button>
                                <button disabled={busy} onClick={() => submit('appealDecision', { won: false })} className="btn-secondary" style={{ color: 'var(--danger-color)' }}>
                                    <ThumbsDown size={14} /> Appeal Lost
                                </button>
                            </>
                        )}
                        {availableActions.includes('resubmit') && (
                            <button disabled={busy} onClick={() => submit('resubmit', { notes: 'Resubmission of ' + c.claimNumber })} className="btn-primary">
                                <RefreshCw size={14} /> Resubmit
                            </button>
                        )}
                    </div>
                )}

                {/* Adjudicate (EOB) form */}
                {action === 'adjudicate' && (
                    <div className={styles.actionForm}>
                        <h4><ThumbsUp size={14} /> Record EOB / Adjudication</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Capture the Explanation of Benefits from the insurer. Allowed = what they say it should cost;
                            Approved = what they will actually pay.
                        </p>
                        <div className={styles.formGrid}>
                            <label>
                                <span>Allowed Amount *</span>
                                <input type="number" value={form.allowedAmount ?? ''} onChange={(e) => setForm({ ...form, allowedAmount: e.target.value })} placeholder={String(c.totalAmount)} />
                            </label>
                            <label>
                                <span>Approved Amount *</span>
                                <input type="number" value={form.approvedAmount ?? ''} onChange={(e) => setForm({ ...form, approvedAmount: e.target.value })} placeholder={String(c.insuranceNetAmount ?? c.totalAmount)} />
                            </label>
                            <label>
                                <span>Patient Responsibility</span>
                                <input type="number" value={form.patientResponsibility ?? ''} onChange={(e) => setForm({ ...form, patientResponsibility: e.target.value })} placeholder="Copay + deductible" />
                            </label>
                            <label>
                                <span>RARC Code(s)</span>
                                <input type="text" value={form.rarcCodes ?? ''} onChange={(e) => setForm({ ...form, rarcCodes: e.target.value })} placeholder="e.g. N30, M127" />
                            </label>
                            <label className={styles.fullWidth}>
                                <span>Notes</span>
                                <textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                            </label>
                        </div>
                        <div className={styles.formButtons}>
                            <button disabled={busy} onClick={() => setAction(null)} className="btn-secondary">Cancel</button>
                            <button disabled={busy} onClick={() => submit('adjudicate', form)} className="btn-primary">
                                Save EOB + Approve
                            </button>
                        </div>
                    </div>
                )}

                {/* Reject form */}
                {action === 'reject' && (
                    <div className={styles.actionForm}>
                        <h4><Ban size={14} /> Reject Claim</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Pick the CARC denial code. The AR will be written off to bad debt (Dr 5430 / Cr 1132) automatically.
                        </p>
                        <div className={styles.formGrid}>
                            <label className={styles.fullWidth}>
                                <span>Denial Reason (CARC) *</span>
                                <select value={form.reasonCode ?? ''} onChange={(e) => setForm({ ...form, reasonCode: e.target.value })}>
                                    <option value="">— Select a CARC code —</option>
                                    {Object.entries(groupCodesByCategory(codes)).map(([cat, list]) => (
                                        <optgroup key={cat} label={cat}>
                                            {list.map((c: any) => (
                                                <option key={c.code} value={c.code}>
                                                    [{c.carcCode}] {c.title} — {c.description}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span>RARC Code</span>
                                <input type="text" value={form.rarcCode ?? ''} onChange={(e) => setForm({ ...form, rarcCode: e.target.value })} placeholder="e.g. N30" />
                            </label>
                            <label>
                                <span>Write Off as Bad Debt?</span>
                                <select value={String(form.writeOffAsBadDebt ?? 'true')} onChange={(e) => setForm({ ...form, writeOffAsBadDebt: e.target.value === 'true' })}>
                                    <option value="true">Yes — Dr 5430 / Cr 1132</option>
                                    <option value="false">No — bill patient instead</option>
                                </select>
                            </label>
                            <label className={styles.fullWidth}>
                                <span>Free-text Reason</span>
                                <textarea value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} />
                            </label>
                        </div>
                        <div className={styles.formButtons}>
                            <button disabled={busy} onClick={() => setAction(null)} className="btn-secondary">Cancel</button>
                            <button disabled={busy || !form.reasonCode} onClick={() => submit('reject', form)} className="btn-primary" style={{ background: 'var(--danger-color)' }}>
                                Reject + Write Off
                            </button>
                        </div>
                    </div>
                )}

                {/* Appeal form */}
                {action === 'appeal' && (
                    <div className={styles.actionForm}>
                        <h4><RotateCcw size={14} /> File Appeal</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Move to PENDING_REPROCESSING. Once the insurer decides, log the appeal outcome.
                        </p>
                        <div className={styles.formGrid}>
                            <label className={styles.fullWidth}>
                                <span>Appeal Reason *</span>
                                <textarea value={form.appealReason ?? ''} onChange={(e) => setForm({ ...form, appealReason: e.target.value })} rows={3} placeholder="e.g. Service was medically necessary; clinical notes attached." />
                            </label>
                        </div>
                        <div className={styles.formButtons}>
                            <button disabled={busy} onClick={() => setAction(null)} className="btn-secondary">Cancel</button>
                            <button disabled={busy || !form.appealReason} onClick={() => submit('appeal', form)} className="btn-primary">Submit Appeal</button>
                        </div>
                    </div>
                )}

                {/* EOB / amounts summary */}
                <div className={styles.claimSummary}>
                    <SummaryRow label="Billed" value={fmt(c.totalAmount)} />
                    <SummaryRow label="Eligible" value={fmt(c.eligibleAmount)} />
                    {c.allowedAmount != null && <SummaryRow label="Allowed (EOB)" value={fmt(c.allowedAmount)} />}
                    {c.approvedAmount != null && <SummaryRow label="Approved (Paid)" value={fmt(c.approvedAmount)} highlight />}
                    {c.contractualAdjAmount != null && c.contractualAdjAmount > 0 && (
                        <SummaryRow label="Contractual Adj" value={fmt(c.contractualAdjAmount)} variant="warning" />
                    )}
                    {c.denialWriteOffAmount != null && c.denialWriteOffAmount > 0 && (
                        <SummaryRow label="Written Off (Bad Debt)" value={fmt(c.denialWriteOffAmount)} variant="danger" />
                    )}
                    {c.denialReasonCode && (
                        <div className={styles.denialBox}>
                            <AlertTriangle size={14} color="var(--danger-color)" />
                            <div>
                                <strong>{c.denialReasonCode}</strong>
                                {c.denialCategory && <span className={styles.catPill}>{c.denialCategory}</span>}
                                {c.denialReason && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.denialReason}</p>}
                            </div>
                        </div>
                    )}
                </div>

                {/* Adjudication log */}
                {detail?.adjudicationLogs && detail.adjudicationLogs.length > 0 && (
                    <div className={styles.logSection}>
                        <h4>Adjudication Log ({detail.adjudicationLogs.length})</h4>
                        <div className={styles.log}>
                            {detail.adjudicationLogs.map((l: any) => (
                                <div key={l.id} className={styles.logItem}>
                                    <div className={styles.logTime}>{new Date(l.performedAt).toLocaleString()}</div>
                                    <div className={styles.logBody}>
                                        <div>
                                            <span className={styles.actionPill}>{l.action}</span>
                                            {l.fromStatus && l.toStatus && l.fromStatus !== l.toStatus && (
                                                <span className={styles.statusFlow}>
                                                    {l.fromStatus} → {l.toStatus}
                                                </span>
                                            )}
                                            {l.reasonCode && <span className={styles.codePill}>{l.reasonCode}</span>}
                                        </div>
                                        {l.notes && <p>{l.notes}</p>}
                                        {l.amount != null && <p style={{ fontFamily: 'monospace' }}>Amount: {fmt(l.amount)}</p>}
                                        {l.performedBy && <small>by {l.performedBy.name ?? l.performedBy.email ?? 'system'}</small>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Resubmissions */}
                {detail?.resubmissions && detail.resubmissions.length > 0 && (
                    <div className={styles.logSection}>
                        <h4>Resubmissions ({detail.resubmissions.length})</h4>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                            {detail.resubmissions.map((r: any) => (
                                <li key={r.id}>
                                    <strong>{r.claimNumber}</strong> — {r.status}
                                    {r.denialReasonCode && <> · denied: {r.denialReasonCode}</>}
                                    <small style={{ color: 'var(--text-muted)' }}> · {new Date(r.claimDate).toLocaleDateString()}</small>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function SummaryRow({ label, value, highlight, variant }: { label: string; value: string; highlight?: boolean; variant?: 'warning' | 'danger' }) {
    const color = variant === 'danger' ? 'var(--danger-color)'
        : variant === 'warning' ? 'var(--warning-color)'
        : highlight ? 'var(--success-color)' : 'var(--text-primary)';
    return (
        <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>{label}</span>
            <span style={{ color, fontWeight: 600, fontFamily: 'monospace' }}>{value}</span>
        </div>
    );
}

function groupCodesByCategory(codes: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    for (const c of codes) {
        (groups[c.categoryLabel] ??= []).push(c);
    }
    return groups;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Denial Analytics                                                            */
/* ──────────────────────────────────────────────────────────────────────────── */

function DenialAnalytics() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/insurance/claims/denials/analytics')
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return <div className={styles.centerState}><Activity className="spin" size={32} /><p>Computing denial analytics…</p></div>;
    }
    if (!data) {
        return <div className={styles.centerState}><AlertCircle size={32} color="var(--danger-color)" /><p>Failed to load denial analytics.</p></div>;
    }

    const { summary, topReasons, byCategory, byInsurer, appealStats, monthlyTrend, writeOffByCategory } = data;

    return (
        <div className={styles.denialPage}>
            {/* KPI cards */}
            <div className={styles.kpiRow}>
                <KpiCard icon={<Receipt size={20} />} label="Total Claims" value={summary.totalClaims} color="#3b82f6" />
                <KpiCard icon={<XCircle size={20} />} label="Denied Claims" value={summary.deniedClaims} color="#ef4444" sub={`${summary.denialRate}% denial rate`} />
                <KpiCard icon={<DollarSign size={20} />} label="Write-Off Total" value={fmt(summary.writeOffTotal)} color="#dc2626" />
                <KpiCard icon={<TrendingUp size={20} />} label="Appeal Win Rate" value={`${Math.round(appealStats.winRate)}%`} color="#10b981" sub={`${appealStats.won} won / ${appealStats.lost} lost`} />
            </div>

            {/* Monthly trend */}
            <div className="glass-card" style={{ padding: 20 }}>
                <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TrendingUp size={18} /> Monthly Trend
                </h3>
                <div className={styles.trendChart}>
                    {monthlyTrend.map((m: any, i: number) => {
                        const max = Math.max(...monthlyTrend.map((x: any) => Math.max(x.total, x.denied)), 1);
                        const denialH = (m.denied / max) * 100;
                        const totalH = (m.total / max) * 100;
                        return (
                            <div key={i} className={styles.trendCol}>
                                <div className={styles.trendBars}>
                                    <div className={styles.trendBar} style={{ height: `${totalH}%`, background: '#3b82f6' }} title={`${m.total} claims`} />
                                    <div className={styles.trendBar} style={{ height: `${denialH}%`, background: '#ef4444' }} title={`${m.denied} denied`} />
                                </div>
                                <div className={styles.trendLabel}>{m.month}</div>
                                <div className={styles.trendValue}>{m.denied}/{m.total}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Two-column: top reasons + by category */}
            <div className={styles.denialGrid}>
                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px' }}>Top Denial Reasons (CARC)</h3>
                    {topReasons.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)' }}>No denials recorded.</p>
                    ) : topReasons.map((r: any, i: number) => {
                        const max = topReasons[0].count;
                        const pct = (r.count / max) * 100;
                        return (
                            <div key={r.code} className={styles.reasonRow}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontWeight: 500 }}>{r.code}</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.count} · {fmt(r.totalAmount)}</span>
                                </div>
                                <div className={styles.barTrack}>
                                    <div className={styles.barFill} style={{ width: `${pct}%`, background: 'var(--danger-color)' }} />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px' }}>By Category</h3>
                    {byCategory.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)' }}>No categorized denials.</p>
                    ) : byCategory.map((c: any) => {
                        const max = byCategory[0].count;
                        const pct = (c.count / max) * 100;
                        return (
                            <div key={c.category} className={styles.reasonRow}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span>
                                        <span className={styles.catDot} style={{ background: c.color }} />
                                        {c.label}
                                    </span>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{c.count} · {fmt(c.writeOffAmount)}</span>
                                </div>
                                <div className={styles.barTrack}>
                                    <div className={styles.barFill} style={{ width: `${pct}%`, background: c.color }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* By insurer */}
            <div className="glass-card" style={{ padding: 20 }}>
                <h3 style={{ margin: '0 0 16px' }}>Denial Rate by Insurer</h3>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Insurance</th>
                            <th style={{ textAlign: 'right' }}>Total Claims</th>
                            <th style={{ textAlign: 'right' }}>Denied</th>
                            <th style={{ textAlign: 'right' }}>Denial Rate</th>
                            <th style={{ textAlign: 'right' }}>Write-Off</th>
                        </tr>
                    </thead>
                    <tbody>
                        {byInsurer.map((i: any) => (
                            <tr key={i.insuranceId}>
                                <td>
                                    <div style={{ fontWeight: 500 }}>{i.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{i.code}</div>
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{i.totalClaims}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{i.deniedClaims}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                    <span style={{ color: i.denialRate > 25 ? 'var(--danger-color)' : i.denialRate > 10 ? 'var(--warning-color)' : 'var(--success-color)' }}>
                                        {i.denialRate.toFixed(1)}%
                                    </span>
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(i.writeOffAmount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function KpiCard({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: number | string; color: string; sub?: string }) {
    return (
        <div className="glass-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace' }}>{value}</div>
                {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</div>}
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Insurance AR Aging                                                          */
/* ──────────────────────────────────────────────────────────────────────────── */

function InsuranceAging() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/finance/aging/insurance')
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return <div className={styles.centerState}><Activity className="spin" size={32} /><p>Loading AR-Insurance aging…</p></div>;
    }
    if (!data) {
        return <div className={styles.centerState}><AlertCircle size={32} color="var(--danger-color)" /><p>Failed to load insurance AR aging.</p></div>;
    }

    const BUCKET_COLORS: Record<string, { bg: string; text: string; label: string }> = {
        '0-30':  { bg: 'rgba(34,197,94,0.08)',  text: '#10b981', label: '0-30 days' },
        '31-60': { bg: 'rgba(245,158,11,0.08)', text: '#f59e0b', label: '31-60 days' },
        '61-90': { bg: 'rgba(249,115,22,0.08)', text: '#f97316', label: '61-90 days' },
        '90+':   { bg: 'rgba(239,68,68,0.08)',  text: '#ef4444', label: '90+ days' },
    };

    return (
        <div>
            <div className={styles.kpiRow}>
                <KpiCard icon={<DollarSign size={20} />} label="Total Insurance AR" value={fmt(data.totalOutstanding)} color="#6366f1" sub={`${data.counts.total} claims outstanding`} />
                <KpiCard icon={<Clock size={20} />} label="Submitted" value={data.counts.submitted} color="#3b82f6" sub="Awaiting acknowledgment" />
                <KpiCard icon={<CheckCircle size={20} />} label="Approved" value={data.counts.approved} color="#10b981" sub="Awaiting payment" />
                <KpiCard icon={<XCircle size={20} />} label="Rejected" value={data.counts.rejected} color="#ef4444" sub={`${data.counts.appealed} appealed`} />
            </div>

            <div className="glass-card" style={{ padding: 20, marginTop: 20 }}>
                <h3 style={{ margin: '0 0 16px' }}>Aging Buckets</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {(['0-30', '31-60', '61-90', '90+'] as const).map(b => {
                        const c = BUCKET_COLORS[b];
                        const amt = data.buckets[b];
                        const max = Math.max(...Object.values(data.buckets).map(v => Number(v)), 1);
                        const pct = (Number(amt) / max) * 100;
                        return (
                            <div key={b} style={{ padding: 14, background: c.bg, border: `1px solid ${c.text}33`, borderRadius: 8 }}>
                                <div style={{ fontSize: '0.7rem', color: c.text, textTransform: 'uppercase', fontWeight: 600 }}>{c.label}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: c.text, fontFamily: 'monospace', margin: '4px 0' }}>
                                    {Number(amt) > 0 ? fmt(Number(amt)) : '—'}
                                </div>
                                <div style={{ height: 4, background: 'rgba(0,0,0,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: c.text, borderRadius: 2 }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="glass-card" style={{ padding: 20, marginTop: 20 }}>
                <h3 style={{ margin: '0 0 16px' }}>Outstanding Claims ({data.items.length})</h3>
                {data.items.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>✅ No outstanding insurance claims.</p>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Claim #</th>
                                <th>Patient</th>
                                <th>Insurance</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Days Old</th>
                                <th style={{ textAlign: 'right' }}>Outstanding</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.items.slice(0, 25).map((i: any) => (
                                <tr key={i.id}>
                                    <td style={{ fontFamily: 'monospace' }}>{i.claimNumber}</td>
                                    <td>{i.patient.firstName} {i.patient.lastName}</td>
                                    <td>{i.insurance.name}</td>
                                    <td><StatusBadge status={i.status} appealStatus={i.appealStatus} /></td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{i.daysOld}d</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(i.outstanding)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {data.byInsurer && data.byInsurer.length > 0 && (
                <div className="glass-card" style={{ padding: 20, marginTop: 20 }}>
                    <h3 style={{ margin: '0 0 16px' }}>By Insurer</h3>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Insurance</th>
                                <th style={{ textAlign: 'right' }}>Open Claims</th>
                                <th style={{ textAlign: 'right' }}>Outstanding</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.byInsurer.map((i: any) => (
                                <tr key={i.insuranceId}>
                                    <td>{i.name} <small style={{ color: 'var(--text-muted)' }}>({i.code})</small></td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{i.count}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(i.outstanding)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
