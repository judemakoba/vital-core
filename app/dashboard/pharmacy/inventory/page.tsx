"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Package, AlertTriangle } from "lucide-react";
import styles from "./page.module.css";
import Link from "next/link";

interface DrugItem {
    id: string;
    name: string;
    genericName: string;
    dosageForm: string;
    strength: string;
    quantityInStock: number;
    reorderLevel: number;
    unitMeasure: string;
    expiryDate: string;
}

export default function PharmacyInventoryPage() {
    const [inventory, setInventory] = useState<DrugItem[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInventory = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/pharmacy/inventory?search=${search}`);
                if (res.ok) {
                    setInventory(await res.json());
                }
            } catch (err) {
                console.error("Failed to fetch inventory");
            }
            setLoading(false);
        };

        const delayDebounceFn = setTimeout(() => {
            fetchInventory();
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    const isExpired = (expiryStr: string) => {
        if (!expiryStr) return false;
        return new Date(expiryStr) < new Date();
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Drug Inventory</h1>
                <Link href="/dashboard/pharmacy/inventory/new" className={styles.addBtn}>
                    <Plus size={18} /> Add New Item
                </Link>
            </div>

            <div className={`glass-card ${styles.controls}`}>
                <div className={styles.searchBox}>
                    <Search size={18} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search drugs by name or generic name..."
                        className={styles.searchInput}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Drug Name</th>
                            <th className={styles.th}>Form & Strength</th>
                            <th className={styles.th}>In Stock</th>
                            <th className={styles.th}>Expiry</th>
                            <th className={styles.th}>Status</th>
                            <th className={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem" }}>
                                    Loading inventory...
                                </td>
                            </tr>
                        ) : inventory.length === 0 ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                    No items found in inventory.
                                </td>
                            </tr>
                        ) : (
                            inventory.map(item => (
                                <tr key={item.id}>
                                    <td className={styles.td}>
                                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{item.genericName}</div>
                                    </td>
                                    <td className={styles.td}>{item.dosageForm} - {item.strength}</td>
                                    <td className={styles.td}>
                                        <span style={{ fontWeight: 700 }}>{item.quantityInStock}</span> {item.unitMeasure}
                                    </td>
                                    <td className={styles.td}>
                                        {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : "N/A"}
                                    </td>
                                    <td className={styles.td}>
                                        {isExpired(item.expiryDate) ? (
                                            <span className={`${styles.stockBadge} ${styles.expired}`}>Expired</span>
                                        ) : item.quantityInStock <= item.reorderLevel ? (
                                            <span className={`${styles.stockBadge} ${styles.lowStock}`}>Low Stock</span>
                                        ) : (
                                            <span className={`${styles.stockBadge} ${styles.inStock}`}>In Stock</span>
                                        )}
                                    </td>
                                    <td className={styles.td}>
                                        <button className="action-btn">Edit</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
