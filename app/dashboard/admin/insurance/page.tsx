'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Plus,
    Building2,
    ShieldCheck,
    Users,
    FileText,
    ChevronRight,
    Search,
    AlertCircle,
    Activity,
    Power
} from 'lucide-react';

interface InsuranceCompany {
    id: string;
    name: string;
    code: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    copayType: 'FLAT' | 'PERCENTAGE' | 'COPAY_PLUS_PERCENT' | 'NO_COPAY' | 'FULL';
    standardPatientCopay: number;
    copayPercentage: number;
    copayDeductible: number;
    paymentTerms: string | null;
    isActive: boolean;
    _count: {
        claims: number;
        enrollments: number;
        priceList: number;
    }
}

const COPAY_TYPE_LABELS: Record<InsuranceCompany['copayType'], string> = {
    FLAT: 'Flat copay',
    PERCENTAGE: 'Coinsurance %',
    COPAY_PLUS_PERCENT: 'Flat + %',
    NO_COPAY: '100% covered',
    FULL: 'No coverage',
};

const COPAY_TYPE_DESCRIPTIONS: Record<InsuranceCompany['copayType'], string> = {
    FLAT: 'Patient pays a fixed amount per service (e.g. UGX 5,000).',
    PERCENTAGE: 'Patient pays a percentage of the negotiated price (e.g. 20% coinsurance).',
    COPAY_PLUS_PERCENT: 'Patient pays a flat amount + a percentage of the remainder (e.g. UGX 5,000 + 10%).',
    NO_COPAY: 'Insurance covers 100% — patient pays nothing.',
    FULL: 'No insurance coverage — patient pays the full negotiated price.',
};

function formatCopay(c: InsuranceCompany): string {
    switch (c.copayType) {
        case 'FLAT':
            return c.standardPatientCopay > 0 ? `UGX ${c.standardPatientCopay.toLocaleString()}` : 'No copay';
        case 'PERCENTAGE':
            return `${c.copayPercentage}% coinsurance`;
        case 'COPAY_PLUS_PERCENT':
            return `UGX ${c.standardPatientCopay.toLocaleString()} + ${c.copayPercentage}%`;
        case 'NO_COPAY':
            return '100% covered';
        case 'FULL':
            return 'No coverage';
        default:
            return '—';
    }
}

