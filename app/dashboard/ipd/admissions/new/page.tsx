"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, ArrowLeft, Search, BedSingle } from "lucide-react";
import Link from "next/link";
import styles from "../../../ipd.module.css";
const toast = { success: (msg: string) => alert(msg), error: (msg: string) => alert(msg) };

export default function NewAdmissionPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    
    // Data sources
    const [patients, setPatients] = useState<any[]>([]);
    const [wards, setWards] = useState<any[]>([]);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    
    // Form state
    const [patientId, setPatientId] = useState("");
    const [wardId, setWardId] = useState("");
    const [bedId, setBedId] = useState("");
    const [type, setType] = useState("ELECTIVE");
    const [initialDeposit, setInitialDeposit] = useState("");
    const [currency, setCurrency] = useState("UGX");

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [pRes, wRes, sRes] = await Promise.all([
                fetch('/api/patients'),
                fetch('/api/ipd/wards'),
                fetch('/api/admin/settings')
            ]);
            
            if (pRes.ok) {
                const data = await pRes.json();
                // /api/patients returns { data: patients[], total, page, ... } — accept both shapes
                const list = Array.isArray(data) ? data : (data.patients ?? data.data ?? []);
                setPatients(list);
            }
            if (wRes.ok) setWards(await wRes.json());
            if (sRes.ok) {
                const settings = await sRes.json();
                if (settings.currency) setCurrency(settings.currency);
            }
        } catch (error) {
            toast.error("Failed to load necessary data");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!patientId || !wardId || !bedId || !type) {
            toast.error("Please fill all required fields");
            return;
        }
        
        setIsLoading(true);
        try {
            const res = await fetch('/api/ipd/admissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patientId, wardId, bedId, type, initialDeposit })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success("Patient admitted successfully");
                router.push(`/dashboard/ipd/admissions/${data.id}`);
            } else {
                const err = await res.json();
                toast.error(err.error || "Failed to admit patient");
            }
        } catch (error) {
            toast.error("An error occurred during admission");
        } finally {
            setIsLoading(false);
        }
    };

    const filteredPatients = patients.filter(p => 
        p.firstName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone?.includes(searchTerm)
    ).slice(0, 5); // Show top 5 matches

    const selectedWard = wards.find(w => w.id === wardId);
    const availableBeds = selectedWard?.beds?.filter((b: any) => b.status === "AVAILABLE") || [];

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/dashboard/ipd" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h2 className="text-2xl font-bold">New Admission</h2>
                    <p className="text-sm text-gray-500">Admit a patient to the Inpatient Department</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Patient Selection Segment */}
                <div className="glass-panel p-6">
                    <h3 className="text-lg font-semibold border-b pb-2 mb-4">1. Select Patient</h3>
                    
                    {!patientId ? (
                        <div>
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Search patient by name or phone..." 
                                    className="input-field pl-10"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            
                            {searchTerm && (
                                <div className="border rounded-lg overflow-hidden bg-white">
                                    {filteredPatients.length > 0 ? filteredPatients.map(p => (
                                        <div 
                                            key={p.id} 
                                            className="p-3 border-b last:border-0 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                            onClick={() => setPatientId(p.id)}
                                        >
                                            <div>
                                                <div className="font-medium">{p.firstName} {p.lastName}</div>
                                                <div className="text-sm text-gray-500">{p.phone || 'No phone'} • {new Date(p.dateOfBirth).toLocaleDateString()}</div>
                                            </div>
                                            <button type="button" className="btn-secondary text-xs py-1 px-3">Select</button>
                                        </div>
                                    )) : (
                                        <div className="p-4 text-center text-gray-500">No patients found.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex justify-between items-center p-4 bg-primary/5 border border-primary/20 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                                    {patients.find(p => p.id === patientId)?.firstName[0]}
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900">
                                        {patients.find(p => p.id === patientId)?.firstName} {patients.find(p => p.id === patientId)?.lastName}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        ID: {patientId.substring(0,8)}
                                    </div>
                                </div>
                            </div>
                            <button type="button" className="text-sm text-primary hover:underline" onClick={() => setPatientId("")}>
                                Change Patient
                            </button>
                        </div>
                    )}
                </div>

                {/* Admission Details */}
                <div className="glass-panel p-6">
                    <h3 className="text-lg font-semibold border-b pb-2 mb-4">2. Admission Details</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="form-group">
                            <label>Admission Type</label>
                            <select className="input-field" value={type} onChange={e => setType(e.target.value)} required>
                                <option value="ELECTIVE">Elective (Planned)</option>
                                <option value="EMERGENCY">Emergency</option>
                                <option value="URGENT">Urgent</option>
                                <option value="TRANSFER">Transfer from external</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Ward & Bed Selection */}
                <div className="glass-panel p-6">
                    <h3 className="text-lg font-semibold border-b pb-2 mb-4">3. Ward Assignment</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="form-group">
                            <label>Select Ward</label>
                            <select 
                                className="input-field" 
                                value={wardId} 
                                onChange={e => {
                                    setWardId(e.target.value); 
                                    setBedId(""); // Reset bed when ward changes
                                }} 
                                required
                            >
                                <option value="">-- Choose Ward --</option>
                                {wards.map(w => (
                                    <option key={w.id} value={w.id}>
                                        {w.name} ({w.type}) - {w.beds?.filter((b:any)=>b.status==='AVAILABLE').length} beds available
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="form-group">
                            <label>Select Bed</label>
                            <select 
                                className="input-field" 
                                value={bedId} 
                                onChange={e => setBedId(e.target.value)} 
                                required
                                disabled={!wardId}
                            >
                                <option value="">-- Choose Available Bed --</option>
                                {availableBeds.map((b: any) => (
                                    <option key={b.id} value={b.id}>
                                        Bed {b.bedNumber} ({b.type})
                                    </option>
                                ))}
                            </select>
                            {wardId && availableBeds.length === 0 && (
                                <p className="text-xs text-danger mt-1">No available beds in this ward.</p>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Initial Billing */}
                <div className="glass-panel p-6">
                    <h3 className="text-lg font-semibold border-b pb-2 mb-4">4. Initial Deposit (Optional)</h3>
                    
                    <div className="form-group max-w-md">
                        <label>Deposit Amount (Cash)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">{currency}</span>
                            <input 
                                type="number" 
                                min="0" 
                                step="0.01" 
                                placeholder="0.00" 
                                className="input-field pl-8"
                                value={initialDeposit}
                                onChange={e => setInitialDeposit(e.target.value)}
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Enter amount if patient is paying an upfront deposit.</p>
                    </div>
                </div>

                <div className="flex justify-end gap-4 pt-4">
                    <Link href="/dashboard/ipd" className="btn-secondary px-6">Cancel</Link>
                    <button 
                        type="submit" 
                        className="btn-primary px-8"
                        disabled={isLoading || !patientId || !wardId || !bedId}
                    >
                        {isLoading ? "Processing..." : (
                            <><UserPlus size={18} /> Admit Patient</>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
