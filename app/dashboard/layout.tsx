"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import styles from "./layout.module.css";
import { TenantProvider, useTenant } from "@/components/TenantContext";export default function DashboardLayout({
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
    // ("Insurance Claims" + "Insurance Partners") from the sidebar so the
    // admin/staff don't see dead-end tabs. The routes themselves still
    // exist — admins can re-enable insurance later and the tabs reappear.
    useEffect(() => {
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
