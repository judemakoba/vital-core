"use client";

import { useState } from "react";
import { ShieldCheck, ShieldX, AlertCircle, RefreshCw, CheckCircle2, XCircle, Clock, History } from "lucide-react";
import styles from "./visit.module.css";
const visitStyles = styles;
import { useSession } from "next-auth/react";

interface InsuranceEnrollment {
    id: string;
    insuranceId: string;
    memberNumber: string;
    policyNumber: string;
    status: string;
    isActive: boolean;
    coverageStart: string | null;
    coverageEnd: string | null;
    insurance: { id: string; name: string; code: string };
}

interface InsuranceVerification {
    id: string;
    status: 'PENDING' | 'APPROVED' | 'DENIED' | 'ERROR';
    verificationNumber: string | null;
    reason: string | null;
    provider: string | null;
    createdAt: string;
    coverageLimit: number | null;
    deductibleRemaining: number | null;
    coverageValidFrom: string | null;
    coverageValidTo: string | null;
    verifiedBy?: { name: string } | null;
    insurance?: { name: string; code: string } | null;
}

interface InsuranceValidationCardProps {
    visitId: string;
    visitStatus: string;
    enrollments: InsuranceEnrollment[];
    verifications: InsuranceVerification[];
    onVerificationComplete: () => void;
}

/**
 * R48 — Insurance validation card (FALLBACK only).
 *
 * Insurance validation now happens on the CREATE-VISIT FORM. The
 * cashier runs the third-party check before submitting the visit
 * creation. This card is the FALLBACK for visits that are still
 * parked at PendingInsuranceValidation (cashier skipped on the form,
 * or got ERROR and wants to retry). It also shows the verification
 * history once the visit has been validated.
 *
 * Three render modes:
 *
 *  1. NO INSURANCE ON FILE
 *     - Returns null (the visit was created as cash — nothing to show)
 *
 *  2. PENDING VALIDATION
 *     - Big "Validate Insurance" button (cashier retry)
 *     - Optional `force` param for admins (APPROVE / DENY / ERROR)
 *
 *  3. ALREADY VALIDATED (visit status past PendingInsuranceValidation)
 *     - "Insurance verified APPROVED at 12:34 — covers UGX 5,000,000"
 *     - Verification history (most recent first)
 *     - "Re-verify" button to call the third-party again
 */
