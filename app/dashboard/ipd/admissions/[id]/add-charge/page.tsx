"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Search, Plus } from "lucide-react";
import styles from "../../../../ipd.module.css";
const toast = { success: (msg: string) => alert(msg), error: (msg: string) => alert(msg) };

export default function AddManualChargePage() {
    const params = useParams();
    const router = useRouter();
    const admissionId = params.id as string;
    
    const [isLoading, setIsLoading] = useState(false);
    const [billableItems, setBillableItems] = useState<any[]>([]);
    const [currency, setCurrency] = useState("UGX");
    
    // Form state
    const [search, setSearch] = useState("");
    const [selectedItemId, setSelectedItemId] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [notes, setNotes] = useState("");

    useEffect(() => {
        const fetchItemsAndSettings = async () => {
            try {
                // Fetch active manual billable items
                const res = await fetch('/api/ipd/billable-items');
                if (res.ok) {
                    const data = await res.json();
                    setBillableItems(data.filter((item: any) => item.application !== "AUTO"));
                }
                
                // Fetch global currency
                const settingsRes = await fetch('/api/admin/settings');
                if (settingsRes.ok) {
                    const settings = await settingsRes.json();
                    if (settings.currency) setCurrency(settings.currency);
                }
            } catch (error) {
                toast.error("Failed to load billable items");
            }
        };
        fetchItemsAndSettings();
    }, []);

    const selectedItem = billableItems.find(i => i.id === selectedItemId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!selectedItem) {
            toast.error("Please select a billable item");
            return;
        }

        setIsLoading(true);
        try {
            const chargeData = {
                admissionId,
                billableItemId: selectedItem.id,
                chargeDate: new Date().toISOString(),
                quantity,
                unitPrice: selectedItem.standardRate,
                discountAmount: 0,
                taxAmount: 0, // Should be calculated if taxable
                notes,
                generationMethod: "MANUAL"
            };

            const res = await fetch('/api/ipd/charges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(chargeData)
            });

            if (res.ok) {
                toast.success("Charge posted successfully");
                router.push(`/dashboard/ipd/admissions/${admissionId}`);
            } else {
                const err = await res.json();
                toast.error(err.error || "Failed to post charge");
            }
        } catch (error) {
            toast.error("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    const filteredItems = billableItems
        .filter(item => 
            item.itemName.toLowerCase().includes(search.toLowerCase()) || 
            item.itemCode.toLowerCase().includes(search.toLowerCase())
        )
        .slice(0, 10);

    return (
        <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Link href={`/dashboard/ipd/admissions/${admissionId}`} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h2 className="text-2xl font-bold">Post Manual Charge</h2>
                    <p className="text-sm text-gray-500">Record a procedure, consumable, or service for the patient.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="glass-panel p-6">
                    <h3 className="text-lg font-semibold border-b pb-2 mb-4">1. Select Item/Service</h3>
                    
                    {!selectedItemId ? (
                        <div>
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Search by code or name..." 
                                    className="input-field pl-10"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            
                            <div className="border rounded-lg overflow-hidden bg-white max-h-64 overflow-y-auto">
                                {filteredItems.length > 0 ? filteredItems.map(item => (
                                    <div 
                                        key={item.id} 
                                        className="p-3 border-b last:border-0 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                        onClick={() => {
                                            setSelectedItemId(item.id);
                                            setQuantity(item.defaultQuantity || 1);
                                        }}
                                    >
                                        <div>
                                            <div className="font-medium">{item.itemName}</div>
                                            <div className="text-sm text-gray-500 flex gap-2">
                                                <span className="font-mono">{item.itemCode}</span>
                                                <span>•</span>
                                                <span className="badge badge-secondary">{item.category}</span>
                                            </div>
                                        </div>
                                        <div className="font-bold text-primary">{currency} {item.standardRate.toFixed(2)}</div>
                                    </div>
                                )) : (
                                    <div className="p-4 text-center text-gray-500">No matching items found.</div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-between items-center p-4 bg-primary/5 border border-primary/20 rounded-lg">
                            <div className="flex flex-col">
                                <span className="font-bold text-gray-900">{selectedItem?.itemName}</span>
                                <span className="text-sm text-gray-500 font-mono">{selectedItem?.itemCode}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="font-bold text-primary">{currency} {selectedItem?.standardRate.toFixed(2)}</span>
                                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelectedItemId("")}>
                                    Change Selected Item
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="glass-panel p-6">
                    <h3 className="text-lg font-semibold border-b pb-2 mb-4">2. Charge Details</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="form-group">
                            <label>Quantity</label>
                            <input 
                                type="number" 
                                min="0.1" 
                                step="0.1"
                                className="input-field" 
                                value={quantity} 
                                onChange={e => setQuantity(parseFloat(e.target.value) || 1)}
                                required
                            />
                        </div>
                        
                        <div className="form-group">
                            <label>Total Price (Calculated)</label>
                            <input 
                                type="text" 
                                className="input-field bg-gray-50 text-gray-500" 
                                value={`${currency} ${((selectedItem?.standardRate || 0) * quantity).toFixed(2)}`}
                                readOnly
                            />
                        </div>

                        <div className="form-group col-span-full">
                            <label>Clinical Notes (Optional)</label>
                            <textarea 
                                className="input-field min-h-[100px]" 
                                value={notes} 
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Add any details regarding this charge..."
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-4 pt-4">
                    <Link href={`/dashboard/ipd/admissions/${admissionId}`} className="btn-secondary px-6">Cancel</Link>
                    <button 
                        type="submit" 
                        className="btn-primary px-8"
                        disabled={isLoading || !selectedItemId}
                    >
                        {isLoading ? "Posting..." : (
                            <><Save size={18} /> Post Charge</>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
