"use client";

import React, { useState, useEffect } from "react";
import { Pill, Plus, Search, Trash2 } from "lucide-react";
import styles from "../page.module.css";

export default function DrugCategoriesTab() {
    const [categories, setCategories] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [message, setMessage] = useState("");
    
    const [newCategory, setNewCategory] = useState({
        name: "", code: "", description: ""
    });

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await fetch("/api/admin/system/inventory/categories");
            if (res.ok) {
                const data = await res.json();
                setCategories(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Failed to fetch categories", err);
        }
    };

    const handleCreateCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        try {
            const res = await fetch("/api/admin/system/inventory/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newCategory)
            });
            const data = await res.json();
            
            if (res.ok) {
                setShowForm(false);
                setNewCategory({ name: "", code: "", description: "" });
                fetchCategories();
                setMessage("Category created successfully!");
                setTimeout(() => setMessage(""), 3000);
            } else {
                setMessage(data.error || "Failed to create category");
            }
        } catch (err) {
            setMessage("Network error occurred.");
        }
    };

    const handleDeleteCategory = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to deactivate ${name}?`)) return;
        try {
            // This assumes the API supports DELETE, or we fall back to a failure message if not yet implemented
            const res = await fetch(`/api/admin/system/inventory/categories/${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchCategories();
                setMessage("Category deactivated.");
            } else {
                setMessage("Failed to deactivate category. Ensure it is empty first.");
            }
        } catch (err) {
            setMessage("Network error occurred.");
        }
    };


    const filteredCategories = categories.filter(c => 
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            {message && (
                <div className={`${styles.status} ${message.includes("success") || message.includes("deactivated") ? styles.success : styles.error}`} style={{ marginBottom: "1rem" }}>
                    {message}
                </div>
            )}
            
            <div className={styles.section}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <h2 className={styles.title} style={{ margin: 0 }}>
                        <Pill size={24} color="var(--primary-color)" /> Drug Categories
                    </h2>
                    <button className={styles.addPartnerBtn} onClick={() => setShowForm(!showForm)}>
                        <Plus size={18} /> {showForm ? "Cancel" : "Add Category"}
                    </button>
                </div>

                {showForm && (
                    <form onSubmit={handleCreateCategory} style={{ marginBottom: "2rem", padding: "1.5rem", background: "rgba(0,0,0,0.02)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                        <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--text-color)" }}>Create New Drug Category</h3>
                        <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Category Name *</label>
                                <input className={styles.input} value={newCategory.name} onChange={e => setNewCategory({ ...newCategory, name: e.target.value })} placeholder="e.g. Analgesics" required />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Category Code *</label>
                                <input className={styles.input} value={newCategory.code} onChange={e => setNewCategory({ ...newCategory, code: e.target.value })} placeholder="e.g. CAT-ANALG" required style={{ textTransform: 'uppercase' }} />
                            </div>
                            <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
                                <label className={styles.label}>Description</label>
                                <textarea className={styles.input} rows={2} value={newCategory.description} onChange={e => setNewCategory({ ...newCategory, description: e.target.value })} placeholder="Optional description..." />
                            </div>
                        </div>
                        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                            <button type="submit" className={styles.saveBtn} style={{ margin: 0 }}>Create Category</button>
                        </div>
                    </form>
                )}

                <div style={{ marginBottom: "1rem", position: "relative", maxWidth: "400px" }}>
                    <Search size={18} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input 
                        className={styles.input} 
                        style={{ paddingLeft: "36px" }}
                        placeholder="Search categories by name or code..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{ overflowX: "auto" }}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Category Code</th>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCategories.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                        No categories found.
                                    </td>
                                </tr>
                            ) : (
                                filteredCategories.map(cat => (
                                    <tr key={cat.id}>
                                        <td><span style={{ fontFamily: "monospace", fontSize: "0.9rem", background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: "4px" }}>{cat.code}</span></td>
                                        <td style={{ fontWeight: 500 }}>{cat.name}</td>
                                        <td style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: "300px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {cat.description || "—"}
                                        </td>
                                        <td>
                                            <span className={`${styles.badge} ${cat.isActive ? styles.badgeSuccess : ""}`} style={{ background: !cat.isActive ? "#f3f4f6" : undefined, color: !cat.isActive ? "#6b7280" : undefined }}>
                                                {cat.isActive ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td>
                                            <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDeleteCategory(cat.id, cat.name)}>
                                                <Trash2 size={16} />
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
