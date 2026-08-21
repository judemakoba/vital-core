"use client";

import React, { useState, useEffect } from "react";
import { Plus, Search, Users as UsersIcon, Trash2 } from "lucide-react";
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

    // Track the user pending deletion; null when no dialog is open.
    const [pendingDelete, setPendingDelete] = useState<any | null>(null);
    const [deleting, setDeleting] = useState(false);
    // Typed-name confirmation: must match the user's name exactly.
    const [confirmText, setConfirmText] = useState("");

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

    const openDeleteDialog = (user: any) => {
        setPendingDelete(user);
        setConfirmText("");
    };

    const closeDeleteDialog = () => {
        if (deleting) return;
        setPendingDelete(null);
        setConfirmText("");
    };

    const handleConfirmDelete = async () => {
        if (!pendingDelete) return;
        // Defensive: require typed-name match on the client too,
        // even though the server has its own guards.
        if (confirmText.trim() !== (pendingDelete.name || "").trim()) {
            setMessage("Confirmation text does not match the user's name.");
            return;
        }
        setDeleting(true);
        setMessage("");
        try {
            const res = await fetch(`/api/admin/users/${pendingDelete.id}`, {
                method: "DELETE",
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setMessage(`User "${pendingDelete.name}" deleted. Records preserved with audit tombstone.`);
                closeDeleteDialog();
                fetchUsers();
                setTimeout(() => setMessage(""), 4000);
            } else {
                setMessage(data.error || "Failed to delete user");
            }
        } catch (err) {
            setMessage("Network error occurred.");
        } finally {
            setDeleting(false);
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
                                            <div style={{ display: "flex", gap: "0.25rem" }}>
                                                <button
                                                    className={styles.actionBtn}
                                                    style={{ fontSize: "0.8rem" }}
                                                    title="Edit user"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                    style={{ fontSize: "0.8rem" }}
                                                    title="Delete user (history preserved with audit tombstone)"
                                                    onClick={() => openDeleteDialog(user)}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {pendingDelete && (
                <div
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => {
                        // click on backdrop closes; click on panel does not
                        if (e.target === e.currentTarget) closeDeleteDialog();
                    }}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.4)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                    }}
                >
                    <div
                        style={{
                            background: "var(--surface-color, #fff)",
                            color: "var(--text-color, #111)",
                            borderRadius: "var(--radius-md, 8px)",
                            padding: "1.5rem",
                            maxWidth: "500px",
                            width: "90%",
                            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                        }}
                    >
                        <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.1rem" }}>
                            Delete user permanently?
                        </h3>
                        <p style={{ margin: "0 0 0.75rem 0", lineHeight: 1.5 }}>
                            <strong>{pendingDelete.name}</strong>
                            {pendingDelete.email ? ` (${pendingDelete.email})` : ""} will be
                            removed from the system. The user record is deleted; this
                            cannot be undone.
                        </p>
                        <p style={{ margin: "0 0 0.75rem 0", lineHeight: 1.5, color: "var(--text-muted)", fontSize: "0.9rem" }}>
                            <strong>What is preserved:</strong> all clinical, billing, and
                            operational records (visits, prescriptions, lab orders, payments,
                            admissions, dispensing logs, journal entries, …) stay in their
                            tables. References to this user are cleared. A full snapshot of
                            the user's identity (name, email, role, tenant) is written to
                            the audit log as a <em>tombstone</em>.
                        </p>
                        <div style={{ margin: "1rem 0" }}>
                            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.35rem", color: "var(--text-muted)" }}>
                                Type <code style={{ background: "rgba(0,0,0,0.06)", padding: "0 0.25rem", borderRadius: 3 }}>{pendingDelete.name}</code> to confirm:
                            </label>
                            <input
                                type="text"
                                className={styles.input}
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                disabled={deleting}
                                autoFocus
                                autoComplete="off"
                                spellCheck={false}
                                placeholder={pendingDelete.name}
                            />
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                            <button
                                type="button"
                                className={styles.addPartnerBtn}
                                style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-color)" }}
                                onClick={closeDeleteDialog}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={deleting || confirmText.trim() !== (pendingDelete.name || "").trim()}
                                style={{
                                    background: "var(--danger-color, #dc2626)",
                                    color: "#fff",
                                    border: "none",
                                    padding: "0.5rem 1rem",
                                    borderRadius: "var(--radius-sm, 4px)",
                                    cursor: (deleting || confirmText.trim() !== (pendingDelete.name || "").trim()) ? "not-allowed" : "pointer",
                                    opacity: (deleting || confirmText.trim() !== (pendingDelete.name || "").trim()) ? 0.5 : 1,
                                }}
                            >
                                {deleting ? "Deleting…" : "Permanently delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
