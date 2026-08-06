"use client";

import React, { useState, useEffect } from "react";
import { 
    BedDouble, 
    Warehouse, 
    ClipboardList, 
    Plus, 
    Edit, 
    Trash2, 
    Save, 
    X,
    CheckCircle,
    AlertCircle,
    Activity
} from "lucide-react";

type SubTab = 'wards' | 'beds' | 'items';

const toast = {
    success: (msg: string) => alert(`Success: ${msg}`),
    error: (msg: string) => alert(`Error: ${msg}`)
};

export default function IPDSettingsTab() {
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('wards');
    const [isLoading, setIsLoading] = useState(false);
    const [wards, setWards] = useState<any[]>([]);
    const [beds, setBeds] = useState<any[]>([]);
    const [billableItems, setBillableItems] = useState<any[]>([]);
    
    // Modal states
    const [showWardModal, setShowWardModal] = useState(false);
    const [showBedModal, setShowBedModal] = useState(false);
    const [showItemModal, setShowItemModal] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    useEffect(() => {
        fetchData();
    }, [activeSubTab]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            if (activeSubTab === 'wards') {
                const res = await fetch('/api/admin/ipd/wards');
                if (res.ok) setWards(await res.json());
            } else if (activeSubTab === 'beds') {
                const [wRes, bRes] = await Promise.all([
                    fetch('/api/admin/ipd/wards'),
                    fetch('/api/admin/ipd/beds')
                ]);
                if (wRes.ok) setWards(await wRes.json());
                if (bRes.ok) setBeds(await bRes.json());
            } else if (activeSubTab === 'items') {
                const res = await fetch('/api/admin/ipd/billable-items');
                if (res.ok) setBillableItems(await res.json());
            }
        } catch (error) {
            toast.error("Failed to load settings data");
        } finally {
            setIsLoading(false);
        }
    };

    // --- Ward Actions ---
    const handleSaveWard = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());
        
        try {
            const method = editingItem ? 'PUT' : 'POST';
            const body = editingItem ? { ...data, id: editingItem.id } : data;
            
            const res = await fetch('/api/admin/ipd/wards', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            if (res.ok) {
                toast.success(editingItem ? "Ward updated" : "Ward created");
                setShowWardModal(false);
                setEditingItem(null);
                fetchData();
            } else {
                const err = await res.json();
                toast.error(err.error || "Operation failed");
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    const handleDeleteWard = async (id: string) => {
        if (!confirm("Are you sure you want to delete this ward?")) return;
        try {
            const res = await fetch(`/api/admin/ipd/wards?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success("Ward deleted");
                fetchData();
            } else {
                const err = await res.json();
                toast.error(err.error || "Failed to delete ward");
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    // --- Bed Actions ---
    const handleSaveBed = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());
        
        try {
            const method = editingItem ? 'PUT' : 'POST';
            const body = editingItem ? { ...data, id: editingItem.id } : data;
            
            const res = await fetch('/api/admin/ipd/beds', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            if (res.ok) {
                toast.success(editingItem ? "Bed updated" : "Bed created");
                setShowBedModal(false);
                setEditingItem(null);
                fetchData();
            } else {
                const err = await res.json();
                toast.error(err.error || "Operation failed");
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    const handleDeleteBed = async (id: string) => {
        if (!confirm("Are you sure you want to delete this bed?")) return;
        try {
            const res = await fetch(`/api/admin/ipd/beds?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success("Bed deleted");
                fetchData();
            } else {
                const err = await res.json();
                toast.error(err.error || "Failed to delete bed");
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    // --- Billable Item Actions ---
    const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());
        
        try {
            const method = editingItem ? 'PUT' : 'POST';
            const body = editingItem ? { ...data, id: editingItem.id } : data;
            
            const res = await fetch('/api/admin/ipd/billable-items', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            if (res.ok) {
                toast.success(editingItem ? "Item updated" : "Item created");
                setShowItemModal(false);
                setEditingItem(null);
                fetchData();
            } else {
                const err = await res.json();
                toast.error(err.error || "Operation failed");
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    const handleDeleteItem = async (id: string) => {
        if (!confirm("Are you sure you want to delete this billable item?")) return;
        try {
            const res = await fetch(`/api/admin/ipd/billable-items?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success("Item deleted");
                fetchData();
            } else {
                const err = await res.json();
                toast.error(err.error || "Failed to delete item");
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Activity className="text-primary" /> IPD Configuration
                    </h2>
                    <p className="text-sm text-gray-500 text-premium">Manage wards, beds, and standard fee schedules.</p>
                </div>
            </div>

            {/* Sub-tabs Navigation */}
            <div className="flex border-b mb-6 border-primary/10">
                <button 
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${activeSubTab === 'wards' ? "border-primary text-primary bg-primary/5" : "border-transparent text-gray-500 hover:text-primary"}`}
                    onClick={() => setActiveSubTab('wards')}
                >
                    <Warehouse size={16} /> Wards
                </button>
                <button 
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${activeSubTab === 'beds' ? "border-primary text-primary bg-primary/5" : "border-transparent text-gray-500 hover:text-primary"}`}
                    onClick={() => setActiveSubTab('beds')}
                >
                    <BedDouble size={16} /> Beds
                </button>
                <button 
                    className={`px-6 py-3 font-medium text-sm transition-all border-b-2 flex items-center gap-2 ${activeSubTab === 'items' ? "border-primary text-primary bg-primary/5" : "border-transparent text-gray-500 hover:text-primary"}`}
                    onClick={() => setActiveSubTab('items')}
                >
                    <ClipboardList size={16} /> Fee Schedule
                </button>
            </div>

            {/* Content Area */}
            <div className="glass-panel p-6">
                {activeSubTab === 'wards' && (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold">Ward Management</h3>
                            <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingItem(null); setShowWardModal(true); }}>
                                <Plus size={16} /> Add Ward
                            </button>
                        </div>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Type</th>
                                        <th>Capacity</th>
                                        <th>Beds</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {wards.map(w => (
                                        <tr key={w.id}>
                                            <td className="font-bold">{w.name}</td>
                                            <td><span className="badge badge-secondary">{w.type}</span></td>
                                            <td>{w.capacity}</td>
                                            <td>{w.beds?.length || 0}</td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <button className="text-primary hover:text-primary-dark" onClick={() => { setEditingItem(w); setShowWardModal(true); }}>
                                                        <Edit size={16} />
                                                    </button>
                                                    <button className="text-danger hover:text-danger-dark" onClick={() => handleDeleteWard(w.id)}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {wards.length === 0 && !isLoading && <tr><td colSpan={5} className="text-center p-4">No wards configured.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {activeSubTab === 'beds' && (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold">Bed Allocation</h3>
                            <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingItem(null); setShowBedModal(true); }}>
                                <Plus size={16} /> Add Bed
                            </button>
                        </div>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Bed No.</th>
                                        <th>Ward</th>
                                        <th>Type</th>
                                        <th>Rate/Day</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {beds.map(b => (
                                        <tr key={b.id}>
                                            <td className="font-mono font-bold">{b.bedNumber}</td>
                                            <td>{b.ward?.name}</td>
                                            <td>{b.type}</td>
                                            <td>UGX {b.ratePerDay?.toLocaleString()}</td>
                                            <td><span className={`badge ${b.status === 'AVAILABLE' ? 'badge-success' : 'badge-warning'}`}>{b.status}</span></td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <button className="text-primary hover:text-primary-dark" onClick={() => { setEditingItem(b); setShowBedModal(true); }}>
                                                        <Edit size={16} />
                                                    </button>
                                                    <button className="text-danger hover:text-danger-dark" onClick={() => handleDeleteBed(b.id)}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {beds.length === 0 && !isLoading && <tr><td colSpan={6} className="text-center p-4">No beds configured.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {activeSubTab === 'items' && (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold">Billable Items Master List</h3>
                            <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingItem(null); setShowItemModal(true); }}>
                                <Plus size={16} /> Add Item
                            </button>
                        </div>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Code</th>
                                        <th>Name</th>
                                        <th>Category</th>
                                        <th>Freq.</th>
                                        <th>App.</th>
                                        <th>Rate</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {billableItems.map(item => (
                                        <tr key={item.id}>
                                            <td className="font-mono text-xs">{item.itemCode}</td>
                                            <td className="font-medium">{item.itemName}</td>
                                            <td><span className="badge badge-secondary">{item.category}</span></td>
                                            <td>{item.frequency}</td>
                                            <td>{item.application}</td>
                                            <td className="font-bold">UGX {item.standardRate?.toLocaleString()}</td>
                                            <td>{item.isActive ? <CheckCircle className="text-success" size={16} /> : <AlertCircle className="text-gray-300" size={16} />}</td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <button className="text-primary hover:text-primary-dark" onClick={() => { setEditingItem(item); setShowItemModal(true); }}>
                                                        <Edit size={16} />
                                                    </button>
                                                    <button className="text-danger hover:text-danger-dark" onClick={() => handleDeleteItem(item.id)}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {billableItems.length === 0 && !isLoading && <tr><td colSpan={8} className="text-center p-4">No billable items configured.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* Modals Implementation (Abbreviated for brevity in this tool call, will expand in next steps) */}
            {showWardModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-panel w-full max-w-lg p-6 animate-scale-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold">{editingItem ? 'Edit Ward' : 'Add New Ward'}</h3>
                            <button onClick={() => { setShowWardModal(false); setEditingItem(null); }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveWard} className="space-y-4">
                            <div className="form-group">
                                <label>Ward Name</label>
                                <input type="text" name="name" className="input-field" defaultValue={editingItem?.name} required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label>Type</label>
                                    <select name="type" className="input-field" defaultValue={editingItem?.type || "GENERAL"} required>
                                        <option value="GENERAL">General</option>
                                        <option value="ICU">ICU</option>
                                        <option value="HDU">HDU</option>
                                        <option value="PEDIATRIC">Pediatric</option>
                                        <option value="MATERNITY">Maternity</option>
                                        <option value="PRIVATE">Private</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Capacity (Total Beds)</label>
                                    <input type="number" name="capacity" className="input-field" defaultValue={editingItem?.capacity} required />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea name="description" className="input-field" rows={3} defaultValue={editingItem?.description}></textarea>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" className="btn-secondary" onClick={() => { setShowWardModal(false); setEditingItem(null); }}>Cancel</button>
                                <button type="submit" className="btn-primary flex items-center gap-2">
                                    <Save size={18} /> {editingItem ? 'Update' : 'Save'} Ward
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showBedModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-panel w-full max-w-lg p-6 animate-scale-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold">{editingItem ? 'Edit Bed' : 'Add New Bed'}</h3>
                            <button onClick={() => { setShowBedModal(false); setEditingItem(null); }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveBed} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label>Ward</label>
                                    <select name="wardId" className="input-field" defaultValue={editingItem?.wardId} required disabled={!!editingItem}>
                                        <option value="">-- Select Ward --</option>
                                        {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Bed Number</label>
                                    <input type="text" name="bedNumber" className="input-field font-mono" defaultValue={editingItem?.bedNumber} required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label>Type</label>
                                    <select name="type" className="input-field" defaultValue={editingItem?.type || "STANDARD"} required>
                                        <option value="STANDARD">Standard</option>
                                        <option value="ELECTRIC">Electric</option>
                                        <option value="ICU_BED">ICU Bed</option>
                                        <option value="PEDIATRIC">Pediatric Bed</option>
                                        <option value="LABOR_BED">Labor Bed</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Rate Per Day (UGX)</label>
                                    <input type="number" name="ratePerDay" className="input-field" defaultValue={editingItem?.ratePerDay} required />
                                </div>
                            </div>
                            {editingItem && (
                                <div className="form-group">
                                    <label>Current Status</label>
                                    <select name="status" className="input-field" defaultValue={editingItem?.status} required>
                                        <option value="AVAILABLE">Available</option>
                                        <option value="MAINTENANCE">Maintenance</option>
                                        <option value="CLEANING">Cleaning</option>
                                    </select>
                                </div>
                            )}
                            <div className="form-group">
                                <label>Features (Optional)</label>
                                <input type="text" name="features" className="input-field" placeholder="e.g., Near window, Side rails" defaultValue={editingItem?.features} />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" className="btn-secondary" onClick={() => { setShowBedModal(false); setEditingItem(null); }}>Cancel</button>
                                <button type="submit" className="btn-primary flex items-center gap-2">
                                    <Save size={18} /> {editingItem ? 'Update' : 'Save'} Bed
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showItemModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="glass-panel w-full max-w-2xl p-6 animate-scale-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold">{editingItem ? 'Edit Service Item' : 'Add IPD Service Item'}</h3>
                            <button onClick={() => { setShowItemModal(false); setEditingItem(null); }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveItem} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label>Item Code</label>
                                    <input type="text" name="itemCode" className="input-field font-mono" defaultValue={editingItem?.itemCode} placeholder="e.g., RB-GEN" required />
                                </div>
                                <div className="form-group">
                                    <label>Item Name</label>
                                    <input type="text" name="itemName" className="input-field" defaultValue={editingItem?.itemName} placeholder="e.g., General Ward Day Rate" required />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="form-group">
                                    <label>Category</label>
                                    <select name="category" className="input-field" defaultValue={editingItem?.category || "ROOM_BOARD"} required>
                                        <option value="ROOM_BOARD">Room & Board</option>
                                        <option value="NURSING_FEE">Nursing Fee</option>
                                        <option value="MEDICAL_FEE">Medical Fee</option>
                                        <option value="PROCEDURE">Procedure</option>
                                        <option value="SUNDRY">Sundry</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Frequency</label>
                                    <select name="frequency" className="input-field" defaultValue={editingItem?.frequency || "DAILY"} required>
                                        <option value="DAILY">Daily</option>
                                        <option value="ONE_TIME">One-time</option>
                                        <option value="PER_SERVICE">Per Service</option>
                                        <option value="PER_SHIFT">Per Shift</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Application</label>
                                    <select name="application" className="input-field" defaultValue={editingItem?.application || "AUTO"} required>
                                        <option value="AUTO">Auto-apply</option>
                                        <option value="MANUAL">Manual only</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label>Standard Rate (UGX)</label>
                                    <input type="number" name="standardRate" className="input-field" defaultValue={editingItem?.standardRate} required />
                                </div>
                                <div className="form-group flex items-end">
                                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                                        <input type="checkbox" name="isActive" defaultChecked={editingItem ? editingItem.isActive : true} />
                                        <span>Active & Available for billing</span>
                                    </label>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea name="description" className="input-field" rows={2} defaultValue={editingItem?.description}></textarea>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" className="btn-secondary" onClick={() => { setShowItemModal(false); setEditingItem(null); }}>Cancel</button>
                                <button type="submit" className="btn-primary flex items-center gap-2">
                                    <Save size={18} /> {editingItem ? 'Update' : 'Save'} Item
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
