"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
    Settings as SettingsIcon, Save, Database, Download, Stethoscope, Info,
    Building2, Globe, Coins, Hash, Calendar, Pill, FlaskConical, ScanLine,
    CreditCard, Calculator, ShieldCheck, Gauge, Wrench, Sparkles,
    Plus, Edit, Trash2, X, Upload, Image as ImageIcon, AlertTriangle,
} from "lucide-react";
import styles from "../page.module.css";

type SettingDef = {
    key: string;
    label: string;
    description?: string;
    category: string;
    valueType: "STRING" | "NUMBER" | "BOOLEAN" | "JSON" | "ENUM";
    defaultValue: string;
    enumOptions?: string[];
    min?: number;
    max?: number;
    group?: string;
    sensitive?: boolean;
};

type SettingsPayload = {
    tenant: Record<string, any>;
    settings: Record<string, any>;
    byCategory: Record<string, Record<string, any>>;
    registry: SettingDef[];
};

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<any>; description: string }> = {
    CLINIC: { label: "Clinic Identity", icon: Building2, description: "Name, address, license, branding" },
    LOCALE: { label: "Locale & Time", icon: Globe, description: "Timezone, date format, language" },
    MONEY: { label: "Currency", icon: Coins, description: "Currency symbol, decimals, format" },
    NUMBERING: { label: "Numbering", icon: Hash, description: "Patient, visit, invoice prefixes" },
    VISIT: { label: "Visits & Consultation", icon: Stethoscope, description: "Fees, follow-up window" },
    APPOINTMENT: { label: "Appointments", icon: Calendar, description: "Duration, working hours" },
    PHARMACY: { label: "Pharmacy & Stock", icon: Pill, description: "Thresholds, expiry, markup" },
    LAB: { label: "Laboratory", icon: FlaskConical, description: "Templates, TAT, critical alerts" },
    RADIOLOGY: { label: "Radiology", icon: ScanLine, description: "Templates, image retention" },
    BILLING: { label: "Billing & Insurance", icon: CreditCard, description: "Aging buckets, COGS" },
    FINANCE: { label: "Finance", icon: Calculator, description: "Fiscal year, tax defaults" },
    SECURITY: { label: "Security", icon: ShieldCheck, description: "Passwords, sessions, lockout" },
    LIMITS: { label: "System Limits", icon: Gauge, description: "Page size, cache TTL" },
    INTEGRATION: { label: "Integrations", icon: Wrench, description: "Nextcloud" },
    ADVANCED: { label: "Advanced", icon: Sparkles, description: "Escape hatch" },
};

// Fields that live on the Tenant row (not TenantSetting)
const TENANT_FIELDS = new Set([
    "name", "shortName", "address", "city", "region", "country", "phone", "email", "website",
    "taxId", "registrationNumber", "licenseExpiry",
    "logoUrl", "faviconUrl", "primaryColor", "accentColor", "reportFont",
    "timezone", "dateFormat", "timeFormat", "locale", "firstDayOfWeek",
    "currency", "currencyPosition", "decimalPlaces",
    "fiscalYearStartMonth", "cogsAccountCode", "defaultTaxRate",
    "patientNumberPrefix", "patientNumberFormat", "patientNumberPadding",
    "visitNumberPrefix", "visitNumberFormat",
    "invoicePrefix", "invoiceFormat", "taxInvoicePrefix",
    "receiptPrefix", "receiptFormat",
    "creditNotePrefix", "creditNoteFormat",
    "poPrefix", "poFormat",
    "journalPrefix", "journalFormat",
    "claimPrefix", "claimFormat",
    "agingBuckets",
    "consultationFee", "followUpWindowDays", "emergencyFee", "scheduledFee",
    "defaultAppointmentDuration", "appointmentBufferMinutes",
    "workingHoursStart", "workingHoursEnd",
    "defaultReorderLevel", "defaultMaxStock", "expiryWarningDays", "expiryCriticalDays",
    "drugMarkupPercent",
    "autoWriteoffThreshold", "auditRetentionDays",
    "backdateLimitDays", "defaultPageSize",
]);

