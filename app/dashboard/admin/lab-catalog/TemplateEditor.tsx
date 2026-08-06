"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, RefreshCw, FileText, Code, Eye, Trash2, AlertTriangle } from 'lucide-react';
import { renderTemplate, FLAG_LABELS, FLAG_COLORS, ResultFlag, defaultTemplateFor } from '@/lib/lab-templates-utils';

interface TemplateEditorProps {
    test: {
        id: string;
        name: string;
        unit?: string | null;
        referenceRange?: string | null;
        category?: { name: string } | null;
    };
    onClose: () => void;
    onSaved: () => void;
}

const PLACEHOLDERS = [
    { key: '{{test_name}}', label: 'Test Name' },
    { key: '{{test_category}}', label: 'Test Category' },
    { key: '{{result}}', label: 'Result Value' },
    { key: '{{unit}}', label: 'Result Unit' },
    { key: '{{normal_range}}', label: 'Normal Range' },
    { key: '{{flag}}', label: 'Flag Code (N/H/L/HH/LL)' },
    { key: '{{flag_label}}', label: 'Flag Label (Normal/High/etc.)' },
    { key: '{{patient_name}}', label: 'Patient Name' },
    { key: '{{patient_number}}', label: 'Patient Number' },
    { key: '{{patient_age}}', label: 'Patient Age' },
    { key: '{{patient_gender}}', label: 'Patient Gender' },
    { key: '{{doctor_name}}', label: 'Doctor Name' },
    { key: '{{technician}}', label: 'Technician' },
    { key: '{{collected_at}}', label: 'Collection Date/Time' },
    { key: '{{reported_at}}', label: 'Reported Date/Time' },
    { key: '{{notes}}', label: 'Notes' },
    { key: '{{visit_number}}', label: 'Visit Number' },
    { key: '{{clinic_name}}', label: 'Clinic Name' },
];

