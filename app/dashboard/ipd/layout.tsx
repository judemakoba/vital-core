"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BedDouble, UserPlus, Users, FileText, Settings, Stethoscope } from "lucide-react";
import styles from "./ipd.module.css";
import { useSession } from "next-auth/react";

const ipdNav = [
    { name: 'Dashboard', href: '/dashboard/ipd', icon: LayoutDashboard },
    { name: 'Wards & Beds', href: '/dashboard/ipd/wards', icon: BedDouble },
    { name: 'Admissions', href: '/dashboard/ipd/admissions', icon: UserPlus },
    { name: 'Active Patients', href: '/dashboard/ipd/active', icon: Users },
    { name: 'Nurse Station', href: '/dashboard/ipd/nurse-station', icon: Stethoscope },
    { name: 'Billing & Reports', href: '/dashboard/ipd/billing', icon: FileText, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER'] },
    { name: 'Configuration', href: '/dashboard/ipd/settings', icon: Settings, roles: ['SUPER_ADMIN', 'ADMIN'] }
];

export default function IPDLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { data: session } = useSession();
    const userRole = session?.user?.role as string;

    return (
        <div className={styles.ipdContainer}>
            <div className={styles.ipdHeader}>
                <div>
                    <h1 className="text-2xl font-bold">Inpatient Department (IPD)</h1>
                    <p className="text-sm text-gray-500">Manage admissions, wards, and inpatient billing</p>
                </div>
            </div>

            <div className={styles.ipdNav}>
                {ipdNav.map((item) => {
                    if (item.roles && !item.roles.includes(userRole)) return null;
                    
                    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/dashboard/ipd');
                    
                    return (
                        <Link 
                            key={item.name} 
                            href={item.href}
                            className={`${styles.navItem} ${isActive ? styles.activeNavItem : ''}`}
                        >
                            <item.icon size={18} />
                            {item.name}
                        </Link>
                    )
                })}
            </div>

            <div className={styles.ipdContent}>
                {children}
            </div>
        </div>
    );
}
