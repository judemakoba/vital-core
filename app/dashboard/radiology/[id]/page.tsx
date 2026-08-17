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
    Image as ImageIcon,
    Upload,
    ExternalLink,
    Trash2,
} from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

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

    const getPriorityClass = (priority: string) => {
        if (priority === "Emergency" || priority === "STAT") return styles.priorityEmergency;
        if (priority === "Urgent") return styles.priorityUrgent;
        return styles.priorityRoutine;
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

    if (loading) return <div className={styles.loadingState}>Loading order details…</div>;
    if (!order) return <div className={styles.notFoundState}>Radiology Order not found.</div>;

    return (
        <div className={styles.container}>
            {/* ── Action bar (no-print) ── */}
            <div className={`${styles.actionBar} ${styles.noPrint}`}>
                <Link href="/dashboard/radiology" className={styles.backLink}>
                    <ArrowLeft size={16} /> Back to Radiology Dashboard
                </Link>
                <div className={styles.actionRight}>
                    {templateId && order.status === 'Completed' && (
                        <div className={styles.viewToggle}>
                            <button
                                onClick={() => setView('edit')}
                                className={`${styles.viewToggleBtn} ${view === 'edit' ? styles.viewToggleBtnActive : ''}`}
                            >
                                <Edit3 size={13} /> Edit
                            </button>
                            <button
                                onClick={() => setView('render')}
                                className={`${styles.viewToggleBtn} ${view === 'render' ? styles.viewToggleBtnActive : ''}`}
                            >
                                <Eye size={13} /> Report Preview
                            </button>
                        </div>
                    )}
                    <span className={styles.statusPill}>
                        Status: {formData.status.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className={`${styles.priorityPill} ${getPriorityClass(order.priority)}`}>
                        Priority: {order.priority}
                    </span>
                </div>
            </div>

            {/* ── Exam header card ── */}
            <div className={`${styles.examHeaderCard} ${styles.noPrint}`}>
                <div className={styles.examHeaderTop}>
                    <div>
                        <h2 className={styles.examTitle}>
                            <Scan size={22} color="var(--primary-color)" /> {order.examName}
                        </h2>
                        <div className={styles.examMeta}>
                            <span>Category: <strong>{order.category}</strong></span>
                            {order.turnaroundTime && <span>TAT: <strong>{order.turnaroundTime}</strong></span>}
                            <span>Visit: <strong style={{ color: "var(--primary-color)" }}>{order.visit?.visitNumber}</strong></span>
                            <span>By: <strong>Dr. {order.doctor?.name}</strong></span>
                            {templateId && <span className={styles.templateBadge}>GMC Template</span>}
                        </div>
                    </div>
                    {order.status === "Completed" && (
                        <div className={styles.publishedBadge}>
                            <CheckCircle size={16} /> Report Published
                        </div>
                    )}
                </div>

                {/* Patient details card */}
                <div className={styles.patientCard}>
                    <div className={styles.patientHeaderLabel}>Patient Details</div>
                    <div className={styles.patientGrid}>
                        <div className={styles.patientField}>
                            <div className={styles.patientLabel}>Name</div>
                            <div className={styles.patientValue}>{order.patient?.firstName} {order.patient?.lastName}</div>
                        </div>
                        <div className={styles.patientField}>
                            <div className={styles.patientLabel}>Patient ID</div>
                            <div className={styles.patientValue}>#{order.patient?.patientNumber}</div>
                        </div>
                        <div className={styles.patientField}>
                            <div className={styles.patientLabel}>Gender & Age</div>
                            <div className={styles.patientValue}>
                                {order.patient?.gender},{" "}
                                {new Date().getFullYear() - new Date(order.patient?.dateOfBirth).getFullYear()} yrs
                            </div>
                        </div>
                        <div className={styles.patientField}>
                            <div className={styles.patientLabel}>Phone</div>
                            <div className={styles.patientValue}>{order.patient?.phone || "N/A"}</div>
                        </div>
                    </div>

                    {order.clinicalNotes && (
                        <div className={styles.clinicalBanner}>
                            <div className={styles.clinicalBannerHeader}>
                                <AlertCircle size={15} /> Clinical Notes / Indication
                            </div>
                            <div className={styles.clinicalBannerText}>{order.clinicalNotes}</div>
                        </div>
                    )}

                    {order.preparationInstructions && (
                        <div className={styles.prepBanner}>
                            <div className={styles.prepBannerHeader}>
                                <FileText size={15} /> Preparation Instructions
                            </div>
                            <div className={styles.prepBannerText}>{order.preparationInstructions}</div>
                        </div>
                    )}
                </div>

                {formData.status === 'Completed' && (
                    <div className={styles.publishedNotice}>
                        <CheckCircle size={16} /> <strong>Report published.</strong> You can edit and re-save if a correction is needed. Use "Report Preview" to see the formatted report.
                    </div>
                )}

                <form onSubmit={handleSubmit} className={styles.noPrint}>
                    {/* Structured Radiology fields */}
                    <div className={styles.formBody}>
                        <div className={styles.formRow}>
                            <div className={styles.formField}>
                                <label className={styles.formLabel}>Modality</label>
                                <input
                                    type="text"
                                    value={formData.modality}
                                    onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                                    placeholder="e.g. X-Ray, CT, MRI, Ultrasound"
                                    className={styles.formInput}
                                />
                            </div>
                            <div className={styles.contrastRow}>
                                <input
                                    type="checkbox"
                                    id="contrast"
                                    checked={formData.contrastUsed}
                                    onChange={(e) => setFormData({ ...formData, contrastUsed: e.target.checked })}
                                    className={styles.contrastCheckbox}
                                />
                                <label htmlFor="contrast" className={styles.contrastLabel}>
                                    Contrast agent used
                                </label>
                            </div>
                        </div>

                        <div className={styles.formField}>
                            <label className={styles.formLabel}>
                                <FileText size={14} /> Technique
                            </label>
                            <textarea
                                value={formData.technique}
                                onChange={(e) => setFormData({ ...formData, technique: e.target.value })}
                                placeholder="Describe the imaging technique, view, contrast (e.g. 'CT scan of the head, axial slices from skull base to vertex, with IV Iohexol 100ml')"
                                rows={3}
                                className={styles.formTextarea}
                            />
                        </div>

                        <div className={styles.formField}>
                            <label className={styles.formLabel}>
                                <FileText size={14} /> Findings <span className={styles.formLabelRequired}>*</span>
                            </label>
                            <textarea
                                value={formData.findings}
                                onChange={(e) => setFormData({ ...formData, findings: e.target.value })}
                                placeholder="Detailed observations — anatomy, pathology, measurements, comparisons, etc."
                                rows={9}
                                required={formData.status === "Completed"}
                                className={`${styles.formTextarea} ${styles.formTextareaLg}`}
                            />
                        </div>

                        <div className={styles.formField}>
                            <label className={styles.formLabel}>
                                <FileText size={14} /> Impression <span className={styles.formLabelOptional}>(clinical conclusion)</span>
                            </label>
                            <textarea
                                value={formData.impression}
                                onChange={(e) => setFormData({ ...formData, impression: e.target.value })}
                                placeholder="Concise diagnostic impression — e.g. 'No acute intracranial pathology. No midline shift or hemorrhage.'"
                                rows={4}
                                className={`${styles.formTextarea} ${styles.formTextareaImpression}`}
                            />
                        </div>

                        <div className={styles.formField}>
                            <label className={styles.formLabel}>
                                <FileText size={14} /> Recommendations <span className={styles.formLabelOptional}>(optional)</span>
                            </label>
                            <textarea
                                value={formData.recommendations}
                                onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
                                placeholder="Follow-up recommendations, further imaging, clinical correlation advice..."
                                rows={3}
                                className={styles.formTextarea}
                            />
                        </div>

                        <details className={styles.notesDisclosure}>
                            <summary className={styles.notesSummary}>
                                Internal radiologist notes (not printed)
                            </summary>
                            <textarea
                                value={formData.radiologistNotes}
                                onChange={(e) => setFormData({ ...formData, radiologistNotes: e.target.value })}
                                placeholder="Notes for internal use only — not shown on printed report."
                                rows={2}
                                className={styles.notesTextarea}
                            />
                        </details>
                    </div>
                </form>

                {/* Action footer */}
                <div className={`${styles.actionFooter} ${styles.noPrint}`}>
                    <button type="button" className={styles.btnSecondary} onClick={() => router.back()}>
                        Cancel
                    </button>
                    {renderedHtml && formData.status === "Completed" && (
                        <button type="button" onClick={handlePrint} className={styles.btnSecondary}>
                            <Printer size={16} /> Print Report
                        </button>
                    )}
                    <button
                        type="submit"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className={styles.btnPublish}
                    >
                        <Save size={16} />
                        {submitting ? "Publishing..." : (formData.status === "Completed" ? (order?.findings || order?.result ? "Update Published Report" : "Publish Report") : "Save Update")}
                    </button>
                </div>
            </div>

            {/* ── Scan Image Upload card ── */}
            <div className={`${styles.uploadCard} ${styles.noPrint}`}>
                <div className={styles.uploadDropzone}>
                    <div className={styles.uploadHeader}>
                        <div className={styles.uploadHeaderLeft}>
                            <span className={styles.uploadTitle}>
                                <ImageIcon size={16} color="var(--primary-color)" /> Scan Image Attachment
                            </span>
                            <span className={styles.uploadSourceTag}>Nextcloud</span>
                        </div>
                        <div className={styles.uploadActions}>
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
                                        className={styles.uploadBtnSecondary}
                                    >
                                        <Upload size={14} /> {uploading ? 'Uploading...' : 'Replace'}
                                    </button>
                                    <a
                                        href={order.reportUrl || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.uploadBtnSecondary}
                                    >
                                        <ExternalLink size={14} /> View in Nextcloud
                                    </a>
                                    <button
                                        type="button"
                                        onClick={handleDeleteImage}
                                        disabled={uploading}
                                        className={`${styles.uploadBtnSecondary} ${styles.uploadBtnDanger}`}
                                    >
                                        <Trash2 size={14} /> Remove
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading || ncConfigured === false}
                                    className={styles.uploadBtnPrimary}
                                >
                                    <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload Scan Image'}
                                </button>
                            )}
                        </div>
                    </div>

                    {ncConfigured === false && (
                        <div className={`${styles.uploadNotice} ${styles.uploadNoticeWarn}`}>
                            <strong>Nextcloud not configured.</strong> Set <code>NEXTCLOUD_URL</code>, <code>NEXTCLOUD_USERNAME</code>, and <code>NEXTCLOUD_PASSWORD</code> in the server <code>.env</code> file to enable image uploads.
                        </div>
                    )}

                    {uploadError && (
                        <div className={`${styles.uploadNotice} ${styles.uploadNoticeError}`}>
                            <strong>Upload error:</strong> {uploadError}
                        </div>
                    )}

                    {order?.reportFileName ? (
                        <div className={styles.uploadFileRow}>
                            <div
                                onClick={() => isImage(order.reportMimeType) && setImagePreviewOpen(true)}
                                className={styles.uploadThumb}
                                style={{ cursor: isImage(order.reportMimeType) ? 'pointer' : 'default' }}
                            >
                                {isImage(order.reportMimeType) && order.reportUrl ? (
                                    <img
                                        src={order.reportUrl}
                                        alt={order.reportFileName}
                                        className={styles.uploadThumbImg}
                                    />
                                ) : (
                                    <FileText size={28} color="var(--text-muted)" />
                                )}
                            </div>
                            <div className={styles.uploadFileMeta}>
                                <div className={styles.uploadFileName}>{order.reportFileName}</div>
                                <div className={styles.uploadFileDetails}>
                                    {order.reportMimeType || 'unknown'} • {formatBytes(order.reportFileSize)}
                                    {order.reportUploadedAt && ` • uploaded ${new Date(order.reportUploadedAt).toLocaleString()}`}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.uploadHelp}>
                            {ncConfigured !== false ? (
                                <>JPG, PNG, PDF, or DICOM. Max 50&nbsp;MB. Stored in <span className={styles.uploadHint}>VitalCore/Radiology/&lt;patient&gt;/&lt;exam&gt;</span>.</>
                            ) : null}
                        </div>
                    )}

                    {imagePreviewOpen && isImage(order?.reportMimeType) && order?.reportUrl && (
                        <div
                            onClick={() => setImagePreviewOpen(false)}
                            className={styles.uploadPreviewOverlay}
                        >
                            <img src={order.reportUrl} alt={order.reportFileName} className={styles.uploadPreviewImg} />
                        </div>
                    )}
                </div>
            </div>

            {/* Read-only print view for completed orders */}
            {formData.status === "Completed" && !submitting && view === 'render' && renderedHtml && (
                <div className={`${styles.formCard} ${styles.noPrint}`}>
                    <div className={styles.reportHeader}>
                        <h3 className={styles.reportTitle}>Final Report</h3>
                        <div className={styles.reportActions}>
                            <button onClick={() => setView('edit')} className={styles.btnSecondary}>
                                <Edit3 size={14} /> Edit
                            </button>
                            <button onClick={handlePrint} className={styles.btnPublish}>
                                <Printer size={16} /> Print
                            </button>
                        </div>
                    </div>
                    <div className={styles.reportBody} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                </div>
            )}
        </div>
    );
}
