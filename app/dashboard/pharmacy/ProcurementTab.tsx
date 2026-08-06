'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    AlertTriangle, Package, Plus, RefreshCw, ShoppingCart, Truck, TrendingDown,
    DollarSign, Calendar, Layers, ChevronDown, ChevronUp, ClipboardList,
    CheckCircle2, AlertCircle, FileText
} from 'lucide-react';
import styles from './pharmacy.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────
type Urgency = 'STOCKOUT' | 'CRITICAL' | 'LOW_STOCK' | 'NEAR_REORDER';

interface Suggestion {
    drugId: string;
    drugCode: string;
    drugName: string;
    genericName: string;
    dosageForm: string;
    strength: string;
    packageUnit: string;
    currentStock: number;
    reorderLevel: number | null;
    maxStock: number | null;
    averageMonthlyUsage: number | null;
    leadTimeDays: number | null;
    reorderPoint: number | null;
    suggestedQty: number;
    estimatedCost: number;
    urgency: Urgency;
    preferredSupplier: {
        id: string;
        supplierCode: string;
        name: string;
        phone: string;
        leadTimeDays: number | null;
    } | null;
    lastPurchasePrice: number | null;
    lastPurchaseDate: Date | string | null;
}

interface SupplierGroup {
    supplier: Suggestion['preferredSupplier'];
    items: Suggestion[];
    totalCost: number;
}

interface Summary {
    totalItems: number;
    totalStockout: number;
    totalCritical: number;
    totalLowStock: number;
    totalNearReorder: number;
    totalEstimatedCost: number;
    suppliersCount: number;
}

interface SuggestionsResponse {
    suggestions: Suggestion[];
    bySupplier: SupplierGroup[];
    summary: Summary;
}

