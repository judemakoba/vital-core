"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, ServerCog, CheckCircle, AlertCircle, Calendar } from "lucide-react";
import styles from "../../ipd.module.css";
const toast = { success: (msg: string) => alert(msg), error: (msg: string) => alert(msg) };

export default function DailyBillingRunPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [targetDateStr, setTargetDateStr] = useState(new Date().toISOString().split('T')[0]);

    const handleBillingRun = async () => {
        setIsLoading(true);
        setResults(null);
        
        try {
            const res = await fetch('/api/ipd/charges/auto/daily', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: targetDateStr })
            });

            const data = await res.json();
            
            if (res.ok) {
                toast.success(data.message || "Daily billing run completed");
                setResults(data);
            } else {
                toast.error(data.error || "Failed to execute billing run");
            }
        } catch (error) {
            toast.error("An error occurred during execution.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/dashboard/ipd" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h2 className="text-2xl font-bold">Automated Daily Billing Engine</h2>
                    <p className="text-sm text-gray-500">Run batch processes to post Room & Board, Nursing Fees, and Daily Sundries to active admissions.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
               <div className="glass-panel p-6 border-l-4 border-primary bg-primary/5">
                   <h3 className="font-bold flex items-center gap-2 mb-2 text-primary-dark">
                       <ServerCog size={20} /> Engine Settings
                   </h3>
                   <p className="text-sm text-gray-700 mb-4">
                       This operation will apply configured daily recurring items to all currently admitted patients.
                       It skips patients that have already been billed for the selected date.
                   </p>
                   
                   <div className="form-group mb-4">
                       <label>Billing Run Target Date</label>
                       <div className="relative">
                            <Calendar size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                            <input 
                                type="date" 
                                className="input-field pl-10 bg-white" 
                                value={targetDateStr}
                                onChange={e => setTargetDateStr(e.target.value)}
                                max={new Date().toISOString().split('T')[0]} // Cannot bill future dates
                            />
                       </div>
                   </div>

                   <button 
                       className="btn-primary w-full justify-center"
                       onClick={handleBillingRun}
                       disabled={isLoading}
                   >
                       {isLoading ? "Running Engine..." : <><Play size={18} /> Execute Billing Run</>}
                   </button>
               </div>

               <div className="glass-panel p-6">
                   <h3 className="font-bold mb-4 border-b pb-2">Execution Results</h3>
                   
                   {isLoading ? (
                       <div className="h-40 flex flex-col items-center justify-center text-primary">
                           <div className="animate-spin mb-4"><ServerCog size={32} /></div>
                           <p className="font-medium animate-pulse">Calculating charges and updating ledgers...</p>
                       </div>
                   ) : results ? (
                       <div className="animate-fade-in space-y-4">
                           <div className="flex items-start gap-3 p-4 bg-success/10 border border-success/20 rounded-lg text-success-dark">
                               <CheckCircle size={24} className="shrink-0 mt-0.5" />
                               <div>
                                   <div className="font-bold">Run Complete</div>
                                   <div className="text-sm">Generated <strong>{results.newChargesGenerated}</strong> new automated charges.</div>
                               </div>
                           </div>

                           {results.errors && results.errors.length > 0 && (
                               <div className="flex items-start gap-3 p-4 bg-danger/10 border border-danger/20 rounded-lg text-danger">
                                   <AlertCircle size={24} className="shrink-0 mt-0.5" />
                                   <div>
                                       <div className="font-bold">Execution Errors ({results.errors.length})</div>
                                       <ul className="text-xs list-disc pl-4 mt-2 space-y-1">
                                           {results.errors.slice(0, 5).map((err: any, idx: number) => (
                                               <li key={idx}>Admission {err.admissionId?.substring(0,8)}: {err.error}</li>
                                           ))}
                                           {results.errors.length > 5 && <li>...and {results.errors.length - 5} more</li>}
                                       </ul>
                                   </div>
                               </div>
                           )}
                       </div>
                   ) : (
                       <div className="h-40 flex flex-col items-center justify-center text-gray-400 border border-dashed rounded-lg bg-gray-50/50">
                           <ServerCog size={32} className="mb-2 opacity-50" />
                           <p className="text-sm">Ready to execute.</p>
                       </div>
                   )}
               </div>
            </div>
            
            <div className="glass-panel p-6">
                <h3 className="font-bold mb-4 border-b pb-2 text-gray-700">How Auto-Billing Works</h3>
                <div className="space-y-4 text-sm text-gray-600">
                    <p><strong>1. Room & Board:</strong> The engine automatically calculates the bed rate multiplied by 1 day. If the specific bed has no rate, the ward's standard fall-back rate is applied.</p>
                    <p><strong>2. Nursing Fees:</strong> Level 1 to Level 5 nursing care fees are generated based on the patient's current configuration. If missing, a generic Standard Nursing Care fee is utilized.</p>
                    <p><strong>3. Daily Sundries:</strong> Configured minimum sundries (linen, sanitation sets) required per patient hospital day are generated sequentially.</p>
                    <div className="p-3 bg-info/10 text-info border border-info/20 rounded-md">
                        <strong>Note:</strong> Auto-billing checks for existing charges matching the selected date to prevent duplicate billing. You may run the engine multiple times a day safely.
                    </div>
                </div>
            </div>
        </div>
    );
}
