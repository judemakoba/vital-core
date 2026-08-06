'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Plus,
    Search,
    Trash2,
    ChevronDown,
    Tag,
    Settings2,
    Check,
    X,
    Activity,
    AlertCircle,
    Layers,
    Sparkles,
    Pill,
    FlaskConical,
    ScanLine,
    Stethoscope,
    Scissors
} from 'lucide-react';

import styles from './price-list.module.css';

interface ItemDetail {
    label: string;
    description: string | null;
    code?: string | null;
    baseRate?: number;
}

interface PriceListItem {
    id: string;
    serviceType: string | null;
    serviceId: string | null;
    negotiatedPrice: number;
    itemDetail: ItemDetail;
}

export default function InsurancePriceListPage() {
    return (
        <Suspense fallback={<div className="loading-container"><Activity className="spin" size={32} /><p>Loading…</p></div>}>
            <InsurancePriceListPageInner />
        </Suspense>
    );
}

function InsurancePriceListPageInner() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [priceList, setPriceList] = useState<PriceListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('');
    const [isAdding, setIsAdding] = useState(false);
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [seedingType, setSeedingType] = useState<'priceList' | 'catalog' | null>(null);
    const [isSeedingCatalog, setIsSeedingCatalog] = useState(false);
    const [catalogEmpty, setCatalogEmpty] = useState(false);
    // Banner for auto-seed on first navigation (?autoSeeded=1&count=N&b=…&d=…&l=…&r=…)
    const [autoSeedBanner, setAutoSeedBanner] = useState<{
        count: number;
        billable: number;
        drug: number;
        lab: number;
        radiology: number;
    } | null>(null);

    // Form state
    const [form, setForm] = useState({
        serviceType: 'CONSULTATION',
        negotiatedPrice: ''
    });

    useEffect(() => {
        if (params.id) {
            fetchPriceList();
        }
        // Auto-seed banner from ?autoSeeded=1&count=…
        if (searchParams.get('autoSeeded') === '1') {
            setAutoSeedBanner({
                count: Number(searchParams.get('count') || 0),
                billable: Number(searchParams.get('b') || 0),
                drug: Number(searchParams.get('d') || 0),
                lab: Number(searchParams.get('l') || 0),
                radiology: Number(searchParams.get('r') || 0),
            });
            // Strip the query so a refresh doesn't re-show the banner
            if (typeof window !== 'undefined') {
                window.history.replaceState({}, '', `/dashboard/admin/insurance/${params.id}/price-list`);
            }
        }
    }, [params.id, searchParams]);

    const fetchPriceList = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/admin/insurance/${params.id}/price-list`);
            if (!res.ok) throw new Error('Failed to load price list');
            const data = await res.json();
            setPriceList(data);
            setSearchTerm('');
            setCategoryFilter('');
            
            // If price list is empty, check if it's because the catalog is empty
            if (data.length === 0) {
                const catRes = await fetch('/api/lab/catalog'); // Using existing catalog API to check count
                if (catRes.ok) {
                    const catData = await catRes.json();
                    if (catData.length === 0) setCatalogEmpty(true);
                }
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSeed = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/admin/insurance/${params.id}/price-list/seed`, { method: 'POST' });
            
            if (!res.ok) {
                 const errData = await res.json().catch(() => ({}));
                 throw new Error(errData.error || 'Failed to seed price list');
            }
            
            const result = await res.json();
            await fetchPriceList();
            alert(result.message || 'Price list successfully initialized with clinic items.');
        } catch (err: any) {
            alert(err.message);
        } finally {
            setLoading(false);
            setSeedingType(null);
        }
    };

    const handleSeedCatalog = async () => {
        try {
            setIsSeedingCatalog(true);
            const res = await fetch('/api/admin/catalog/seed', { method: 'POST' });
            
            if (!res.ok) {
                 const errData = await res.json().catch(() => ({}));
                 throw new Error(errData.error || 'Failed to seed clinical catalog');
            }
            
            const result = await res.json();
            setCatalogEmpty(false);
            alert(result.message);
            // Now that we have a catalog, we can seed this partner's price list
            handleSeed();
        } catch (err: any) {
            alert(err.message);
            setSeedingType(null);
        } finally {
            setIsSeedingCatalog(false);
        }
    };

    const updatePriceValue = async (itemId: string, newValue: number) => {
        try {
            const res = await fetch(`/api/admin/insurance/${params.id}/price-list/${itemId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ negotiatedPrice: newValue })
            });
            if (!res.ok) throw new Error('Failed to update price');
            setPriceList(prev => prev.map(item => item.id === itemId ? { ...item, negotiatedPrice: newValue } : item));
        } catch (err: any) {
            alert(err.message);
        }
    };

    const applyBulkPrice = async () => {
        const newPrice = prompt('Enter a flat negotiated price to set for ALL items (e.g., 15000):');
        if (newPrice === null || isNaN(Number(newPrice))) return;
        
        try {
            setLoading(true);
            await Promise.all(priceList.map(item => 
                fetch(`/api/admin/insurance/${params.id}/price-list/${item.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ negotiatedPrice: Number(newPrice) })
                })
            ));
            await fetchPriceList();
            alert(`Updated all items to UGX ${Number(newPrice).toLocaleString()}.`);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const endpoint = editingRuleId 
                ? `/api/admin/insurance/${params.id}/price-list/${editingRuleId}`
                : `/api/admin/insurance/${params.id}/price-list`;
            
            const method = editingRuleId ? 'PATCH' : 'POST';

            const res = await fetch(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            if (!res.ok) throw new Error(`Failed to ${editingRuleId ? 'update' : 'create'} rule`);
            
            setIsAdding(false);
            setEditingRuleId(null);
            fetchPriceList();
            setForm({
                serviceType: 'CONSULTATION',
                negotiatedPrice: ''
            });
        } catch (err: any) {
            alert(err.message);
        }
    };

    const executeDelete = async (ruleId: string) => {
        try {
            console.log('Sending DELETE request to API...');
            const res = await fetch(`/api/admin/insurance/${params.id}/price-list/${ruleId}`, {
                method: 'DELETE'
            });
            
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                console.error('API Error Response:', errData);
                throw new Error(errData.error || 'Failed to delete rule');
            }
            
            console.log('Delete successful on backend, updating UI state...');
            setPriceList(prev => prev.filter(item => item.id !== ruleId));
        } catch (err: any) {
            console.error('Delete Exception:', err);
            window.alert('Delete Error: ' + err.message);
        } finally {
            setDeletingId(null);
        }
    };

    const openEdit = (item: PriceListItem) => {
        setForm({
            serviceType: item.serviceType || 'CONSULTATION',
            negotiatedPrice: item.negotiatedPrice.toString(),
        });
        setEditingRuleId(item.id);
        setIsAdding(true);
    };

    const openAdd = () => {
        setForm({
            serviceType: 'CONSULTATION',
            negotiatedPrice: ''
        });
        setEditingRuleId(null);
        setIsAdding(true);
    };

    const getPriceDisplay = (item: PriceListItem) => {
        return `UGX ${item.negotiatedPrice.toLocaleString()}`;
    };

    return (
        <div className={styles.priceListContainer}>
            <div className="breadcrumb">
                <Link href={`/dashboard/admin/insurance/${params.id}`} className={styles.backLink}>
                    <ArrowLeft size={18} />
                    Back to Partner Details
                </Link>
            </div>

            <header className={`page-header glass shadow-sm ${styles.pageHeader}`}>
                <div className={styles.headerContent}>
                    <h1>Service Price List</h1>
                    <p>Manage pre-negotiated rates for this insurance partner</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-secondary" onClick={() => setSeedingType('priceList')}>
                        <Layers size={18} />
                        Initialize Full List
                    </button>
                    <button className="btn-primary" onClick={openAdd}>
                        <Plus size={18} />
                        Add Rule
                    </button>
                </div>
            </header>

            <div className="main-content">
                {autoSeedBanner && (
                    <div className={styles.autoSeedBanner} role="status">
                        <Sparkles size={20} className={styles.autoSeedIcon} />
                        <div className={styles.autoSeedBody}>
                            <strong>Auto-initialized {autoSeedBanner.count.toLocaleString()} item{autoSeedBanner.count === 1 ? '' : 's'} from the clinic's master catalog.</strong>
                            <span>
                                {autoSeedBanner.billable > 0 && <span className={styles.autoSeedChip}><Stethoscope size={12} /> {autoSeedBanner.billable} services</span>}
                                {autoSeedBanner.drug > 0 && <span className={styles.autoSeedChip}><Pill size={12} /> {autoSeedBanner.drug} drugs</span>}
                                {autoSeedBanner.lab > 0 && <span className={styles.autoSeedChip}><FlaskConical size={12} /> {autoSeedBanner.lab} labs</span>}
                                {autoSeedBanner.radiology > 0 && <span className={styles.autoSeedChip}><ScanLine size={12} /> {autoSeedBanner.radiology} radiology</span>}
                            </span>
                            <small>Each row starts at the clinic's general price. Adjust individual rows to reflect the partner's negotiated rate.</small>
                        </div>
                        <button
                            className={styles.autoSeedDismiss}
                            onClick={() => setAutoSeedBanner(null)}
                            aria-label="Dismiss"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                <div className={`filters-bar glass shadow-sm mb-4 ${styles.filtersBar}`}>
                    <div className={styles.searchBox}>
                        <Search size={18} />
                        <input
                            className={styles.searchBoxInput}
                            type="text"
                            placeholder="Search by name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="filter-group" style={{ display: 'flex', gap: '1rem' }}>
                        <button className="btn-secondary" onClick={applyBulkPrice}>
                            <Tag size={18} />
                            Set Bulk Price
                        </button>
                        <select className={styles.filterSelect} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                            <option value="">All Categories</option>
                            <option value="CONSULTATION">Consultations</option>
                            <option value="LAB_TEST">Lab Tests</option>
                            <option value="PHARMACY">Pharmacy</option>
                            <option value="PROCEDURE">Procedures</option>
                            <option value="RADIOLOGY">Radiology</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>
                </div>

                {(() => {
                    const lower = searchTerm.toLowerCase();
                    const filtered = priceList.filter(item => {
                        const matchesSearch = !searchTerm ||
                            item.itemDetail.label.toLowerCase().includes(lower) ||
                            (item.itemDetail.description ?? '').toLowerCase().includes(lower) ||
                            (item.itemDetail.code ?? '').toLowerCase().includes(lower);
                        const matchesCategory = !categoryFilter || item.serviceType === categoryFilter;
                        return matchesSearch && matchesCategory;
                    });

                    const groups: Record<string, PriceListItem[]> = {};
                    for (const item of filtered) {
                        const key = item.serviceType ?? 'OTHER';
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(item);
                    }

                    const categoryLabel: Record<string, string> = {
                        CONSULTATION: 'Consultations',
                        LAB_TEST: 'Lab Tests',
                        PHARMACY: 'Pharmacy / Drugs',
                        PROCEDURE: 'Procedures',
                        RADIOLOGY: 'Radiology',
                        OTHER: 'Other',
                    };

                    const categoryOrder = ['CONSULTATION', 'LAB_TEST', 'PHARMACY', 'PROCEDURE', 'RADIOLOGY', 'OTHER'];

                    return (
                        <div className={styles.groupedTable}>
                            {loading ? (
                                <div className={`table-container glass shadow-sm ${styles.tableContainer}`}>
                                    <div className={styles.tableMsg}><Activity className={styles.spin} /> Loading...</div>
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className={`table-container glass shadow-sm ${styles.tableContainer}`}>
                                    <div className={styles.tableMsg}>
                                        <AlertCircle size={40} className="mb-g" />
                                        <p>{priceList.length === 0
                                            ? (catalogEmpty ? 'The Clinic Master Catalog is currently empty.' : 'No pricing rules defined yet.')
                                            : 'No items match the current filter.'}</p>
                                        {priceList.length === 0 && (
                                            catalogEmpty ? (
                                                <button className="btn-primary mt-2" onClick={() => setSeedingType('catalog')}>Initialize Master Clinical Catalog</button>
                                            ) : (
                                                <button className="btn-secondary mt-2" onClick={() => setSeedingType('priceList')}>Initialize Price List from Catalog</button>
                                            )
                                        )}
                                    </div>
                                </div>
                            ) : (
                                categoryOrder.map(key => {
                                    const items = groups[key];
                                    if (!items || items.length === 0) return null;
                                    return (
                                        <div key={key} className={`category-section glass shadow-sm ${styles.categorySection}`}>
                                            <div className={styles.categoryHeader}>
                                                <span className={`scope-icon ${key.toLowerCase()}`}><Tag size={14} /></span>
                                                <h3>{categoryLabel[key] ?? key}</h3>
                                                <span className={styles.catCount}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                                            </div>
                                            <table className={styles.priceTable}>
                                                <thead>
                                                    <tr>
                                                        <th>Item</th>
                                                        <th>Details</th>
                                                        <th>Base Rate</th>
                                                        <th>Negotiated Price</th>
                                                        <th>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {items.map(item => (
                                                        <tr key={item.id}>
                                                            <td>
                                                                <span className={styles.itemLabel}>{item.itemDetail.label}</span>
                                                                {item.itemDetail.code && <span className={styles.itemCode}>{item.itemDetail.code}</span>}
                                                            </td>
                                                            <td>
                                                                {item.itemDetail.description
                                                                    ? <span className={styles.itemDesc}>{item.itemDetail.description}</span>
                                                                    : <span className="text-muted">—</span>}
                                                            </td>
                                                            <td>
                                                                {item.itemDetail.baseRate
                                                                    ? <span className={styles.baseRate}>UGX {item.itemDetail.baseRate.toLocaleString()}</span>
                                                                    : <span className="text-muted">—</span>}
                                                            </td>
                                                            <td>
                                                                <span className={`${styles.priceBadge} ${styles.priceBadgeFixed}`}>UGX {item.negotiatedPrice.toLocaleString()}</span>
                                                            </td>
                                                            <td>
                                                                <div className={styles.tableActions}>
                                                                    <button type="button" className={`${styles.btnIcon} ${styles.btnIconBlue}`} onClick={() => openEdit(item)}><Settings2 size={16} /></button>
                                                                    <button type="button" className={`${styles.btnIcon} ${styles.btnIconRed}`} onClick={() => setDeletingId(item.id)}><Trash2 size={16} /></button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    );
                })()}
                </div>

                {deletingId && (
                    <div className={styles.modalOverlay}>
                        <div className={`delete-modal glass shadow-lg animate-slide-up ${styles.deleteModal}`}>
                            <div className={styles.modalHeader}>
                                <h2>Confirm Deletion</h2>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
                                    Are you sure you want to delete this pricing rule? This action cannot be undone.
                                </p>
                            </div>
                            <div className="modal-footer" style={{ marginTop: '2rem', justifyContent: 'flex-end', display: 'flex', gap: '1rem' }}>
                                <button className="btn-secondary" onClick={() => setDeletingId(null)}>Cancel</button>
                                <button className="btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444' }} onClick={() => executeDelete(deletingId)}>Delete Rule</button>
                            </div>
                        </div>
                    </div>
                )}

                {seedingType && (
                    <div className={styles.modalOverlay}>
                        <div className={`delete-modal glass shadow-lg animate-slide-up ${styles.deleteModal}`}>
                            <div className={styles.modalHeader}>
                                <h2>Confirm Initialization</h2>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
                                    {seedingType === 'catalog' 
                                        ? 'This will seed the clinic with a standard set of services (Consultations, Labs, etc.). Continue?'
                                        : 'This will populate this price list with all current clinic items. Continue?'}
                                </p>
                            </div>
                            <div className="modal-footer" style={{ marginTop: '2rem', justifyContent: 'flex-end', display: 'flex', gap: '1rem' }}>
                                <button className="btn-secondary" onClick={() => setSeedingType(null)}>Cancel</button>
                                <button className="btn-primary" onClick={() => seedingType === 'catalog' ? handleSeedCatalog() : handleSeed()}>
                                    Initialize Now
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {isAdding && (
                    <div className={styles.modalOverlay}>
                        <div className={`modal-content glass shadow-lg animate-slide-up ${styles.modalContent}`}>
                            <div className={styles.modalHeader}>
                                <h2>{editingRuleId ? 'Edit Price Rule' : 'Add Price Rule'}</h2>
                                <button className="btn-close" onClick={() => setIsAdding(false)}><X size={20} /></button>
                            </div>
                            <form onSubmit={handleCreate}>
                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label>Service Type</label>
                                        <select
                                            value={form.serviceType}
                                            onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
                                        >
                                        <option value="CONSULTATION">Consultation</option>
                                        <option value="LAB_TEST">Lab Test</option>
                                        <option value="PHARMACY">Pharmacy</option>
                                        <option value="PROCEDURE">Procedure</option>
                                        <option value="RADIOLOGY">Radiology</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>Negotiated Price (UGX)</label>
                                        <input
                                            type="number"
                                            required
                                            value={form.negotiatedPrice}
                                            onChange={(e) => setForm({ ...form, negotiatedPrice: e.target.value })}
                                            placeholder="e.g. 15000"
                                        />
                                    </div>
                                </div>
                                <div className={styles.modalFooter}>
                                    <button type="button" className="btn-secondary" onClick={() => setIsAdding(false)}>Cancel</button>
                                    <button type="submit" className="btn-primary">Save Rule</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </div>
    );
}