interface RecentReceipt {
    type: 'po' | 'adhoc';
    id: string;
    sortDate: string;
    grNumber?: string;
    poNumber?: string;
    supplierName?: string;
    receivedBy?: string;
    invoiceNumber?: string | null;
    itemCount?: number;
    totalQuantity?: number;
    totalValue?: number;
    status?: string;
    batchNumber?: string;
    drugCode?: string;
    drugName?: string;
    quantityReceived?: number;
    storageLocation?: string | null;
    receivedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const URGENCY_META: Record<Urgency, { label: string; color: string; bg: string; border: string; order: number }> = {
    STOCKOUT:     { label: '🚨 Stockout',    color: '#7f1d1d', bg: '#fee2e2', border: '#fca5a5', order: 0 },
    CRITICAL:     { label: '🔴 Critical',    color: '#991b1b', bg: '#fef2f2', border: '#fecaca', order: 1 },
    LOW_STOCK:    { label: '🟠 Low Stock',   color: '#9a3412', bg: '#fff7ed', border: '#fed7aa', order: 2 },
    NEAR_REORDER: { label: '🟡 Reorder',     color: '#854d0e', bg: '#fefce8', border: '#fde68a', order: 3 },
};

const fmtUGX = (n: number) => `UGX ${n.toLocaleString()}`;
const fmtDate = (d: Date | string | null) => d ? new Date(d).toLocaleDateString() : '—';

// ─── Component ──────────────────────────────────────────────────────────────
export default function ProcurementTab() {
    const [data, setData] = useState<SuggestionsResponse | null>(null);
    const [recent, setRecent] = useState<RecentReceipt[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set());
    const [showQuickEntry, setShowQuickEntry] = useState(false);
    const [filter, setFilter] = useState<'ALL' | Urgency>('ALL');

    // Quick entry form state
    const [drugs, setDrugs] = useState<any[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [priceSource, setPriceSource] = useState<'REGULAR' | 'LATEST_BATCH' | 'NONE'>('NONE');
    const [priceChanged, setPriceChanged] = useState(false);
    const [formData, setFormData] = useState({
        drugId: '',
        batchNumber: '',
        expiryDate: '',
        quantityReceived: '',
        purchasePrice: '',
        sellingPrice: '',
        source: 'WALK_IN',
        notes: '',
        storageLocation: 'Main Pharmacy'
    });

    // When user selects a drug, auto-fill price from existing pricing
    const handleDrugChange = (drugId: string) => {
        const drug = drugs.find(d => d.id === drugId);
        const regularPrice = drug?.priceList?.[0]?.price;
        const purchasePrice = regularPrice != null ? String(regularPrice * 0.6) : ''; // default cost ~ 60% of retail
        const sellingPrice = regularPrice != null ? String(regularPrice) : '';
        setFormData(prev => ({
            ...prev,
            drugId,
            purchasePrice,
            sellingPrice,
        }));
        setPriceSource(regularPrice != null ? 'REGULAR' : 'NONE');
        setPriceChanged(false);
    };

    const handlePriceChange = (field: 'purchasePrice' | 'sellingPrice', value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setPriceChanged(true);
    };

    const fetchAll = async () => {
        setLoading(true);
        setErrorMsg('');
        try {
            const [suggRes, recentRes, drugsRes] = await Promise.all([
                fetch('/api/pharmacy/reorder-suggestions', { credentials: 'include' }),
                fetch('/api/pharmacy/recent-receipts', { credentials: 'include' }),
                fetch('/api/pharmacy/drugs', { credentials: 'include' }),
            ]);
            if (suggRes.ok) {
                const j = await suggRes.json();
                setData(j);
            } else {
                setErrorMsg('Failed to load reorder suggestions');
            }
            if (recentRes.ok) {
                const j = await recentRes.json();
                setRecent(j);
            }
            if (drugsRes.ok) {
                const j = await drugsRes.json();
                setDrugs(j);
            }
        } catch (e) {
            setErrorMsg('Network error loading procurement data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, []);

    const filteredBySupplier = useMemo(() => {
        if (!data) return [];
        if (filter === 'ALL') return data.bySupplier;
        return data.bySupplier
            .map(g => ({ ...g, items: g.items.filter(s => s.urgency === filter) }))
            .filter(g => g.items.length > 0);
    }, [data, filter]);

    const toggleSupplier = (key: string) => {
        setCollapsedSuppliers(prev => {
            const n = new Set(prev);
            n.has(key) ? n.delete(key) : n.add(key);
            return n;
        });
    };

    const handleQuickSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.drugId || !formData.batchNumber || !formData.expiryDate || !formData.quantityReceived || !formData.purchasePrice) {
            setErrorMsg('Please fill in all required fields');
            return;
        }
        setSubmitting(true);
        setErrorMsg('');
        try {
            const res = await fetch('/api/pharmacy/stock-in', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    drugId: formData.drugId,
                    batchNumber: formData.batchNumber,
                    expiryDate: formData.expiryDate,
                    quantityReceived: formData.quantityReceived,
                    purchasePrice: formData.purchasePrice,
                    sellingPrice: formData.sellingPrice || null,
                    storageLocation: formData.storageLocation,
                })
            });
            if (res.ok) {
                setSuccessMsg(`Ad-hoc receipt of ${formData.quantityReceived} units logged successfully`);
                setFormData({
                    drugId: '', batchNumber: '', expiryDate: '',
                    quantityReceived: '', purchasePrice: '', sellingPrice: '',
                    source: 'WALK_IN', notes: '', storageLocation: 'Main Pharmacy'
                });
                setPriceSource('NONE');
                setPriceChanged(false);
                setShowQuickEntry(false);
                fetchAll();
                setTimeout(() => setSuccessMsg(''), 5000);
            } else {
                const err = await res.json();
                setErrorMsg(err.error || 'Failed to log receipt');
            }
        } catch {
            setErrorMsg('Network error while saving');
        } finally {
            setSubmitting(false);
        }
    };

