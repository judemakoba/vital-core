"use client";

import React, { useEffect, useState } from "react";
import { Plus, Edit, Trash2, X, Check, Star } from "lucide-react";
import styles from "../page.module.css";

type Tier = {
    id: string;
    name: string;
    fee: number;
    visitTypes: string;
    description: string | null;
    isDefault: boolean;
    isActive: boolean;
    sortOrder: number;
    tenantId: string | null;
};

const VISIT_TYPE_OPTIONS = [
    "OPD", "EMERGENCY", "SCHEDULED", "FOLLOW_UP",
    "LAB_REVIEW", "VACCINATION", "ANTENATAL", "OTHER",
];

function formatFee(value: number): string {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(value);
}

function emptyForm() {
    return {
        name: "",
        fee: 0,
        visitTypes: "OPD" as string,
        description: "",
        isDefault: false,
        isActive: true,
        sortOrder: 0,
    };
}

export default function ConsultationFeesSection() {
    const [tiers, setTiers] = useState<Tier[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Tier | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const fetchTiers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/consultation-fees");
            if (res.ok) setTiers(await res.json());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchTiers(); }, []);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm());
        setError("");
        setMessage("");
        setShowForm(true);
    };

    const openEdit = (t: Tier) => {
        setEditing(t);
        setForm({
            name: t.name,
            fee: t.fee,
            visitTypes: t.visitTypes,
            description: t.description ?? "",
            isDefault: t.isDefault,
            isActive: t.isActive,
            sortOrder: t.sortOrder,
        });
        setError("");
        setMessage("");
        setShowForm(true);
    };

    const closeForm = () => {
        if (saving) return;
        setShowForm(false);
        setEditing(null);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const url = editing
                ? `/api/admin/consultation-fees/${editing.id}`
                : "/api/admin/consultation-fees";
            const method = editing ? "PATCH" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || "Save failed");
                return;
            }
            setMessage(editing ? "Tier updated." : "Tier created.");
            setShowForm(false);
            setEditing(null);
            await fetchTiers();
            setTimeout(() => setMessage(""), 2500);
        } catch (e: any) {
            setError(e?.message || "Network error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (t: Tier) => {
        if (!confirm(`Delete the "${t.name}" tier (${formatFee(t.fee)} UGX)? This cannot be undone.`)) {
            return;
        }
        try {
            const res = await fetch(`/api/admin/consultation-fees/${t.id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "Delete failed");
                return;
            }
            setMessage("Tier deleted.");
            await fetchTiers();
            setTimeout(() => setMessage(""), 2500);
        } catch (e: any) {
            setError(e?.message || "Network error");
        }
    };

    const visitTypeChips = (csv: string) =>
        csv.split(",").map((s) => s.trim()).filter(Boolean);

    return (
        <div style={{ marginTop: "1.5rem" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.75rem",
                }}
            >
                <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
                        Consultation Fee Categories
                    </h3>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0.25rem 0 0 0" }}>
                        Multi-tier pricing. Add as many categories as your clinic offers
                        (e.g. <em>Standard OPD</em>, <em>Senior Specialist</em>, <em>Pediatric</em>).
                        The first tier marked <Star size={11} style={{ display: "inline-block" }} /> <strong>default</strong> for a
                        visit type is used when none is picked at check-in.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className={styles.addPartnerBtn}
                    style={{ margin: 0 }}
                >
                    <Plus size={16} /> Add Category
                </button>
            </div>

            {message && (
                <div
                    className={`${styles.status} ${styles.success}`}
                    style={{ marginBottom: "0.75rem" }}
                >
                    {message}
                </div>
            )}
            {error && (
                <div
                    className={`${styles.status} ${styles.error}`}
                    style={{ marginBottom: "0.75rem" }}
                >
                    {error}
                </div>
            )}

            {loading ? (
                <div style={{ padding: "1rem", color: "var(--text-muted)" }}>Loading tiers…</div>
            ) : tiers.length === 0 ? (
                <div
                    style={{
                        padding: "1.5rem",
                        textAlign: "center",
                        color: "var(--text-muted)",
                        background: "rgba(0,0,0,0.02)",
                        borderRadius: "var(--radius-md)",
                    }}
                >
                    No fee categories yet. Click <strong>Add Category</strong> to create
                    your first tier. The legacy <code>visit.consultationFee</code>{" "}
                    setting will be used as a fallback until you do.
                </div>
            ) : (
                <div style={{ overflowX: "auto" }}>
                    <table className={styles.table} style={{ fontSize: "0.9rem" }}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Visit Types</th>
                                <th style={{ textAlign: "right" }}>Fee (UGX)</th>
                                <th style={{ width: 90 }}>Status</th>
                                <th style={{ width: 120 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tiers.map((t) => (
                                <tr key={t.id} style={{ opacity: t.isActive ? 1 : 0.55 }}>
                                    <td>
                                        <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                                            {t.isDefault && (
                                                <Star
                                                    size={13}
                                                    fill="currentColor"
                                                    color="var(--warning-color, #f59e0b)"
                                                />
                                            )}
                                            {t.name}
                                        </div>
                                        {t.description && (
                                            <div
                                                style={{
                                                    fontSize: "0.8rem",
                                                    color: "var(--text-muted)",
                                                }}
                                            >
                                                {t.description}
                                            </div>
                                        )}
                                        {t.tenantId === null && (
                                            <div
                                                style={{
                                                    fontSize: "0.7rem",
                                                    color: "var(--text-muted)",
                                                    marginTop: 2,
                                                }}
                                            >
                                                (global default)
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                            {visitTypeChips(t.visitTypes).map((vt) => (
                                                <span
                                                    key={vt}
                                                    className={`${styles.badge} ${styles.badgeSuccess}`}
                                                    style={{ fontSize: "0.7rem" }}
                                                >
                                                    {vt}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                                        {formatFee(t.fee)}
                                    </td>
                                    <td>
                                        {t.isActive ? (
                                            <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                                                Active
                                            </span>
                                        ) : (
                                            <span className={styles.badge} style={{ background: "#f3f4f6", color: "#6b7280" }}>
                                                Inactive
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ display: "flex", gap: 4 }}>
                                            <button
                                                type="button"
                                                className={styles.actionBtn}
                                                onClick={() => openEdit(t)}
                                                title="Edit"
                                            >
                                                <Edit size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                onClick={() => handleDelete(t)}
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showForm && (
                <div
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeForm();
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
                    <form
                        onSubmit={handleSave}
                        style={{
                            background: "var(--surface-color, #fff)",
                            color: "var(--text-color, #111)",
                            borderRadius: "var(--radius-md, 8px)",
                            padding: "1.5rem",
                            width: "100%",
                            maxWidth: "560px",
                            maxHeight: "90vh",
                            overflowY: "auto",
                            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "1rem",
                            }}
                        >
                            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
                                {editing ? "Edit Category" : "Add Category"}
                            </h3>
                            <button
                                type="button"
                                onClick={closeForm}
                                disabled={saving}
                                className={styles.actionBtn}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className={styles.formGroup} style={{ marginBottom: "0.75rem" }}>
                            <label className={styles.label}>Name *</label>
                            <input
                                className={styles.input}
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="e.g. Senior Specialist"
                                required
                                disabled={saving}
                                autoFocus
                            />
                        </div>

                        <div className={styles.formGroup} style={{ marginBottom: "0.75rem" }}>
                            <label className={styles.label}>Fee (UGX) *</label>
                            <input
                                type="number"
                                className={styles.input}
                                value={Number.isFinite(form.fee) ? form.fee : ""}
                                onChange={(e) =>
                                    setForm({ ...form, fee: Number(e.target.value) || 0 })
                                }
                                min={0}
                                step={500}
                                required
                                disabled={saving}
                            />
                            <p
                                style={{
                                    fontSize: "0.75rem",
                                    color: "var(--text-muted)",
                                    marginTop: 4,
                                }}
                            >
                                Set to 0 for free tiers (e.g. follow-up visits).
                            </p>
                        </div>

                        <div className={styles.formGroup} style={{ marginBottom: "0.75rem" }}>
                            <label className={styles.label}>Applies to Visit Types *</label>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(2, 1fr)",
                                    gap: 6,
                                    marginTop: 4,
                                }}
                            >
                                {VISIT_TYPE_OPTIONS.map((vt) => {
                                    const selected = form.visitTypes
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean)
                                        .includes(vt);
                                    return (
                                        <label
                                            key={vt}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                                padding: "0.35rem 0.5rem",
                                                border: "1px solid var(--border-color)",
                                                borderRadius: "var(--radius-sm)",
                                                cursor: "pointer",
                                                background: selected ? "rgba(99,102,241,0.08)" : "transparent",
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                disabled={saving}
                                                onChange={(e) => {
                                                    const current = form.visitTypes
                                                        .split(",")
                                                        .map((s) => s.trim())
                                                        .filter(Boolean);
                                                    const next = e.target.checked
                                                        ? Array.from(new Set([...current, vt]))
                                                        : current.filter((x) => x !== vt);
                                                    setForm({ ...form, visitTypes: next.join(",") });
                                                }}
                                            />
                                            <span style={{ fontSize: "0.85rem" }}>{vt}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={styles.formGroup} style={{ marginBottom: "0.75rem" }}>
                            <label className={styles.label}>Description</label>
                            <input
                                className={styles.input}
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="Optional — shown to admins and on hover"
                                disabled={saving}
                            />
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: "1rem",
                                marginBottom: "0.75rem",
                                flexWrap: "wrap",
                            }}
                        >
                            <label
                                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
                            >
                                <input
                                    type="checkbox"
                                    checked={form.isDefault}
                                    disabled={saving}
                                    onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                                />
                                <Star size={12} fill="currentColor" color="var(--warning-color, #f59e0b)" />
                                Default for these visit types
                            </label>
                            <label
                                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
                            >
                                <input
                                    type="checkbox"
                                    checked={form.isActive}
                                    disabled={saving}
                                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                                />
                                <Check size={12} />
                                Active
                            </label>
                        </div>

                        {error && (
                            <div className={`${styles.status} ${styles.error}`} style={{ marginBottom: "0.75rem" }}>
                                {error}
                            </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "0.5rem" }}>
                            <button
                                type="button"
                                onClick={closeForm}
                                disabled={saving}
                                className={styles.addPartnerBtn}
                                style={{
                                    background: "transparent",
                                    color: "var(--text-muted)",
                                    border: "1px solid var(--border-color)",
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className={styles.saveBtn}
                                style={{ margin: 0 }}
                                disabled={saving}
                            >
                                {saving ? "Saving…" : editing ? "Save changes" : "Create category"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
