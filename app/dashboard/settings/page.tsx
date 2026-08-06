"use client";

import React, { useState, useEffect } from "react";
import {
    Settings as SettingsIcon,
    Users,
    Shield,
    Briefcase,
    Beaker,
    Pill,
    Warehouse
} from "lucide-react";
import styles from "./page.module.css";
import ClinicConfigTab from "./components/ClinicConfigTab";
import InsuranceTab from "./components/InsuranceTab";
import UsersTab from "./components/UsersTab";
import RolesTab from "./components/RolesTab";
import DrugCategoriesTab from "./components/DrugCategoriesTab";
import LabCategoriesTab from "./components/LabCategoriesTab";
import LabConfigTab from "./components/LabConfigTab";
import IPDSettingsTab from "./components/IPDSettingsTab";
import EmailSettingsTab from "./components/EmailSettingsTab";
import { Mail } from "lucide-react";

type TabType = 'clinic' | 'users' | 'roles' | 'insurance' | 'drugs' | 'labcats' | 'labs' | 'ipd' | 'email';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('clinic');

    // R49: insurance feature flag. When OFF, hide the "Insurance Partners"
    // tab in this settings page. The InsuranceTab component is still
    // imported and rendered if the user navigates to it directly (defense
    // in depth) but the tab button is gone.
    const [insuranceEnabled, setInsuranceEnabled] = useState(true);
    useEffect(() => {
        fetch("/api/insurance/enabled", { credentials: "include" })
            .then(r => r.ok ? r.json() : { enabled: true })
            .then(data => setInsuranceEnabled(data.enabled !== false))
            .catch(() => setInsuranceEnabled(true));
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case 'clinic':
                return <ClinicConfigTab />;
            case 'users':
                return <UsersTab />;
            case 'roles':
                return <RolesTab />;
            case 'insurance':
                // R49: insurance OFF — render an empty state instead of
                // the InsuranceTab. The tab button is already hidden, but
                // this guards against the user landing on this state via
                // deep link or stale UI.
                if (!insuranceEnabled) {
                    return (
                        <div className={styles.section}>
                            <h2 className={styles.title}>Insurance Disabled</h2>
                            <p style={{ color: 'var(--text-muted)' }}>
                                Insurance is currently disabled for this clinic.
                                Re-enable it from the admin insurance toggle to manage partners.
                            </p>
                        </div>
                    );
                }
                return <InsuranceTab />;
            case 'drugs':
                return <DrugCategoriesTab />;
            case 'labcats':
                return <LabCategoriesTab />;
            case 'labs':
                return <LabConfigTab />;
            case 'ipd':
                return <IPDSettingsTab />;
            case 'email':
                return <EmailSettingsTab />;
            default:
                return null;
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className="title">System Administration Settings</h1>
                <p className="subtitle">Manage clinic configuration, users, insurance, and system catalogs.</p>
            </div>

            <div className={styles.layout}>
                {/* Sidebar Navigation */}
                <aside className={styles.sidebar}>
                    <nav className={styles.nav}>
                        <button
                            className={`${styles.navItem} ${activeTab === 'clinic' ? styles.active : ''}`}
                            onClick={() => setActiveTab('clinic')}
                        >
                            <SettingsIcon size={18} /> Configuration
                        </button>
                        <button
                            className={`${styles.navItem} ${activeTab === 'users' ? styles.active : ''}`}
                            onClick={() => setActiveTab('users')}
                        >
                            <Users size={18} /> User Profiles
                        </button>
                        <button
                            className={`${styles.navItem} ${activeTab === 'roles' ? styles.active : ''}`}
                            onClick={() => setActiveTab('roles')}
                        >
                            <Shield size={18} /> Roles & Permissions
                        </button>
                        {insuranceEnabled && (
                            <button
                                className={`${styles.navItem} ${activeTab === 'insurance' ? styles.active : ''}`}
                                onClick={() => setActiveTab('insurance')}
                            >
                                <Briefcase size={18} /> Insurance Partners
                            </button>
                        )}
                        <button
                            className={`${styles.navItem} ${activeTab === 'drugs' ? styles.active : ''}`}
                            onClick={() => setActiveTab('drugs')}
                        >
                            <Pill size={18} /> Drug Categories
                        </button>
                        <button
                            className={`${styles.navItem} ${activeTab === 'labcats' ? styles.active : ''}`}
                            onClick={() => setActiveTab('labcats')}
                        >
                            <Beaker size={18} /> Lab Categories
                        </button>
                        <button
                            className={`${styles.navItem} ${activeTab === 'labs' ? styles.active : ''}`}
                            onClick={() => setActiveTab('labs')}
                        >
                            <Beaker size={18} /> Lab Tests Catalog
                        </button>
                        <button
                            className={`${styles.navItem} ${activeTab === 'ipd' ? styles.active : ''}`}
                            onClick={() => setActiveTab('ipd')}
                        >
                            <Warehouse size={18} /> IPD Configuration
                        </button>
                        <button
                            className={`${styles.navItem} ${activeTab === 'email' ? styles.active : ''}`}
                            onClick={() => setActiveTab('email')}
                        >
                            <Mail size={18} /> Email Configuration
                        </button>
                    </nav>
                </aside>

                {/* Main Content Area */}
                <main className={styles.content}>
                    {renderContent()}
                </main>
            </div>
            
            {/* System Security Context footer */}
            <div className={styles.section} style={{ marginTop: '2rem', borderLeft: "4px solid var(--success-color)", padding: '1rem' }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--success-color)' }}>System Security Active</h3>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Database: PostgreSQL (Encrypted at rest) | Auth: NextAuth.js (JWT + BCrypt) | Role-Based Access Control (RBAC) Enforced
                </div>
            </div>
        </div>
    );
}
