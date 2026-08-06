'use client';

import { useState, useEffect } from 'react';
import { Search, AlertTriangle, Calendar, Package, MoreVertical, X, Save, Edit3 } from 'lucide-react';
import styles from './pharmacy.module.css';

interface Batch {
    id: string;
    batchNumber: string;
    drug: {
        name: string;
        genericName: string;
        dosageForm: string;
        strength: string;
        packageUnit?: string;
    };
    supplier: {
        name: string;
    } | null;
    expiryDate: string;
    quantityRemaining: number;
    quantityReceived?: number;
    storageLocation: string | null;
    purchasePrice: number;
    sellingPrice: number | null;
}

export default function BatchManagementTab() {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Adjustment modal state
    const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
    const [editQty, setEditQty] = useState<string>('');
    const [editExpiry, setEditExpiry] = useState<string>('');
    const [editLocation, setEditLocation] = useState<string>('');
    const [editPurchasePrice, setEditPurchasePrice] = useState<string>('');
    const [editSellingPrice, setEditSellingPrice] = useState<string>('');
    const [editReason, setEditReason] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const fetchBatches = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/pharmacy/batches?search=${search}`);
            if (res.ok) {
                const data = await res.json();
                setBatches(data);
            }
        } catch (error) {
            console.error('Failed to fetch batches:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchBatches();
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const getExpiryStatus = (expiryDate: string) => {
        const now = new Date();
        const expiry = new Date(expiryDate);
        const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) return { label: 'Expired', class: styles.statusBadgeDanger };
        if (diffDays <= 90) return { label: 'Near Expiry', class: styles.statusBadgeWarning };
        return { label: 'Healthy', class: styles.statusBadgeSuccess };
    };

    const openAdjustModal = (batch: Batch) => {
        setEditingBatch(batch);
        setEditQty(String(batch.quantityRemaining));
        setEditExpiry(new Date(batch.expiryDate).toISOString().slice(0, 10));
        setEditLocation(batch.storageLocation || '');
        setEditPurchasePrice(String(batch.purchasePrice ?? ''));
        setEditSellingPrice(String(batch.sellingPrice ?? ''));
        setEditReason('');
        setErrorMsg('');
    };

    const closeAdjustModal = () => {
        setEditingBatch(null);
        setEditQty('');
        setEditExpiry('');
        setEditLocation('');
        setEditPurchasePrice('');
        setEditSellingPrice('');
        setEditReason('');
        setErrorMsg('');
    };

    const saveAdjustment = async () => {
        if (!editingBatch) return;
        const qtyNum = parseInt(editQty, 10);
        if (isNaN(qtyNum) || qtyNum < 0) {
            setErrorMsg('Quantity must be a non-negative number');
            return;
        }
        if (!editExpiry) {
            setErrorMsg('Expiry date is required');
            return;
        }
        const purchasePriceNum = editPurchasePrice.trim() === '' ? null : parseFloat(editPurchasePrice);
        if (purchasePriceNum != null && (isNaN(purchasePriceNum) || purchasePriceNum < 0)) {
            setErrorMsg('Purchase price must be a non-negative number');
            return;
        }
        const sellingPriceNum = editSellingPrice.trim() === '' ? null : parseFloat(editSellingPrice);
        if (sellingPriceNum != null && (isNaN(sellingPriceNum) || sellingPriceNum < 0)) {
            setErrorMsg('Selling price must be a non-negative number');
            return;
        }
        if (!editReason.trim()) {
            setErrorMsg('A reason is required for the adjustment (audit trail)');
            return;
        }

        // If any price changed, the reason is required (already validated) but
        // also ensure at least one field actually changed before saving
        const hasAnyChange =
            qtyNum !== editingBatch.quantityRemaining ||
            editExpiry !== new Date(editingBatch.expiryDate).toISOString().slice(0, 10) ||
            (editLocation || '') !== (editingBatch.storageLocation || '') ||
            purchasePriceNum !== (editingBatch.purchasePrice ?? null) ||
            sellingPriceNum !== (editingBatch.sellingPrice ?? null);
        if (!hasAnyChange) {
            setErrorMsg('No changes detected — adjust at least one field');
            return;
        }

        setSaving(true);
        setErrorMsg('');
        try {
            const payload: any = {
                quantityRemaining: qtyNum,
                expiryDate: editExpiry,
                storageLocation: editLocation.trim() || null,
                reason: editReason.trim(),
            };
            if (purchasePriceNum != null) payload.purchasePrice = purchasePriceNum;
            if (sellingPriceNum != null) payload.sellingPrice = sellingPriceNum;

            const res = await fetch(`/api/pharmacy/batches/${editingBatch.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setSuccessMsg(`Batch ${editingBatch.batchNumber} adjusted successfully`);
                closeAdjustModal();
                fetchBatches();
                setTimeout(() => setSuccessMsg(''), 4000);
            } else {
                const err = await res.json();
                setErrorMsg(err.error || 'Failed to adjust batch');
            }
        } catch (error) {
            setErrorMsg('Network error while saving adjustment');
        } finally {
            setSaving(false);
        }
    };

    const qtyChanged = editingBatch && editQty !== String(editingBatch.quantityRemaining);
    const expiryChanged = editingBatch && editExpiry && editExpiry !== new Date(editingBatch.expiryDate).toISOString().slice(0, 10);
    const locationChanged = editingBatch && (editLocation || '') !== (editingBatch.storageLocation || '');
    const purchasePriceChanged = editingBatch && editPurchasePrice !== '' &&
        parseFloat(editPurchasePrice) !== (editingBatch.purchasePrice ?? 0);
    const sellingPriceChanged = editingBatch && editSellingPrice !== '' &&
        parseFloat(editSellingPrice) !== (editingBatch.sellingPrice ?? 0);
    const anyPriceChanged = purchasePriceChanged || sellingPriceChanged;

    return (
        <div className={styles.tabContent}>
            <div className={styles.tabActions}>
                <div className={styles.searchContainer}>
                    <Search className={styles.searchIcon} size={18} />
                    <input
                        type="text"
                        placeholder="Search batch #, drug name..."
                        className={styles.searchInput}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className={styles.btnSecondary}>
                        <Package size={18} style={{ marginRight: '8px' }} />
                        Stock Take
                    </button>
                    <button
                        className={styles.btnPrimary}
                        onClick={() => batches.length > 0 && openAdjustModal(batches[0])}
                        disabled={batches.length === 0}
                        title={batches.length === 0 ? 'No batches to adjust' : 'Adjust the first batch in the list'}
                    >
                        <Edit3 size={16} style={{ marginRight: '6px' }} />
                        Adjust Stock
                    </button>
                </div>
            </div>

            {successMsg && (
                <div className={styles.successBanner} style={{ marginBottom: '14px' }}>
                    {successMsg}
                </div>
            )}

            <div className={styles.card}>
                {loading ? (
                    <div className={styles.loading}>Loading inventory batches...</div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Drug & Batch</th>
                                <th>Supplier</th>
                                <th>Unit Cost</th>
                                <th>Unit Price</th>
                                <th>Quantity</th>
                                <th>Expiry Date</th>
                                <th>Location</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {batches.map((batch) => {
                                const status = getExpiryStatus(batch.expiryDate);
                                return (
                                    <tr key={batch.id}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{batch.drug.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {batch.drug.genericName} • Batch: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-color)' }}>{batch.batchNumber}</span>
                                            </div>
                                        </td>
                                        <td>{batch.supplier?.name || 'Opening Stock'}</td>
                                        <td style={{ fontWeight: '500' }}>
                                            UGX {(batch.purchasePrice || 0).toLocaleString()}
                                        </td>
                                        <td style={{ fontWeight: '700', color: '#0ea5e9' }}>
                                            UGX {(batch.sellingPrice || 0).toLocaleString()}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{batch.quantityRemaining}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>available</div>
                                        </td>
                                        <td>
                                            <div>{new Date(batch.expiryDate).toLocaleDateString()}</div>
                                            <span className={`${styles.statusBadge} ${status.class}`}>
                                                {status.label}
                                            </span>
                                        </td>
                                        <td>{batch.storageLocation || 'Unassigned'}</td>
                                        <td>
                                            <span className={`${styles.statusBadge} ${status.class}`}>
                                                {status.label}
                                            </span>
                                        </td>
                                        <td>
                                            <button
                                                className={styles.btnChange}
                                                onClick={() => openAdjustModal(batch)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <Edit3 size={12} />
                                                Adjust
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {batches.length === 0 && (
                                <tr>
                                    <td colSpan={9} className={styles.emptyTable}>
                                        No active batches found matching your search.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Adjust Stock Modal ── */}
            {editingBatch && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.45)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '20px'
                    }}
                    onClick={closeAdjustModal}
                >
                    <div
                        style={{
                            background: 'white',
                            borderRadius: '14px',
                            width: '100%',
                            maxWidth: '540px',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                            overflow: 'hidden'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{
                            padding: '18px 22px',
                            borderBottom: '1px solid #e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)',
                            color: 'white'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Adjust Batch</h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', opacity: 0.85 }}>
                                    {editingBatch.drug.name} • Batch {editingBatch.batchNumber}
                                </p>
                            </div>
                            <button
                                onClick={closeAdjustModal}
                                style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    borderRadius: '8px',
                                    padding: '6px',
                                    cursor: 'pointer',
                                    color: 'white',
                                    display: 'flex'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '22px' }}>
                            {errorMsg && (
                                <div className={styles.errorBanner} style={{ marginBottom: '14px' }}>
                                    <AlertTriangle size={16} /> {errorMsg}
                                </div>
                            )}

                            {/* Quantity */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                    Quantity Remaining *
                                </label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <input
                                        type="number"
                                        min="0"
                                        value={editQty}
                                        onChange={(e) => setEditQty(e.target.value)}
                                        style={{
                                            flex: 1,
                                            padding: '10px 14px',
                                            borderRadius: '8px',
                                            border: qtyChanged ? '2px solid #0ea5e9' : '1px solid #d1d5db',
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            color: qtyChanged ? '#0ea5e9' : '#111827',
                                            background: qtyChanged ? '#f0f9ff' : 'white',
                                            outline: 'none'
                                        }}
                                    />
                                    {qtyChanged && (
                                        <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: 600, background: '#f0f9ff', padding: '4px 10px', borderRadius: '999px' }}>
                                            was {editingBatch.quantityRemaining}
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                                    Units in stock. Adjustment creates a stock movement audit record.
                                </div>
                            </div>

                            {/* Expiry date */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                    Expiry Date *
                                </label>
                                <input
                                    type="date"
                                    value={editExpiry}
                                    onChange={(e) => setEditExpiry(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        border: expiryChanged ? '2px solid #0ea5e9' : '1px solid #d1d5db',
                                        fontSize: '15px',
                                        fontWeight: 600,
                                        color: expiryChanged ? '#0ea5e9' : '#111827',
                                        background: expiryChanged ? '#f0f9ff' : 'white',
                                        outline: 'none'
                                    }}
                                />
                                {expiryChanged && (
                                    <div style={{ fontSize: '11px', color: '#0369a1', marginTop: '4px' }}>
                                        Previous: {new Date(editingBatch.expiryDate).toLocaleDateString()}
                                    </div>
                                )}
                            </div>

                            {/* Storage location */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                    Storage Location
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Shelf A-3, Cold Room 2"
                                    value={editLocation}
                                    onChange={(e) => setEditLocation(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        border: locationChanged ? '2px solid #0ea5e9' : '1px solid #d1d5db',
                                        fontSize: '14px',
                                        color: '#111827',
                                        background: locationChanged ? '#f0f9ff' : 'white',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            {/* Pricing — Unit Cost + Unit Price */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                        Unit Cost (UGX)
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', fontWeight: 600, color: '#64748b', pointerEvents: 'none' }}>UGX</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={editPurchasePrice}
                                            onChange={(e) => setEditPurchasePrice(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '10px 14px 10px 44px',
                                                borderRadius: '8px',
                                                border: purchasePriceChanged ? '2px solid #0ea5e9' : '1px solid #d1d5db',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: purchasePriceChanged ? '#0ea5e9' : '#111827',
                                                background: purchasePriceChanged ? '#f0f9ff' : 'white',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                    {purchasePriceChanged && editingBatch && (
                                        <div style={{ fontSize: '10.5px', color: '#0369a1', marginTop: '3px' }}>
                                            was UGX {(editingBatch.purchasePrice ?? 0).toLocaleString()}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                        Unit Price (UGX) <span style={{ fontWeight: 500, color: '#ef4444' }}>*</span>
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', fontWeight: 600, color: '#64748b', pointerEvents: 'none' }}>UGX</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={editSellingPrice}
                                            onChange={(e) => setEditSellingPrice(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '10px 14px 10px 44px',
                                                borderRadius: '8px',
                                                border: sellingPriceChanged ? '2px solid #0ea5e9' : '1px solid #d1d5db',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: sellingPriceChanged ? '#0ea5e9' : '#111827',
                                                background: sellingPriceChanged ? '#f0f9ff' : 'white',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                    {sellingPriceChanged && editingBatch && (
                                        <div style={{ fontSize: '10.5px', color: '#0369a1', marginTop: '3px' }}>
                                            was UGX {(editingBatch.sellingPrice ?? 0).toLocaleString()}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {anyPriceChanged && (
                                <div style={{
                                    background: '#fef3c7',
                                    border: '1px solid #fde68a',
                                    color: '#92400e',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    marginBottom: '16px',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '8px'
                                }}>
                                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <span>
                                        Price changes are logged in the Drug Price Audit trail. Changing the unit price also updates the drug's REGULAR price used at dispensing.
                                    </span>
                                </div>
                            )}

                            {/* Reason */}
                            <div style={{ marginBottom: '6px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                    Reason for Adjustment *
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="e.g. Physical count correction, expired units removed, damage write-off, transfer between batches..."
                                    value={editReason}
                                    onChange={(e) => setEditReason(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        border: '1px solid #d1d5db',
                                        fontSize: '13px',
                                        resize: 'vertical',
                                        fontFamily: 'inherit',
                                        outline: 'none'
                                    }}
                                />
                                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                                    Required for audit trail. Will be recorded in stock movement history.
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '14px 22px',
                            background: '#f9fafb',
                            borderTop: '1px solid #e5e7eb',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '10px'
                        }}>
                            <button
                                className={styles.btnSecondary}
                                onClick={closeAdjustModal}
                                disabled={saving}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveAdjustment}
                                disabled={saving || (!qtyChanged && !expiryChanged && !locationChanged && !purchasePriceChanged && !sellingPriceChanged)}
                                style={{
                                    padding: '9px 18px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: saving || (!qtyChanged && !expiryChanged && !locationChanged && !purchasePriceChanged && !sellingPriceChanged) ? '#cbd5e1' : 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
                                    color: 'white',
                                    fontSize: '13.5px',
                                    fontWeight: 600,
                                    cursor: saving || (!qtyChanged && !expiryChanged && !locationChanged && !purchasePriceChanged && !sellingPriceChanged) ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 4px rgba(14, 165, 233, 0.25)'
                                }}
                            >
                                <Save size={14} />
                                {saving ? 'Saving...' : 'Save Adjustment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
