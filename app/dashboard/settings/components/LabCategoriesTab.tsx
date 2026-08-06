"use client";

import React, { useState, useEffect } from "react";
import { Beaker, Plus, Edit2, Search } from "lucide-react";
import styles from "../page.module.css";

export default function LabCategoriesTab() {
    const [categories, setCategories] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [message, setMessage] = useState("");
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    
    const [formData, setFormData] = useState({
        name: "", description: ""
    });

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await fetch("/api/admin/lab-categories");
            if (res.ok) {
                const data = await res.json();
                setCategories(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Failed to fetch lab categories", err);
        }
    };

    const handleSaveCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        
        const url = editingCategoryId ? `/api/admin/lab-categories/${editingCategoryId}` : "/api/admin/lab-categories";
        const method = editingCategoryId ? "PUT" : "POST";

        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            
            if (res.ok) {
                setShowForm(false);
                setEditingCategoryId(null);
                setFormData({ name: "", description: "" });
                fetchCategories();
                setMessage(editingCategoryId ? "Category updated!" : "Category created!");
                setTimeout(() => setMessage(""), 3000);
            } else {
                setMessage(data.error || "Failed to save lab category");
            }
        } catch (err) {
            setMessage("Network error occurred.");
        }
    };

    const handleEdit = (category: any) => {
        setFormData({
            name: category.name,
            description: category.description || ""
        });
        setEditingCategoryId(category.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleToggleStatus = async (category: any) => {
        try {
            const res = await fetch(`/api/admin/lab-categories/${category.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !category.isActive })
            });
            if (res.ok) fetchCategories();
        } catch (err) {
            alert("Failed to update status");
        }
    };

    const filteredCategories = categories.filter(c => 
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            {message && (
                <div className={`${styles.status} ${message.includes("success") || message.includes("updated") || message.includes("created") ? styles.success : styles.error}`} style={{ marginBottom: "1rem" }}>
                    {message}
                </div>
            )}
            
            <div className={styles.section}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <h2 className={styles.title} style={{ margin: 0 }}>
                        <Beaker size={24} color="var(--primary-color)" /> Lab Categories
                    </h2>
                    <button className={styles.addPartnerBtn} onClick={() => {
                        if (showForm) {
                            setShowForm(false);
                            setEditingCategoryId(null);
                        } else {
                            setShowForm(true);
                            setFormData({ name: "", description: "" });
                        }
                    }}>
                        <Plus size={18} /> {showForm ? "Cancel" : "Add New Category"}
                    </button>
                </div>

                {showForm && (
                    <form onSubmit={handleSaveCategory} style={{ marginBottom: "2rem", padding: "1.5rem", background: "rgba(0,0,0,0.02)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                        <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--text-color)" }}>
                            {editingCategoryId ? `Edit Category: ${formData.name}` : "Create New Category"}
                        </h3>
                        <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem", maxWidth: "400px" }}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Category Name *</label>
                                <input className={styles.input} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Hematology" required disabled={!!editingCategoryId} />
                                {editingCategoryId && <small style={{ color: "var(--text-muted)" }}>Names cannot be changed once created.</small>}
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Description</label>
                                <input className={styles.input} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Category description..." />
                            </div>
                        </div>
                        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-start" }}>
                            <button type="submit" className={styles.saveBtn} style={{ margin: 0 }}>
                                {editingCategoryId ? "Save Changes" : "Create Category"}
                            </button>
                        </div>
                    </form>
                )}

                <div style={{ marginBottom: "1rem", position: "relative", maxWidth: "400px" }}>
                    <Search size={18} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input 
                        className={styles.input} 
                        style={{ paddingLeft: "36px" }}
                        placeholder="Search categories..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{ overflowX: "auto" }}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Category Name</th>
                                <th>Description</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCategories.length === 0 ? (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                        No lab categories found.
                                    </td>
                                </tr>
                            ) : (
                                filteredCategories.map(category => (
                                    <tr key={category.id}>
                                        <td style={{ fontWeight: 500 }}>{category.name}</td>
                                        <td>{category.description || "—"}</td>
                                        <td>
                                            <button 
                                                onClick={() => handleToggleStatus(category)}
                                                className={`${styles.badge} ${category.isActive ? styles.badgeSuccess : ""}`} 
                                                style={{ 
                                                    background: !category.isActive ? "#f3f4f6" : undefined, 
                                                    color: !category.isActive ? "#6b7280" : undefined,
                                                    border: "1px solid transparent",
                                                    cursor: "pointer"
                                                }}
                                            >
                                                {category.isActive ? "Active" : "Disabled"}
                                            </button>
                                        </td>
                                        <td>
                                            <button className={styles.actionBtn} onClick={() => handleEdit(category)} style={{ color: "var(--primary-color)" }}>
                                                <Edit2 size={16} />
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