export default function InsuranceAdminPage() {
    const [companies, setCompanies] = useState<InsuranceCompany[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showNewModal, setShowNewModal] = useState(false);
    // R49: insurance feature flag (tenant-level toggle)
    const [insuranceEnabled, setInsuranceEnabled] = useState<boolean>(true);
    const [toggling, setToggling] = useState(false);
    const [flagError, setFlagError] = useState<string | null>(null);

    useEffect(() => {
        fetchCompanies();
        fetchInsuranceFlag();
    }, []);

    const fetchCompanies = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/insurance');
            if (!res.ok) throw new Error('Failed to load insurance partners');
            const data = await res.json();
            setCompanies(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchInsuranceFlag = async () => {
        try {
            const res = await fetch('/api/admin/insurance-feature');
            if (!res.ok) return;
            const data = await res.json();
            setInsuranceEnabled(data.enabled !== false);
        } catch (e) { /* ignore — default true */ }
    };

    const handleToggleInsurance = async () => {
        setToggling(true);
        setFlagError(null);
        const next = !insuranceEnabled;
        try {
            const res = await fetch('/api/admin/insurance-feature', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: next }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to update setting');
            }
            setInsuranceEnabled(next);
        } catch (err: any) {
            setFlagError(err.message || 'Failed to update setting');
        } finally {
            setToggling(false);
        }
    };

    const filteredCompanies = companies.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="admin-container">
            <header className="page-header">
                <div className="header-content">
                    <h1>Insurance Partners</h1>
                    <p>Manage insurance partners, negotiated rates, and patient copays</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <Link href="/dashboard/admin/insurance/authorizations" className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                        <ShieldCheck size={18} style={{ marginRight: '0.5rem' }} />
                        Pre-Auths
                    </Link>
                    <Link href="/dashboard/admin/insurance/claims" className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                        <FileText size={18} style={{ marginRight: '0.5rem' }} />
                        Claims Dashboard
                    </Link>
                    <button className="btn-primary" onClick={() => setShowNewModal(true)}>
                        <Plus size={18} style={{ marginRight: '0.5rem' }} />
                        New Partner
                    </button>

                </div>
            </header>

            {/* R49: Insurance feature flag toggle (tenant-level) */}
            <div
                className="stat-card glass shadow-sm"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem 1.25rem',
                    margin: '1.25rem 0 0',
                    background: insuranceEnabled
                        ? 'rgba(16, 185, 129, 0.06)'
                        : 'rgba(245, 158, 11, 0.06)',
                    border: `1px solid ${insuranceEnabled ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.3)'}`,
                }}
            >
                <div
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: insuranceEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.18)',
                        color: insuranceEnabled ? '#047857' : '#b45309',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <Power size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                        Insurance feature is {insuranceEnabled ? 'ON' : 'OFF'} for this clinic
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                        {insuranceEnabled
                            ? 'Patients can be enrolled in insurance and coverage is validated on every visit via the third-party system.'
                            : 'Insurance enrollment is hidden. All patients are treated as cash and the validation step is skipped on the visit creation form.'}
                    </div>
                    {flagError && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--danger-color, #dc2626)', marginTop: 4 }}>
                            {flagError}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleToggleInsurance}
                    disabled={toggling}
                    className={insuranceEnabled ? 'btn-secondary' : 'btn-primary'}
                    style={{
                        padding: '0.5rem 1.25rem',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        cursor: toggling ? 'wait' : 'pointer',
                    }}
                >
                    {toggling ? 'Updating…' : (insuranceEnabled ? 'Disable Insurance' : 'Enable Insurance')}
                </button>
            </div>

            <div className="stats-grid">
                <div className="stat-card glass shadow-sm">
                    <div className="stat-icon purple">
                        <Building2 size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Companies</span>
                        <span className="stat-value">{companies.length}</span>
                    </div>
                </div>
                <div className="stat-card glass shadow-sm">
                    <div className="stat-icon blue">
                        <ShieldCheck size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Packages</span>
                        <span className="stat-value">
                            {companies.reduce((acc, c) => acc + c._count.priceList, 0)}
                        </span>
                    </div>
                </div>
                <div className="stat-card glass shadow-sm">
                    <div className="stat-icon green">
                        <Users size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Enrolled Patients</span>
                        <span className="stat-value">
                            {companies.reduce((acc, c) => acc + c._count.enrollments, 0)}
                        </span>
                    </div>
                </div>
                <div className="stat-card glass shadow-sm">
                    <div className="stat-icon orange">
                        <FileText size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Pending Claims</span>
                        <span className="stat-value">
                            {companies.reduce((acc, c) => acc + c._count.claims, 0)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="actions-bar glass shadow-sm mt-4">
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search partners..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="loading-state glass shadow-sm mt-4">
                    <Activity className="spin" size={32} />
                    <p>Loading partners...</p>
                </div>
            ) : error ? (
                <div className="error-state glass shadow-sm mt-4">
                    <AlertCircle size={32} />
                    <p>{error}</p>
                    <button onClick={fetchCompanies} className="btn-secondary">Retry</button>
                </div>
            ) : (
                <div className="partners-grid mt-4">
                    {filteredCompanies.map(company => (
                        <div key={company.id} className="partner-card glass shadow-sm border-left-active">
                            <div className="partner-header">
                                <div className="partner-identity">
                                    <div className="partner-avatar">
                                        {company.name.charAt(0)}
                                    </div>
                                    <div className="partner-names">
                                        <h3>{company.name}</h3>
                                        <span className="code-tag">{company.code}</span>
                                    </div>
                                </div>
                                <div className={`status-pill ${company.isActive ? 'active' : 'inactive'}`}>
                                    {company.isActive ? 'Active' : 'Inactive'}
                                </div>
                            </div>

                            <div className="partner-metrics">
                                <div className="metric">
                                    <span className="metric-label">Copay Model</span>
                                    <span className="metric-value">{COPAY_TYPE_LABELS[company.copayType]}</span>
                                </div>
                                <div className="metric">
                                    <span className="metric-label">Amount</span>
                                    <span className="metric-value">{formatCopay(company)}</span>
                                </div>
                                <div className="metric">
                                    <span className="metric-label">Claims</span>
                                    <span className="metric-value">{company._count.claims}</span>
                                </div>
                                <div className="metric highlight">
                                    <span className="metric-label">Enrollments</span>
                                    <span className="metric-value">{company._count.enrollments}</span>
                                </div>
                            </div>

                            <div className="partner-actions">
                                <Link href={`/dashboard/admin/insurance/${company.id}`} className="btn-secondary btn-full">
                                    View Details
                                    <ChevronRight size={16} />
                                </Link>
                                <Link href={`/dashboard/admin/insurance/${company.id}/price-list`} className="btn-secondary btn-full">
                                    Price List
                                    <ChevronRight size={16} />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style jsx>{`
                .admin-container {
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                    animation: fadeIn 0.4s ease-out;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .header-content h1 {
                    font-size: 1.75rem;
                    font-weight: 700;
                    background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .header-content p {
                    color: var(--text-muted);
                    font-size: 0.9rem;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                }

                .stat-card {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1.25rem;
                    border-radius: 12px;
                }

                .stat-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .stat-icon.purple { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
                .stat-icon.blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
                .stat-icon.green { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
                .stat-icon.orange { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

                .stat-info {
                    display: flex;
                    flex-direction: column;
                }

                .stat-label {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--text-main);
                }

                .actions-bar {
                    padding: 0.75rem;
                    border-radius: 10px;
                }

                .search-box {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    background: rgba(255, 255, 255, 0.5);
                    padding: 0.5rem 1rem;
                    border-radius: 8px;
                    max-width: 400px;
                }

                .search-box input {
                    border: none;
                    background: transparent;
                    width: 100%;
                    outline: none;
                    font-size: 0.9rem;
                }

                .partners-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 1.5rem;
                }

                .partner-card {
                    padding: 1.5rem;
                    border-radius: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                    transition: all 0.2s ease;
                }

                .partner-card:hover {
                    transform: translateY(-4px);
                    border-color: var(--primary-color);
                }

                .partner-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }

                .partner-identity {
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                }

                .partner-avatar {
                    width: 44px;
                    height: 44px;
                    background: var(--primary-gradient);
                    color: white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 1.2rem;
                }

                .partner-names h3 {
                    font-size: 1.1rem;
                    font-weight: 600;
                    margin: 0;
                }

                .code-tag {
                    font-size: 0.75rem;
                    background: #f1f5f9;
                    padding: 1px 6px;
                    border-radius: 4px;
                    color: #475569;
                    font-family: monospace;
                }

                .status-pill {
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .status-pill.active { background: #dcfce7; color: #166534; }
                .status-pill.inactive { background: #fee2e2; color: #991b1b; }

                .partner-metrics {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 0.5rem;
                    background: rgba(0,0,0,0.03);
                    padding: 1rem;
                    border-radius: 12px;
                }
                
                .metric.highlight {
                    background: rgba(var(--primary-rgb), 0.05);
                    border-radius: 8px;
                    color: var(--primary-color);
                }

                .metric {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.25rem;
                }

                .metric-label {
                    font-size: 0.7rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                }

                .metric-value {
                    font-weight: 700;
                    font-size: 1.1rem;
                }

                .partner-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .btn-full {
                    width: 100%;
                    justify-content: center;
                }

                .loading-state, .error-state {
                    padding: 3rem;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 1rem;
                    border-radius: 16px;
                }

                .spin { animation: rotate 2s linear infinite; }
                @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                .mt-4 { margin-top: 1rem; }
            `}</style>

            {showNewModal && (
                <NewPartnerModal
                    onClose={() => setShowNewModal(false)}
                    onSuccess={() => { setShowNewModal(false); fetchCompanies(); }}
                />
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// New Partner Modal — collects all fields including the copay model
// ──────────────────────────────────────────────────────────────────────────
function NewPartnerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [paymentTerms, setPaymentTerms] = useState('Net 30');
    const [copayType, setCopayType] = useState<InsuranceCompany['copayType']>('FLAT');
    const [standardPatientCopay, setStandardPatientCopay] = useState('0');
    const [copayPercentage, setCopayPercentage] = useState('0');
    const [copayDeductible, setCopayDeductible] = useState('0');
    const [consultationFee, setConsultationFee] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!name.trim() || !code.trim()) {
            setError('Name and code are required');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/admin/insurance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    code: code.trim(),
                    contactPerson: contactPerson.trim() || null,
                    phone: phone.trim() || null,
                    email: email.trim() || null,
                    address: address.trim() || null,
                    paymentTerms,
                    copayType,
                    standardPatientCopay: parseFloat(standardPatientCopay) || 0,
                    copayPercentage: parseFloat(copayPercentage) || 0,
                    copayDeductible: parseFloat(copayDeductible) || 0,
                    consultationFee: consultationFee ? parseFloat(consultationFee) : null,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                onSuccess();
                // If the server auto-initialized the price list, jump to the
                // price-list page so the admin sees the breakdown banner.
                const seed = data?._priceListSeed;
                if (seed && seed.created > 0) {
                    const qs = new URLSearchParams({
                        autoSeeded: '1',
                        count: String(seed.created),
                        b: String(seed.breakdown?.billable ?? 0),
                        d: String(seed.breakdown?.drug ?? 0),
                        l: String(seed.breakdown?.lab ?? 0),
                        r: String(seed.breakdown?.radiology ?? 0),
                    });
                    window.location.href = `/dashboard/admin/insurance/${data.id}/price-list?${qs.toString()}`;
                }
            } else {
                const j = await res.json().catch(() => ({}));
                setError(j.error || 'Failed to create partner');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setSaving(false);
        }
    };

    const useFlat = copayType === 'FLAT' || copayType === 'COPAY_PLUS_PERCENT';
    const usePercent = copayType === 'PERCENTAGE' || copayType === 'COPAY_PLUS_PERCENT';

    return (
        <>
        <div className="backdrop" onClick={onClose}>
            <div className="card" onClick={(e) => e.stopPropagation()}>
                {/* Accent bar */}
                <div className="accent-bar" />

                {/* Header */}
                <div className="card-header">
                    <div className="header-text">
                        <div className="header-icon">
                            <Building2 size={18} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h2>New Insurance Partner</h2>
                            <p>Add a new insurance company and set up their copay model</p>
                        </div>
                    </div>
                    <button className="close-btn" onClick={onClose} aria-label="Close" type="button">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="card-body">
                        {/* Section 1: Basic Info */}
                        <section className="section">
                            <div className="section-head">
                                <span className="section-num">1</span>
                                <h3>Company Details</h3>
                            </div>
                            <div className="row two">
                                <div className="field">
                                    <label>Partner Name <em>*</em></label>
                                    <input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        placeholder="AAR Insurance"
                                        autoFocus
                                    />
                                </div>
                                <div className="field">
                                    <label>Short Code <em>*</em></label>
                                    <input
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                                        required
                                        placeholder="AAR"
                                        maxLength={12}
                                    />
                                </div>
                            </div>
                            <div className="row two">
                                <div className="field">
                                    <label>Contact Person</label>
                                    <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Jane Doe" />
                                </div>
                                <div className="field">
                                    <label>Phone</label>
                                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256 700 000 000" />
                                </div>
                            </div>
                            <div className="row two">
                                <div className="field">
                                    <label>Email</label>
                                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="claims@aar.co.ug" />
                                </div>
                                <div className="field">
                                    <label>Payment Terms</label>
                                    <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Net 30" />
                                </div>
                            </div>
                            <div className="row one">
                                <div className="field">
                                    <label>Address</label>
                                    <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Plot 12, Kampala Road" />
                                </div>
                            </div>
                        </section>

                        {/* Section 2: Copay */}
                        <section className="section">
                            <div className="section-head">
                                <span className="section-num">2</span>
                                <h3>Copay Model</h3>
                            </div>
                            <div className="row one">
                                <div className="field">
                                    <label>Consultation Fee Override <small style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>(optional, defaults to global fee)</small></label>
                                    <div className="input-prefix">
                                        <span>UGX</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            value={consultationFee}
                                            onChange={(e) => setConsultationFee(e.target.value)}
                                            disabled={saving}
                                            placeholder="Leave empty to use the system default (UGX 50,000)"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="copay-grid">
                                {(Object.keys(COPAY_TYPE_LABELS) as InsuranceCompany['copayType'][]).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        className={`copay-pill ${copayType === type ? 'active' : ''}`}
                                        onClick={() => setCopayType(type)}
                                    >
                                        <div className="pill-label">{COPAY_TYPE_LABELS[type]}</div>
                                        <div className="pill-desc">{COPAY_TYPE_DESCRIPTIONS[type]}</div>
                                    </button>
                                ))}
                            </div>

                            {/* Dynamic amount fields — only show what's relevant */}
                            {(useFlat || usePercent) && (
                                <div className="amount-row">
                                    {useFlat && (
                                        <div className="field">
                                            <label>{copayType === 'COPAY_PLUS_PERCENT' ? 'Flat amount (UGX)' : 'Flat copay (UGX)'}</label>
                                            <div className="input-prefix">
                                                <span>UGX</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="100"
                                                    value={standardPatientCopay}
                                                    onChange={(e) => setStandardPatientCopay(e.target.value)}
                                                    disabled={saving}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {usePercent && (
                                        <div className="field">
                                            <label>Coinsurance share</label>
                                            <div className="input-suffix">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.1"
                                                    value={copayPercentage}
                                                    onChange={(e) => setCopayPercentage(e.target.value)}
                                                    disabled={saving}
                                                />
                                                <span>%</span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="field">
                                        <label>Deductible (UGX)</label>
                                        <div className="input-prefix">
                                            <span>UGX</span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="100"
                                                value={copayDeductible}
                                                onChange={(e) => setCopayDeductible(e.target.value)}
                                                disabled={saving}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="preview">
                                <span className="preview-icon">💡</span>
                                <span><strong>How it works:</strong> {COPAY_TYPE_DESCRIPTIONS[copayType]}</span>
                            </div>
                        </section>

                        {error && (
                            <div className="error-banner">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <span>{error}</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="card-footer">
                        <button type="button" className="btn-cancel" onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-create" disabled={saving}>
                            {saving ? (
                                <>
                                    <span className="spinner" /> Creating…
                                </>
                            ) : (
                                <>
                                    <Building2 size={16} />
                                    Create Partner
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
            <style jsx>{`
                /* ── Backdrop & Card shell ── */
                .backdrop {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.55);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 1rem;
                    animation: backdropIn 0.2s ease-out;
                }
                @keyframes backdropIn { from { opacity: 0; } to { opacity: 1; } }

                .card {
                    position: relative;
                    background: #ffffff;
                    border-radius: 18px;
                    width: 100%;
                    max-width: 1020px;
                    max-height: 92vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow:
                        0 20px 25px -5px rgba(0, 0, 0, 0.12),
                        0 8px 10px -6px rgba(0, 0, 0, 0.08),
                        0 0 0 1px rgba(15, 23, 42, 0.05);
                    animation: cardIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes cardIn {
                    from { opacity: 0; transform: translateY(20px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }

                .accent-bar {
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 4px;
                    background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
                }

                /* ── Header ── */
                .card-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 1rem;
                    padding: 1.5rem 1.75rem 1rem;
                }
                .header-text { display: flex; gap: 0.75rem; align-items: flex-start; flex: 1; min-width: 0; }
                .header-icon {
                    width: 38px; height: 38px;
                    border-radius: 10px;
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.12));
                    color: #6366f1;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                }
                .card-header h2 {
                    margin: 0 0 0.25rem;
                    font-size: 1.125rem;
                    font-weight: 700;
                    color: #0f172a;
                    letter-spacing: -0.01em;
                }
                .card-header p {
                    margin: 0;
                    font-size: 0.8125rem;
                    color: #64748b;
                    line-height: 1.4;
                }
                .close-btn {
                    width: 32px; height: 32px;
                    border-radius: 8px;
                    border: none;
                    background: #f1f5f9;
                    color: #64748b;
                    cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.15s ease;
                    flex-shrink: 0;
                }
                .close-btn:hover { background: #e2e8f0; color: #0f172a; }

                /* ── Body ── */
                .card-body {
                    padding: 0.5rem 1.75rem 1.25rem;
                    overflow-y: auto;
                    flex: 1;
                }

                /* ── Sections ── */
                .section { padding: 1rem 0; }
                .section + .section {
                    border-top: 1px dashed #e2e8f0;
                    margin-top: 0.25rem;
                }
                .section-head {
                    display: flex;
                    align-items: center;
                    gap: 0.625rem;
                    margin-bottom: 0.875rem;
                }
                .section-num {
                    display: inline-flex;
                    align-items: center; justify-content: center;
                    width: 22px; height: 22px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    font-size: 0.75rem;
                    font-weight: 700;
                    flex-shrink: 0;
                }
                .section-head h3 {
                    margin: 0;
                    font-size: 0.875rem;
                    font-weight: 700;
                    color: #0f172a;
                    letter-spacing: -0.005em;
                }

                /* ── Rows & Fields ── */
                .row {
                    display: grid;
                    gap: 0.875rem;
                }
                .row.two { grid-template-columns: 1fr 1fr; }
                .row.one { grid-template-columns: 1fr; }
                .field { display: flex; flex-direction: column; gap: 0.375rem; min-width: 0; }

                .field label {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #475569;
                    letter-spacing: 0.01em;
                }
                .field label em {
                    color: #ef4444;
                    font-style: normal;
                    margin-left: 0.125rem;
                }

                .field input {
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    background: #ffffff;
                    color: #0f172a;
                    font-size: 0.875rem;
                    font-family: inherit;
                    transition: all 0.15s ease;
                    box-sizing: border-box;
                }
                .field input::placeholder { color: #94a3b8; }
                .field input:hover:not(:focus) { border-color: #cbd5e1; }
                .field input:focus {
                    outline: none;
                    border-color: #6366f1;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
                }
                .field input:disabled { background: #f8fafc; color: #94a3b8; cursor: not-allowed; }

                /* Input with prefix/suffix */
                .input-prefix, .input-suffix {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                .input-prefix span, .input-suffix span {
                    position: absolute;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #64748b;
                    pointer-events: none;
                }
                .input-prefix span { left: 0.75rem; }
                .input-suffix span { right: 0.75rem; }
                .input-prefix input { padding-left: 2.5rem !important; }
                .input-suffix input { padding-right: 2.5rem !important; }

                /* ── Copay pills ── */
                .copay-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.5rem;
                }
                .copay-pill {
                    text-align: left;
                    padding: 0.625rem 0.75rem;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 10px;
                    background: #ffffff;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    font-family: inherit;
                }
                .copay-pill:hover {
                    border-color: #c7d2fe;
                    background: #f8fafc;
                }
                .copay-pill.active {
                    border-color: #6366f1;
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.06), rgba(139, 92, 246, 0.06));
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
                }
                .pill-label {
                    font-size: 0.8125rem;
                    font-weight: 700;
                    color: #0f172a;
                    margin-bottom: 0.125rem;
                }
                .copay-pill.active .pill-label { color: #4f46e5; }
                .pill-desc {
                    font-size: 0.6875rem;
                    color: #64748b;
                    line-height: 1.35;
                }

                .amount-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 0.625rem;
                    margin-top: 0.875rem;
                }

                /* ── Preview chip ── */
                .preview {
                    margin-top: 0.875rem;
                    padding: 0.625rem 0.875rem;
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.06), rgba(139, 92, 246, 0.04));
                    border: 1px solid rgba(99, 102, 241, 0.18);
                    border-radius: 10px;
                    font-size: 0.8125rem;
                    color: #4338ca;
                    display: flex;
                    align-items: flex-start;
                    gap: 0.5rem;
                    line-height: 1.45;
                }
                .preview-icon { font-size: 1rem; line-height: 1.3; }

                /* ── Error ── */
                .error-banner {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    color: #b91c1c;
                    padding: 0.625rem 0.875rem;
                    border-radius: 10px;
                    font-size: 0.8125rem;
                    margin-top: 0.75rem;
                }

                /* ── Footer ── */
                .card-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.625rem;
                    padding: 1rem 1.75rem;
                    background: #f8fafc;
                    border-top: 1px solid #e2e8f0;
                }
                .btn-cancel, .btn-create {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    padding: 0.625rem 1.125rem;
                    border-radius: 10px;
                    font-size: 0.875rem;
                    font-weight: 600;
                    font-family: inherit;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    border: 1px solid transparent;
                }
                .btn-cancel {
                    background: #ffffff;
                    color: #475569;
                    border-color: #e2e8f0;
                }
                .btn-cancel:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }

                .btn-create {
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: white;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 4px 12px rgba(99, 102, 241, 0.25);
                }
                .btn-create:hover:not(:disabled) {
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 6px 16px rgba(99, 102, 241, 0.35);
                    transform: translateY(-1px);
                }
                .btn-create:active:not(:disabled) { transform: translateY(0); }
                .btn-cancel:disabled, .btn-create:disabled { opacity: 0.55; cursor: not-allowed; }

                .spinner {
                    width: 14px; height: 14px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: spin 0.6s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }

                /* ── Mobile: single-column for narrow screens ── */
                @media (max-width: 480px) {
                    .row.two, .copay-grid, .amount-row { grid-template-columns: 1fr; }
                }
            `}</style>
        </>
    );
}
