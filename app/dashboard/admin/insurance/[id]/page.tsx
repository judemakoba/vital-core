'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Building2,
    ShieldCheck,
    Edit3,
    Plus,
    CheckCircle2,
    XCircle,
    Mail,
    Phone,
    MapPin,
    CreditCard,
    Activity,
    AlertCircle,
    FileText,
    Users
} from 'lucide-react';

interface InsuranceCompany {
    id: string;
    name: string;
    code: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    paymentTerms: string | null;
    copayType: 'FLAT' | 'PERCENTAGE' | 'COPAY_PLUS_PERCENT' | 'NO_COPAY' | 'FULL';
    standardPatientCopay: number;
    copayPercentage: number;
    copayDeductible: number;
    consultationFee: number | null;
    isActive: boolean;
    _count: {
        claims: number;
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
    FLAT: 'Patient pays a fixed amount per service.',
    PERCENTAGE: 'Patient pays a percentage of the negotiated price.',
    COPAY_PLUS_PERCENT: 'Patient pays a flat amount + a percentage of the remainder.',
    NO_COPAY: 'Insurance covers 100% — patient pays nothing.',
    FULL: 'No insurance coverage — patient pays the full negotiated price.',
};

export default function InsuranceDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [company, setCompany] = useState<InsuranceCompany | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);

    useEffect(() => {
        if (params.id) {
            fetchCompanyDetails();
        }
    }, [params.id]);

    const fetchCompanyDetails = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/admin/insurance/${params.id}`);
            if (!res.ok) throw new Error('Insurance partner not found');
            const data = await res.json();
            setCompany(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaved = (updated: InsuranceCompany) => {
        // PATCH response doesn't include _count, so re-fetch the full record
        // to keep the count badges accurate after the save.
        setIsEditOpen(false);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 4000);
        // Preserve the freshly-saved fields the user just edited; the refetch
        // below will overwrite if it succeeds.
        setCompany((prev) => prev ? { ...prev, ...updated } : updated);
        fetchCompanyDetails();
    };

    if (loading) return (
        <div className="loading-container">
            <Activity className="spin" size={32} />
            <p>Loading partner details...</p>
        </div>
    );

    if (error || !company) return (
        <div className="error-container">
            <AlertCircle size={32} />
            <p>{error || 'Partner not found'}</p>
            <button onClick={() => router.back()} className="btn-secondary">Go Back</button>
        </div>
    );

    return (
        <div className="detail-container">
            <div className="breadcrumb">
                <Link href="/dashboard/admin/insurance" className="back-link">
                    <ArrowLeft size={18} />
                    Back to Insurance Partners
                </Link>
            </div>

            {savedFlash && (
                <div className="saved-flash" role="status">
                    <CheckCircle2 size={18} /> Partner details saved.
                </div>
            )}

            <header className="detail-header glass shadow-sm">
                <div className="header-info">
                    <div className="partner-avatar-large">
                        {company.name.charAt(0)}
                    </div>
                    <div className="partner-meta">
                        <div className="title-row">
                            <h1>{company.name}</h1>
                            <span className={`status-pill ${company.isActive ? 'active' : 'inactive'}`}>
                                {company.isActive ? 'Active Partner' : 'Inactive Partner'}
                            </span>
                        </div>
                        <div className="subtitle-row">
                            <span className="code-badge">{company.code}</span>
                            <span className="separator">•</span>
                            <span>{company._count.priceList} Negotiated Prices</span>
                            <span className="separator">•</span>
                            <span>{company._count.claims} Total Claims</span>
                        </div>
                    </div>
                </div>
                <div className="header-actions">
                    <button className="btn-secondary" onClick={() => setIsEditOpen(true)}>
                        <Edit3 size={18} />
                        Edit Partner
                    </button>
                    <Link href={`/dashboard/admin/insurance/${company.id}/price-list`} className="btn-primary">
                        <CreditCard size={18} />
                        Service Price List
                    </Link>
                </div>
            </header>

            <div className="detail-grid">
                <section className="info-section glass shadow-sm">
                    <h2>Company Information</h2>
                    <div className="info-list">
                        <div className="info-item">
                            <div className="info-icon"><Building2 size={18} /></div>
                            <div className="info-content">
                                <label>Contact Person</label>
                                <p>{company.contactPerson || 'Not specified'}</p>
                            </div>
                        </div>
                        <div className="info-item">
                            <div className="info-icon"><Mail size={18} /></div>
                            <div className="info-content">
                                <label>Email Address</label>
                                <p>{company.email || 'No email provided'}</p>
                            </div>
                        </div>
                        <div className="info-item">
                            <div className="info-icon"><Phone size={18} /></div>
                            <div className="info-content">
                                <label>Phone Number</label>
                                <p>{company.phone || 'No phone provided'}</p>
                            </div>
                        </div>
                        <div className="info-item">
                            <div className="info-icon"><MapPin size={18} /></div>
                            <div className="info-content">
                                <label>Office Address</label>
                                <p>{company.address || 'Address not listed'}</p>
                            </div>
                        </div>
                        <div className="info-item">
                            <div className="info-icon"><FileText size={18} /></div>
                            <div className="info-content">
                                <label>Payment Terms</label>
                                <p>{company.paymentTerms || 'Standard Terms'}</p>
                            </div>
                        </div>
                        <div className="info-item highlight-item">
                            <div className="info-icon"><CreditCard size={18} /></div>
                            <div className="info-content">
                                <label>Copay Model</label>
                                <p>
                                    <strong>{COPAY_TYPE_LABELS[company.copayType]}</strong>
                                    {company.copayType === 'FLAT' && company.standardPatientCopay > 0 &&
                                        ` — UGX ${company.standardPatientCopay.toLocaleString()} per service`}
                                    {company.copayType === 'PERCENTAGE' && company.copayPercentage > 0 &&
                                        ` — ${company.copayPercentage}% of negotiated price`}
                                    {company.copayType === 'COPAY_PLUS_PERCENT' && company.standardPatientCopay > 0 &&
                                        ` — UGX ${company.standardPatientCopay.toLocaleString()} + ${company.copayPercentage}% of remainder`}
                                </p>
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                    {COPAY_TYPE_DESCRIPTIONS[company.copayType]}
                                </small>
                                {company.copayDeductible > 0 && (
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginTop: 2 }}>
                                        Deductible: UGX {company.copayDeductible.toLocaleString()}
                                    </small>
                                )}
                                {company.consultationFee != null && company.consultationFee > 0 && (
                                    <small style={{ color: 'var(--primary-color)', fontSize: '0.75rem', display: 'block', marginTop: 2, fontWeight: 600 }}>
                                        ⭐ Custom consultation fee: UGX {company.consultationFee.toLocaleString()}
                                    </small>
                                )}
                                <Link href={`/dashboard/admin/insurance/${company.id}/price-list`} className="info-link">
                                    Manage Price List →
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>

            </div>

            {isEditOpen && company && (
                <EditPartnerModal
                    company={company}
                    onClose={() => setIsEditOpen(false)}
                    onSaved={handleSaved}
                />
            )}

            <style jsx>{`
                .detail-container {
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .breadcrumb { margin-bottom: 0.5rem; }
                .back-link {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: var(--text-muted);
                    text-decoration: none;
                    font-size: 0.9rem;
                    transition: color 0.2s;
                }
                .back-link:hover { color: var(--primary-color); }

                .detail-header {
                    padding: 2rem;
                    border-radius: 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .header-info {
                    display: flex;
                    gap: 1.5rem;
                    align-items: center;
                }

                .partner-avatar-large {
                    width: 80px;
                    height: 80px;
                    background: var(--primary-gradient);
                    color: white;
                    border-radius: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 2.5rem;
                    box-shadow: 0 10px 25px rgba(var(--primary-rgb), 0.3);
                }

                .partner-meta .title-row {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .partner-meta h1 { font-size: 2rem; margin: 0; }

                .status-pill {
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 0.8rem;
                    font-weight: 600;
                }
                .status-pill.active { background: #dcfce7; color: #166534; }
                .status-pill.inactive { background: #fee2e2; color: #991b1b; }

                .subtitle-row {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    color: var(--text-muted);
                    font-size: 1rem;
                    margin-top: 0.5rem;
                }

                .code-badge {
                    background: #f1f5f9;
                    color: #475569;
                    padding: 2px 8px;
                    border-radius: 6px;
                    font-family: monospace;
                    font-weight: 700;
                }

                .separator { opacity: 0.3; }

                .header-actions { display: flex; gap: 1rem; }

                .detail-grid {
                    display: grid;
                    grid-template-columns: 350px 1fr;
                    gap: 1.5rem;
                }

                .info-section, .packages-section {
                    padding: 1.5rem;
                    border-radius: 16px;
                }

                h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 1.5rem; }

                .info-list { display: flex; flex-direction: column; gap: 1.25rem; }
                .info-item { display: flex; gap: 1rem; }
                .info-icon {
                    width: 36px;
                    height: 36px;
                    background: rgba(var(--primary-rgb), 0.05);
                    color: var(--primary-color);
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .info-content label {
                    display: block;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    margin-bottom: 0.1rem;
                }

                .info-content p { font-weight: 600; color: var(--text-main); margin: 0; }

                .highlight-item {
                    background: rgba(var(--primary-rgb), 0.03);
                    padding: 0.75rem;
                    border-radius: 12px;
                    border: 1px dashed rgba(var(--primary-rgb), 0.2);
                }

                .info-link {
                    font-size: 0.75rem;
                    color: var(--primary-color);
                    text-decoration: none;
                    font-weight: 600;
                    margin-top: 0.25rem;
                    display: block;
                }
                .info-link:hover { text-decoration: underline; }

                .saved-flash {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.75rem 1rem;
                    border-radius: 10px;
                    background: rgba(16, 185, 129, 0.10);
                    border: 1px solid rgba(16, 185, 129, 0.30);
                    color: #047857;
                    font-weight: 600;
                    font-size: 0.9rem;
                    animation: slideDown 0.25s ease-out;
                }
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-4px); }
                    to   { opacity: 1; transform: translateY(0); }
                }

                .section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                }

                .package-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }

                .package-item {
                    background: rgba(255,255,255,0.4);
                    border: 1px solid rgba(0,0,0,0.05);
                    border-radius: 12px;
                    padding: 1.25rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .border-left-pkg { border-left: 4px solid var(--primary-color); }

                .pkg-main { display: flex; justify-content: space-between; align-items: flex-start; }
                .pkg-info h3 { font-size: 1.1rem; font-weight: 700; margin: 0; }
                .pkg-code { font-size: 0.75rem; color: var(--text-muted); font-family: monospace; }

                .pkg-status {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                .pkg-status.active { color: #166534; }
                .pkg-status.inactive { color: #991b1b; }

                .pkg-limits {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 0.5rem;
                }

                .limit-chip {
                    background: #f8fafc;
                    padding: 0.5rem;
                    border-radius: 8px;
                    display: flex;
                    flex-direction: column;
                    gap: 0.1rem;
                }

                .limit-chip.highlight { background: rgba(var(--primary-rgb), 0.05); }

                .limit-chip label { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; }
                .limit-chip span { font-size: 0.8rem; font-weight: 700; }

                .pkg-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-top: 1px dashed rgba(0,0,0,0.1);
                    padding-top: 0.75rem;
                }

                .enrollment-count {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    font-size: 0.8rem;
                    color: var(--text-muted);
                }

                .loading-container, .error-container {
                    height: 400px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 1rem;
                    color: var(--text-muted);
                }

                .spin { animation: rotate 2s linear infinite; }
                @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                .btn-small {
                    padding: 6px 12px;
                    font-size: 0.8rem;
                    background: var(--primary-color);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                }

                .btn-icon-text {
                    background: transparent;
                    border: none;
                    color: var(--primary-color);
                    font-size: 0.8rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    cursor: pointer;
                }
            `}</style>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Edit Partner Modal — pre-fills with existing values, PATCHes the partner
// ──────────────────────────────────────────────────────────────────────────
function EditPartnerModal({
    company,
    onClose,
    onSaved,
}: {
    company: InsuranceCompany;
    onClose: () => void;
    onSaved: (updated: InsuranceCompany) => void;
}) {
    const [name, setName] = useState(company.name);
    const [code, setCode] = useState(company.code);
    const [contactPerson, setContactPerson] = useState(company.contactPerson ?? '');
    const [phone, setPhone] = useState(company.phone ?? '');
    const [email, setEmail] = useState(company.email ?? '');
    const [address, setAddress] = useState(company.address ?? '');
    const [paymentTerms, setPaymentTerms] = useState(company.paymentTerms ?? 'Net 30');
    const [copayType, setCopayType] = useState<InsuranceCompany['copayType']>(company.copayType);
    const [standardPatientCopay, setStandardPatientCopay] = useState(String(company.standardPatientCopay));
    const [copayPercentage, setCopayPercentage] = useState(String(company.copayPercentage));
    const [copayDeductible, setCopayDeductible] = useState(String(company.copayDeductible));
    const [consultationFee, setConsultationFee] = useState(company.consultationFee != null ? String(company.consultationFee) : '');
    const [isActive, setIsActive] = useState(company.isActive);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const useFlat = copayType === 'FLAT' || copayType === 'COPAY_PLUS_PERCENT';
    const usePercent = copayType === 'PERCENTAGE' || copayType === 'COPAY_PLUS_PERCENT';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!name.trim() || !code.trim()) {
            setError('Name and code are required');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/admin/insurance/${company.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    code: code.trim().toUpperCase(),
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
                    isActive,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                // Server returns { ...company, _priceListSeed }. Strip the seed key.
                const { _priceListSeed, ...cleaned } = data;
                onSaved(cleaned as InsuranceCompany);
            } else {
                const j = await res.json().catch(() => ({}));
                setError(j.error || 'Failed to save changes');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Edit Insurance Partner</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
                </div>
                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-section">
                        <h3 className="form-section-title">Basic Info</h3>
                        <div className="form-grid">
                            <div className="form-field">
                                <label>Name *</label>
                                <input value={name} onChange={(e) => setName(e.target.value)} required disabled={saving} />
                            </div>
                            <div className="form-field">
                                <label>Code * <small>(unique short ID)</small></label>
                                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={12} disabled={saving} />
                            </div>
                            <div className="form-field">
                                <label>Contact Person</label>
                                <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} disabled={saving} />
                            </div>
                            <div className="form-field">
                                <label>Phone</label>
                                <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={saving} />
                            </div>
                            <div className="form-field">
                                <label>Email</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
                            </div>
                            <div className="form-field">
                                <label>Payment Terms</label>
                                <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} disabled={saving} />
                            </div>
                            <div className="form-field full-width">
                                <label>Address</label>
                                <input value={address} onChange={(e) => setAddress(e.target.value)} disabled={saving} />
                            </div>
                        </div>
                    </div>

                    <div className="form-section">
                        <h3 className="form-section-title">Copay Configuration</h3>
                        <div className="form-field full-width" style={{ marginBottom: '1rem' }}>
                            <label>Consultation Fee (UGX) <small>(leave empty to use the system default of 50,000)</small></label>
                            <input
                                type="number"
                                min="0"
                                step="100"
                                value={consultationFee}
                                onChange={(e) => setConsultationFee(e.target.value)}
                                disabled={saving}
                                placeholder="e.g. 48000 — overrides the global default for this partner"
                            />
                        </div>
                        <div className="form-field">
                            <label>Copay Model</label>
                            <div className="copay-selector">
                                {(Object.keys(COPAY_TYPE_LABELS) as InsuranceCompany['copayType'][]).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        className={`copay-option ${copayType === type ? 'active' : ''}`}
                                        onClick={() => setCopayType(type)}
                                        disabled={saving}
                                    >
                                        <div className="copay-option-label">{COPAY_TYPE_LABELS[type]}</div>
                                        <div className="copay-option-desc">{COPAY_TYPE_DESCRIPTIONS[type]}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="form-grid">
                            {useFlat && (
                                <div className="form-field">
                                    <label>Flat Copay (UGX)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="100"
                                        value={standardPatientCopay}
                                        onChange={(e) => setStandardPatientCopay(e.target.value)}
                                        disabled={saving}
                                    />
                                </div>
                            )}
                            {usePercent && (
                                <div className="form-field">
                                    <label>Coinsurance (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        value={copayPercentage}
                                        onChange={(e) => setCopayPercentage(e.target.value)}
                                        disabled={saving}
                                    />
                                </div>
                            )}
                            <div className="form-field">
                                <label>Deductible (UGX)</label>
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
                        <div className="copay-preview">
                            <strong>Preview:</strong> {COPAY_TYPE_DESCRIPTIONS[copayType]}
                        </div>
                    </div>

                    <div className="form-section">
                        <h3 className="form-section-title">Status</h3>
                        <label className="status-toggle">
                            <span className="switch">
                                <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                    disabled={saving}
                                />
                                <span className="switch-track">
                                    <span className="switch-thumb" />
                                </span>
                            </span>
                            <span>
                                <span className="status-toggle-label">{isActive ? 'Active Partner' : 'Inactive Partner'}</span>
                                <br />
                                <span className="status-toggle-hint">
                                    {isActive
                                        ? 'Patients can be enrolled and claims filed.'
                                        : 'Hidden from cashier; existing enrollments preserved but no new claims.'}
                                </span>
                            </span>
                        </label>
                    </div>

                    {error && <div className="error-banner">{error}</div>}

                    <div className="modal-footer">
                        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={saving}>
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>

            <style jsx>{`
                .modal-backdrop {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.55);
                    backdrop-filter: blur(6px);
                    -webkit-backdrop-filter: blur(6px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 1rem;
                    animation: fadeIn 0.2s ease-out;
                }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

                .modal-container {
                    background: var(--bg-card, #ffffff);
                    color: var(--text-primary, #1f2937);
                    border-radius: 16px;
                    border: 1px solid var(--border-color, #e5e7eb);
                    max-width: 720px;
                    width: 100%;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    animation: slideUp 0.25s ease-out;
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }

                .modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 1.25rem 1.5rem;
                    border-bottom: 1px solid var(--border-color, #e5e7eb);
                    position: sticky;
                    top: 0;
                    background: var(--bg-card, #ffffff);
                    z-index: 1;
                }
                .modal-header h2 {
                    margin: 0;
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--text-primary, #1f2937);
                }
                .modal-close {
                    background: none; border: none; font-size: 1.75rem; cursor: pointer;
                    color: var(--text-muted, #6b7280); line-height: 1; padding: 0 0.5rem;
                }
                .modal-close:hover { color: var(--text-primary, #1f2937); }

                .modal-form { padding: 1.5rem; }
                .form-section { margin-bottom: 2rem; }
                .form-section:last-of-type { margin-bottom: 0; }
                .form-section-title {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-secondary, #4b5563);
                    font-weight: 600;
                    margin: 0 0 0.875rem;
                    padding-bottom: 0.625rem;
                    border-bottom: 1px solid var(--border-color, #e5e7eb);
                }
                .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1rem;
                }
                .form-field {
                    display: flex;
                    flex-direction: column;
                    gap: 0.375rem;
                }
                .form-field.full-width { grid-column: 1 / -1; }
                .form-field label {
                    font-size: 0.8125rem;
                    font-weight: 500;
                    color: var(--text-secondary, #4b5563);
                }
                .form-field label small { color: var(--text-muted, #6b7280); font-weight: 400; }
                .form-field input, .form-field select {
                    padding: 0.5rem 0.75rem;
                    border: 1px solid var(--border-color, #e5e7eb);
                    border-radius: 8px;
                    background: var(--bg-color, #ffffff);
                    color: var(--text-primary, #1f2937);
                    font-size: 0.875rem;
                    font-family: inherit;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .form-field input:focus, .form-field select:focus {
                    outline: none;
                    border-color: var(--primary-color, #6366f1);
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
                }
                .form-field input:disabled, .form-field select:disabled {
                    background: rgba(0, 0, 0, 0.04);
                    color: var(--text-muted, #6b7280);
                    cursor: not-allowed;
                }
                .copay-selector {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 0.5rem;
                    margin-top: 0.25rem;
                }
                .copay-option {
                    text-align: left;
                    padding: 0.75rem;
                    border: 1px solid var(--border-color, #e5e7eb);
                    border-radius: 8px;
                    background: var(--bg-color, #ffffff);
                    cursor: pointer;
                    transition: all 0.15s;
                    font-family: inherit;
                }
                .copay-option:hover { border-color: var(--primary-color, #6366f1); }
                .copay-option.active {
                    border-color: var(--primary-color, #6366f1);
                    background: rgba(99, 102, 241, 0.08);
                    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
                }
                .copay-option:disabled { cursor: not-allowed; opacity: 0.6; }
                .copay-option-label {
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: var(--text-primary, #1f2937);
                }
                .copay-option-desc {
                    font-size: 0.6875rem;
                    color: var(--text-muted, #6b7280);
                    margin-top: 0.25rem;
                    line-height: 1.4;
                }
                .copay-preview {
                    margin-top: 0.75rem;
                    padding: 0.625rem 0.875rem;
                    background: rgba(99, 102, 241, 0.08);
                    border: 1px solid rgba(99, 102, 241, 0.2);
                    border-radius: 8px;
                    font-size: 0.8125rem;
                    color: var(--primary-color, #6366f1);
                }
                .error-banner {
                    background: rgba(244, 63, 94, 0.08);
                    border: 1px solid rgba(244, 63, 94, 0.3);
                    color: var(--danger-color, #ef4444);
                    padding: 0.625rem 0.875rem;
                    border-radius: 8px;
                    font-size: 0.8125rem;
                    margin-bottom: 1rem;
                }
                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.75rem;
                    padding-top: 1.25rem;
                    margin-top: 1.5rem;
                    border-top: 1px solid var(--border-color, #e5e7eb);
                }
                .status-toggle {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.875rem 1rem;
                    background: rgba(0, 0, 0, 0.03);
                    border-radius: 8px;
                    cursor: pointer;
                }
                .switch {
                    position: relative;
                    width: 42px;
                    height: 24px;
                    flex-shrink: 0;
                }
                .switch input { display: none; }
                .switch-track {
                    position: absolute;
                    inset: 0;
                    background: var(--border-color, #d1d5db);
                    border-radius: 999px;
                    transition: background 0.2s;
                }
                .switch-thumb {
                    position: absolute;
                    top: 2px;
                    left: 2px;
                    width: 20px;
                    height: 20px;
                    background: white;
                    border-radius: 50%;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                    transition: transform 0.2s;
                }
                .switch input:checked + .switch-track { background: var(--success-color, #10b981); }
                .switch input:checked + .switch-track .switch-thumb { transform: translateX(18px); }
                .status-toggle-label {
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: var(--text-primary, #1f2937);
                }
                .status-toggle-hint {
                    font-size: 0.75rem;
                    color: var(--text-muted, #6b7280);
                }
            `}</style>
        </div>
    );
}

