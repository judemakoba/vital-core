"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
    Activity,
    LayoutDashboard,
    Users,
    Calendar,
    Pill,
    Stethoscope,
    CreditCard,
    Settings,
    LogOut,
    Menu,
    X,
    Shield,
    Mail,
    BarChart3,
    TestTube,
    Scan,
    User,
    TrendingUp,
    BedDouble
} from "lucide-react";
import styles from "./layout.module.css";
import { TenantProvider, useTenant } from "@/components/TenantContext";

// Routes that are gated by the `insurance.enabled` system setting.
// Hidden from the sidebar when insurance is OFF so the UI stays clean.
// The pages themselves still exist (so admins can re-enable later).
const INSURANCE_NAVGATION_HREFS = new Set<string>([
    '/dashboard/admin/insurance',
    '/dashboard/admin/insurance/claims',
]);

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Patients', href: '/dashboard/patients', icon: Users, roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
    { name: 'Appointments', href: '/dashboard/appointments', icon: Calendar, roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
    { name: 'Triage', href: '/dashboard/triage', icon: Activity, roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE'] },
    { name: 'Doctor', href: '/dashboard/doctor', icon: Stethoscope, roles: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR'] },
    { name: 'Pharmacy', href: '/dashboard/pharmacy', icon: Pill, roles: ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST'] },
    { name: 'Laboratory', href: '/dashboard/lab', icon: TestTube, roles: ['SUPER_ADMIN', 'ADMIN', 'LAB_TECH', 'LAB_ADMIN'] },
    { name: 'Radiology', href: '/dashboard/radiology', icon: Scan, roles: ['SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST'] },
    { name: 'Inpatient (IPD)', href: '/dashboard/ipd', icon: BedDouble, roles: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] },
    { name: 'Finance (Billing)', href: '/dashboard/billing', icon: CreditCard, roles: ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT'] },
    { name: 'Finance & Accounting', href: '/dashboard/finance', icon: TrendingUp, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { name: 'Insurance Claims', href: '/dashboard/admin/insurance/claims', icon: Shield, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { name: 'Messages', href: '/dashboard/communication', icon: Mail, roles: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR'] },
    { name: 'Email', href: '/dashboard/email', icon: Mail, roles: ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'ACCOUNTANT'] },
    { name: 'Reports', href: '/dashboard/reports', icon: BarChart3, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { name: 'User Profile', href: '/dashboard/profile', icon: User },
    { name: 'Admin Settings', href: '/dashboard/settings', icon: Settings, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { name: 'Insurance Partners', href: '/dashboard/admin/insurance', icon: Shield, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { name: 'Lab Catalog', href: '/dashboard/admin/lab-catalog', icon: TestTube, roles: ['SUPER_ADMIN', 'ADMIN'] }
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <TenantProvider>
            <DashboardShell>{children}</DashboardShell>
        </TenantProvider>
    );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { data: session } = useSession();
    const { tenant, settings } = useTenant();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // R49: insurance feature flag. When OFF, hide the insurance nav items
    // ("Insurance Claims" + "Insurance Partners") from the sidebar so the
    // admin/staff don't see dead-end tabs. The routes themselves still
    // exist — admins can re-enable insurance later and the tabs reappear.
    const [insuranceEnabled, setInsuranceEnabled] = useState(true);
    useEffect(() => {
        fetch("/api/insurance/enabled", { credentials: "include" })
            .then(r => r.ok ? r.json() : { enabled: true })
            .then(data => setInsuranceEnabled(data.enabled !== false))
            .catch(() => setInsuranceEnabled(true));
    }, []);

    // Role-based logic
    const userRole = session?.user?.role;
    const isReceptionist = userRole === 'RECEPTIONIST';

    // Route Guard check
    const forbiddenPaths = [
        '/dashboard/doctor',
        '/dashboard/pharmacy',
        '/dashboard/lab',
        '/dashboard/radiology',
        '/dashboard/billing',
        '/dashboard/communication',
        '/dashboard/reports',
        '/dashboard/finance',
        '/dashboard/settings',
        '/dashboard/admin'
    ];

    const isForbidden = isReceptionist && forbiddenPaths.some(path => pathname.startsWith(path));

    // Improved Title Logic: Match most specific route first
    const currentNavItem = [...navigation]
        .reverse()
        .find(n => pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(`${n.href}/`)))
        || navigation.find(n => n.href === '/dashboard');

    const pageTitle = currentNavItem?.name || 'Dashboard';

    // Extract initials for avatar
    const getInitials = (name?: string | null) => {
        if (!name) return "U";
        return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    };

    const clinicName = tenant.shortName || tenant.name || "VitalCore";
    const logoUrl = tenant.logoUrl as string | undefined;

    return (
        <div className={styles.container}>
            {/* Inject tenant brand colors as CSS variables on :root */}
            {tenant?.primaryColor && (
                <style jsx global>{`
                    :root {
                        --primary-color: ${tenant.primaryColor} !important;
                        --primary-hover: ${tenant.primaryColor} !important;
                    }
                `}</style>
            )}
            {tenant?.accentColor && (
                <style jsx global>{`
                    :root {
                        --secondary-color: ${tenant.accentColor} !important;
                    }
                `}</style>
            )}

            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
                <div className={styles.logoArea}>
                    {logoUrl ? (
                        <img src={logoUrl} alt={clinicName} style={{ height: 32, marginRight: 8 }} />
                    ) : (
                        <Activity size={28} />
                    )}
                    <span>{clinicName}</span>
                </div>

                <nav className={styles.nav}>
                    {navigation.map((item: any, index) => {
                        // Role-based filtering
                        if (item.roles && !item.roles.includes(userRole)) {
                            return null;
                        }

                        // R49: hide insurance nav items when the feature is OFF
                        if (!insuranceEnabled && INSURANCE_NAVGATION_HREFS.has(item.href)) {
                            return null;
                        }

                        const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`)) || (item.href === '/dashboard' && pathname === '/dashboard');

                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''} animate-slide-in`}
                                onClick={() => setSidebarOpen(false)}
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <item.icon size={20} />
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>

                <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <button onClick={() => signOut({ callbackUrl: '/login' })} className={styles.logoutBtn}>
                        <LogOut size={20} />
                        Logout
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className={styles.mainWrapper}>
                <header className={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button
                            className="mobile-menu-btn"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'none' }}
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                        >
                            <Menu size={24} />
                        </button>
                        <style jsx>{`
                            @media (max-width: 768px) {
                                .mobile-menu-btn { display: block !important; }
                            }
                        `}</style>
                        <h1 className={styles.headerTitle}>
                            {pageTitle}
                        </h1>
                    </div>

                    <div className={styles.userProfile}>
                        <div className={styles.userInfo}>
                            <span className={styles.userName}>{session?.user?.name || "User"}</span>
                            <span className={styles.userRole}>{userRole || "Staff"}</span>
                        </div>
                        <div className={styles.avatar}>
                            {getInitials(session?.user?.name)}
                        </div>
                    </div>
                </header>

                <main className={styles.mainContent}>
                    {isForbidden ? (
                        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '400px', borderRadius: 'var(--radius-lg)' }}>
                                <Shield size={48} color="var(--danger-color)" style={{ marginBottom: '1.5rem', margin: '0 auto' }} />
                                <h2 style={{ marginBottom: '0.5rem' }}>Access Denied</h2>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                                    Your account does not have permission to access this module.
                                </p>
                                <Link href="/dashboard" className="btn-premium btn-primary" style={{ display: 'inline-block', padding: '0.75rem 1.5rem' }}>
                                    Return to Dashboard
                                </Link>
                            </div>
                        </div>
                    ) : (
                        children
                    )}
                </main>
            </div>
        </div>
    );
}
