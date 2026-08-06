"use client";

import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Search, TestTube, Save, X, FileText, LayoutTemplate, Wand2 } from "lucide-react";
import styles from "../../patients/page.module.css"; // Reusing standard list/table styles
import TemplateEditor from "./TemplateEditor";

export default function LabCatalogAdmin() {
    const [tests, setTests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [currency, setCurrency] = useState("UGX"); // Default fallback
    const [statusMessage, setStatusMessage] = useState("");
    const [categories, setCategories] = useState<any[]>([]);
    const [templateTest, setTemplateTest] = useState<any | null>(null);
    const [seeding, setSeeding] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        categoryId: "",
        description: "",
        price: "",
        referenceRange: "",
        unit: "",
        template: ""
    });

    const fetchTests = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/lab/catalog?search=${search}`);
            if (res.ok) {
                const data = await res.json();
                setTests(data);
            }
        } catch (error) {
            console.error("Failed to fetch lab catalog");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const fetchSystemSettings = async () => {
            try {
                const res = await fetch("/api/admin/settings");
                if (res.ok) {
                    const data = await res.json();
                    if (data.currency) setCurrency(data.currency);
                }
            } catch (err) {
                console.error("Failed to load settings", err);
            }
        };

        const fetchCategories = async () => {
            try {
                const res = await fetch("/api/admin/lab-categories");
                if (res.ok) {
                    const data = await res.json();
                    setCategories(data);
                }
            } catch (err) {
                console.error("Failed to fetch lab categories", err);
            }
        };

        fetchSystemSettings();
        fetchCategories();
        const timeoutId = setTimeout(() => fetchTests(), 300);
        return () => clearTimeout(timeoutId);
    }, [search]);

    const handleOpenForm = (test?: any) => {
        if (test) {
            setEditingId(test.id);
            setFormData({
                name: test.name,
                categoryId: test.categoryId || test.category?.id || "",
                description: test.description || "",
                price: test.price.toString(),
                referenceRange: test.referenceRange || "",
                unit: test.unit || "",
                template: test.template || ""
            });
        } else {
            setEditingId(null);
            setFormData({
                name: "",
                categoryId: "",
                description: "",
                price: "",
                referenceRange: "",
                unit: "",
                template: ""
            });
        }
        setIsFormOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const endpoint = editingId ? `/api/lab/catalog/${editingId}` : '/api/lab/catalog';
        const method = editingId ? 'PUT' : 'POST';

        try {
            const res = await fetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setStatusMessage("Test configuration saved successfully!");
                setIsFormOpen(false);
                fetchTests();
                setTimeout(() => setStatusMessage(""), 3000);
            } else {
                alert("Failed to save lab test. Check your permissions (Admin/Super Admin).");
            }
        } catch (error) {
            alert("An error occurred while saving.");
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) return;

        try {
            const res = await fetch(`/api/lab/catalog/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setStatusMessage("Test deleted successfully!");
                fetchTests();
                setTimeout(() => setStatusMessage(""), 3000);
            } else {
                alert("Failed to delete test");
            }
        } catch (error) {
            alert("Error deleting test");
        }
    };

    const handleSeedDefaults = async (overwrite: boolean) => {
        const confirmMsg = overwrite
            ? "This will OVERWRITE every existing template with a fresh default. Continue?"
            : "Auto-create default templates for any test that doesn't have one. Existing templates are kept. Continue?";
        if (!confirm(confirmMsg)) return;
        setSeeding(true);
        try {
            const res = await fetch('/api/lab/templates/seed-defaults', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ onlyMissing: !overwrite, overwrite }),
            });
            if (res.ok) {
                const data = await res.json();
                setStatusMessage(`Seed complete — ${data.created} created, ${data.updated} updated, ${data.skipped} skipped, ${data.failed} failed.`);
                fetchTests();
            } else {
                const err = await res.json();
                alert(`Seed failed: ${err.error || 'Unknown error'}`);
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setSeeding(false);
            setTimeout(() => setStatusMessage(""), 5000);
        }
    };

    const testsWithTemplate = tests.filter(t => t.resultTemplate).length;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Lab Test Catalog</h1>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {tests.length} tests · {testsWithTemplate} with custom result template
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className="btn-secondary"
                        onClick={() => handleSeedDefaults(false)}
                        disabled={seeding}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        title="Auto-create default templates for tests without one"
                    >
                        <Wand2 size={16} /> {seeding ? 'Seeding...' : 'Seed Default Templates'}
                    </button>
                    <button className={styles.addBtn} onClick={() => handleOpenForm()}>
                        <Plus size={20} /> Add New Test
                    </button>
                </div>
            </div>

            {statusMessage && <div style={{ position: "fixed", top: "2rem", right: "2rem", background: "var(--success-color)", color: "white", padding: "1rem 2rem", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 2000 }}>{statusMessage}</div>}

            <div className={styles.searchBar}>
                <Search className={styles.searchIcon} size={20} />
                <input
                    type="text"
                    placeholder="Search by test name or category..."
                    className={styles.searchInput}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.th}>Test Details</th>
                            <th className={styles.th}>Reference Info</th>
                            <th className={styles.th}>Price</th>
                            <th className={styles.th}>Template</th>
                            <th className={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className={styles.td} style={{ textAlign: "center" }}>Loading...</td></tr>
                        ) : tests.length === 0 ? (
                            <tr><td colSpan={5} className={styles.td} style={{ textAlign: "center" }}>No tests found.</td></tr>
                        ) : (
                            tests.map(test => (
                                <tr key={test.id} className={styles.tr}>
                                    <td className={styles.td}>
                                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{test.name}</div>
                                        <div style={{ fontSize: "0.8rem", color: "var(--primary-color)" }}>{test.category?.name || "Uncategorized"}</div>
                                    </td>
                                    <td className={styles.td}>
                                        <div style={{ fontSize: "0.85rem" }}>Range: {test.referenceRange || "N/A"}</div>
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Unit: {test.unit || "N/A"}</div>
                                    </td>
                                    <td className={styles.td}>
                                        <span style={{ fontWeight: 600, color: "var(--success-color)" }}>
                                            {currency} {test.price.toFixed(2)}
                                        </span>
                                    </td>
                                    <td className={styles.td}>
                                        {test.resultTemplate ? (
                                            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                                <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--primary-color)", fontSize: "0.8rem", fontWeight: 500, padding: "0.2rem 0.5rem", background: "rgba(99, 102, 241, 0.1)", borderRadius: "999px" }}>
                                                    <LayoutTemplate size={12} /> {test.resultTemplate.templateName}
                                                </span>
                                            </span>
                                        ) : (
                                            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Default only</span>
                                        )}
                                    </td>
                                    <td className={styles.td}>
                                        <div style={{ display: "flex", gap: "0.4rem" }}>
                                            <button
                                                onClick={() => setTemplateTest(test)}
                                                className="btn-primary"
                                                style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", padding: "0.35rem 0.6rem" }}
                                                title="Edit result template"
                                            >
                                                <FileText size={13} /> Template
                                            </button>
                                            <button
                                                onClick={() => handleOpenForm(test)}
                                                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "0.25rem" }}
                                                title="Edit test config"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(test.id, test.name)}
                                                style={{ background: "none", border: "none", color: "var(--danger-color)", cursor: "pointer", padding: "0.25rem" }}
                                                title="Delete test"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal for Create/Edit test config */}
            {isFormOpen && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", padding: "1rem" }}>
                    <div className="glass-card animate-slide-up" style={{ width: "100%", maxWidth: "600px", padding: "0", overflow: "hidden" }}>
                        <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)" }}>
                            <h2 style={{ fontSize: "1.25rem", margin: 0 }}>{editingId ? "Edit Lab Test" : "Create New Lab Test"}</h2>
                            <button onClick={() => setIsFormOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem", maxHeight: "70vh", overflowY: "auto" }}>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                <div className="input-group">
                                    <label className="input-label">Test Name *</label>
                                    <input type="text" className="input-field" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Complete Blood Count" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Category *</label>
                                    <select className="input-field" required value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })}>
                                        <option value="">Select Category</option>
                                        {categories.filter(c => c.isActive).map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                <div className="input-group">
                                    <label className="input-label">Price ({currency}) *</label>
                                    <input type="number" step="0.01" min="0" className="input-field" required value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Unit of Measure</label>
                                    <input type="text" className="input-field" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} placeholder="e.g. mg/dL, %" />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Reference Range</label>
                                <input type="text" className="input-field" value={formData.referenceRange} onChange={e => setFormData({ ...formData, referenceRange: e.target.value })} placeholder="e.g. 4.5 - 5.5" />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                    Will be parsed for auto-flag detection (e.g. "4.5 - 5.5" → normal 4.5-5.5)
                                </span>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Plain-Text Template (legacy / fallback)</label>
                                <textarea
                                    className="input-field"
                                    style={{ minHeight: "120px", fontFamily: "monospace", fontSize: "0.875rem" }}
                                    value={formData.template}
                                    onChange={e => setFormData({ ...formData, template: e.target.value })}
                                    placeholder={`WBC: [ ] x10^9/L\nRBC: [ ] x10^12/L\nHGB: [ ] g/dL\nHCT: [ ] %`}
                                />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                    For a richer HTML result with color-coded flags, click "Template" on the test row instead.
                                </span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-color)" }}>
                                <button type="button" className="btn-secondary" onClick={() => setIsFormOpen(false)}>Cancel</button>
                                <button type="submit" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <Save size={18} /> Save Test Configuration
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Template editor modal */}
            {templateTest && (
                <TemplateEditor
                    test={templateTest}
                    onClose={() => setTemplateTest(null)}
                    onSaved={() => fetchTests()}
                />
            )}
        </div>
    );
}
