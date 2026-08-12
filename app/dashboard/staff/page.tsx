"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Edit2, ShieldAlert } from "lucide-react";
import styles from "./page.module.css";
import Link from "next/link";

interface User {
    id: string;
    name: string;
    email: string;
    employeeId: string | null;
    department: string | null;
    phone: string | null;
    isActive: boolean;
    role: { name: string } | null;
}

export default function StaffPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/users?search=${search}&role=${roleFilter}`);
                if (res.ok) {
                    const data = await res.json();
                    setUsers(data);
                }
            } catch (err) {
                console.error("Failed to fetch users");
            }
            setLoading(false);
        };

        fetchUsers();
    }, [search, roleFilter]);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Staff Management</h1>
                <Link href="/dashboard/staff/new" className={styles.addBtn}>
                    <Plus size={18} /> Add Staff
                </Link>
            </div>

            <div className={`glass-card ${styles.controls}`}>
                <div className={styles.searchBox}>
                    <Search size={18} className={styles.searchIcon} />
                    <input
                        type="text"
                        placeholder="Search staff by name, email, or ID..."
                        className={styles.searchInput}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <select
                    className={styles.filterSelect}
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                >
                    <option value="">All Roles</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                    <option value="ADMIN">Admin</option>
                    <option value="DOCTOR">Doctor</option>
                    <option value="NURSE">Nurse</option>
                    <option value="RECEPTIONIST">Receptionist</option>
                    <option value="PHARMACIST">Pharmacist</option>
                    <option value="LAB_TECHNICIAN">Lab Tech</option>
                    <option value="ACCOUNTANT">Accountant</option>
                </select>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Name</th>
                            <th className={styles.th}>Employee ID</th>
                            <th className={styles.th}>Role</th>
                            <th className={styles.th}>Department</th>
                            <th className={styles.th}>Status</th>
                            <th className={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem" }}>
                                    Loading staff...
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                    No staff members found.
                                </td>
                            </tr>
                        ) : (
                            users.map(user => (
                                <tr key={user.id} className={styles.tr}>
                                    <td className={styles.td}>
                                        <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{user.name}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{user.email}</div>
                                    </td>
                                    <td className={styles.td}>{user.employeeId || "-"}</td>
                                    <td className={styles.td}>
                                        {user.role ? (
                                            <span className={styles.roleTag}>{user.role.name}</span>
                                        ) : (
                                            <span style={{ color: "var(--text-muted)" }}>None</span>
                                        )}
                                    </td>
                                    <td className={styles.td}>{user.department || "-"}</td>
                                    <td className={styles.td}>
                                        <span className={`${styles.badge} ${user.isActive ? styles.badgeActive : styles.badgeInactive}`}>
                                            {user.isActive ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        <button className={styles.actionBtn} title="Edit User">
                                            <Edit2 size={16} />
                                        </button>
                                        <button className={styles.actionBtn} title="Permissions">
                                            
                                        </button>
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