    const printPO = (group: SupplierGroup) => {
        if (!group.supplier) return;
        const lines = [
            `PURCHASE ORDER SUGGESTION`,
            `Supplier: ${group.supplier.name} (${group.supplier.supplierCode})`,
            `Phone: ${group.supplier.phone || '—'}`,
            `Lead Time: ${group.supplier.leadTimeDays ?? '—'} days`,
            `Generated: ${new Date().toLocaleString()}`,
            ``,
            ...group.items.map((s, i) =>
                `${i + 1}. ${s.drugName} (${s.drugCode}) ${s.strength} ${s.dosageForm}\n` +
                `   Suggested Qty: ${s.suggestedQty} ${s.packageUnit}\n` +
                `   Last Price: ${s.lastPurchasePrice ? fmtUGX(s.lastPurchasePrice) : '—'} | ` +
                `Est Cost: ${fmtUGX(s.estimatedCost)}\n` +
                `   Urgency: ${URGENCY_META[s.urgency].label}\n` +
                `   Current Stock: ${s.currentStock} | Reorder Level: ${s.reorderLevel ?? '—'}`
            ),
            ``,
            `TOTAL ESTIMATED COST: ${fmtUGX(group.totalCost)}`,
        ].join('\n');

        const w = window.open('', '_blank');
        if (w) {
            w.document.write(`<html><head><title>PO Suggestion - ${group.supplier.name}</title>
                <style>body{font-family:monospace;padding:24px;white-space:pre-wrap;line-height:1.6;}</style>
                </head><body>${lines.replace(/\n/g, '<br>')}</body></html>`);
            w.document.close();
            w.print();
        }
    };

    const summary = data?.summary;

    return (
        <div className={styles.tabContent}>
            {/* Header row */}
            <div className={styles.tabActions}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>Procurement Workspace</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                        Smart reorder suggestions based on stock levels, usage patterns, and supplier lead times
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as any)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid #d1d5db',
                            fontSize: '13px',
                            background: 'white',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >
                        <option value="ALL">All ({summary?.totalItems ?? 0})</option>
                        <option value="STOCKOUT">🚨 Stockouts ({summary?.totalStockout ?? 0})</option>
                        <option value="CRITICAL">🔴 Critical ({summary?.totalCritical ?? 0})</option>
                        <option value="LOW_STOCK">🟠 Low Stock ({summary?.totalLowStock ?? 0})</option>
                        <option value="NEAR_REORDER">🟡 Reorder ({summary?.totalNearReorder ?? 0})</option>
                    </select>
                    <button className={styles.btnSecondary} onClick={fetchAll} disabled={loading}>
                        <RefreshCw size={16} style={{ marginRight: '6px' }} className={loading ? styles.spin : ''} />
                        Refresh
                    </button>
                    <button
                        className={styles.btnPrimary}
                        onClick={() => setShowQuickEntry(!showQuickEntry)}
                    >
                        <Plus size={16} style={{ marginRight: '6px' }} />
                        {showQuickEntry ? 'Close' : 'Ad-hoc Receipt'}
                    </button>
                </div>
            </div>

            {errorMsg && <div className={styles.errorBanner} style={{ marginBottom: '14px' }}><AlertCircle size={16} />{errorMsg}</div>}
            {successMsg && <div className={styles.successBanner} style={{ marginBottom: '14px' }}><CheckCircle2 size={16} />{successMsg}</div>}

            {/* KPI cards */}
            <div className={styles.kpiGrid} style={{ marginBottom: '18px' }}>
                <div className={`${styles.kpiCard} ${styles.kpiAlerts}`}>
                    <div className={styles.kpiIcon}>📋</div>
                    <div className={styles.kpiContent}>
                        <span className={styles.kpiLabel}>Items to Reorder</span>
                        <span className={styles.kpiValue}>{summary?.totalItems ?? 0}</span>
                        <span className={styles.kpiSub}>{summary?.suppliersCount ?? 0} supplier{summary?.suppliersCount === 1 ? '' : 's'}</span>
                    </div>
                </div>
                <div className={`${styles.kpiCard} ${styles.kpiAlerts}`}>
                    <div className={styles.kpiIcon}>🚨</div>
                    <div className={styles.kpiContent}>
                        <span className={styles.kpiLabel}>Stockouts</span>
                        <span className={styles.kpiValue} style={{ color: '#dc2626' }}>{summary?.totalStockout ?? 0}</span>
                        <span className={styles.kpiSub}>Out of stock — urgent</span>
                    </div>
                </div>
                <div className={`${styles.kpiCard} ${styles.kpiAlerts}`}>
                    <div className={styles.kpiIcon}>🔴</div>
                    <div className={styles.kpiContent}>
                        <span className={styles.kpiLabel}>Critical</span>
                        <span className={styles.kpiValue} style={{ color: '#ea580c' }}>{summary?.totalCritical ?? 0}</span>
                        <span className={styles.kpiSub}>Below half of reorder point</span>
                    </div>
                </div>
                <div className={`${styles.kpiCard} ${styles.kpiInventory}`}>
                    <div className={styles.kpiIcon}>💰</div>
                    <div className={styles.kpiContent}>
                        <span className={styles.kpiLabel}>Estimated Restock Cost</span>
                        <span className={styles.kpiValue} style={{ fontSize: '18px' }}>
                            {summary ? fmtUGX(summary.totalEstimatedCost) : '—'}
                        </span>
                        <span className={styles.kpiSub}>Based on last purchase prices</span>
                    </div>
                </div>
            </div>

