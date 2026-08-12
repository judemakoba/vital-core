"use client";

import React, { useState, useEffect } from "react";
import styles from "./page.module.css";
import ClinicConfigTab from "./components/ClinicConfigTab";
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
    // tab in this settings page. The InsuranceTab component is still
    // imported and rendered if the user navigates to it directly (defense
    // in depth) but the tab button is gone.
    useEffect(() => {
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
                // the InsuranceTab. The tab button is already hidden, but
                // this guards against the user landing on this state via
                // deep link or stale UI.
                if (!insuranceEnabled) {
                    return (
                        <div className={styles.section}>
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
                                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Database: PostgreSQL (Encrypted at rest) | Auth: NextAuth.js (JWT + BCrypt) | Role-Based Access Control (RBAC) Enforced
                </div>
            </div>
        </div>
    );
}
