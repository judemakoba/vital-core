"use client";

import React, { useState } from "react";
import styles from "./page.module.css";
import ClinicConfigTab from "./components/ClinicConfigTab";
import UsersTab from "./components/UsersTab";
import RolesTab from "./components/RolesTab";
import DrugCategoriesTab from "./components/DrugCategoriesTab";
import LabCategoriesTab from "./components/LabCategoriesTab";
import LabConfigTab from "./components/LabConfigTab";
import IPDSettingsTab from "./components/IPDSettingsTab";
import {
    Building2,
    Users,
    Shield,
    Pill,
    FlaskConical,
    Microscope,
    BedDouble,
} from "lucide-react";

type TabType = 'clinic' | 'users' | 'roles' | 'drugs' | 'labcats' | 'labs' | 'ipd';

const TABS: { id: TabType; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'clinic',  label: 'Clinic',      icon: Building2 },
    { id: 'users',   label: 'Users',       icon: Users },
    { id: 'roles',   label: 'Roles',       icon: Shield },
    { id: 'drugs',   label: 'Drugs',       icon: Pill },
    { id: 'labcats', label: 'Lab Catalog', icon: Microscope },
    { id: 'labs',    label: 'Lab Config',  icon: FlaskConical },
    { id: 'ipd',     label: 'IPD',         icon: BedDouble },
];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('clinic');

    const renderContent = () => {
        switch (activeTab) {
            case 'clinic':  return <ClinicConfigTab />;
            case 'users':   return <UsersTab />;
            case 'roles':   return <RolesTab />;
            case 'drugs':   return <DrugCategoriesTab />;
            case 'labcats': return <LabCategoriesTab />;
            case 'labs':    return <LabConfigTab />;
            case 'ipd':     return <IPDSettingsTab />;
            default:        return null;
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Settings</h1>
                <p className={styles.subtitle}>
                    Clinic configuration, user management, catalogs, and integrations.
                </p>
            </div>

            <div className={styles.tabBar}>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <Icon size={16} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className={styles.content}>
                {renderContent()}
            </div>

            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2rem", textAlign: "center" }}>
                Database: PostgreSQL (encrypted at rest) · Auth: NextAuth.js (JWT + BCrypt) · RBAC enforced
            </div>
        </div>
    );
}
