'use client';

import { useState, useEffect } from 'react';
import { Shield, Plus, CheckCircle2, Clock, XCircle, ChevronDown, X, Activity } from 'lucide-react';

interface Enrollment {
    id: string;
    insuranceId: string;
    policyNumber: string;
    memberNumber: string | null;
    coverageStart: string;
    coverageEnd: string | null;
    status: string;
    isActive: boolean;
    verifiedAt: string | null;
    insurance: { id: string; name: string; code: string };
    verifiedBy: { id: string; name: string } | null;
}

interface Props {
    patientId: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    VERIFIED: { bg: '#dcfce7', color: '#166534', icon: <CheckCircle2 size={13} /> },
    PENDING: { bg: '#fef3c7', color: '#92400e', icon: <Clock size={13} /> },
    REJECTED: { bg: '#fee2e2', color: '#991b1b', icon: <XCircle size={13} /> },
    EXPIRED: { bg: '#f3f4f6', color: '#6b7280', icon: <XCircle size={13} /> },
};

export default function InsuranceEnrollmentPanel({ patientId }: Props) {
    const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
    const [companies, setCompanies] = useState<{ id: string; name: string; code: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedCompanyId, setSelectedCompanyId] = useState('');

    const [form, setForm] = useState({
        insuranceId: '',
        policyNumber: '',
        memberNumber: '',
        coverageStart: new Date().toISOString().split('T')[0],
        coverageEnd: '',
    });

    useEffect(() => {
        fetchEnrollments();
        fetchCompanies();
    }, [patientId]);

    const fetchEnrollments = async () => {
        try {
            const res = await fetch(`/api/patients/${patientId}/insurance`);
            if (res.ok) setEnrollments(await res.json());
        } catch (e) {
            console.error('Failed to fetch enrollments', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchCompanies = async () => {
        try {
            const res = await fetch('/api/admin/insurance');
            if (res.ok) setCompanies(await res.json());
        } catch (e) { }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch(`/api/patients/${patientId}/insurance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to save');
                return;
            }
            setShowModal(false);
            setForm({ insuranceId: '', policyNumber: '', memberNumber: '', coverageStart: new Date().toISOString().split('T')[0], coverageEnd: '' });
            setSelectedCompanyId('');
            fetchEnrollments();
        } catch (e) {
            alert('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleVerify = async (enrollmentId: string) => {
        if (!confirm('Mark this enrollment as VERIFIED? (Confirm with third party first)')) return;
        try {
            const res = await fetch(`/api/patients/${patientId}/insurance`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enrollmentId, status: 'VERIFIED' }),
            });
            if (res.ok) fetchEnrollments();
            else alert('Failed to verify enrollment');
        } catch (e) {
            alert('Network error.');
        }
    };

    const activeEnrollment = enrollments.find(e => e.isActive);

    return (
        <div className="enrollment-panel glass-card">
            <div className="panel-header">
                <div className="panel-title">
                    <Shield size={18} />
                    <h3>Insurance Coverage</h3>
                </div>
                <button className="btn-add-enroll" onClick={() => setShowModal(true)}>
                    <Plus size={15} />
                    Enroll
                </button>
            </div>

            {loading ? (
                <div className="panel-loading"><Activity size={20} className="spin" /></div>
            ) : enrollments.length === 0 ? (
                <div className="panel-empty">
                    <Shield size={32} opacity={0.2} />
                    <p>No insurance on file</p>
                    <p className="sub">Click Enroll to add coverage</p>
                </div>
            ) : (
                <div className="enrollment-list">
                    {enrollments.map(enroll => {
                        const s = STATUS_COLORS[enroll.status] || STATUS_COLORS.PENDING;
                        return (
                            <div key={enroll.id} className={`enrollment-card ${enroll.isActive ? 'active' : 'inactive'}`}>
                                <div className="enroll-top">
                                    <div className="enroll-insurer">
                                        <div className="insurer-avatar">{enroll.insurance.name.charAt(0)}</div>
                                        <div>
                                            <div className="insurer-name">{enroll.insurance.name}</div>
                                            <div className="insurer-code">{enroll.insurance.code}</div>
                                        </div>
                                    </div>
                                    <span className="status-chip" style={{ background: s.bg, color: s.color }}>
                                        {s.icon} {enroll.status}
                                    </span>
                                </div>

                                <div className="enroll-details">
                                    <div className="detail-row">
                                        <span className="detail-lbl">Policy #</span>
                                        <span className="detail-val mono">{enroll.policyNumber}</span>
                                    </div>
                                    {enroll.memberNumber && (
                                        <div className="detail-row">
                                            <span className="detail-lbl">Member #</span>
                                            <span className="detail-val mono">{enroll.memberNumber}</span>
                                        </div>
                                    )}
                                    <div className="detail-row">
                                        <span className="detail-lbl">Valid From</span>
                                        <span className="detail-val">{new Date(enroll.coverageStart).toLocaleDateString()}</span>
                                    </div>
                                    {enroll.coverageEnd && (
                                        <div className="detail-row">
                                            <span className="detail-lbl">Expires</span>
                                            <span className="detail-val">{new Date(enroll.coverageEnd).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                    {enroll.verifiedAt && (
                                        <div className="detail-row">
                                            <span className="detail-lbl">Verified By</span>
                                            <span className="detail-val">{enroll.verifiedBy?.name ?? 'Staff'} on {new Date(enroll.verifiedAt).toLocaleDateString()}</span>
                                        </div>
                                    )}
                                </div>

                                {enroll.status === 'PENDING' && enroll.isActive && (
                                    <button className="btn-verify" onClick={() => handleVerify(enroll.id)}>
                                        Mark Verified
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="modal-card">
                        <div className="modal-header">
                            <h2>Enroll in Insurance</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="enroll-form">
                            <div className="form-row">
                                <label>Insurance Company *</label>
                                <select
                                    required
                                    value={selectedCompanyId}
                                    onChange={e => { setSelectedCompanyId(e.target.value); setForm(f => ({ ...f, insuranceId: e.target.value })); }}
                                >
                                    <option value="">Select insurer...</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-row">
                                <label>Policy Number *</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="e.g. JUB-2025-00432"
                                    value={form.policyNumber}
                                    onChange={e => setForm(f => ({ ...f, policyNumber: e.target.value }))}
                                />
                            </div>

                            <div className="form-row">
                                <label>Member Number (optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 001"
                                    value={form.memberNumber}
                                    onChange={e => setForm(f => ({ ...f, memberNumber: e.target.value }))}
                                />
                            </div>

                            <div className="form-grid-2">
                                <div className="form-row">
                                    <label>Coverage Start *</label>
                                    <input
                                        required
                                        type="date"
                                        value={form.coverageStart}
                                        onChange={e => setForm(f => ({ ...f, coverageStart: e.target.value }))}
                                    />
                                </div>
                                <div className="form-row">
                                    <label>Coverage End</label>
                                    <input
                                        type="date"
                                        value={form.coverageEnd}
                                        onChange={e => setForm(f => ({ ...f, coverageEnd: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn-save" disabled={saving}>
                                    {saving ? 'Saving...' : 'Save Enrollment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style jsx>{`
                .enrollment-panel { padding: 1.25rem; border-radius: 16px; }

                .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
                .panel-title { display: flex; align-items: center; gap: 0.5rem; }
                .panel-title h3 { font-size: 1rem; font-weight: 700; margin: 0; }

                .btn-add-enroll {
                    display: flex; align-items: center; gap: 0.4rem;
                    background: var(--primary-color); color: white;
                    border: none; border-radius: 8px; padding: 5px 10px;
                    font-size: 0.8rem; font-weight: 600; cursor: pointer;
                    transition: opacity 0.2s;
                }
                .btn-add-enroll:hover { opacity: 0.85; }

                .panel-loading {
                    height: 80px; display: flex; align-items: center; justify-content: center;
                }
                .spin { animation: rotate 2s linear infinite; }
                @keyframes rotate { to { transform: rotate(360deg); } }

                .panel-empty {
                    display: flex; flex-direction: column; align-items: center;
                    gap: 0.25rem; padding: 1.5rem; text-align: center;
                    color: var(--text-muted);
                }
                .panel-empty p { margin: 0; font-size: 0.9rem; }
                .panel-empty .sub { font-size: 0.75rem; opacity: 0.7; }

                .enrollment-list { display: flex; flex-direction: column; gap: 0.75rem; }

                .enrollment-card {
                    border-radius: 12px;
                    padding: 1rem;
                    border: 1px solid rgba(0,0,0,0.06);
                    background: rgba(255,255,255,0.4);
                    display: flex; flex-direction: column; gap: 0.75rem;
                    transition: all 0.2s;
                }
                .enrollment-card.active { border-left: 3px solid var(--primary-color); }
                .enrollment-card.inactive { opacity: 0.55; }

                .enroll-top { display: flex; justify-content: space-between; align-items: flex-start; }
                .enroll-insurer { display: flex; align-items: center; gap: 0.6rem; }
                .insurer-avatar {
                    width: 32px; height: 32px; border-radius: 50%;
                    background: var(--primary-gradient); color: white;
                    display: flex; align-items: center; justify-content: center;
                    font-weight: 700; font-size: 0.9rem;
                }
                .insurer-name { font-weight: 700; font-size: 0.9rem; }
                .insurer-code { font-size: 0.7rem; color: var(--text-muted); font-family: monospace; }

                .status-chip {
                    display: flex; align-items: center; gap: 0.25rem;
                    padding: 3px 8px; border-radius: 20px; font-size: 0.7rem; font-weight: 700;
                }

                .enroll-details { display: flex; flex-direction: column; gap: 0.3rem; }
                .detail-row { display: flex; justify-content: space-between; align-items: center; }
                .detail-lbl { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; }
                .detail-val { font-size: 0.82rem; font-weight: 600; }
                .detail-val.mono { font-family: monospace; }

                .btn-verify {
                    align-self: flex-start;
                    padding: 4px 10px; border-radius: 8px; border: none;
                    background: #166534; color: white; font-size: 0.75rem;
                    font-weight: 600; cursor: pointer;
                }
                .btn-verify:hover { opacity: 0.85; }

                /* Modal */
                .modal-overlay {
                    position: fixed; inset: 0; z-index: 2000;
                    background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);
                    display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.15s ease-out;
                }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

                .modal-card {
                    background: var(--glass-bg, rgba(255,255,255,0.9));
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.5);
                    border-radius: 20px; padding: 2rem;
                    width: 100%; max-width: 480px;
                    box-shadow: 0 25px 50px rgba(0,0,0,0.2);
                    animation: slideUp 0.2s ease-out;
                }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

                .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
                .modal-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0; }
                .modal-close { background: none; border: none; cursor: pointer; color: var(--text-muted); border-radius: 8px; padding: 4px; }

                .enroll-form { display: flex; flex-direction: column; gap: 1rem; }
                .form-row { display: flex; flex-direction: column; gap: 0.35rem; }
                .form-row label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }
                .form-row input, .form-row select {
                    padding: 0.65rem 0.9rem;
                    border: 1px solid rgba(0,0,0,0.1);
                    border-radius: 10px;
                    font-size: 0.9rem;
                    outline: none;
                    background: rgba(255,255,255,0.6);
                    transition: border 0.2s;
                    width: 100%;
                }
                .form-row input:focus, .form-row select:focus { border-color: var(--primary-color); }

                .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

                .modal-footer { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid rgba(0,0,0,0.06); }
                .btn-cancel { padding: 0.6rem 1.2rem; border-radius: 10px; border: 1px solid rgba(0,0,0,0.1); background: transparent; cursor: pointer; font-weight: 600; }
                .btn-save { padding: 0.6rem 1.5rem; border-radius: 10px; border: none; background: var(--primary-color); color: white; cursor: pointer; font-weight: 700; transition: opacity 0.2s; }
                .btn-save:hover { opacity: 0.85; }
                .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
            `}</style>
        </div>
    );
}
