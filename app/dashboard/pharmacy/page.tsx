'use client';

import { useState, useEffect } from 'react';
import styles from './pharmacy.module.css';
import DrugMasterTab from './DrugMasterTab';
import BatchManagementTab from './BatchManagementTab';
import DispensingTab from './DispensingTab';
import ProcurementTab from './ProcurementTab';
import ReportsTab from './ReportsTab';

interface PharmacySummary {
    totalDrugs: number;
    activeDrugs: number;
    drugCountInStock: number;
    outOfStockCount: number;
    totalStockUnits: number;
    totalStockValue: number;
    lowStockCount: number;
    nearExpiryCount: number;
    dispensedToday: number;
    pendingDispensing: number;
    recentMovements: any[];
}

const TABS = ['Dispensing', 'Overview', 'Drug Master', 'Batch Management', 'Procurement', 'Reports'];

export default function PharmacyPage() {
    const [activeTab, setActiveTab] = useState('Dispensing');
    const [data, setData] = useState<PharmacySummary | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshSummary = async () => {
        try {
            const [summary, pending] = await Promise.all([
                fetch('/api/pharmacy/summary', { credentials: "include" }).then(r => r.ok ? r.json() : null),
                fetch('/api/pharmacy/prescriptions', { credentials: "include" }).then(r => r.ok ? r.json() : [])
            ]);
            const base = summary || {
                totalDrugs: 0, activeDrugs: 0, drugCountInStock: 0, outOfStockCount: 0,
                totalStockUnits: 0, totalStockValue: 0,
                lowStockCount: 0, nearExpiryCount: 0,
                dispensedToday: 0, recentMovements: []
            };
            setData({ ...base, pendingDispensing: Array.isArray(pending) ? pending.length : 0 });
        } catch {
            // silently ignore refresh errors — stale data is better than a crash
        }
    };

    useEffect(() => {
        refreshSummary().finally(() => setLoading(false));
    }, []);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Pharmacy Management</h1>
                    <p className={styles.subtitle}>Inventory control · Advanced dispensing · Multi-tier pricing</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btnSecondary} onClick={() => setActiveTab('Drug Master')}>💊 Manage Drugs</button>
                    <button className={styles.btnPrimary} onClick={() => setActiveTab('Dispensing')}>+ New Dispense</button>
                </div>
            </div>

            {loading ? (
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <p>Loading pharmacy data…</p>
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className={styles.kpiGrid}>
                        <div className={`${styles.kpiCard} ${styles.kpiInventory}`}>
                            <div className={styles.kpiIcon}>📦</div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Total Drug Products</span>
                                <span className={styles.kpiValue}>{data?.totalDrugs ?? 0}</span>
                                <span className={styles.kpiSub}>
                                    {data?.activeDrugs ?? 0} active · {data?.drugCountInStock ?? 0} in stock
                                </span>
                            </div>
                        </div>
                        <div className={`${styles.kpiCard} ${styles.kpiAlerts}`}>
                            <div className={styles.kpiIcon}>💰</div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Stock Value</span>
                                <span className={styles.kpiValue} style={{ fontSize: '18px' }}>
                                    UGX {(data?.totalStockValue ?? 0).toLocaleString()}
                                </span>
                                <span className={styles.kpiSub}>
                                    {(data?.totalStockUnits ?? 0).toLocaleString()} units on hand
                                </span>
                            </div>
                        </div>
                        <div className={`${styles.kpiCard} ${styles.kpiAlerts}`}>
                            <div className={styles.kpiIcon}>⚠️</div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Stock Alerts</span>
                                <span className={styles.kpiValue}>{data?.lowStockCount ?? 0}</span>
                                <span className={styles.kpiSub}>
                                    {data?.outOfStockCount ?? 0} out of stock
                                </span>
                            </div>
                        </div>
                        <div className={`${styles.kpiCard} ${styles.kpiAlerts}`}>
                            <div className={styles.kpiIcon}>⏳</div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Near Expiry</span>
                                <span className={styles.kpiValue}>{data?.nearExpiryCount ?? 0}</span>
                                <span className={styles.kpiSub}>Expiring within 90 days</span>
                            </div>
                        </div>
                        <div className={`${styles.kpiCard} ${styles.kpiDispensed}`}>
                            <div className={styles.kpiIcon}>💊</div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Dispensed Today</span>
                                <span className={styles.kpiValue}>{data?.dispensedToday ?? 0}</span>
                                <span className={styles.kpiSub}>Completed prescriptions</span>
                            </div>
                        </div>
                        <div
                            className={`${styles.kpiCard} ${styles.kpiPending}`}
                            style={{ cursor: 'pointer', border: (data?.pendingDispensing ?? 0) > 0 ? '2px solid #f97316' : undefined }}
                            onClick={() => setActiveTab('Dispensing')}
                        >
                            <div className={styles.kpiIcon}>⏱️</div>
                            <div className={styles.kpiContent}>
                                <span className={styles.kpiLabel}>Pending Dispensing</span>
                                <span className={styles.kpiValue} style={{ color: (data?.pendingDispensing ?? 0) > 0 ? '#f97316' : undefined }}>
                                    {data?.pendingDispensing ?? 0}
                                </span>
                                <span className={styles.kpiSub}>Click to open queue →</span>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className={styles.tabs}>
                        {TABS.map(tab => (
                            <button
                                key={tab}
                                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
                                onClick={() => setActiveTab(tab)}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className={styles.tabContent}>
                        {activeTab === 'Dispensing' && <DispensingTab onDispenseSuccess={refreshSummary} />}
                        {activeTab === 'Overview' && <OverviewTab recentMovements={data?.recentMovements ?? []} setActiveTab={setActiveTab} />}
                        {activeTab === 'Drug Master' && <DrugMasterTab />}
                        {activeTab === 'Batch Management' && <BatchManagementTab />}
                        {activeTab === 'Procurement' && <ProcurementTab />}
                        {activeTab === 'Reports' && <ReportsTab />}
                    </div>
                </>
            )}
        </div>
    );
}

function OverviewTab({ recentMovements, setActiveTab }: { recentMovements: any[], setActiveTab: (tab: string) => void }) {
    return (
        <div className={styles.overviewGrid}>
            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <h3>Recent Stock Movements</h3>
                    <span className={styles.badge}>{recentMovements.length}</span>
                </div>
                {recentMovements.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>No recent stock movements.</p>
                    </div>
                ) : (
                    <div className={styles.journalList}>
                        {recentMovements.map((m: any) => (
                            <div key={m.id} className={styles.journalItem}>
                                <div className={styles.journalMeta}>
                                    <span className={styles.journalNumber}>{m.movementType}</span>
                                    <span style={{ color: m.quantity > 0 ? 'green' : 'red', fontWeight: 'bold' }}>
                                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                                    </span>
                                </div>
                                <p className={styles.journalDesc}>{m.drug?.name} / Batch: {m.drugBatch?.batchNumber}</p>
                                <div className={styles.journalAmounts}>
                                    <span className={styles.journalDate}>{new Date(m.createdAt).toLocaleString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className={styles.card}>
                <div className={styles.cardHeader}>
                    <h3>Quick Actions</h3>
                </div>
                <div className={styles.quickActions}>
                    {[
                        { icon: '💊', label: 'Dispense Drugs', desc: 'Process patient prescriptions', tab: 'Dispensing' },
                        { icon: '📦', label: 'Receive Stock', desc: 'Log new batch deliveries', tab: 'Procurement' },
                        { icon: '⚠️', label: 'Stock Adjustment', desc: 'Record damages or write-offs', tab: 'Batch Management' },
                        { icon: '📋', label: 'New Drug Entry', desc: 'Add product to Master Data', tab: 'Drug Master' },
                    ].map(action => (
                        <button key={action.label} className={styles.quickAction} onClick={() => setActiveTab(action.tab)}>
                            <span className={styles.qaIcon}>{action.icon}</span>
                            <div>
                                <strong>{action.label}</strong>
                                <p>{action.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
