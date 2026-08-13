"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, CreditCard, LogOut, CheckCircle, FileText, AlertCircle, RefreshCw } from "lucide-react";
import styles from "../../../ipd.module.css";
const toast = { success: (msg: string) => alert(msg), error: (msg: string) => alert(msg) };

export default function AdmissionRecordPage() {
    const params = useParams();
    const router = useRouter();
    const admissionId = params.id as string;
    
    const [admission, setAdmission] = useState<any>(null);
    const [finalBill, setFinalBill] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("CHARGES"); // CHARGES, DEPOSITS, DISCHARGE
    const [currency, setCurrency] = useState("UGX");
    
    // Transfer Bed State
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [wards, setWards] = useState<any[]>([]);
    const [selectedWardId, setSelectedWardId] = useState("");
    const [selectedBedId, setSelectedBedId] = useState("");
    const [isTransferring, setIsTransferring] = useState(false);
    
    // Refresh function
    const fetchRecord = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/ipd/final-bill/${admissionId}`);
            if (res.ok) {
                const data = await res.json();
                setAdmission(data);
                setFinalBill(data.financials);
            }
            
        } catch (error) {
            toast.error("Failed to load admission record");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (admissionId) fetchRecord();
        
        // Fetch global currency
        fetch('/api/admin/settings')
            .then(res => res.json())
            .then(data => {
                if (data.currency) setCurrency(data.currency);
            })
            .catch(() => {});
    }, [admissionId]);

    if (isLoading) return <div className="p-8 text-center text-gray-500">Loading patient record...</div>;
    if (!admission) return <div className="p-8 text-center text-danger">Record not found</div>;

    const isDischarged = admission.dischargeDate && admission.status === "DISCHARGED";

    const handleDischarge = async () => {
        if (!confirm("Are you sure you want to finalize this bill and discharge the patient?")) return;
        
        try {
            const res = await fetch(`/api/ipd/final-bill/${admissionId}/settle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    additionalPaymentAmount: finalBill.balanceDue > 0 ? finalBill.balanceDue : 0,
                    paymentMethod: "CASH",
                    notes: "Final Settlement on Discharge"
                })
            });
            
            if (res.ok) {
                toast.success("Patient Discharged & Bill Settled");
                fetchRecord(); // Refresh to show discharged state
            } else {
                toast.error("Failed to discharge patient");
            }
        } catch (err) {
        }
    };

    const handleTransfer = async () => {
        if (!selectedBedId) {
            toast.error("Please select a new bed");
            return;
        }

        setIsTransferring(true);
        try {
            const res = await fetch(`/api/ipd/admissions/${admissionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bedId: selectedBedId,
                    wardId: selectedWardId
                })
            });

            if (res.ok) {
                toast.success("Patient transferred successfully");
                setIsTransferModalOpen(false);
                fetchRecord();
            } else {
                const err = await res.json();
                toast.error(err.error || "Failed to transfer patient");
            }
        } catch (error) {
            toast.error("An error occurred during transfer");
        } finally {
            setIsTransferring(false);
        }
    };

    const openTransferModal = async () => {
        setIsTransferModalOpen(true);
        try {
            const res = await fetch('/api/ipd/wards');
            if (res.ok) {
                const data = await res.json();
                setWards(data);
                if (admission?.wardId) setSelectedWardId(admission.wardId);
            }
        } catch (error) {
            toast.error("Failed to fetch available wards");
        }
    };

    return (
        <div className="max-w-6xl mx-auto pb-12">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/ipd/active" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold">{admission.patient?.firstName} {admission.patient?.lastName}</h2>
                            {isDischarged ? (
                                <span className="badge badge-success">Discharged</span>
                            ) : (
                                <span className="badge badge-primary">Admitted</span>
                            )}
                        </div>
                        <p className="text-sm text-gray-500">
                            IP No: {admissionId.substring(0,8).toUpperCase()} • {admission.ward} (Bed {admission.bed})
                        </p>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button onClick={fetchRecord} className="btn-secondary px-3" title="Refresh">
                        <RefreshCw size={18} />
                    </button>
                    {!isDischarged && (
                        <>
                            <button className="btn-secondary" onClick={openTransferModal}>
                                <RefreshCw size={18} /> Transfer Bed
                            </button>
                            <Link href={`/dashboard/ipd/admissions/${admissionId}/add-charge`} className="btn-secondary">
                                <Plus size={18} /> Add Charge
                            </Link>
                            <button className="btn-primary" onClick={() => setActiveTab("DEPOSITS")}>
                                <CreditCard size={18} /> Add Deposit
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Financial Summary Top Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="glass-panel p-4 border-l-4 border-primary">
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Charges</div>
                    <div className="text-2xl font-bold mt-1">{currency} {finalBill?.patientShareTotal?.toFixed(2) || '0.00'}</div>
                </div>
                <div className="glass-panel p-4 border-l-4 border-success">
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Deposits Made</div>
                    <div className="text-2xl font-bold mt-1">{currency} {finalBill?.totalDepositsAvailable?.toFixed(2) || '0.00'}</div>
                </div>
                <div className="glass-panel p-4 border-l-4 border-info">
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Insurance Coverage</div>
                    <div className="text-2xl font-bold mt-1">{currency} {finalBill?.insuranceShareTotal?.toFixed(2) || '0.00'}</div>
                </div>
                <div className={`glass-panel p-4 border-l-4 ${finalBill?.balanceDue > 0 ? 'border-warning' : 'border-success'}`}>
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Balance Due</div>
                    <div className="text-2xl font-bold mt-1 text-danger">{currency} {finalBill?.balanceDue?.toFixed(2) || '0.00'}</div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex border-b mb-6">
                <button 
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === "CHARGES" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    onClick={() => setActiveTab("CHARGES")}
                >
                    Billing Breakdown
                </button>
                <button 
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === "DEPOSITS" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    onClick={() => setActiveTab("DEPOSITS")}
                >
                    Deposits & Advances
                </button>
                <button 
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === "DISCHARGE" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                    onClick={() => setActiveTab("DISCHARGE")}
                >
                    Discharge & Settlement
                </button>
            </div>

            {/* Tab Contents */}
            <div className="animate-fade-in">
                {activeTab === "CHARGES" && (
                    <div className="glass-panel p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold">Pending Charges Breakdown</h3>
                            <span className="text-sm text-gray-500">{admission.unbilledChargesCount} items to be billed</span>
                        </div>
                        
                        {Object.keys(admission.categoryTotals || {}).length > 0 ? (
                            <div className="space-y-4">
                                {Object.entries(admission.categoryTotals).map(([category, amount]: [string, any]) => (
                                    <div key={category} className="flex justify-between items-center p-3 border-b hover:bg-gray-50">
                                        <div className="font-medium text-gray-700">{category.replace('_', ' ')}</div>
                                        <div className="font-semibold">{currency} {amount.toFixed(2)}</div>
                                    </div>
                                ))}
                                
                                <div className="flex justify-between items-center p-4 bg-gray-50 font-bold text-lg rounded-lg mt-4">
                                    <div>Gross Total</div>
                                    <div>{currency} {finalBill?.grandTotal?.toFixed(2)}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center p-8 text-gray-500 border border-dashed rounded-lg">
                                No pending charges for this admission.
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "DEPOSITS" && (
                    <div className="glass-panel p-6">
                        <h3 className="text-lg font-semibold mb-6">Deposit History</h3>
                        
                        {admission.unappliedDeposits?.length > 0 ? (
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Deposit Ref</th>
                                            <th>Method</th>
                                            <th>Original Amount</th>
                                            <th>Remaining Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {admission.unappliedDeposits.map((dep: any) => (
                                            <tr key={dep.id}>
                                                <td>{new Date(dep.depositDate).toLocaleString()}</td>
                                                <td className="font-mono text-sm">{dep.depositNumber}</td>
                                                <td>{dep.paymentMethod}</td>
                                                <td>{currency} {dep.amount.toFixed(2)}</td>
                                                <td className="font-bold text-success">{currency} {dep.remainingBalance.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center p-8 text-gray-500 border border-dashed rounded-lg">
                                No unapplied deposits available.
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "DISCHARGE" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="glass-panel p-6">
                            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                                <FileText size={20} className="text-primary" /> Final Settlement Summary
                            </h3>
                            
                            <div className="space-y-3 mb-6 bg-gray-50 p-4 rounded-lg">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Total Billed Charges:</span>
                                    <span className="font-semibold">{currency} {finalBill?.patientShareTotal?.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Less: Deposits Applied:</span>
                                    <span className="font-semibold text-danger">-{currency} {finalBill?.totalDepositsAvailable?.toFixed(2)}</span>
                                </div>
                                <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-bold text-lg">
                                    <span>Net Balance Due:</span>
                                    <span className={finalBill?.balanceDue > 0 ? 'text-warning' : 'text-success'}>
                                        {currency} {finalBill?.balanceDue?.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {isDischarged ? (
                                <div className="text-center p-4 bg-success/10 text-success rounded-lg border border-success/20">
                                    <CheckCircle size={32} className="mx-auto mb-2" />
                                    <p className="font-semibold">Patient Discharged & Settled</p>
                                    <p className="text-sm mt-1">No further actions required.</p>
                                </div>
                            ) : (
                                <div>
                                    {finalBill?.balanceDue > 0 && (
                                        <div className="mb-4 p-3 bg-warning/10 text-warning-dark border border-warning/20 rounded-lg text-sm flex gap-2">
                                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                            <span>The patient has an outstanding balance. Collect the payment before finalizing discharge.</span>
                                        </div>
                                    )}
                                    <button 
                                        className="btn-primary w-full py-3 justify-center text-lg"
                                        onClick={handleDischarge}
                                    >
                                        <LogOut size={20} /> Finalize Bill & Discharge
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        <div className="glass-panel p-6 bg-gray-50/50">
                            <h3 className="text-lg font-semibold mb-4 text-gray-700">Discharge Checklist</h3>
                            <ul className="space-y-3 text-sm text-gray-600">
                                <li className="flex items-start gap-2">
                                    <CheckCircle size={16} className="text-success mt-0.5 shrink-0" />
                                    Review all category charges for accuracy
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle size={16} className="text-success mt-0.5 shrink-0" />
                                    Ensure daily billing run is complete for today
                                </li>
                                <li className="flex items-start gap-2">
                                    {finalBill?.totalDepositsAvailable > 0 ? (
                                         <CheckCircle size={16} className="text-success mt-0.5 shrink-0" />
                                    ) : (
                                        <span className="w-4 h-4 rounded-full border border-gray-300 mt-0.5 shrink-0" />
                                    )}
                                    Apply collected deposits
                                </li>
                                <li className="flex items-start gap-2">
                                    {finalBill?.balanceDue <= 0 ? (
                                        <CheckCircle size={16} className="text-success mt-0.5 shrink-0" />
                                    ) : (
                                         <span className="w-4 h-4 rounded-full border border-gray-300 mt-0.5 shrink-0" />
                                    )}
                                    Settle outstanding balance
                                </li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>

            {/* Transfer Bed Modal */}
            {isTransferModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slide-in">
                        <h3 className="text-xl font-bold mb-4">Transfer Patient</h3>
                        <p className="text-sm text-gray-500 mb-6">Move {admission.patient.firstName} to a different ward or bed.</p>
                        
                        <div className="space-y-4">
                            <div className="form-group">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Select Ward</label>
                                <select 
                                    className="input-field" 
                                    value={selectedWardId} 
                                    onChange={(e) => {
                                        setSelectedWardId(e.target.value);
                                        setSelectedBedId("");
                                    }}
                                >
                                    <option value="">Select Ward</option>
                                    {wards.map(w => (
                                        <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Select New Bed</label>
                                <select 
                                    className="input-field" 
                                    value={selectedBedId} 
                                    onChange={(e) => setSelectedBedId(e.target.value)}
                                    disabled={!selectedWardId}
                                >
                                    <option value="">Select Bed</option>
                                    {wards.find(w => w.id === selectedWardId)?.beds
                                        .filter((b: any) => b.status === 'AVAILABLE' || b.id === admission?.bedId)
                                        .map((b: any) => (
                                            <option key={b.id} value={b.id}>
                                                {b.bedNumber} {b.id === admission?.bedId ? '(Current)' : ''}
                                            </option>
                                        ))
                                    }
                                </select>
                                {selectedWardId && wards.find(w => w.id === selectedWardId)?.beds.filter((b: any) => b.status === 'AVAILABLE').length === 0 && (
                                    <p className="text-xs text-danger mt-1">No available beds in this ward.</p>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button 
                                className="btn-secondary flex-1 justify-center" 
                                onClick={() => setIsTransferModalOpen(false)}
                                disabled={isTransferring}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn-primary flex-1 justify-center" 
                                onClick={handleTransfer}
                                disabled={isTransferring || !selectedBedId || selectedBedId === admission?.bedId}
                            >
                                {isTransferring ? "Processing..." : "Confirm Transfer"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