export default function ClinicConfigTab() {
    const [data, setData] = useState<SettingsPayload | null>(null);
    const [tenant, setTenant] = useState<Record<string, any>>({});
    const [settings, setSettings] = useState<Record<string, any>>({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>("CLINIC");
    const [branches, setBranches] = useState<any[]>([]);
    const [showBranchModal, setShowBranchModal] = useState(false);
    const [editingBranch, setEditingBranch] = useState<any>(null);

    useEffect(() => {
        fetch("/api/admin/settings?all=true")
            .then(res => res.json())
            .then((d: SettingsPayload) => {
                setData(d);
                setTenant(d.tenant || {});
                setSettings(d.settings || {});
            });
        fetch("/api/admin/tenant/branches")
            .then(res => res.json())
            .then(setBranches)
            .catch(() => {});
    }, []);

    const groupsForCategory = useMemo(() => {
        if (!data) return [];
        const defs = data.registry.filter(d => d.category === activeCategory);
        const groups = new Map<string, SettingDef[]>();
        for (const def of defs) {
            const g = def.group || "General";
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g)!.push(def);
        }
        return Array.from(groups.entries());
    }, [data, activeCategory]);

    const handleTenantChange = (key: string, value: any) => {
        setTenant(prev => ({ ...prev, [key]: value }));
    };

    const handleSettingChange = (key: string, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // PATCH tenant row
            const tenantRes = await fetch("/api/admin/tenant", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(tenant),
            });
            if (!tenantRes.ok) {
                const err = await tenantRes.json().catch(() => ({}));
                throw new Error(err.error || "Failed to save clinic info");
            }

            // POST settings
            const settingsRes = await fetch("/api/admin/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings }),
            });
            if (!settingsRes.ok) {
                const err = await settingsRes.json().catch(() => ({}));
                throw new Error(err.error || "Failed to save settings");
            }

            setMessage("Settings saved successfully!");
            setTimeout(() => setMessage(""), 3000);
        } catch (e: any) {
            alert(e.message || "Save failed");
        }
        setSaving(false);
    };

    const handleBackup = async () => {
        try {
            const res = await fetch("/api/admin/backup");
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `vitalcore_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
        } catch (err) {
            alert("Backup failed. Ensure you have Admin privileges.");
        }
    };

    if (!data) {
        return <div className="text-muted">Loading settings...</div>;
    }

    return (
        <div>
            {/* Category nav */}
            <div className={styles.section} style={{ marginBottom: "1rem" }}>
                <h2 className={styles.title}>
                    <SettingsIcon size={24} color="var(--primary-color)" /> System Configuration
                </h2>
                <p className="subtitle" style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                    All settings auto-generated from the registry. Add new settings in
                    <code> lib/settings/registry.ts</code> and they show up here.
                </p>

                {/* Category tabs (scrollable horizontal) */}
                <div style={{
                    display: "flex", gap: "0.5rem", overflowX: "auto",
                    paddingBottom: "0.5rem", borderBottom: "1px solid var(--border-color)",
                    marginBottom: "1.5rem",
                }}>
                    {Object.entries(CATEGORY_META).map(([key, meta]) => {
                        const Icon = meta.icon;
                        const active = activeCategory === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setActiveCategory(key)}
                                style={{
                                    display: "flex", alignItems: "center", gap: "0.5rem",
                                    padding: "0.5rem 1rem", borderRadius: "var(--radius-md)",
                                    background: active ? "var(--primary-light)" : "transparent",
                                    color: active ? "var(--primary-color)" : "var(--text-secondary)",
                                    border: "1px solid " + (active ? "var(--primary-color)" : "var(--border-color)"),
                                    cursor: "pointer", fontWeight: active ? 600 : 400,
                                    whiteSpace: "nowrap", fontSize: "0.875rem",
                                }}
                            >
                                <Icon size={16} /> {meta.label}
                            </button>
                        );
                    })}
                </div>

                {/* Active category content */}
                {activeCategory === "CLINIC" && (
                    <ClinicIdentitySection
                        tenant={tenant}
                        onChange={handleTenantChange}
                    />
                )}

                {activeCategory !== "CLINIC" && (
                    <CategorySection
                        category={activeCategory}
                        groups={groupsForCategory}
                        values={settings}
                        onChange={handleSettingChange}
                    />
                )}

                {/* Save button (always visible) */}
                <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                    <button onClick={handleSave} className={styles.saveBtn} disabled={saving}>
                        {saving ? "Saving..." : <><Save size={18} /> Save All Settings</>}
                    </button>
                    {message && <div className={`${styles.status} ${styles.success}`}>{message}</div>}
                </div>
            </div>

            {/* Branches section */}
            <BranchesSection
                branches={branches}
                onChange={setBranches}
                showModal={showBranchModal}
                setShowModal={setShowBranchModal}
                editing={editingBranch}
                setEditing={setEditingBranch}
            />

            {/* Maintenance & backup */}
            <div className={styles.section}>
                <h2 className={styles.title}><Database size={24} color="var(--info-color)" /> Maintenance & Backups</h2>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
                    Export a full JSON snapshot of your clinical and financial data for archival purposes.
                    Backups include Patients, Users, Visits, and Invoices.
                </p>
                <button onClick={handleBackup} className={styles.backupBtn} type="button">
                    <Download size={20} /> Generate Data Backup (.JSON)
                </button>
            </div>
        </div>
    );
}

// ───── Sub-components ────────────────────────────────────────────────────

function ClinicIdentitySection({ tenant, onChange }: { tenant: any; onChange: (k: string, v: any) => void }) {
    return (
        <div style={{ display: "grid", gap: "1rem" }}>
            <Group title="Identity" description="What shows on every invoice, report, and email">
                <Field label="Clinic Name" required>
                    <input className={styles.input} value={tenant.name || ""} onChange={e => onChange("name", e.target.value)} />
                </Field>
                <Field label="Short Name / Code">
                    <input className={styles.input} placeholder="GMC" value={tenant.shortName || ""} onChange={e => onChange("shortName", e.target.value)} />
                </Field>
                <Field label="Formal Address">
                    <textarea className={styles.input} rows={2} value={tenant.address || ""} onChange={e => onChange("address", e.target.value)} />
                </Field>
                <Row>
                    <Field label="City"><input className={styles.input} value={tenant.city || ""} onChange={e => onChange("city", e.target.value)} /></Field>
                    <Field label="Country">
                        <select className={styles.select} value={tenant.country || "UG"} onChange={e => onChange("country", e.target.value)}>
                            {["UG","KE","TZ","RW","ET","ZA","NG","GH","US","GB","IN","PH"].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </Field>
                </Row>
                <Row>
                    <Field label="Phone"><input className={styles.input} value={tenant.phone || ""} onChange={e => onChange("phone", e.target.value)} /></Field>
                    <Field label="Email"><input className={styles.input} type="email" value={tenant.email || ""} onChange={e => onChange("email", e.target.value)} /></Field>
                </Row>
            </Group>

            <Group title="Regulatory" description="Required on every tax invoice / official report">
                <Field label="Tax Registration (TIN / KRA PIN)">
                    <input className={styles.input} placeholder="100000000" value={tenant.taxId || ""} onChange={e => onChange("taxId", e.target.value)} />
                </Field>
                <Field label="Hospital License #">
                    <input className={styles.input} placeholder="e.g. GMC-HOSP-2024-001" value={tenant.registrationNumber || ""} onChange={e => onChange("registrationNumber", e.target.value)} />
                </Field>
                <Field label="License Expiry">
                    <input className={styles.input} type="date" value={tenant.licenseExpiry ? new Date(tenant.licenseExpiry).toISOString().slice(0, 10) : ""} onChange={e => onChange("licenseExpiry", e.target.value || null)} />
                </Field>
                <Field label="Regulatory Disclosure" hint="Mandatory footer text on invoices">
                    <textarea className={styles.input} rows={2} placeholder="This is a URA-compliant tax invoice..." value={tenant.regulatoryText || ""} onChange={e => onChange("regulatoryText", e.target.value)} />
                </Field>
            </Group>

            <Group title="Branding" description="Logo, colors, fonts">
                <BrandingFileField
                    label="Logo"
                    field="logoUrl"
                    value={tenant.logoUrl}
                    onChange={(v) => onChange("logoUrl", v)}
                />
                <BrandingFileField
                    label="Favicon"
                    field="faviconUrl"
                    value={tenant.faviconUrl}
                    onChange={(v) => onChange("faviconUrl", v)}
                    previewSize={48}
                />
                <Row>
                    <Field label="Primary Color">
                        <input className={styles.input} type="color" value={tenant.primaryColor || "#6366f1"} onChange={e => onChange("primaryColor", e.target.value)} />
                    </Field>
                    <Field label="Accent Color">
                        <input className={styles.input} type="color" value={tenant.accentColor || "#10b981"} onChange={e => onChange("accentColor", e.target.value)} />
                    </Field>
                </Row>
                <Field label="Report Font" hint="Used in lab/radiology PDF reports">
                    <select className={styles.select} value={tenant.reportFont || "Times New Roman"} onChange={e => onChange("reportFont", e.target.value)}>
                        {["Times New Roman", "Georgia", "Arial", "Helvetica", "Calibri"].map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </Field>
            </Group>
        </div>
    );
}

function CategorySection({ category, groups, values, onChange }: {
    category: string;
    groups: [string, SettingDef[]][];
    values: Record<string, any>;
    onChange: (k: string, v: any) => void;
}) {
    if (groups.length === 0) {
        return <div className="text-muted">No settings in this category yet.</div>;
    }
    return (
        <div style={{ display: "grid", gap: "1rem" }}>
            {groups.map(([groupName, defs]) => (
                <Group key={groupName} title={groupName} description={CATEGORY_META[category]?.description}>
                    {defs.map(def => (
                        <SettingField key={def.key} def={def} value={values[def.key]} onChange={v => onChange(def.key, v)} />
                    ))}
                </Group>
            ))}
        </div>
    );
}

function SettingField({ def, value, onChange }: { def: SettingDef; value: any; onChange: (v: any) => void }) {
    const stringVal = value == null ? "" : String(value);
    const str = stringVal === "" ? (def.defaultValue || "") : stringVal;

    return (
        <Field label={def.label} hint={def.description}>
            {def.valueType === "BOOLEAN" ? (
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        checked={str === "true" || str === "1"}
                        onChange={e => onChange(e.target.checked ? "true" : "false")}
                    />
                    <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                        {str === "true" || str === "1" ? "Enabled" : "Disabled"}
                    </span>
                </label>
            ) : def.valueType === "ENUM" ? (
                <select className={styles.select} value={str} onChange={e => onChange(e.target.value)}>
                    {def.enumOptions?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : def.valueType === "NUMBER" ? (
                <input
                    className={styles.input}
                    type="number"
                    min={def.min}
                    max={def.max}
                    step={def.min === 0 ? "1" : "any"}
                    value={str}
                    onChange={e => onChange(e.target.value)}
                />
            ) : def.sensitive ? (
                <input
                    className={styles.input}
                    type="password"
                    value={str}
                    onChange={e => onChange(e.target.value)}
                    placeholder="********"
                />
            ) : (
                <input
                    className={styles.input}
                    value={str}
                    onChange={e => onChange(e.target.value)}
                />
            )}
        </Field>
    );
}

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <div style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "1rem", background: "var(--bg-card)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>{title}</h3>
            {description && <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>{description}</p>}
            <div style={{ display: "grid", gap: "0.75rem" }}>
                {children}
            </div>
        </div>
    );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div className={styles.formGroup}>
            <label className={styles.label}>
                {label}{required && " *"}
                {hint && <span title={hint} style={{ marginLeft: 6, color: "var(--text-muted)" }}><Info size={12} /></span>}
            </label>
            {children}
        </div>
    );
}

function Row({ children }: { children: React.ReactNode }) {
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>{children}</div>;
}

function BrandingFileField({ label, field, value, onChange, previewSize = 96 }: {
    label: string;
    field: "logoUrl" | "faviconUrl";
    value: string | null | undefined;
    onChange: (v: string) => void;
    previewSize?: number;
}) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string>("");
    const [dragOver, setDragOver] = useState(false);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const ALLOWED_TYPES = new Set([
        "image/png", "image/jpeg", "image/jpg", "image/svg+xml",
        "image/webp", "image/x-icon", "image/vnd.microsoft.icon",
    ]);
    const MAX_BYTES = 5 * 1024 * 1024;

    const isLocalFilePath =
        !!value &&
        (value.startsWith("file://") ||
         /^[a-zA-Z]:[\\/]/.test(value) ||
         value.startsWith("/Users/") ||
         value.startsWith("/home/"));

    const isRenderable =
        !!value &&
        (value.startsWith("/") ||
         value.startsWith("http://") ||
         value.startsWith("https://") ||
         value.startsWith("data:"));

    const upload = async (file: File) => {
        setError("");
        if (!file) return;
        if (file.size > MAX_BYTES) {
            setError(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
            return;
        }
        if (file.type && !ALLOWED_TYPES.has(file.type)) {
            setError(`Unsupported file type: ${file.type || "unknown"}. Use PNG, JPG, SVG, WebP or ICO.`);
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("field", field);
            const res = await fetch("/api/admin/branding/upload", { method: "POST", body: fd });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Upload failed (${res.status})`);
            }
            const data = await res.json();
            onChange(data.url);
        } catch (e: any) {
            setError(e.message || "Upload failed");
        }
        setUploading(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) upload(file);
        e.target.value = ""; // allow re-uploading the same file
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) upload(file);
    };

    const handleClear = () => {
        onChange("");
        setError("");
    };

    return (
        <div className={styles.formGroup}>
            <label className={styles.label}>{label}</label>

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                {/* Preview box */}
                <div
                    style={{
                        width: previewSize,
                        height: previewSize,
                        border: "1px dashed var(--border-color)",
                        borderRadius: "var(--radius-md)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--bg-secondary, #f8fafc)",
                        flexShrink: 0,
                        overflow: "hidden",
                        position: "relative",
                    }}
                >
                    {isRenderable ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={value!}
                            alt={label}
                            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                        />
                    ) : value ? (
                        <div
                            title="Browser cannot load a local file path. Upload the file or paste a public URL."
                            style={{
                                fontSize: "0.7rem",
                                color: "var(--text-muted)",
                                textAlign: "center",
                                padding: "0.25rem",
                                lineHeight: 1.2,
                            }}
                        >
                            <AlertTriangle size={16} style={{ color: "var(--warning-color, #f59e0b)" }} />
                            <div>Local path</div>
                        </div>
                    ) : (
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                            <ImageIcon size={20} style={{ opacity: 0.5 }} />
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div style={{ flex: 1, display: "grid", gap: "0.5rem", minWidth: 0 }}>
                    {/* Drop zone / upload button */}
                    <div
                        onClick={() => !uploading && fileInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={(e) => {
                            e.preventDefault();
                            if (!uploading) setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        style={{
                            border: `2px dashed ${dragOver ? "var(--primary-color)" : "var(--border-color)"}`,
                            borderRadius: "var(--radius-md)",
                            padding: "0.75rem",
                            textAlign: "center",
                            cursor: uploading ? "wait" : "pointer",
                            background: dragOver ? "rgba(99,102,241,0.08)" : "var(--bg-secondary, #f8fafc)",
                            color: "var(--text-secondary)",
                            fontSize: "0.875rem",
                            transition: "all 0.15s",
                        }}
                    >
                        {uploading ? (
                            <span>Uploading…</span>
                        ) : (
                            <>
                                <Upload size={18} style={{ display: "block", margin: "0 auto 0.25rem" }} />
                                <div style={{ fontWeight: 500 }}>Click or drop a file here</div>
                                <div style={{ fontSize: "0.7rem", marginTop: "0.2rem", color: "var(--text-muted)" }}>
                                    PNG, JPG, SVG, WebP, ICO · max 5 MB
                                </div>
                            </>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon"
                            onChange={handleFileChange}
                            disabled={uploading}
                            style={{ display: "none" }}
                        />
                    </div>

                    {/* URL fallback (collapsed by default) */}
                    {showUrlInput ? (
                        <input
                            className={styles.input}
                            placeholder="https://cdn.example.com/logo.png"
                            value={value || ""}
                            onChange={e => onChange(e.target.value)}
                            autoFocus
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowUrlInput(true)}
                            style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--text-muted)",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                padding: "0.25rem 0",
                                textAlign: "left",
                                textDecoration: "underline",
                            }}
                        >
                            …or paste a URL
                        </button>
                    )}

                    {/* Status row */}
                    {isLocalFilePath && (
                        <div style={{ fontSize: "0.75rem", color: "var(--warning-color, #f59e0b)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <AlertTriangle size={12} />
                            Local file path won't load in a browser. Upload the file above.
                        </div>
                    )}

                    {value && (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <code style={{
                                fontSize: "0.7rem",
                                color: "var(--text-muted)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flex: 1,
                                minWidth: 0,
                            }}>
                                {value}
                            </code>
                            <button
                                type="button"
                                onClick={handleClear}
                                style={{
                                    background: "transparent",
                                    border: "1px solid var(--border-color)",
                                    color: "var(--text-secondary)",
                                    borderRadius: "var(--radius-sm)",
                                    padding: "0.15rem 0.5rem",
                                    fontSize: "0.75rem",
                                    cursor: "pointer",
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    )}

                    {error && (
                        <div style={{ fontSize: "0.75rem", color: "var(--danger-color, #ef4444)" }}>
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function BranchesSection({ branches, onChange, showModal, setShowModal, editing, setEditing }: {
    branches: any[];
    onChange: (b: any[]) => void;
    showModal: boolean;
    setShowModal: (v: boolean) => void;
    editing: any;
    setEditing: (v: any) => void;
}) {
    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const data: any = Object.fromEntries(fd.entries());
        if (editing) data.isMain = editing.isMain;
        try {
            const res = editing
                ? await fetch(`/api/admin/tenant/branches/${editing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                })
                : await fetch("/api/admin/tenant/branches", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data),
                });
            if (res.ok) {
                const list = await fetch("/api/admin/tenant/branches").then(r => r.json());
                onChange(list);
                setShowModal(false);
                setEditing(null);
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || "Failed");
            }
        } catch {
            alert("Network error");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this branch?")) return;
        const res = await fetch(`/api/admin/tenant/branches/${id}`, { method: "DELETE" });
        if (res.ok) {
            const list = await fetch("/api/admin/tenant/branches").then(r => r.json());
            onChange(list);
        } else {
            const err = await res.json().catch(() => ({}));
            alert(err.error || "Delete failed");
        }
    };

    return (
        <div className={styles.section}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                    <h2 className={styles.title}><Building2 size={24} color="var(--primary-color)" /> Branches / Locations</h2>
                    <p className="subtitle" style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                        For multi-location hospitals (main campus + satellite clinics).
                    </p>
                </div>
                <button className={styles.saveBtn} onClick={() => { setEditing(null); setShowModal(true); }}>
                    <Plus size={16} /> Add Branch
                </button>
            </div>
            <div className="table-container">
                <table className="data-table">
                    <thead>
                        <tr><th>Code</th><th>Name</th><th>Address</th><th>Phone</th><th>Status</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        {branches.map(b => (
                            <tr key={b.id}>
                                <td className="font-mono">{b.code}{b.isMain && " (Main)"}</td>
                                <td><strong>{b.name}</strong></td>
                                <td>{b.address || "—"}</td>
                                <td>{b.phone || "—"}</td>
                                <td>{b.isActive ? "✅ Active" : "⛔ Inactive"}</td>
                                <td>
                                    <div style={{ display: "flex", gap: "0.5rem" }}>
                                        <button onClick={() => { setEditing(b); setShowModal(true); }}><Edit size={16} /></button>
                                        {!b.isMain && <button onClick={() => handleDelete(b.id)}><Trash2 size={16} /></button>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="modal-backdrop" style={{
                    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem",
                }}>
                    <div className="glass-panel" style={{ width: "100%", maxWidth: 500, padding: "1.5rem", background: "var(--bg-card)", borderRadius: "var(--radius-lg)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                            <h3 style={{ fontWeight: 600 }}>{editing ? "Edit Branch" : "Add Branch"}</h3>
                            <button onClick={() => { setShowModal(false); setEditing(null); }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSave} style={{ display: "grid", gap: "0.75rem" }}>
                            <Field label="Code" required hint="Short code, e.g. MAIN, ANNEX">
                                <input className={styles.input} name="code" defaultValue={editing?.code} required disabled={editing?.isMain} />
                            </Field>
                            <Field label="Name" required>
                                <input className={styles.input} name="name" defaultValue={editing?.name} required />
                            </Field>
                            <Field label="Address">
                                <input className={styles.input} name="address" defaultValue={editing?.address || ""} />
                            </Field>
                            <Field label="Phone">
                                <input className={styles.input} name="phone" defaultValue={editing?.phone || ""} />
                            </Field>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                                <button type="button" className="btn-secondary" onClick={() => { setShowModal(false); setEditing(null); }}>Cancel</button>
                                <button type="submit" className={styles.saveBtn}><Save size={16} /> Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
