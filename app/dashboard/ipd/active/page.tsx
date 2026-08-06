"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Search, Edit } from "lucide-react";
import styles from "../../ipd.module.css";
const toast = { success: (msg: string) => alert(msg), error: (msg: string) => alert(msg) };

export default function ActivePatientsPage() {
    const [admissions, setAdmissions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const fetchAdmissions = async () => {
             try {
                 const res = await fetch('/api/ipd/admissions?status=ADMITTED');
                 if (res.ok) setAdmissions(await res.json());
             } catch (error) {
                 toast.error("Failed to load admissions");
             } finally {
                 setIsLoading(false);
             }
        };
        fetchAdmissions();
    }, []);

    const filteredAdmissions = admissions.filter(adm => 
        adm.patient?.firstName.toLowerCase().includes(search.toLowerCase()) || 
        adm.patient?.lastName.toLowerCase().includes(search.toLowerCase()) ||
        adm.admissionNumber.toLowerCase().includes(search.toLowerCase()) ||
        adm.ward?.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/ipd" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h2 className="text-2xl font-bold">Active Inpatients</h2>
                        <p className="text-sm text-gray-500">Currently admitted patients across all wards</p>
                    </div>
                </div>
                
                <Link href="/dashboard/ipd/admissions/new" className="btn-primary">
                    <UserPlus size={18} /> New Admission
                </Link>
            </div>

            <div className="glass-panel p-6">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                     <div className="relative w-full sm:w-96">
                         <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                         <input 
                             type="text" 
                             placeholder="Search patient, ward, or IP number..." 
                             className="input-field pl-10"
                             value={search}
                             onChange={(e) => setSearch(e.target.value)}
                         />
                     </div>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center text-gray-500">Loading active patients...</div>
                ) : filteredAdmissions.length === 0 ? (
                    <div className="p-12 text-center text-gray-500 border border-dashed rounded-lg bg-gray-50/50">
                        {search ? "No patients matching your search." : "No active admissions at the moment."}
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>IP Number</th>
                                    <th>Patient</th>
                                    <th>Ward & Bed</th>
                                    <th>Admission Date</th>
                                    <th>Attending Dr.</th>
                                    <th>Status</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAdmissions.map((adm) => {
                                    const admDate = new Date(adm.admissionDate);
                                    const daysAdmitted = Math.ceil((new Date().getTime() - admDate.getTime()) / (1000 * 3600 * 24));
                                    
                                    return (
                                    <tr key={adm.id} className="hover:bg-gray-50">
                                        <td className="font-mono text-sm">{adm.admissionNumber}</td>
                                        <td>
                                            <div className="font-bold">{adm.patient?.firstName} {adm.patient?.lastName}</div>
                                            <div className="text-xs text-gray-500">{adm.patient?.gender} • {new Date(adm.patient?.dateOfBirth).getFullYear()}</div>
                                        </td>
                                        <td>
                                            <span className="font-medium text-primary">{adm.ward?.name}</span>
                                            <div className="text-xs text-gray-500">Bed: {adm.bed?.bedNumber}</div>
                                        </td>
                                        <td>
                                            <div>{admDate.toLocaleDateString()}</div>
                                            <div className="text-xs text-info font-medium">Day {daysAdmitted}</div>
                                        </td>
                                        <td className="text-sm">{adm.admittingDoctor?.name || 'Unassigned'}</td>
                                        <td><span className="badge badge-primary">ADMITTED</span></td>
                                        <td className="text-right">
                                            <Link href={`/dashboard/ipd/admissions/${adm.id}`} className="btn-secondary py-1 px-3 text-xs w-full sm:w-auto inline-flex justify-center">
                                                Manage File
                                            </Link>
                                        </td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