export default function TemplateEditor({ test, onClose, onSaved }: TemplateEditorProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<'edit' | 'preview'>('edit');
    const [templateId, setTemplateId] = useState<string | null>(null);

    const [templateName, setTemplateName] = useState('Standard Report');
    const [headerHtml, setHeaderHtml] = useState('');
    const [templateHtml, setTemplateHtml] = useState('');
    const [footerHtml, setFooterHtml] = useState('');

    const [normalRangeMin, setNormalRangeMin] = useState('');
    const [normalRangeMax, setNormalRangeMax] = useState('');
    const [criticalRangeMin, setCriticalRangeMin] = useState('');
    const [criticalRangeMax, setCriticalRangeMax] = useState('');
    const [resultUnit, setResultUnit] = useState(test.unit || '');

    // Live preview values
    const [previewResult, setPreviewResult] = useState('5.4');

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`/api/lab/templates?labTestId=${test.id}`);
                if (res.ok) {
                    const list = await res.json();
                    const existing = Array.isArray(list) ? list[0] : null;
                    if (existing) {
                        setTemplateId(existing.id);
                        setTemplateName(existing.templateName || 'Standard Report');
                        setHeaderHtml(existing.headerHtml || '');
                        setTemplateHtml(existing.templateHtml || '');
                        setFooterHtml(existing.footerHtml || '');
                        setNormalRangeMin(existing.normalRangeMin != null ? String(existing.normalRangeMin) : '');
                        setNormalRangeMax(existing.normalRangeMax != null ? String(existing.normalRangeMax) : '');
                        setCriticalRangeMin(existing.criticalRangeMin != null ? String(existing.criticalRangeMin) : '');
                        setCriticalRangeMax(existing.criticalRangeMax != null ? String(existing.criticalRangeMax) : '');
                        setResultUnit(existing.resultUnit || test.unit || '');
                    } else {
                        // Pre-populate with a default
                        setTemplateHtml(defaultTemplateFor({
                            testName: test.name,
                            categoryName: test.category?.name,
                            unit: test.unit || '',
                            referenceRange: test.referenceRange || '',
                        }));
                        setResultUnit(test.unit || '');
                        // Pre-parse reference range
                        if (test.referenceRange) {
                            const m = test.referenceRange.match(/([\d.]+)\s*-\s*([\d.]+)/);
                            if (m) {
                                setNormalRangeMin(m[1]);
                                setNormalRangeMax(m[2]);
                            }
                        }
                    }
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load template');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [test.id]);

    // Live preview HTML
    const previewHtml = useMemo(() => {
        const nMin = parseFloat(normalRangeMin);
        const nMax = parseFloat(normalRangeMax);
        const cMin = parseFloat(criticalRangeMin);
        const cMax = parseFloat(criticalRangeMax);
        const r = parseFloat(previewResult);
        let flag: ResultFlag = '';
        if (!isNaN(r)) {
            if (!isNaN(cMin) && r < cMin) flag = 'LL';
            else if (!isNaN(cMax) && r > cMax) flag = 'HH';
            else if (!isNaN(nMin) && r < nMin) flag = 'L';
            else if (!isNaN(nMax) && r > nMax) flag = 'H';
            else if (!isNaN(nMin) || !isNaN(nMax) || !isNaN(cMin) || !isNaN(cMax)) flag = 'N';
        }
        const rangeStr = !isNaN(nMin) && !isNaN(nMax)
            ? `${nMin} - ${nMax}`
            : !isNaN(nMin) ? `>= ${nMin}`
            : !isNaN(nMax) ? `<= ${nMax}`
            : '';
        const ctx = {
            test_name: test.name,
            test_category: test.category?.name || '',
            result: previewResult,
            unit: resultUnit,
            normal_range: rangeStr,
            flag,
            patient_name: 'Jane Doe',
            patient_number: 'P-00123',
            patient_age: '34',
            patient_gender: 'F',
            doctor_name: 'Dr. Smith',
            technician: 'Lab Tech',
            collected_at: new Date().toLocaleString(),
            reported_at: new Date().toLocaleString(),
            notes: '—',
            visit_number: 'V-2026-0001',
            clinic_name: 'Vital Core Hospital',
        };
        const h = headerHtml ? renderTemplate(headerHtml, ctx) : '';
        const b = renderTemplate(templateHtml, ctx);
        const f = footerHtml ? renderTemplate(footerHtml, ctx) : '';
        return h + b + f;
    }, [headerHtml, templateHtml, footerHtml, previewResult, normalRangeMin, normalRangeMax, criticalRangeMin, criticalRangeMax, resultUnit, test.name, test.category?.name]);

    const previewFlag = useMemo<ResultFlag>(() => {
        const r = parseFloat(previewResult);
        if (isNaN(r)) return '';
        const nMin = parseFloat(normalRangeMin);
        const nMax = parseFloat(normalRangeMax);
        const cMin = parseFloat(criticalRangeMin);
        const cMax = parseFloat(criticalRangeMax);
        if (!isNaN(cMin) && r < cMin) return 'LL';
        if (!isNaN(cMax) && r > cMax) return 'HH';
        if (!isNaN(nMin) && r < nMin) return 'L';
        if (!isNaN(nMax) && r > nMax) return 'H';
        if (!isNaN(nMin) || !isNaN(nMax) || !isNaN(cMin) || !isNaN(cMax)) return 'N';
        return '';
    }, [previewResult, normalRangeMin, normalRangeMax, criticalRangeMin, criticalRangeMax]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/lab/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    labTestId: test.id,
                    templateName,
                    headerHtml: headerHtml || null,
                    templateHtml,
                    footerHtml: footerHtml || null,
                    normalRangeMin: normalRangeMin || null,
                    normalRangeMax: normalRangeMax || null,
                    criticalRangeMin: criticalRangeMin || null,
                    criticalRangeMax: criticalRangeMax || null,
                    resultUnit: resultUnit || null,
                    isActive: true,
                }),
            });
            if (!res.ok) {
                const e = await res.json();
                throw new Error(e.error || 'Save failed');
            }
            onSaved();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!templateId) return;
        if (!confirm('Delete this template? Tests will fall back to the default template on render.')) return;
        try {
            const res = await fetch(`/api/lab/templates/${templateId}`, { method: 'DELETE' });
            if (!res.ok) {
                const e = await res.json();
                throw new Error(e.error || 'Delete failed');
            }
            onSaved();
            onClose();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const insertPlaceholder = (key: string) => {
        setTemplateHtml((v) => v + key);
    };

    const flagColor = FLAG_COLORS[previewFlag];

    if (loading) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="glass-card" style={{ padding: '2rem' }}>Loading template...</div>
            </div>
        );
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="glass-card animate-slide-up" style={{ width: '100%', maxWidth: '1400px', height: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(99, 102, 241, 0.04)' }}>
                    <div>
                        <h2 style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={18} /> Template Editor: {test.name}
                        </h2>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            HTML template · auto-flags on ranges · printable · color-coded indicators
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '8px', padding: '2px' }}>
                            <button onClick={() => setMode('edit')} style={{ padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', background: mode === 'edit' ? 'white' : 'transparent', color: mode === 'edit' ? 'var(--primary-color)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: mode === 'edit' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                                <Code size={14} /> Edit
                            </button>
                            <button onClick={() => setMode('preview')} style={{ padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', background: mode === 'preview' ? 'white' : 'transparent', color: mode === 'preview' ? 'var(--primary-color)' : 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: mode === 'preview' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                                <Eye size={14} /> Live Preview
                            </button>
                        </div>
                        {templateId && (
                            <button onClick={handleDelete} className="btn-secondary" style={{ color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Trash2 size={14} /> Delete
                            </button>
                        )}
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
                    </div>
                </div>

                {error && (
                    <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={14} /> {error}
                    </div>
                )}

                {/* Body */}
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: mode === 'edit' ? '1fr 1fr' : '1fr', overflow: 'hidden' }}>
                    {mode === 'edit' ? (
                        <>
                            {/* Editor column */}
                            <div style={{ padding: '1.25rem', overflow: 'auto', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label className="input-label">Template Name</label>
                                    <input type="text" className="input-field" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. CBC Report" />
                                </div>

                                <div>
                                    <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Header HTML (optional)</span>
                                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Letterhead, clinic info</span>
                                    </label>
                                    <textarea className="input-field" style={{ minHeight: '70px', fontFamily: 'monospace', fontSize: '0.8rem' }} value={headerHtml} onChange={(e) => setHeaderHtml(e.target.value)} placeholder="<div style='text-align:center;'>...</div>" />
                                </div>

                                <div>
                                    <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Template HTML <span style={{ color: 'var(--danger-color)' }}>*</span></span>
                                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Use placeholders below</span>
                                    </label>
                                    <textarea className="input-field" style={{ minHeight: '280px', fontFamily: 'monospace', fontSize: '0.8rem' }} value={templateHtml} onChange={(e) => setTemplateHtml(e.target.value)} placeholder="<div>...</div>" required />
                                </div>

                                <div>
                                    <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Footer HTML (optional)</span>
                                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem' }}>Signatures, disclaimers</span>
                                    </label>
                                    <textarea className="input-field" style={{ minHeight: '70px', fontFamily: 'monospace', fontSize: '0.8rem' }} value={footerHtml} onChange={(e) => setFooterHtml(e.target.value)} />
                                </div>

                                {/* Placeholder chips */}
                                <div>
                                    <label className="input-label">Placeholders (click to insert into template)</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {PLACEHOLDERS.map((p) => (
                                            <button key={p.key} type="button" onClick={() => insertPlaceholder(p.key)} style={{ padding: '0.3rem 0.6rem', borderRadius: '999px', border: '1px solid var(--border-color)', background: 'rgba(99, 102, 241, 0.06)', color: 'var(--primary-color)', fontFamily: 'monospace', fontSize: '0.75rem', cursor: 'pointer' }} title={p.label}>
                                                {p.key}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Ranges + result unit + live preview */}
                            <div style={{ padding: '1.25rem', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(0,0,0,0.02)' }}>
                                <div>
                                    <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.75rem 0' }}>Auto-Flag Ranges</h3>
                                    <div style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        Result is auto-flagged based on these numeric ranges. Critical (LL/HH) overrides Normal (L/H). Leave blank to skip a check.
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div className="input-group">
                                            <label className="input-label" style={{ color: '#16a34a' }}>Normal Range Min</label>
                                            <input type="number" step="0.001" className="input-field" value={normalRangeMin} onChange={(e) => setNormalRangeMin(e.target.value)} placeholder="e.g. 4.5" />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label" style={{ color: '#16a34a' }}>Normal Range Max</label>
                                            <input type="number" step="0.001" className="input-field" value={normalRangeMax} onChange={(e) => setNormalRangeMax(e.target.value)} placeholder="e.g. 5.5" />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label" style={{ color: '#dc2626' }}>Critical Range Min (LL)</label>
                                            <input type="number" step="0.001" className="input-field" value={criticalRangeMin} onChange={(e) => setCriticalRangeMin(e.target.value)} placeholder="e.g. 2.0" />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label" style={{ color: '#dc2626' }}>Critical Range Max (HH)</label>
                                            <input type="number" step="0.001" className="input-field" value={criticalRangeMax} onChange={(e) => setCriticalRangeMax(e.target.value)} placeholder="e.g. 8.0" />
                                        </div>
                                    </div>

                                    <div className="input-group" style={{ marginTop: '0.75rem' }}>
                                        <label className="input-label">Result Unit</label>
                                        <input type="text" className="input-field" value={resultUnit} onChange={(e) => setResultUnit(e.target.value)} placeholder="e.g. mg/dL, mmol/L" />
                                    </div>
                                </div>

                                <div>
                                    <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.75rem 0' }}>Live Preview</h3>
                                    <div style={{ background: 'white', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Test result:</label>
                                        <input type="text" value={previewResult} onChange={(e) => setPreviewResult(e.target.value)} style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem' }} placeholder="enter a numeric result" />
                                        {previewFlag && (
                                            <div style={{ padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, background: flagColor.bg, color: flagColor.text, border: `1px solid ${flagColor.border}` }}>
                                                {previewFlag} · {FLAG_LABELS[previewFlag]}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ flex: 1, background: 'white', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'auto', minHeight: '300px' }}>
                                    <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(99, 102, 241, 0.05)', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>HTML Preview</span>
                                        <span>What gets saved & printed</span>
                                    </div>
                                    <div dangerouslySetInnerHTML={{ __html: previewHtml }} style={{ padding: '1rem' }} />
                                </div>
                            </div>
                        </>
                    ) : (
                        /* Full-width preview mode */
                        <div style={{ padding: '1.5rem', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ background: 'white', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Test result for preview:</label>
                                <input type="text" value={previewResult} onChange={(e) => setPreviewResult(e.target.value)} style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem' }} />
                                {previewFlag && (
                                    <div style={{ padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, background: flagColor.bg, color: flagColor.text, border: `1px solid ${flagColor.border}` }}>
                                        {previewFlag} · {FLAG_LABELS[previewFlag]}
                                    </div>
                                )}
                            </div>
                            <div style={{ flex: 1, background: 'white', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '2rem', overflow: 'auto' }}>
                                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {templateId ? 'Editing existing template' : 'Will create a new template'}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button className="btn-primary" onClick={handleSave} disabled={saving || !templateHtml.trim()} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Save size={16} /> {saving ? 'Saving...' : 'Save Template'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