            {/* Quick entry panel (collapsible) */}
            {showQuickEntry && (
                <div style={{
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '10px',
                    padding: '18px 22px',
                    marginBottom: '18px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '15px', color: '#92400e' }}>⚡ Ad-hoc / Emergency Receipt</h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#a16207' }}>
                                For donations, walk-in purchases, and stock received without a purchase order. For routine procurement, use the reorder suggestions below.
                            </p>
                        </div>
                    </div>

                    {/* Price source indicator — shown when a drug is selected */}
                    {formData.drugId && (
                        <div style={{
                            background: priceSource === 'NONE' ? '#fef2f2' : priceChanged ? '#fef3c7' : '#f0f9ff',
                            border: `1px solid ${priceSource === 'NONE' ? '#fecaca' : priceChanged ? '#fde68a' : '#bae6fd'}`,
                            color: priceSource === 'NONE' ? '#991b1b' : priceChanged ? '#92400e' : '#0369a1',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            fontSize: '12.5px',
                            marginBottom: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <DollarSign size={14} />
                                {priceSource === 'NONE' ? (
                                    <span>⚠ <strong>No prior price</strong> found for this drug — please enter a valid cost and (optionally) selling price.</span>
                                ) : priceChanged ? (
                                    <span>✏️ <strong>Price updated</strong> — overrides the existing record. Server will save with your values.</span>
                                ) : (
                                    <span>✓ Prices auto-filled from <strong>REGULAR price</strong> (UGX {parseFloat(formData.sellingPrice).toLocaleString()}). Edit to override.</span>
                                )}
                            </div>
                            {priceSource === 'REGULAR' && !priceChanged && (
                                <span style={{ fontSize: '11px', color: '#0369a1' }}>
                                    Change the values to query a new price on save
                                </span>
                            )}
                        </div>
                    )}

                    <form onSubmit={handleQuickSubmit} style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr auto',
                        gap: '10px',
                        alignItems: 'end'
                    }}>
                        <div>
                            <label style={fieldLabel}>Drug *</label>
                            <select required style={fieldInput} value={formData.drugId} onChange={e => handleDrugChange(e.target.value)}>
                                <option value="">Select drug…</option>
                                {drugs.map(d => <option key={d.id} value={d.id}>{d.drugCode} — {d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={fieldLabel}>Batch # *</label>
                            <input required style={fieldInput} placeholder="BN-001" value={formData.batchNumber} onChange={e => setFormData({ ...formData, batchNumber: e.target.value })} />
                        </div>
                        <div>
                            <label style={fieldLabel}>Expiry *</label>
                            <input required type="date" style={fieldInput} value={formData.expiryDate} onChange={e => setFormData({ ...formData, expiryDate: e.target.value })} />
                        </div>
                        <div>
                            <label style={fieldLabel}>Qty *</label>
                            <input required type="number" min="1" style={fieldInput} placeholder="0" value={formData.quantityReceived} onChange={e => setFormData({ ...formData, quantityReceived: e.target.value })} />
                        </div>
                        <div>
                            <label style={fieldLabel}>Cost (UGX) *</label>
                            <input required type="number" min="0" step="0.01" style={fieldInput} placeholder="0" value={formData.purchasePrice} onChange={e => handlePriceChange('purchasePrice', e.target.value)} />
                        </div>
                        <div>
                            <label style={fieldLabel}>Price (UGX)</label>
                            <input type="number" min="0" step="0.01" style={fieldInput} placeholder="0" value={formData.sellingPrice} onChange={e => handlePriceChange('sellingPrice', e.target.value)} />
                        </div>
                        <div>
                            <label style={fieldLabel}>Location</label>
                            <input style={fieldInput} placeholder="Shelf A1" value={formData.storageLocation} onChange={e => setFormData({ ...formData, storageLocation: e.target.value })} />
                        </div>
                        <button type="submit" disabled={submitting} className={styles.btnPrimary} style={{ height: '38px', padding: '0 18px' }}>
                            {submitting ? 'Saving…' : 'Save'}
                        </button>
                    </form>
                </div>
            )}

            {/* Main: Reorder suggestions grouped by supplier */}
            {loading && !data ? (
                <div className={styles.loading}><div className={styles.spinner} /><p>Computing reorder suggestions…</p></div>
            ) : !data || data.suggestions.length === 0 ? (
                <div className={styles.card}>
                    <div className={styles.emptyState} style={{ padding: '64px 24px' }}>
                        <CheckCircle2 size={56} color="#22c55e" style={{ marginBottom: '16px' }} />
                        <h3 style={{ margin: '0 0 8px 0', color: '#166534' }}>All stock levels are healthy</h3>
                        <p>No drugs currently need restocking. Set reorder levels and average monthly usage on drug master records to enable smart suggestions.</p>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {filteredBySupplier.map((group) => {
                        const key = group.supplier?.id ?? '__none__';
                        const collapsed = collapsedSuppliers.has(key);
                        return (
                            <div key={key} className={styles.card} style={{ overflow: 'hidden' }}>
                                {/* Supplier group header */}
                                <div style={{
                                    padding: '14px 18px',
                                    background: group.supplier ? 'linear-gradient(90deg, #f0f9ff 0%, #ffffff 100%)' : '#fef2f2',
                                    borderBottom: collapsed ? 'none' : '1px solid #e5e7eb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <button
                                            onClick={() => toggleSupplier(key)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#64748b', display: 'flex' }}
                                        >
                                            {collapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                                        </button>
                                        <Truck size={20} color={group.supplier ? '#0369a1' : '#dc2626'} />
                                        <div>
                                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                                {group.supplier ? group.supplier.name : '⚠️ No preferred supplier assigned'}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                                {group.supplier ? (
                                                    <>
                                                        {group.supplier.supplierCode} · {group.supplier.phone || 'no phone'} · Lead: {group.supplier.leadTimeDays ?? '?'}d
                                                    </>
                                                ) : (
                                                    <>Assign a preferred supplier to these drugs to enable auto-grouping</>
                                                )}
                                            </div>
                                        </div>
                                        <span className={styles.badge} style={{ background: '#0ea5e9', color: 'white', fontSize: '11px', padding: '3px 10px' }}>
                                            {group.items.length} item{group.items.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Est. Total</div>
                                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0369a1' }}>{fmtUGX(group.totalCost)}</div>
                                        </div>
                                        {group.supplier && (
                                            <button
                                                onClick={() => printPO(group)}
                                                className={styles.btnPrimary}
                                                style={{ fontSize: '12.5px', padding: '8px 14px' }}
                                                title="Generate a printable PO summary for this supplier"
                                            >
                                                <FileText size={14} style={{ marginRight: '6px' }} />
                                                Print PO
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {!collapsed && (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                                <th style={thCell}>Drug</th>
                                                <th style={thCell}>Urgency</th>
                                                <th style={{ ...thCell, textAlign: 'right' }}>In Stock</th>
                                                <th style={{ ...thCell, textAlign: 'right' }}>Reorder Lvl</th>
                                                <th style={{ ...thCell, textAlign: 'right' }}>Reorder Point</th>
                                                <th style={{ ...thCell, textAlign: 'right' }}>Suggested Qty</th>
                                                <th style={{ ...thCell, textAlign: 'right' }}>Last Price</th>
                                                <th style={{ ...thCell, textAlign: 'right' }}>Est. Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.items.map(s => {
                                                const meta = URGENCY_META[s.urgency];
                                                return (
                                                    <tr key={s.drugId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                        <td style={{ ...tdCell, fontWeight: 600, color: '#0f172a' }}>
                                                            {s.drugName}
                                                            <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 400, marginTop: '2px' }}>
                                                                {s.drugCode} · {s.genericName} · {s.strength} {s.dosageForm}
                                                            </div>
                                                        </td>
                                                        <td style={tdCell}>
                                                            <span style={{
                                                                background: meta.bg,
                                                                color: meta.color,
                                                                border: `1px solid ${meta.border}`,
                                                                padding: '3px 8px',
                                                                borderRadius: '999px',
                                                                fontSize: '11px',
                                                                fontWeight: 700
                                                            }}>{meta.label}</span>
                                                        </td>
                                                        <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: s.currentStock === 0 ? '#dc2626' : '#0f172a' }}>
                                                            {s.currentStock}
                                                        </td>
                                                        <td style={{ ...tdCell, textAlign: 'right', color: '#6b7280' }}>{s.reorderLevel ?? '—'}</td>
                                                        <td style={{ ...tdCell, textAlign: 'right', color: '#6b7280' }}>{s.reorderPoint ?? '—'}</td>
                                                        <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: '#0369a1' }}>
                                                            +{s.suggestedQty}
                                                            <div style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 400 }}>{s.packageUnit}</div>
                                                        </td>
                                                        <td style={{ ...tdCell, textAlign: 'right', color: '#475569' }}>{s.lastPurchasePrice ? fmtUGX(s.lastPurchasePrice) : '—'}</td>
                                                        <td style={{ ...tdCell, textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmtUGX(s.estimatedCost)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Recent receipts (last 30 days) */}
            {recent.length > 0 && (
                <div className={styles.card} style={{ marginTop: '20px' }}>
                    <div className={styles.cardHeader}>
                        <h3>Recent Receipts (Last 30 Days)</h3>
                        <span className={styles.badge}>{recent.length}</span>
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
                                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={thCell}>Type</th>
                                    <th style={thCell}>Reference</th>
                                    <th style={thCell}>Drug / Supplier</th>
                                    <th style={{ ...thCell, textAlign: 'right' }}>Qty</th>
                                    <th style={{ ...thCell, textAlign: 'right' }}>Value</th>
                                    <th style={thCell}>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent.map((r) => (
                                    <tr key={`${r.type}-${r.id}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={tdCell}>
                                            {r.type === 'po' ? (
                                                <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                                                    PO
                                                </span>
                                            ) : (
                                                <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                                                    AD-HOC
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ ...tdCell, fontFamily: 'monospace', fontSize: '12px' }}>
                                            {r.type === 'po' ? r.grNumber : r.batchNumber}
                                            {r.poNumber && <div style={{ fontSize: '10px', color: '#6b7280' }}>{r.poNumber}</div>}
                                        </td>
                                        <td style={tdCell}>
                                            {r.type === 'po' ? (
                                                <>
                                                    <span style={{ fontWeight: 600 }}>{r.supplierName}</span>
                                                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{r.itemCount} line items</div>
                                                </>
                                            ) : (
                                                <>
                                                    <span style={{ fontWeight: 600 }}>{r.drugName}</span>
                                                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{r.drugCode}</div>
                                                </>
                                            )}
                                        </td>
                                        <td style={{ ...tdCell, textAlign: 'right', fontWeight: 600 }}>{r.totalQuantity ?? r.quantityReceived}</td>
                                        <td style={{ ...tdCell, textAlign: 'right', color: '#0369a1', fontWeight: 600 }}>{r.totalValue ? fmtUGX(r.totalValue) : '—'}</td>
                                        <td style={{ ...tdCell, color: '#6b7280', fontSize: '12px' }}>{new Date(r.receivedAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

const fieldLabel: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: '#78350f',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: '4px'
};
const fieldInput: React.CSSProperties = {
    width: '100%',
    height: '38px',
    padding: '0 10px',
    borderRadius: '6px',
    border: '1px solid #fbbf24',
    background: 'white',
    fontSize: '13px',
    color: '#0f172a',
    outline: 'none',
    boxSizing: 'border-box'
};
const thCell: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
};
const tdCell: React.CSSProperties = {
    padding: '10px 14px',
    color: '#1e293b',
    verticalAlign: 'top'
};
