"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Save,
    AlertCircle,
    CheckCircle,
    Scan,
    FileText,
    Printer,
    Edit3,
    Eye,
    RefreshCw,
    Image as ImageIcon,
    Upload,
    ExternalLink,
    Trash2,
} from "lucide-react";
import Link from "next/link";

export default function RadiologyOrderDetails({ params }: { params: { id: string } }) {
    const router = useRouter();
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [view, setView] = useState<'edit' | 'render'>('edit');
    const [renderedHtml, setRenderedHtml] = useState<string>('');
    const [rendering, setRendering] = useState(false);
    const [templateId, setTemplateId] = useState<string | null>(null);
    const renderTimerRef = useRef<any>(null);

    // Image upload state
    const [ncConfigured, setNcConfigured] = useState<boolean | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string>('');
    const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [formData, setFormData] = useState({
        status: "Ordered",
        technique: "",
        findings: "",
        impression: "",
        recommendations: "",
        radiologistNotes: "",
        modality: "",
        contrastUsed: false,
    });

    useEffect(() => {
        // Check Nextcloud availability
        fetch('/api/radiology/config', { credentials: 'include' })
            .then(r => r.ok ? r.json() : { configured: false })
            .then(d => setNcConfigured(!!d.configured))
            .catch(() => setNcConfigured(false));

        const fetchOrder = async () => {
            try {
                const res = await fetch(`/api/radiology/orders/${params.id}`, { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    setOrder(data);
                    setTemplateId(data.templateId || null);

                    let initialStatus = data.status;
                    if (data.status === "Ordered") {
                        initialStatus = "InProgress";
                        fetch(`/api/radiology/orders/${params.id}`, {
                            method: "PUT",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "InProgress" })
                        }).catch(err => console.error("Failed to auto-advance status", err));
                    }

                    if (data.status === 'Completed') {
                        setView('render');
                    }

                    setFormData({
                        status: initialStatus,
                        technique: data.technique || "",
                        findings: data.findings || data.result || "",
                        impression: data.impression || "",
                        recommendations: data.recommendations || "",
                        radiologistNotes: data.radiologistNotes || "",
                        modality: data.modality || data.category || "",
                        contrastUsed: data.contrastUsed ?? false,
                    });
                }
            } catch (err) {
                console.error("Failed to fetch radiology order", err);
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
    }, [params.id]);

    const getPriorityColor = (priority: string) => {
        if (priority === "Emergency" || priority === "STAT") return "var(--danger-color)";
        if (priority === "Urgent") return "var(--warning-color)";
        return "var(--primary-color)";
    };

    const doRender = useCallback(async (data: typeof formData) => {
        if (!order) return;
        setRendering(true);
        try {
            // Look up the catalog id for this exam
            const catRes = await fetch(`/api/radiology/catalog?search=${encodeURIComponent(order.examName)}`, { credentials: 'include' });
            if (!catRes.ok) return;
            const cat = (await catRes.json()).find((c: any) => c.name === order.examName);
            if (!cat) return;

            const res = await fetch('/api/radiology/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    radiologyCatalogId: cat.id,
                    orderId: order.id,
                    technique: data.technique,
                    findings: data.findings,
                    impression: data.impression,
                    recommendations: data.recommendations,
                    clinicalNotes: order.clinicalNotes,
                    modality: data.modality || order.category,
                }),
            });
            if (res.ok) {
                const r = await res.json();
                setRenderedHtml(r.html);
            }
        } catch (e) {
            console.error('Render failed', e);
        } finally {
            setRendering(false);
        }
    }, [order]);

    useEffect(() => {
        if (!order) return;
        if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
        renderTimerRef.current = setTimeout(() => {
            doRender(formData);
        }, 500);
        return () => clearTimeout(renderTimerRef.current);
    }, [formData, order?.id, doRender]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const submissionData: any = {
                ...formData,
                status: "Completed",
                // Mirror findings into legacy result for back-compat
                result: formData.findings,
            };
            const res = await fetch(`/api/radiology/orders/${params.id}`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(submissionData)
            });

            if (res.ok) {
                await doRender(formData);
                setView('render');
                setTimeout(() => {
                    router.push("/dashboard/radiology");
                    router.refresh();
                }, 1800);
            } else {
                const err = await res.json();
                alert(`Failed to publish report: ${err.error || "Unknown error"}`);
            }
        } catch (err) {
            alert("Error saving radiology findings");
        } finally {
            setSubmitting(false);
        }
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank', 'width=900,height=1100');
        if (!printWindow) {
            alert('Pop-up blocked. Please allow pop-ups to print.');
            return;
        }
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Radiology Report - ${order?.examName || ''}</title>
            <style>
                @page { size: A4; margin: 10mm; }
                body { font-family: 'Times New Roman', Georgia, serif; background: white; margin: 0; padding: 16px; }
                @media print { body { padding: 0; } }
            </style>
        </head><body>${renderedHtml}</body></html>`;
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 350);
    };

    // ----- Nextcloud image upload -----
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setUploadError('');
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch(`/api/radiology/orders/${params.id}/upload-image`, {
                method: 'POST',
                credentials: 'include',
                body: fd,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            // Refresh order to pick up new image metadata
            const ref = await fetch(`/api/radiology/orders/${params.id}`, { credentials: 'include' });
            if (ref.ok) setOrder(await ref.json());
        } catch (err: any) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteImage = async () => {
        if (!confirm('Remove the attached scan image from Nextcloud?')) return;
        setUploading(true);
        setUploadError('');
        try {
            const res = await fetch(`/api/radiology/orders/${params.id}/image`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Delete failed');
            const ref = await fetch(`/api/radiology/orders/${params.id}`, { credentials: 'include' });
            if (ref.ok) setOrder(await ref.json());
        } catch (err: any) {
            setUploadError(err.message);
        } finally {
            setUploading(false);
        }
    };

    const isImage = (mime?: string) => !!mime && /^image\//.test(mime);
    const isPdf = (mime?: string) => mime === 'application/pdf';
    const formatBytes = (n?: number) => {
        if (!n) return '';
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1024 / 1024).toFixed(2)} MB`;
    };

    if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading order details...</div>;
    if (!order) return <div style={{ padding: "2rem", textAlign: "center" }}>Radiology Order not found.</div>;

    return (
        <div className="container" style={{ maxWidth: "1100px", margin: "0 auto" }}>
            <style>{`
                @media print {
                    body { background: white !important; }
                    .no-print { display: none !important; }
                }
            `}</style>

            <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }} className="no-print">
                <Link href="/dashboard/radiology" style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    <ArrowLeft size={16} /> Back to Radiology Dashboard
                </Link>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    {templateId && order.status === 'Completed' && (
                        <div style={{ display: 'flex', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '8px', padding: '2px' }}>
                            <button onClick={() => setView('edit')} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: 'none', background: view === 'edit' ? 'white' : 'transparent', color: view === 'edit' ? 'var(--primary-color)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', boxShadow: view === 'edit' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                                <Edit3 size={13} /> Edit
                            </button>
                            <button onClick={() => setView('render')} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: 'none', background: view === 'render' ? 'white' : 'transparent', color: view === 'render' ? 'var(--primary-color)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', boxShadow: view === 'render' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                                <Eye size={13} /> Report Preview
                            </button>
                        </div>
                    )}
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "0.4rem 0.8rem", borderRadius: "8px", background: "rgba(99, 102, 241, 0.1)", color: "var(--primary-color)", textTransform: "uppercase" }}>
                        Status: {formData.status.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "0.4rem 0.8rem", borderRadius: "8px", background: `color-mix(in srgb, ${getPriorityColor(order.priority)} 15%, transparent)`, color: getPriorityColor(order.priority), textTransform: "uppercase" }}>
                        Priority: {order.priority}
                    </span>
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: "1.5rem", overflow: "hidden" }}>
                {/* Exam Header */}
                <div style={{
                    padding: "1.25rem 1.5rem",
                    background: "rgba(99, 102, 241, 0.05)",
                    borderBottom: "1px solid rgba(99, 102, 241, 0.1)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start"
                }}>
                    <div>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Scan size={22} color="var(--primary-color)" /> {order.examName}
                        </h2>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.25rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                            <span>Category: <strong>{order.category}</strong></span>
                            {order.turnaroundTime && <span>TAT: <strong>{order.turnaroundTime}</strong></span>}
                            <span>Visit: <strong style={{ color: "var(--primary-color)" }}>{order.visit?.visitNumber}</strong></span>
                            <span>By: <strong>Dr. {order.doctor?.name}</strong></span>
                            {templateId && <span style={{ padding: '0.1rem 0.5rem', background: 'rgba(99,102,241,0.15)', color: 'var(--primary-color)', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600 }}>GMC TEMPLATE</span>}
                        </div>
                    </div>
                    {order.status === "Completed" && (
                        <div style={{
                            display: "flex", alignItems: "center", gap: "0.5rem",
                            background: "rgba(34,197,94,0.1)", color: "var(--success-color)",
                            padding: "0.5rem 1rem", borderRadius: "10px", fontWeight: 700, fontSize: "0.85rem"
                        }}>
                            <CheckCircle size={16} /> Report Published
                        </div>
                    )}
                </div>

                {/* Patient Details */}
                <div style={{ padding: "1.5rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", margin: "0 1.5rem 1.5rem" }}>
                    <h3 style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "1px", marginBottom: "1rem", fontWeight: 700 }}>
                        Patient Details
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Name</div>
                            <div style={{ fontWeight: 600 }}>{order.patient?.firstName} {order.patient?.lastName}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Patient ID</div>
                            <div style={{ fontWeight: 600 }}>#{order.patient?.patientNumber}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Gender & Age</div>
                            <div style={{ fontWeight: 600 }}>
                                {order.patient?.gender},{" "}
                                {new Date().getFullYear() - new Date(order.patient?.dateOfBirth).getFullYear()} yrs
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Phone</div>
                            <div style={{ fontWeight: 600 }}>{order.patient?.phone || "N/A"}</div>
                        </div>
                    </div>

                    {order.clinicalNotes && (
                        <div style={{ marginTop: "1.5rem", padding: "1rem", background: "rgba(239,68,68,0.05)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--danger-color)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--danger-color)", fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                                <AlertCircle size={15} /> Clinical Notes / Indication
                            </div>
                            <div style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{order.clinicalNotes}</div>
                        </div>
                    )}

                    {order.preparationInstructions && (
                        <div style={{ marginTop: "1rem", padding: "1rem", background: "rgba(99,102,241,0.05)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--primary-color)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--primary-color)", fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                                <FileText size={15} /> Preparation Instructions
                            </div>
                            <div style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{order.preparationInstructions}</div>
                        </div>
                    )}
                </div>

                {formData.status === 'Completed' && (
                    <div style={{ margin: '0 1.5rem 1rem', padding: '0.75rem 1rem', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success-color)', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                        <CheckCircle size={16} /> <strong>Report published.</strong> You can edit and re-save if a correction is needed. Use "Report Preview" to see the formatted report.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="no-print">
                    {/* Structured Radiology fields */}
                    <div style={{ padding: "0 1.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    Modality
                                </label>
                                <input
                                    type="text"
                                    value={formData.modality}
                                    onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                                    placeholder="e.g. X-Ray, CT, MRI, Ultrasound"
                                    style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.03)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', alignSelf: 'end', paddingBottom: '0.4rem' }}>
                                <input
                                    type="checkbox"
                                    id="contrast"
                                    checked={formData.contrastUsed}
                                    onChange={(e) => setFormData({ ...formData, contrastUsed: e.target.checked })}
                                    style={{ width: 18, height: 18, accentColor: 'var(--primary-color)' }}
                                />
                                <label htmlFor="contrast" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Contrast agent used
                                </label>
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <FileText size={14} /> Technique
                            </label>
                            <textarea
                                value={formData.technique}
                                onChange={(e) => setFormData({ ...formData, technique: e.target.value })}
                                placeholder="Describe the imaging technique, view, contrast (e.g. 'CT scan of the head, axial slices from skull base to vertex, with IV Iohexol 100ml')"
                                rows={3}
                                style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.03)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', resize: 'vertical' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <FileText size={14} /> Findings <span style={{ color: 'var(--danger-color)' }}>*</span>
                            </label>
                            <textarea
                                value={formData.findings}
                                onChange={(e) => setFormData({ ...formData, findings: e.target.value })}
                                placeholder="Detailed observations — anatomy, pathology, measurements, comparisons, etc."
                                rows={9}
                                required={formData.status === "Completed"}
                                style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.03)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', resize: 'vertical' }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <FileText size={14} /> Impression <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(clinical conclusion)</span>
                            </label>
                            <textarea
                                value={formData.impression}
                                onChange={(e) => setFormData({ ...formData, impression: e.target.value })}
                                placeholder="Concise diagnostic impression — e.g. 'No acute intracranial pathology. No midline shift or hemorrhage.'"
                                rows={4}
                                style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.03)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', resize: 'vertical', fontWeight: 500 }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <FileText size={14} /> Recommendations <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                            </label>
                            <textarea
                                value={formData.recommendations}
                                onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
                                placeholder="Follow-up recommendations, further imaging, clinical correlation advice..."
                                rows={3}
                                style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.03)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', resize: 'vertical' }}
                            />
                        </div>

                        <details style={{ background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.85rem' }}>
                            <summary style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>
                                Internal radiologist notes (not printed)
                            </summary>
                            <textarea
                                value={formData.radiologistNotes}
                                onChange={(e) => setFormData({ ...formData, radiologistNotes: e.target.value })}
                                placeholder="Notes for internal use only — not shown on printed report."
                                rows={2}
                                style={{ width: '100%', marginTop: '0.5rem', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: '0.85rem', resize: 'vertical' }}
                            />
                        </details>
                    </div>

                    {/* Scan Image Upload (Nextcloud) */}
                    <div style={{ padding: '0 1.5rem 1rem' }}>
                        <div style={{
                            border: '1.5px dashed var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            padding: '1rem',
                            background: 'rgba(0,0,0,0.015)',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <ImageIcon size={16} color="var(--primary-color)" />
                                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        Scan Image Attachment
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '0.1rem 0.45rem', background: 'rgba(99,102,241,0.1)', color: 'var(--primary-color)', borderRadius: '4px', fontWeight: 600 }}>
                                        NEXTCLOUD
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*,application/pdf,application/dicom"
                                        onChange={handleFileChange}
                                        style={{ display: 'none' }}
                                    />
                                    {order?.reportFileName ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={uploading}
                                                className="btn-secondary"
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                                            >
                                                <Upload size={14} /> {uploading ? 'Uploading...' : 'Replace'}
                                            </button>
                                            <a
                                                href={order.reportUrl || '#'}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn-secondary"
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', fontSize: '0.8rem', textDecoration: 'none' }}
                                            >
                                                <ExternalLink size={14} /> View in Nextcloud
                                            </a>
                                            <button
                                                type="button"
                                                onClick={handleDeleteImage}
                                                disabled={uploading}
                                                className="btn-secondary"
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', fontSize: '0.8rem', color: 'var(--danger-color)' }}
                                            >
                                                <Trash2 size={14} /> Remove
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploading || ncConfigured === false}
                                            className="btn-primary"
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.8rem', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: (uploading || ncConfigured === false) ? 'not-allowed' : 'pointer', opacity: (uploading || ncConfigured === false) ? 0.5 : 1 }}
                                        >
                                            <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload Scan Image'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {ncConfigured === false && (
                                <div style={{ padding: '0.6rem 0.85rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 'var(--radius-sm)', color: '#92400e', fontSize: '0.78rem' }}>
                                    <strong>Nextcloud not configured.</strong> Set <code>NEXTCLOUD_URL</code>, <code>NEXTCLOUD_USERNAME</code>, and <code>NEXTCLOUD_PASSWORD</code> in the server <code>.env</code> file to enable image uploads.
                                </div>
                            )}

                            {uploadError && (
                                <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.85rem', background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)', borderRadius: 'var(--radius-sm)', color: '#991b1b', fontSize: '0.78rem' }}>
                                    <strong>Upload error:</strong> {uploadError}
                                </div>
                            )}

                            {order?.reportFileName ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                                    <div
                                        onClick={() => isImage(order.reportMimeType) && setImagePreviewOpen(true)}
                                        style={{
                                            width: 80, height: 80, flexShrink: 0,
                                            background: '#f3f4f6', border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: isImage(order.reportMimeType) ? 'pointer' : 'default',
                                        }}
                                    >
                                        {isImage(order.reportMimeType) && order.reportUrl ? (
                                            <img
                                                src={order.reportUrl}
                                                alt={order.reportFileName}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                        ) : (
                                            <FileText size={28} color="var(--text-muted)" />
                                        )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {order.reportFileName}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                            {order.reportMimeType || 'unknown'} • {formatBytes(order.reportFileSize)}
                                            {order.reportUploadedAt && ` • uploaded ${new Date(order.reportUploadedAt).toLocaleString()}`}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                    {ncConfigured !== false ? (
                                        <>JPG, PNG, PDF, or DICOM. Max 50&nbsp;MB. Stored in <strong>VitalCore/Radiology/&lt;patient&gt;/&lt;exam&gt;</strong>.</>
                                    ) : null}
                                </div>
                            )}

                            {imagePreviewOpen && isImage(order?.reportMimeType) && order?.reportUrl && (
                                <div
                                    onClick={() => setImagePreviewOpen(false)}
                                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'zoom-out' }}
                                >
                                    <img src={order.reportUrl} alt={order.reportFileName} style={{ maxWidth: '90%', maxHeight: '90%', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }} />
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", padding: "1rem 1.5rem 1.5rem", borderTop: "1px solid var(--border-color)" }}>
                        <button type="button" className="btn-secondary" onClick={() => router.back()} style={{ padding: "0.75rem 1.75rem" }}>
                            Cancel
                        </button>
                        {renderedHtml && formData.status === "Completed" && (
                            <button type="button" onClick={handlePrint} className="btn-secondary" style={{ padding: "0.75rem 1.5rem", display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Printer size={16} /> Print Report
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={submitting}
                            style={{
                                padding: "0.75rem 2rem",
                                background: "var(--success-color)",
                                color: "white",
                                border: "none",
                                borderRadius: "var(--radius-md)",
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                cursor: submitting ? "not-allowed" : "pointer",
                                opacity: submitting ? 0.6 : 1,
                                transition: "all 0.2s"
                            }}
                        >
                            <Save size={16} />
                            {submitting ? "Publishing..." : (formData.status === "Completed" ? (order?.findings || order?.result ? "Update Published Report" : "Publish Report") : "Save Update")}
                        </button>
                    </div>
                </form>

                {/* Read-only print view for completed orders */}
                {formData.status === "Completed" && !submitting && view === 'render' && renderedHtml && (
                    <div style={{ padding: "1.5rem", borderTop: "1px solid var(--border-color)" }} className="no-print">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Final Report</h3>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={() => setView('edit')} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Edit3 size={14} /> Edit
                                </button>
                                <button onClick={handlePrint} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--primary-color)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 700, cursor: 'pointer' }}>
                                    <Printer size={16} /> Print
                                </button>
                            </div>
                        </div>
                        <div style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', border: '1px solid var(--border-color)' }} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                    </div>
                )}
            </div>
        </div>
    );
}
