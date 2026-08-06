import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Users, BedDouble, UserMinus, Activity, UserPlus, FileText } from "lucide-react";
import styles from "./ipd.module.css";
import Link from "next/link";

export default async function IPDDashboard() {
    const session = await getServerSession(authOptions);
    if (!session) {
        redirect('/login');
    }

    // 1. Get total active admissions
    const activeAdmissionsCount = await prisma.admission.count({
        where: { status: "ADMITTED" }
    });

    // 2. Get total beds and occupied
    const totalBedsCount = await prisma.bed.count();
    const occupiedBedsCount = await prisma.admission.count({
        where: { status: "ADMITTED", bedId: { not: null } }
    });
    
    const occupancyRate = totalBedsCount > 0 ? Math.round((occupiedBedsCount / totalBedsCount) * 100) : 0;

    // 3. Discharges this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);
    
    const dischargesThisMonth = await prisma.admission.count({
        where: { 
            status: "DISCHARGED",
            dischargeDate: { gte: startOfMonth }
        }
    });

    // 4. Pending Daily Summaries (Needs attention)
    const today = new Date();
    today.setHours(0,0,0,0);
    const unbilledAdmissions = await prisma.admission.findMany({
        where: { status: "ADMITTED" },
        include: {
            patient: true,
            ward: true,
            bed: true,
        },
        take: 5
    });

    return (
        <div>
            <div className={styles.pageHeader}>
                <h2>IPD Overview</h2>
                <Link href="/dashboard/ipd/admissions/new" className="btn-primary">
                    <UserPlus size={18} /> New Admission
                </Link>
            </div>

            <div className={styles.summaryCards}>
                <div className={styles.summaryCard}>
                    <div className={`${styles.iconWrapper} ${styles.primary}`}>
                        <Users size={24} />
                    </div>
                    <div>
                        <div className={styles.cardLabel}>Active Patients</div>
                        <div className={styles.cardValue}>{activeAdmissionsCount}</div>
                    </div>
                </div>
                
                <div className={styles.summaryCard}>
                    <div className={`${styles.iconWrapper} ${occupancyRate > 80 ? styles.warning : styles.info}`}>
                        <BedDouble size={24} />
                    </div>
                    <div>
                        <div className={styles.cardLabel}>Occupancy Rate</div>
                        <div className={styles.cardValue}>{occupancyRate}% <span className="text-sm font-normal text-gray-500">({occupiedBedsCount}/{totalBedsCount})</span></div>
                    </div>
                </div>

                <div className={styles.summaryCard}>
                    <div className={`${styles.iconWrapper} ${styles.success}`}>
                        <UserMinus size={24} />
                    </div>
                    <div>
                        <div className={styles.cardLabel}>Discharges (This Month)</div>
                        <div className={styles.cardValue}>{dischargesThisMonth}</div>
                    </div>
                </div>
                
                <div className={styles.summaryCard}>
                    <div className={`${styles.iconWrapper} ${styles.warning}`}>
                        <Activity size={24} />
                    </div>
                    <div>
                        <div className={styles.cardLabel}>Pending Billing Runs</div>
                        <div className={styles.cardValue}>Active</div>
                    </div>
                </div>
            </div>

            <div className={styles.grid}>
                <div className={styles.sectionGroup}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1rem'}}>
                        <h3 className="font-semibold text-lg">Recent Admissions</h3>
                        <Link href="/dashboard/ipd/active" className="text-primary text-sm font-medium">View All</Link>
                    </div>
                    
                    {unbilledAdmissions.length === 0 ? (
                        <p className="text-gray-500 text-sm py-4">No active admissions.</p>
                    ) : (
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Patient</th>
                                        <th>Ward/Bed</th>
                                        <th>Admitted</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {unbilledAdmissions.map(adm => (
                                        <tr key={adm.id}>
                                            <td>
                                                <div className="font-medium">{adm.patient.firstName} {adm.patient.lastName}</div>
                                                <div className="text-xs text-gray-500">IP Number: {adm.admissionNumber}</div>
                                            </td>
                                            <td>{adm.ward?.name || 'N/A'} - {adm.bed?.bedNumber || 'N/A'}</td>
                                            <td>{new Date(adm.admissionDate).toLocaleDateString()}</td>
                                            <td>
                                                <Link href={`/dashboard/ipd/admissions/${adm.id}`} className="btn-secondary py-1 px-2 text-xs">
                                                    Manage
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                
                <div className={styles.sectionGroup}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1rem'}}>
                        <h3 className="font-semibold text-lg">Quick Actions</h3>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        <Link href="/dashboard/ipd/billing-run" className="glass-panel p-4 flex items-center gap-3 hover:border-primary transition-colors">
                            <div className="bg-primary/10 text-primary p-2 rounded-lg">
                                <Activity size={20} />
                            </div>
                            <div>
                                <div className="font-medium">Run Daily Billing</div>
                                <div className="text-xs text-gray-500">Calculate nursing, ward & sundry charges</div>
                            </div>
                        </Link>
                        
                        <Link href="/dashboard/ipd/wards" className="glass-panel p-4 flex items-center gap-3 hover:border-primary transition-colors">
                            <div className="bg-primary/10 text-primary p-2 rounded-lg">
                                <BedDouble size={20} />
                            </div>
                            <div>
                                <div className="font-medium">Bed Management</div>
                                <div className="text-xs text-gray-500">View ward status and reassign beds</div>
                            </div>
                        </Link>
                        
                        <Link href="/dashboard/ipd/reports" className="glass-panel p-4 flex items-center gap-3 hover:border-primary transition-colors">
                            <div className="bg-primary/10 text-primary p-2 rounded-lg">
                                <FileText size={20} />
                            </div>
                            <div>
                                <div className="font-medium">Financial Reports</div>
                                <div className="text-xs text-gray-500">IPD Revenue and Cost metrics</div>
                            </div>
                        </Link>
                    </div>
                </div>
            </div>
            
        </div>
    );
}


