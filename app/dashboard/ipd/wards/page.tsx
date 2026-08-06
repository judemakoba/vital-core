"use client";

import { useState, useEffect } from "react";
import { BedDouble, Plus, AlertCircle, Edit, Trash2 } from "lucide-react";
import styles from "../ipd.module.css";
const toast = { success: (msg: string) => alert(msg), error: (msg: string) => alert(msg) };

export default function WardsPage() {
    const [wards, setWards] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    // Form state
    const [name, setName] = useState("");
    const [type, setType] = useState("GENERAL");
    const [capacity, setCapacity] = useState("");
    const [description, setDescription] = useState("");

    useEffect(() => {
        fetchWards();
    }, []);

    const fetchWards = async () => {
        try {
            const res = await fetch('/api/ipd/wards');
            if (res.ok) {
                const data = await res.json();
                setWards(data);
            }
        } catch (error) {
            toast.error("Failed to fetch wards");
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddWard = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/ipd/wards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type, capacity, description })
            });

            if (res.ok) {
                toast.success("Ward created successfully");
                fetchWards();
                setIsAdding(false);
                // Reset form
                setName(""); setCapacity(""); setDescription(""); setType("GENERAL");
            } else {
                const err = await res.json();
                toast.error(err.error || "Failed to create ward");
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    if (isLoading) return <div className="p-8 text-center text-gray-500">Loading wards...</div>;

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <h2>Wards & Bed Management</h2>
                    <p className="text-sm text-gray-500">Configure inpatient wards and monitor bed availability</p>
                </div>
                <button className="btn-primary" onClick={() => setIsAdding(!isAdding)}>
                    <Plus size={18} /> {isAdding ? "Cancel" : "Add Ward"}
                </button>
            </div>

            {isAdding && (
                <div className="glass-panel p-6 mb-6 animate-slide-in">
                    <h3 className="font-semibold mb-4 text-lg">Add New Ward</h3>
                    <form onSubmit={handleAddWard} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="form-group">
                            <label>Ward Name (e.g., Maternity Wing A)</label>
                            <input type="text" className="input-field" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>Ward Type</label>
                            <select className="input-field" value={type} onChange={e => setType(e.target.value)} required>
                                <option value="GENERAL">General Ward</option>
                                <option value="ICU">Intensive Care Unit (ICU)</option>
                                <option value="HDU">High Dependency Unit (HDU)</option>
                                <option value="MATERNITY">Maternity</option>
                                <option value="PEDIATRIC">Pediatric</option>
                                <option value="PRIVATE">Private Rooms</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Capacity (Number of Beds)</label>
                            <input type="number" min="1" className="input-field" value={capacity} onChange={e => setCapacity(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <input type="text" className="input-field" value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                        <div className="col-span-full flex justify-end gap-3 mt-4">
                            <button type="button" className="btn-secondary" onClick={() => setIsAdding(false)}>Cancel</button>
                            <button type="submit" className="btn-primary">Save Ward & Generate Beds</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="flex flex-col gap-6">
                {wards.length === 0 && !isAdding && (
                    <div className="text-center p-12 glass-panel">
                        <BedDouble size={48} className="mx-auto text-gray-300 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Wards Configured</h3>
                        <p className="text-gray-500">Click "Add Ward" to create your first inpatient ward.</p>
                    </div>
                )}

                {wards.map((ward) => {
                    const occupiedStr = ward.beds.filter((b: any) => b.admissions && b.admissions.length > 0).length;
                    const totalBeds = ward.capacity;
                    const isFull = occupiedStr >= totalBeds;

                    return (
                        <div key={ward.id} className="glass-panel p-6">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-xl font-bold">{ward.name}</h3>
                                        <span className="badge badge-primary">{ward.type}</span>
                                        {isFull && <span className="badge badge-danger">FULL</span>}
                                    </div>
                                    <p className="text-sm text-gray-500 mt-1">{ward.description}</p>
                                    <div className="mt-2 text-sm">
                                        <strong>{occupiedStr}</strong> / {totalBeds} Beds Occupied
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button className="p-2 text-gray-500 hover:text-primary transition-colors"><Edit size={18} /></button>
                                    <button className="p-2 text-gray-500 hover:text-danger transition-colors"><Trash2 size={18} /></button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                                {ward.beds.map((bed: any) => (
                                    <div 
                                        key={bed.id} 
                                        className={`p-4 rounded-xl border text-center relative overflow-hidden transition-all ${
                                            (bed.admissions && bed.admissions.length > 0) ? 'border-primary bg-primary/5' :
                                            bed.status === 'AVAILABLE' ? 'border-success bg-success/5 hover:bg-success/10' :
                                            bed.status === 'CLEANING' ? 'border-warning bg-warning/5' :
                                            'border-gray-300 bg-gray-50'
                                        }`}
                                    >
                                        <div className="mb-2">
                                            <BedDouble size={24} className={`mx-auto ${
                                                (bed.admissions && bed.admissions.length > 0) ? 'text-primary' :
                                                bed.status === 'AVAILABLE' ? 'text-success' :
                                                bed.status === 'CLEANING' ? 'text-warning' :
                                                'text-gray-400'
                                            }`} />
                                        </div>
                                        <div className="font-bold text-sm tracking-wide">{bed.bedNumber}</div>
                                        
                                        {bed.admissions && bed.admissions.length > 0 ? (
                                            <div className="text-[10px] font-bold uppercase mt-1 tracking-wider text-primary truncate px-1" title={`${bed.admissions[0].patient.firstName} ${bed.admissions[0].patient.lastName}`}>
                                                {bed.admissions[0].patient.firstName}
                                            </div>
                                        ) : (
                                            <div className="text-[10px] font-medium uppercase mt-1 tracking-wider text-gray-500">
                                                {bed.status}
                                            </div>
                                        )}
                                        
                                        {(bed.admissions && bed.admissions.length > 0) && (
                                            <div className="absolute top-0 right-0 w-2 h-full bg-primary"></div>
                                        )}
                                        {bed.status === 'CLEANING' && (
                                            <div className="absolute top-0 right-0 w-2 h-full bg-warning"></div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
