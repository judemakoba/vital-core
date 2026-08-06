'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import styles from './pharmacy.module.css';

export default function DrugMasterTab() {
    const [drugs, setDrugs] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Form state
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    
    const [formData, setFormData] = useState({
        drugCode: '',
        name: '',
        genericName: '',
        categoryId: '',
        schedule: 'PRESCRIPTION',
        dosageForm: 'TABLET',
        strength: '',
        packageSize: 1,
        packageUnit: 'Pack',
        storage: 'ROOM_TEMP'
    });

    const fetchDrugs = async (search = '') => {
        setLoading(true);
        try {
            const res = await fetch(`/api/pharmacy/drugs?search=${encodeURIComponent(search)}`);
            if (res.ok) {
                const data = await res.json();
                setDrugs(data);
            }
        } catch (error) {
            console.error('Failed to fetch drugs:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/admin/system/inventory/categories');
            if (res.ok) {
                const data = await res.json();
                setCategories(data);
            }
        } catch (error) {
            console.error('Failed to fetch categories:', error);
        }
    };

    useEffect(() => {
        fetchDrugs();
        fetchCategories();
    }, []);

    // Debounced live search — fires 300ms after the user stops typing.
    // Cancels any pending request when the user keeps typing.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            fetchDrugs(searchTerm);
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        // Cancel pending debounce and fetch immediately on Enter
        if (debounceRef.current) clearTimeout(debounceRef.current);
        fetchDrugs(searchTerm);
    };

    const clearSearch = () => {
        setSearchTerm('');
    };

    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}>
                <h3>Drug Master Data</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{
                                position: 'absolute', left: 10, top: '50%',
                                transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
                            }} />
                            <input
                                type="text"
                                placeholder="Search generic, trade, code..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    padding: '8px 30px 8px 32px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    fontSize: '14px',
                                    width: '280px',
                                    outline: 'none',
                                }}
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={clearSearch}
                                    title="Clear search"
                                    style={{
                                        position: 'absolute', right: 6, top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'transparent', border: 'none',
                                        cursor: 'pointer', color: '#6b7280', padding: 2,
                                    }}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <button type="submit" className={styles.btnSecondary} style={{ padding: '8px 12px' }}>
                            Search
                        </button>
                    </form>
                    {!showForm && (
                        <button
                            className={styles.btnPrimary}
                            onClick={() => {
                                setShowForm(true);
                                setSuccessMsg('');
                                setErrorMsg('');
                            }}
                        >
                            <Plus size={16} style={{ marginRight: '6px' }} />
                            Register Drug
                        </button>
                    )}
                </div>
            </div>

            {successMsg && (
                <div className={styles.successBanner} style={{ margin: '0 16px 16px' }}>
                    <CheckCircle2 size={16} /> {successMsg}
                </div>
            )}
            
            {showForm ? (
                <div style={{ padding: '20px', background: '#f8fafc', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h4 style={{ margin: 0, color: '#111827', fontSize: '16px' }}>New Drug Registration</h4>
                        <button 
                            className={styles.iconBtn} 
                            onClick={() => setShowForm(false)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                            <X size={20} color="#6b7280" />
                        </button>
                    </div>

                    {errorMsg && (
                        <div className={styles.errorBanner} style={{ marginBottom: '16px' }}>
                            <AlertCircle size={16} /> {errorMsg}
                        </div>
                    )}

                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        setSubmitting(true);
                        setErrorMsg('');
                        try {
                            const res = await fetch('/api/pharmacy/drugs', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(formData)
                            });
                            if (res.ok) {
                                setSuccessMsg('Drug registered successfully!');
                                setShowForm(false);
                                setFormData({
                                    drugCode: '', name: '', genericName: '', categoryId: '',
                                    schedule: 'PRESCRIPTION', dosageForm: 'TABLET', strength: '',
                                    packageSize: 1, packageUnit: 'Pack', storage: 'ROOM_TEMP'
                                });
                                fetchDrugs();
                                setTimeout(() => setSuccessMsg(''), 4000);
                            } else {
                                const err = await res.json();
                                setErrorMsg(err.error || 'Failed to register drug');
                            }
                        } catch (error) {
                            setErrorMsg('Network error occurred while saving.');
                        } finally {
                            setSubmitting(false);
                        }
                    }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Drug Code *</label>
                                <input required className={styles.input} placeholder="e.g. PAR-500-01" value={formData.drugCode} onChange={e => setFormData({...formData, drugCode: e.target.value})} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Trade/Brand Name *</label>
                                <input required className={styles.input} placeholder="e.g. Panadol" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Generic/INN Name *</label>
                                <input required className={styles.input} placeholder="e.g. Paracetamol" value={formData.genericName} onChange={e => setFormData({...formData, genericName: e.target.value})} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Category *</label>
                                <select required className={styles.input} value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})}>
                                    <option value="">-- Select Category --</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Schedule *</label>
                                <select required className={styles.input} value={formData.schedule} onChange={e => setFormData({...formData, schedule: e.target.value})}>
                                    <option value="OTC">OTC (Over the Counter)</option>
                                    <option value="PRESCRIPTION">Prescription Only</option>
                                    <option value="CONTROLLED">Controlled Substance</option>
                                    <option value="NARCOTIC">Narcotic</option>
                                    <option value="RESTRICTED">Restricted</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Dosage Form *</label>
                                <select required className={styles.input} value={formData.dosageForm} onChange={e => setFormData({...formData, dosageForm: e.target.value})}>
                                    <option value="TABLET">Tablet</option>
                                    <option value="CAPSULE">Capsule</option>
                                    <option value="SYRUP">Syrup</option>
                                    <option value="SUSPENSION">Suspension</option>
                                    <option value="INJECTION">Injection</option>
                                    <option value="IV_FLUID">IV Fluid</option>
                                    <option value="CREAM">Cream / Ointment</option>
                                    <option value="DROPS">Drops</option>
                                    <option value="OTHER">Other</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Strength *</label>
                                <input required className={styles.input} placeholder="e.g. 500mg" value={formData.strength} onChange={e => setFormData({...formData, strength: e.target.value})} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Storage Condition *</label>
                                <select required className={styles.input} value={formData.storage} onChange={e => setFormData({...formData, storage: e.target.value})}>
                                    <option value="ROOM_TEMP">Room Temperature (15-25°C)</option>
                                    <option value="REFRIGERATED">Refrigerated (2-8°C)</option>
                                    <option value="FROZEN">Frozen (&lt; 0°C)</option>
                                    <option value="CONTROLLED">Special/Controlled</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Package Size *</label>
                                <input required type="number" min="1" className={styles.input} value={formData.packageSize} onChange={e => setFormData({...formData, packageSize: parseInt(e.target.value) || 1})} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Package Unit *</label>
                                <input required className={styles.input} placeholder="e.g. Pack, Bottle, Vial" value={formData.packageUnit} onChange={e => setFormData({...formData, packageUnit: e.target.value})} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                            <button type="button" className={styles.btnSecondary} onClick={() => setShowForm(false)} disabled={submitting}>
                                Cancel
                            </button>
                            <button type="submit" className={styles.btnPrimary} style={{ width: '150px', justifyContent: 'center' }} disabled={submitting}>
                                {submitting ? 'Saving...' : 'Save Drug'}
                            </button>
                        </div>
                    </form>
                </div>
            ) : loading ? (
                <div className={styles.loading} style={{ height: '200px' }}>
                    <div className={styles.spinner} />
                    <p>{searchTerm ? `Searching for "${searchTerm}"...` : 'Loading drug directory...'}</p>
                </div>
            ) : drugs.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>
                        {searchTerm
                            ? <>No drugs match "<strong>{searchTerm}</strong>". Try a different search, or <button type="button" onClick={clearSearch} className={styles.btnSecondary} style={{ padding: '2px 8px', fontSize: 12 }}>clear filter</button>.</>
                            : 'No drugs found. Register a new drug to populate the master list.'}
                    </p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', padding: '16px' }}>
                    <div style={{
                        padding: '6px 0 12px',
                        fontSize: 13, color: '#6b7280',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span>
                            Showing <strong style={{ color: '#111827' }}>{drugs.length}</strong> drug{drugs.length === 1 ? '' : 's'}
                            {searchTerm && <> for "<strong style={{ color: '#0ea5e9' }}>{searchTerm}</strong>"</>}
                        </span>
                        {searchTerm && (
                            <button type="button" onClick={clearSearch} style={{
                                background: 'transparent', border: 'none', color: '#0ea5e9',
                                cursor: 'pointer', fontSize: 13, textDecoration: 'underline',
                            }}>
                                clear filter
                            </button>
                        )}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb', color: '#6b7280' }}>
                                <th style={{ padding: '12px 16px' }}>Code</th>
                                <th style={{ padding: '12px 16px' }}>Trade Name</th>
                                <th style={{ padding: '12px 16px' }}>Generic Name</th>
                                <th style={{ padding: '12px 16px' }}>Category</th>
                                <th style={{ padding: '12px 16px' }}>Strength</th>
                                <th style={{ padding: '12px 16px' }}>Dosage Form</th>
                                <th style={{ padding: '12px 16px' }}>Selling Price</th>
                                <th style={{ padding: '12px 16px' }}>Active Batches</th>
                            </tr>
                        </thead>
                        <tbody>
                            {drugs.map(drug => {
                                const regularPrice = drug.priceList?.[0]?.price || 0;
                                const currency = drug.priceList?.[0]?.currency || 'UGX';
                                return (
                                    <tr key={drug.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                        <td style={{ padding: '12px 16px', fontWeight: '500', color: '#374151', whiteSpace: 'nowrap' }}>{drug.drugCode}</td>
                                        <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{drug.name}</td>
                                        <td style={{ padding: '12px 16px', color: '#6b7280' }}>{drug.genericName}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span className={styles.badge} style={{ background: '#f3f4f6', color: '#4b5563' }}>
                                                {drug.category?.name || 'N/A'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{drug.strength}</td>
                                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{drug.dosageForm}</td>
                                        <td style={{ padding: '12px 16px', fontWeight: '700', color: '#0ea5e9', whiteSpace: 'nowrap' }}>
                                            {regularPrice > 0 ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3px' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>{currency}</span>
                                                    <span>{regularPrice.toLocaleString()}</span>
                                                </span>
                                            ) : (
                                                <span style={{ color: '#9ca3af', fontWeight: 400 }}>Not Set</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            {drug._count.batches > 0 ? (
                                                <span style={{ color: '#059669', fontWeight: 'bold' }}>{drug._count.batches}</span>
                                            ) : (
                                                <span style={{ color: '#ef4444' }}>None</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
