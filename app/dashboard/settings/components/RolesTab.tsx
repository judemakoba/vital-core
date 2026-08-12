"use client";

import React, { useState, useEffect } from "react";
import styles from "../page.module.css";

export default function RolesTab() {
    const [roles, setRoles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        try {
            const res = await fetch("/api/admin/roles");
            if (res.ok) {
                const data = await res.json();
                setRoles(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Failed to fetch roles", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className={styles.section}>
                <h2 className={styles.title}> Roles & Permissions</h2>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                    Manage access control levels for staff members. Currently, roles are managed by system administrators directly.
                </p>

                {loading ? (
                    <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Loading roles...</div>
                ) : (
                    <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                        {roles.map(role => (
                            <div key={role.id} style={{ padding: "1.5rem", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", background: "white" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                                    
                                    <h3 style={{ fontSize: "1.1rem", margin: 0 }}>{role.name}</h3>
                                </div>
                                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1rem", minHeight: "40px" }}>
                                    {role.description || "No description provided for this role."}
                                </p>
                                
                                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "1rem", fontSize: "0.8rem", color: "var(--text-color)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--primary-color)" }}>
                                        <Info size={14} /> System Managed
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
