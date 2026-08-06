"use client";

import React, { useState, useEffect } from "react";
import { Beaker, Plus, Search, Trash2, Edit2 } from "lucide-react";
import styles from "../page.module.css";

export default function LabConfigTab() {
    const [tests, setTests] = useState<any[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [message, setMessage] = useState("");
    const [editingTestId, setEditingTestId] = useState<string | null>(null);
    const [categories, setCategories] = useState<any[]>([]);
    
    const [testForm, setTestForm] = useState({
        name: "", categoryId: "", price: "0", referenceRange: "", unit: "", description: ""
    });

    useEffect(() => {
        fetchTests();
        fetchCategories();
    }, []);

    const fetchTests = async () => {
        try {
            const res = await fetch("/api/admin/lab-catalog");
            if (res.ok) {
                const data = await res.json();
                setTests(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error("Failed to fetch lab tests", err);
        }
    };

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

    const handleSaveTest = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage("");
        
        const url = editingTestId ? `/api/admin/lab-catalog/${editingTestId}` : "/api/admin/lab-catalog";
        const method = editingTestId ? "PUT" : "POST";

        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...testForm,
                    price: parseFloat(testForm.price.toString()) || 0
                })
            });
            const data = await res.json();
            
            if (res.ok) {
                setShowForm(false);
                setEditingTestId(null);
                setTestForm({ name: "", categoryId: "", price: "0", referenceRange: "", unit: "", description: "" });
                fetchTests();
                setMessage(editingTestId ? "Lab test updated!" : "Lab test created!");
                setTimeout(() => setMessage(""), 3000);
            } else {
                setMessage(data.error || "Failed to save lab test");
            }
        } catch (err) {
            setMessage("Network error occurred.");
        }
    };

    const handleEdit = (test: any) => {
        setTestForm({
            name: test.name,
            categoryId: test.categoryId || test.category?.id || "",
            price: test.price.toString(),
            referenceRange: test.referenceRange || "",
            unit: test.unit || "",
            description: test.description || ""
        });
        setEditingTestId(test.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleToggleStatus = async (test: any) => {
        try {
            const res = await fetch(`/api/admin/lab-catalog/${test.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !test.isActive })
            });
            if (res.ok) fetchTests();
        } catch (err) {
            alert("Failed to update status");
        }
    };

    const filteredTests = tests.filter(t => 
        t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.category?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeCategories = categories.filter(c => c.isActive);

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
                        <Beaker size={24} color="var(--primary-color)" /> Lab Test Catalog
                    </h2>
                    <button className={styles.addPartnerBtn} onClick={() => {
                        if (showForm) {
                            setShowForm(false);
                            setEditingTestId(null);
                        } else {
                            setShowForm(true);
                            setTestForm({ name: "", categoryId: "", price: "0", referenceRange: "", unit: "", description: "" });
                        }
                    }}>
                        <Plus size={18} /> {showForm ? "Cancel" : "Add New Test"}
                    </button>
                </div>

                {showForm && (
                    <form onSubmit={handleSaveTest} style={{ marginBottom: "2rem", padding: "1.5rem", background: "rgba(0,0,0,0.02)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                        <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--text-color)" }}>
                            {editingTestId ? `Edit Lab Test: ${testForm.name}` : "Create New Lab Test"}
                        </h3>
                        <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Test Name *</label>
                                <input className={styles.input} value={testForm.name} onChange={e => setTestForm({ ...testForm, name: e.target.value })} placeholder="e.g. Complete Blood Count" required disabled={!!editingTestId} />
                                {editingTestId && <small style={{ color: "var(--text-muted)" }}>Names cannot be changed once created.</small>}
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Category *</label>
                                <select className={styles.input} value={testForm.categoryId} onChange={e => setTestForm({ ...testForm, categoryId: e.target.value })} required>
                                    <option value="" disabled>Select a category</option>
                                    {activeCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Base Price *</label>
                                <input type="number" step="0.01" className={styles.input} value={testForm.price} onChange={e => setTestForm({ ...testForm, price: e.target.value })} required />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Reference Range</label>
                                <input className={styles.input} value={testForm.referenceRange} onChange={e => setTestForm({ ...testForm, referenceRange: e.target.value })} placeholder="e.g. 4.0 - 10.0" />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Unit of Measurement</label>
                                <input className={styles.input} value={testForm.unit} onChange={e => setTestForm({ ...testForm, unit: e.target.value })} placeholder="e.g. x10^9/L" />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Description</label>
                                <input className={styles.input} value={testForm.description} onChange={e => setTestForm({ ...testForm, description: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                            <button type="submit" className={styles.saveBtn} style={{ margin: 0 }}>
                                {editingTestId ? "Save Changes" : "Create Test"}
                            </button>
                        </div>
                    </form>
                )}

                <div style={{ marginBottom: "1rem", position: "relative", maxWidth: "400px" }}>
                    <Search size={18} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input 
                        className={styles.input} 
                        style={{ paddingLeft: "36px" }}
                        placeholder="Search by test name or category..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{ overflowX: "auto" }}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Test Name</th>
                                <th>Category</th>
                                <th>Ref. Range</th>
                                <th>Price</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTests.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                                        No lab tests found.
                                    </td>
                                </tr>
                            ) : (
                                filteredTests.map(test => (
                                    <tr key={test.id}>
                                        <td style={{ fontWeight: 500 }}>{test.name}</td>
                                        <td><span style={{ fontSize: "0.85rem", background: "rgba(0,0,0,0.05)", padding: "2px 8px", borderRadius: "12px" }}>{test.category?.name || "—"}</span></td>
                                        <td>
                                            <div style={{ fontSize: "0.9rem" }}>{test.referenceRange || "—"}</div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{test.unit}</div>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{test.price.toLocaleString()}</td>
                                        <td>
                                            <button 
                                                onClick={() => handleToggleStatus(test)}
                                                className={`${styles.badge} ${test.isActive ? styles.badgeSuccess : ""}`} 
                                                style={{ 
                                                    background: !test.isActive ? "#f3f4f6" : undefined, 
                                                    color: !test.isActive ? "#6b7280" : undefined,
                                                    border: "1px solid transparent",
                                                    cursor: "pointer"
                                                }}
                                            >
                                                {test.isActive ? "Active" : "Disabled"}
                                            </button>
                                        </td>
                                        <td>
                                            <button className={styles.actionBtn} onClick={() => handleEdit(test)} style={{ color: "var(--primary-color)" }}>
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