export default function InsuranceValidationCard({
    visitId,
    visitStatus,
    enrollments,
    verifications,
    onVerificationComplete,
}: InsuranceValidationCardProps) {
    const { data: session } = useSession();
    const isAdmin = (session?.user as any)?.role === "ADMIN" || (session?.user as any)?.role === "SUPER_ADMIN";
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAdminTools, setShowAdminTools] = useState(false);

    const activeEnrollment = enrollments.find((e) => e.isActive) ?? null;
    const lastVerification = verifications[0] ?? null;

    const isPending = visitStatus === "PendingInsuranceValidation";
    const showReverify = !isPending && activeEnrollment;

    // No enrollment at all → no insurance option, cash flow
    if (!activeEnrollment) {
        return null; // (the visit was created as cash — nothing to show)
    }

    const callVerify = async (force: 'AUTO' | 'APPROVE' | 'DENY' | 'ERROR' = 'AUTO') => {
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/visits/${visitId}/verify-insurance`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force }),
            });
            const data = await res.json();
            if (res.ok) {
                onVerificationComplete();
            } else {
                setError(data.error || data.details || 'Verification failed');
            }
        } catch (e: any) {
            setError(e.message || 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (s: string | null) => {
        if (!s) return '—';
        return new Date(s).toLocaleString();
    };

    const statusIcon = (s: string) => {
        if (s === 'APPROVED') return <CheckCircle2 size={14} color="var(--success-color, #059669)" />;
        if (s === 'DENIED') return <XCircle size={14} color="var(--danger-color, #dc2626)" />;
        if (s === 'ERROR') return <AlertCircle size={14} color="var(--danger-color, #dc2626)" />;
        return <Clock size={14} color="var(--text-muted)" />;
    };

    return (
        <div className={visitStyles.section}>
            <div className={visitStyles.sectionHeader}>
                <ShieldCheck size={15} color="var(--primary-color)" />
                <span className={visitStyles.sectionTitle}>Insurance Validation</span>
                {lastVerification && (
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {statusIcon(lastVerification.status)}
                        Last: {lastVerification.status} on {new Date(lastVerification.createdAt).toLocaleDateString()}
                    </span>
                )}
            </div>

            {/* Enrollment on file */}
            <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={14} color="var(--primary-color)" />
                    <strong>{activeEnrollment.insurance.name}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>
                        ({activeEnrollment.insurance.code}) — Policy: {activeEnrollment.policyNumber}, Member: {activeEnrollment.memberNumber}
                    </span>
                </div>
                {activeEnrollment.coverageEnd && (
                    <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        Local coverage dates: {activeEnrollment.coverageStart ? new Date(activeEnrollment.coverageStart).toLocaleDateString() : '?'} — {new Date(activeEnrollment.coverageEnd).toLocaleDateString()}
                        <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>
                            (informational only — actual validation is via the third-party system)
                        </span>
                    </div>
                )}
            </div>

            {/* Pending state: big validate button */}
            {isPending && (
                <div style={{ padding: '0.5rem 0.75rem' }}>
                    <div style={{
                        padding: '0.625rem 0.75rem',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: 6,
                        fontSize: '0.82rem',
                        color: 'var(--text-primary)',
                        marginBottom: 10,
                    }}>
                        <strong>Awaiting third-party validation.</strong> The cashier skipped validation
                        when creating this visit. Run the check now with {activeEnrollment.insurance.name}
                        to advance the visit.
                    </div>

                    {!showAdminTools ? (
                        <button
                            onClick={() => callVerify('AUTO')}
                            disabled={submitting}
                            className={visitStyles.validateInsuranceBtn}
                        >
                            <ShieldCheck size={14} />
                            {submitting ? 'Validating with provider…' : 'Validate Insurance with Provider'}
                        </button>
                    ) : (
                        <div className={visitStyles.adminTools}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                                Admin tools — pick a forced result to test the UI
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button onClick={() => callVerify('APPROVE')} disabled={submitting} className={visitStyles.adminBtn}>Force APPROVE</button>
                                <button onClick={() => callVerify('DENY')} disabled={submitting} className={visitStyles.adminBtn}>Force DENY</button>
                                <button onClick={() => callVerify('ERROR')} disabled={submitting} className={visitStyles.adminBtn}>Force ERROR</button>
                                <button onClick={() => callVerify('AUTO')} disabled={submitting} className={visitStyles.adminBtn}>Run AUTO</button>
                            </div>
                        </div>
                    )}

                    {isAdmin && (
                        <div style={{ marginTop: 8 }}>
                            <button
                                onClick={() => setShowAdminTools((s) => !s)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                                {showAdminTools ? 'Hide admin tools' : 'Show admin tools (force result)'}
                            </button>
                        </div>
                    )}

                    {error && (
                        <div style={{ color: 'var(--danger-color, #dc2626)', fontSize: '0.8rem', marginTop: 8 }}>
                            <AlertCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                            {error}
                        </div>
                    )}
                </div>
            )}

            {/* Already validated: re-verify + history */}
            {!isPending && (lastVerification || showReverify) && (
                <div style={{ padding: '0.5rem 0.75rem' }}>
                    {lastVerification && (
                        <div style={{
                            padding: '0.625rem 0.75rem',
                            background: lastVerification.status === 'APPROVED'
                                ? 'rgba(16, 185, 129, 0.06)'
                                : lastVerification.status === 'DENIED'
                                    ? 'rgba(239, 68, 68, 0.06)'
                                    : 'rgba(245, 158, 11, 0.06)',
                            border: `1px solid ${lastVerification.status === 'APPROVED'
                                ? 'rgba(16, 185, 129, 0.3)'
                                : lastVerification.status === 'DENIED'
                                    ? 'rgba(239, 68, 68, 0.3)'
                                    : 'rgba(245, 158, 11, 0.3)'}`,
                            borderRadius: 6,
                            fontSize: '0.82rem',
                            marginBottom: 10,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                {statusIcon(lastVerification.status)}
                                <strong>Verification: {lastVerification.status}</strong>
                                {lastVerification.verificationNumber && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                        #{lastVerification.verificationNumber}
                                    </span>
                                )}
                            </div>
                            {lastVerification.reason && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                    {lastVerification.reason}
                                </div>
                            )}
                            {lastVerification.status === 'APPROVED' && lastVerification.coverageLimit != null && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
                                    Coverage limit: UGX {Number(lastVerification.coverageLimit).toLocaleString()} ·
                                    Deductible remaining: UGX {Number(lastVerification.deductibleRemaining || 0).toLocaleString()}
                                </div>
                            )}
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>
                                By {lastVerification.verifiedBy?.name ?? 'system'} on {formatDate(lastVerification.createdAt)}
                                {lastVerification.provider ? ` via ${lastVerification.provider}` : ''}
                            </div>
                        </div>
                    )}

                    {showReverify && (
                        <button
                            onClick={() => callVerify('AUTO')}
                            disabled={submitting}
                            className={visitStyles.reverifyInsuranceBtn}
                        >
                            <RefreshCw size={13} />
                            {submitting ? 'Re-verifying…' : 'Re-verify with provider'}
                        </button>
                    )}

                    {/* Verification history (last 5) */}
                    {verifications.length > 1 && (
                        <details style={{ marginTop: 10 }}>
                            <summary style={{ fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <History size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                Verification history ({verifications.length})
                            </summary>
                            <div className={visitStyles.verificationHistory}>
                                {verifications.slice(0, 5).map((v) => (
                                    <div key={v.id} className={visitStyles.verificationHistoryItem}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {statusIcon(v.status)}
                                            <strong>{v.status}</strong>
                                            {v.verificationNumber && (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                                    #{v.verificationNumber}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            {formatDate(v.createdAt)} by {v.verifiedBy?.name ?? 'system'}
                                        </div>
                                        {v.reason && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                {v.reason}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}

                    {error && (
                        <div style={{ color: 'var(--danger-color, #dc2626)', fontSize: '0.8rem', marginTop: 8 }}>
                            <AlertCircle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                            {error}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
