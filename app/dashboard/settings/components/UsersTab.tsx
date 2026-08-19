"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, Users as UsersIcon } from "lucide-react";
import styles from "../page.module.css";

export default function UsersTab() {
    const [users, setUsers] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [message, setMessage] = useState("");
    
    const [newUser, setNewUser] = useState({
        name: "", email: "", employeeId: "", phone: "",
        department: "", specialization: "", roleId: "", password: ""
    });

    useEffect(() => {
        fetchUsers();
        fetchRoles();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/admin/users");
            if (res.ok) {
                const data = await res.json();
                setUsers(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Failed to fetch users", err);
        }
    };

    const fetchRoles = async () => {
        try {
            const res = await fetch("/api/admin/roles");
            if (res.ok) {
                const data = await res.json();
                setRoles(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Failed to fetch roles", err);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newUser)
            });
            const data = await res.json();
            
            if (res.ok) {
                setShowForm(false);
                setNewUser({ name: "", email: "", employeeId: "", phone: "", department: "", specialization: "", roleId: "", password: "" });
                fetchUsers();
                setMessage("User created successfully!");
                setTimeout(() => setMessage(""), 3000);
            } else {
                setMessage(data.error || "Failed to create user");
            }
        } catch (err) {
            setMessage("Network error occurred.");
        }
    };

    const filteredUsers = users.filter(u => 
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.employeeId?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            {message && (
                <div className={`${styles.status} ${message.includes("success") ? styles.success : styles.error}`} style={{ marginBottom: "1rem" }}>
                    {message}
                </div>
            )}
            
            <div className={styles.section}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <h2 className={styles.title} style={{ margin: 0 }}>
                        <UsersIcon size={24} color="var(--primary-color)" /> User Profiles
                    </h2>
                    <button className={styles.addPartnerBtn} onClick={() => setShowForm(!showForm)}>
                        <Plus size={18} /> {showForm ? "Cancel" : "Add New User"}
                    </button>
                </div>

                {showForm && (
                    <form onSubmit={handleCreateUser} style={{ marginBottom: "2rem", padding: "1.5rem", background: "rgba(0,0,0,0.02)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                        <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--text-color)" }}>Create New Staff Profile</h3>
                        <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Full Name *</label>
                                <input className={styles.input} value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} required />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Email Address *</label>
                                <input type="email" className={styles.input} value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Employee ID</label>
                                <input className={styles.input} value={newUser.employeeId} onChange={e => setNewUser({ ...newUser, employeeId: e.target.value })} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Phone Number</label>
                                <input className={styles.input} value={newUser.phone} onChange={e => setNewUser({ ...newUser, phone: e.target.value })} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>System Role *</label>
                                <select className={styles.input} value={newUser.roleId} onChange={e => setNewUser({ ...newUser, roleId: e.target.value })} required>
                                    <option value="">Select a Role...</option>
                                    {roles.map(role => (
                                        <option key={role.id} value={role.id}>{role.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Temporary Password</label>
                                <input type="text" className={styles.input} placeholder="Defaults to VitalCore@123" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                            <button type="submit" className={styles.saveBtn} style={{ margin: 0 }}>Create User</button>
                        </div>
                    </form>
                )}

                <div style={{ marginBottom: "1rem", position: "relative", maxWidth: "400px" }}>
                    <Search size={18} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input 
                        className={styles.input} 
                        style={{ paddingLeft: "36px" }}
                        placeholder="Search users by name, email, or ID..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{ overflowX: "auto" }}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Name / Emp ID</th>
                                <th>Email / Phone</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                        No users found.
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(user => (
                                    <tr key={user.id}>
                                        <td>
                                            <div style={{ fontWeight: 500 }}>{user.name}</div>
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{user.employeeId || "No ID"}</div>
                                        </td>
                                        <td>
                                            <div>{user.email}</div>
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{user.phone || "No phone"}</div>
                                        </td>
                                        <td>
                                            <span className={`${styles.badge} ${user.role?.name === 'SUPER_ADMIN' ? styles.badgeWarning : styles.badgeSuccess}`}>
                                                
                                                {user.role?.name || "Unassigned"}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`${styles.badge} ${user.isActive ? styles.badgeSuccess : ""}`} style={{ background: !user.isActive ? "#f3f4f6" : undefined, color: !user.isActive ? "#6b7280" : undefined }}>
                                                {user.isActive ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td>
                                            <button className={styles.actionBtn} style={{ fontSize: "0.8rem" }}>
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
