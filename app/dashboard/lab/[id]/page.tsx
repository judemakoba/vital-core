"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, AlertCircle, FileText, CheckCircle, Activity, Printer, Edit3, Eye, RefreshCw, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import styles from "../../triage/[visitId]/page.module.css";
import { FLAG_LABELS, FLAG_COLORS, ResultFlag, computeRowFlag, computeFlag, getTestSchema, formatRange } from "@/lib/lab-templates-utils";

interface SchemaRow {
    section?: string;
    investigation: string;
    unit?: string;
    normalRange?: string;
    normalMin?: number;
    normalMax?: number;
    criticalMin?: number;
    criticalMax?: number;
    isSection?: boolean;
}

interface ResultRow {
    section?: string;
    investigation: string;
    result?: string;
    unit?: string;
    normalRange?: string;
    normalMin?: number;
    normalMax?: number;
    criticalMin?: number;
    criticalMax?: number;
    flag?: ResultFlag;
    comment?: string;
    isSection?: boolean;
}

/**
 * GMC-style single-mode result input. Renders a test info card with
 * category, normal range, critical range, and unit, plus a smart input
 * field (numeric for numeric tests, text otherwise) with live flag
 * computation. Mirrors the layout of the generated GMC report so the
 * lab tech sees exactly what will be printed.
 */
function SingleModeResultInput({
    result,
    onChange,
    testInfo,
    testName,
    categoryName,
    orderReferenceRange,
    orderUnit,
    isRequired,
}: {
    result: string;
    onChange: (v: string) => void;
    testInfo: { unit?: string | null; normalMin?: number | null; normalMax?: number | null; criticalMin?: number | null; criticalMax?: number | null; referenceRange?: string | null } | null;
    testName: string;
    categoryName?: string;
    orderReferenceRange?: string | null;
    orderUnit?: string | null;
    isRequired: boolean;
}) {
    // Pull effective values from testInfo template (preferred) or fall back to order fields
    const unit = testInfo?.unit ?? orderUnit ?? null;
    const normalMin = testInfo?.normalMin ?? null;
    const normalMax = testInfo?.normalMax ?? null;
    const criticalMin = testInfo?.criticalMin ?? null;
    const criticalMax = testInfo?.criticalMax ?? null;
    const normalRangeText = formatRange(normalMin, normalMax) || orderReferenceRange || '';
    const criticalRangeText = formatRange(criticalMin, criticalMax);

    // Live flag: compute as user types (no server roundtrip)
    const trimmed = (result || '').trim();
    const isNumeric = /^-?\d+(\.\d+)?$/.test(trimmed);
    const liveFlag: ResultFlag = isNumeric
        ? computeFlag({
              result: trimmed,
              normalRangeMin: normalMin,
              normalRangeMax: normalMax,
              criticalRangeMin: criticalMin,
              criticalRangeMax: criticalMax,
          })
        : (trimmed ? 'N' : '');
    const flagColor = FLAG_COLORS[liveFlag];
    const arrowFor = (f: ResultFlag) => {
        if (f === 'H' || f === 'HH') return f === 'HH' ? '↑↑↑' : '↑';
        if (f === 'L' || f === 'LL') return f === 'LL' ? '↓↓↓' : '↓';
        return '';
    };

    // Preview the value as it'll appear in the report (bold + colored + arrow)
    const previewVal = trimmed
        ? isNumeric && liveFlag && liveFlag !== 'N'
            ? <><strong style={{ color: '#dc2626' }}>{trimmed}</strong> <span style={{ color: '#dc2626', fontWeight: 700 }}>{arrowFor(liveFlag)}</span></>
            : <strong>{trimmed}</strong>
        : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>;

    const hasRange = !!(normalMin != null || normalMax != null || criticalMin != null || criticalMax != null || orderReferenceRange);

    return (
        <div style={{ padding: '0 1.5rem 1.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={16} /> Test Result
            </label>

            {/* GMC-style test info card */}
            <div style={{
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                marginBottom: '0.75rem',
                fontSize: '0.85rem',
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem 1rem' }}>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.15rem' }}>Category</div>
                        <div style={{ fontWeight: 600 }}>{categoryName || '—'}</div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.15rem' }}>Unit</div>
                        <div style={{ fontWeight: 600 }}>{unit || '—'}</div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.15rem' }}>Normal Range</div>
                        <div style={{ fontWeight: 600, color: 'var(--success-color)' }}>{normalRangeText || '—'}</div>
                    </div>
                    {criticalRangeText && (
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.15rem' }}>Critical</div>
                            <div style={{ fontWeight: 600, color: 'var(--danger-color)' }}>{criticalRangeText}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Smart input: numeric for numeric tests, textarea for descriptive */}
            {hasRange || isNumeric ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={result}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Enter numeric value (e.g. 5.4)"
                        style={{
                            flex: 1,
                            padding: '0.85rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            border: `2px solid ${liveFlag && liveFlag !== 'N' && liveFlag !== '' ? (flagColor?.border || '#dc2626') : 'var(--border-color)'}`,
                            background: 'white',
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-sans)',
                            fontSize: '1.05rem',
                            fontWeight: 600,
                            outline: 'none',
                        }}
                        required={isRequired}
                    />
                    {unit && (
                        <div style={{ minWidth: 60, padding: '0.6rem 0.75rem', background: 'rgba(99, 102, 241, 0.08)', color: 'var(--primary-color)', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.85rem', textAlign: 'center' }}>
                            {unit}
                        </div>
                    )}
                </div>
            ) : (
                <textarea
                    value={result}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Enter the result value (e.g. Positive / Negative / descriptive paragraph)..."
                    style={{
                        width: '100%',
                        minHeight: '90px',
                        padding: '1rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(0,0,0,0.1)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '0.875rem',
                        resize: 'vertical',
                    }}
                    required={isRequired}
                />
            )}

            {/* Live flag + report-preview value */}
            {trimmed && (
                <div style={{
                    marginTop: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    flexWrap: 'wrap',
                }}>
                    {liveFlag ? (
                        <span style={{
                            padding: '0.3rem 0.7rem',
                            borderRadius: '999px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            background: flagColor?.bg,
                            color: flagColor?.text,
                            border: `1px solid ${flagColor?.border}`,
                        }}>
                            {liveFlag} · {FLAG_LABELS[liveFlag]}
                        </span>
                    ) : null}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Report preview:</span>
                    <span style={{
                        padding: '0.25rem 0.6rem',
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                    }}>
                        {previewVal} {unit && <span style={{ color: 'var(--text-muted)' }}>{unit}</span>}
                    </span>
                </div>
            )}
        </div>
    );
}

export default function LabOrderDetails({ params }: { params: { id: string } }) {
    const router = useRouter();
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [view, setView] = useState<'render' | 'edit'>('edit');
    const [renderedHtml, setRenderedHtml] = useState<string>('');
    const [renderedFlag, setRenderedFlag] = useState<ResultFlag>('');
    const [renderedRange, setRenderedRange] = useState<string>('');
    const [renderedRows, setRenderedRows] = useState<ResultRow[]>([]);
    const [rendering, setRendering] = useState(false);
    const [testInfo, setTestInfo] = useState<{
        id: string;
        hasTemplate: boolean;
        resultMode: 'single' | 'table' | 'qualitative' | null;
        schema: SchemaRow[] | null;
        unit?: string | null;
        normalMin?: number | null;
        normalMax?: number | null;
        criticalMin?: number | null;
        criticalMax?: number | null;
        referenceRange?: string | null;
    } | null>(null);
    const renderTimerRef = useRef<any>(null);

    const [formData, setFormData] = useState({
        status: "Ordered",
        result: "",
        resultFlags: "Normal",
    });

    // For table-mode: rows the user is editing
    const [rows, setRows] = useState<ResultRow[]>([]);
    // Guard so the schema-init in lookupTest doesn't run after fetchOrder hydrates saved rows
    const rowsInitializedRef = useRef(false);

    // Initial load
    useEffect(() => {
        // Reset the guard when navigating to a different order
        rowsInitializedRef.current = false;
        setRows([]);
        setTestInfo(null);

        const fetchOrder = async () => {
            try {
                const res = await fetch(`/api/lab/orders/${params.id}`, { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    setOrder(data);

                    if (data.status === 'Completed') {
                        setView('render');
                    }

                    let initialStatus = data.status;
                    if (data.status === "Ordered" || data.status === "SampleCollected") {
                        initialStatus = "InProgress";
                        fetch(`/api/lab/orders/${params.id}`, {
                            method: "PUT",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "InProgress", result: data.result, resultFlags: data.resultFlags })
                        }).catch(err => console.error("Failed to auto-transition status", err));
                    }

                    setFormData({
                        status: initialStatus,
                        result: data.result || (data.template && typeof data.template === 'string' && !data.template.includes('{{') ? data.template : ''),
                        resultFlags: data.resultFlags || "Normal",
                    });

                    // Hydrate saved rows whenever the order has any. The earlier
                    // guard (`data.resultMode === 'table' || 'qualitative'`)
                    // skipped hydration when the test's LabResultTemplate row
                    // was missing — the API then returned `resultMode: null`
                    // and the form rendered the schema with empty values,
                    // losing the saved data. `savedRows.length > 0` is the
                    // real signal that the data exists; resultMode is just a
                    // form-layout hint and can legitimately be null on a fresh
                    // or wiped DB.
                    const savedRows = data.resultRowsParsed || [];
                    if (savedRows.length > 0) {
                        // Merge saved rows with template schema so flag computation
                        // can use the numeric ranges (saved rows only carry the
                        // string range like "11.5 - 15", not the parsed numbers).
                        // We also need the schema to fill in any rows the saved data
                        // is missing (e.g. new rows added to the schema after save).
                        let schema = parseSchemaString(data.resultSchema);
                        // Fall back to the in-code schema map if the template's
                        // resultSchema is empty/missing — this catches the case where
                        // a test's template hasn't been seeded yet but the test name
                        // matches a predefined schema (e.g. CBC/FBC).
                        if (schema.length === 0) {
                            const fallback = getTestSchema(data.testName);
                            if (fallback) schema = fallback.rows as SchemaRow[];
                        }
                        const merged = mergeRowsWithSchema(savedRows, schema);
                        setRows(merged);
                        rowsInitializedRef.current = true;
                    }
                } else {
                    const errorData = await res.json();
                    console.error("Failed to fetch lab order", errorData.error || res.statusText);
                }
            } catch (err) {
                console.error("Failed to fetch lab order", err);
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
    }, [params.id]);

    // Look up the test by name to find the testId, then check for template + schema
    useEffect(() => {
        if (!order) return;
        const lookupTest = async () => {
            try {
                const res = await fetch(`/api/lab/catalog?search=${encodeURIComponent(order.testName)}`, { credentials: 'include' });
                if (!res.ok) return;
                const list = await res.json();
                const test = list.find((t: any) => t.name === order.testName) || list[0];
                if (test) {
                    let schema: SchemaRow[] | null = null;
                    if (test.resultTemplate?.resultSchema) {
                        try {
                            const parsed = JSON.parse(test.resultTemplate.resultSchema);
                            if (Array.isArray(parsed)) schema = parsed;
                        } catch (e) { /* ignore */ }
                    }
                    // Fall back to the in-code schema map (TEST_SCHEMAS) if the
                    // template's resultSchema is empty or missing. This ensures the
                    // page can hydrate even if a test's template hasn't been seeded.
                    if (!schema || schema.length === 0) {
                        const fallback = getTestSchema(test.name);
                        if (fallback) schema = fallback.rows as SchemaRow[];
                    }
                    setTestInfo({
                        id: test.id,
                        hasTemplate: !!test.resultTemplate || !!schema,
                        resultMode: (test.resultTemplate?.resultMode as any) || (schema ? 'table' : null),
                        schema,
                        unit: test.resultTemplate?.resultUnit ?? test.unit ?? null,
                        normalMin: test.resultTemplate?.normalRangeMin ?? null,
                        normalMax: test.resultTemplate?.normalRangeMax ?? null,
                        criticalMin: test.resultTemplate?.criticalRangeMin ?? null,
                        criticalMax: test.resultTemplate?.criticalRangeMax ?? null,
                        referenceRange: test.referenceRange ?? null,
                    });
                    // Only init from schema if rows are completely empty AND we haven't already
                    // hydrated from saved data. The ref guard prevents the schema-init from
                    // overwriting rows that fetchOrder just populated.
                    if (!rowsInitializedRef.current && schema && (test.resultTemplate?.resultMode === 'table' || test.resultTemplate?.resultMode === 'qualitative' || schema) && rows.length === 0) {
                        setRows(schema.map((r) => ({
                            section: r.section,
                            investigation: r.investigation,
                            unit: r.unit,
                            // Compute a display string for the Normal Range column.
                            // Prefer the schema's `normalRange` (e.g. "12 - 17 g/dL"),
                            // fall back to formatting from min/max so the column
                            // is never empty when ranges are known.
                            normalRange: r.normalRange || formatRange(r.normalMin, r.normalMax),
                            normalMin: r.normalMin,
                            normalMax: r.normalMax,
                            criticalMin: r.criticalMin,
                            criticalMax: r.criticalMax,
                            isSection: !!(r.section && !r.investigation),
                            result: '',
                        })));
                        rowsInitializedRef.current = true;
                    }
                }
            } catch (err) {
                console.error('Failed to look up test', err);
            }
        };
        lookupTest();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order?.testName]);

    // Debounced render when result or rows change
    // CRITICAL: doRender must NOT write to `rows` (the editable state) or
    // `formData.resultFlags` (anything that flows back into the effect deps).
    // Doing so creates a render → effect → render loop at the debounce rate.
    // Per-row flags from the server go to `renderedRows` (separate state).
    const doRender = useCallback(async (resultValue: string, resultRows: ResultRow[]) => {
        if (!testInfo?.id || !order) return;
        setRendering(true);
        try {
            const isTableMode = testInfo.resultMode === 'table' || testInfo.resultMode === 'qualitative';
            const body: any = {
                labTestId: testInfo.id,
                labOrderId: order.id,
                result: resultValue,
            };
            if (isTableMode) {
                body.rows = resultRows;
            }
            const res = await fetch('/api/lab/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const data = await res.json();
                setRenderedHtml(data.html);
                setRenderedFlag(data.flag as ResultFlag);
                setRenderedRange(data.normalRange);
                // Per-row flags live in `renderedRows` only — NOT `rows`.
                // The display layer prefers `renderedRows[i]?.flag` so the
                // user sees the server-refined value, falling back to the
                // locally-computed value when the server hasn't responded yet.
                setRenderedRows(Array.isArray(data.rows) ? data.rows : []);
            }
        } catch (err) {
            console.error('Render failed', err);
        } finally {
            setRendering(false);
        }
    }, [testInfo?.id, testInfo?.resultMode, order?.id]);

    useEffect(() => {
        if (!testInfo?.hasTemplate) return;
        if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
        renderTimerRef.current = setTimeout(() => {
            doRender(formData.result, rows);
        }, 400);
        return () => clearTimeout(renderTimerRef.current);
        // Intentionally do NOT include `doRender` in deps — it's stable as
        // long as testInfo.id / resultMode / order.id are stable, and
        // including it triggers a re-render storm when doRender's body
        // updates any state we read here.
    }, [formData.result, rows, testInfo?.hasTemplate, testInfo?.id, testInfo?.resultMode, order?.id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const submissionData: any = { ...formData, status: "Completed" };
            if (testInfo?.resultMode === 'table' || testInfo?.resultMode === 'qualitative') {
                submissionData.resultRows = rows;
            }

            const res = await fetch(`/api/lab/orders/${params.id}`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(submissionData)
            });

            if (res.ok) {
                if (testInfo?.hasTemplate) {
                    await doRender(formData.result, rows);
                    setView('render');
                }
                setTimeout(() => {
                    router.push("/dashboard/lab");
                    router.refresh();
                }, 1500);
            } else {
                const err = await res.json();
                alert(`Failed to publish results: ${err.error || "Unknown error"}`);
            }
        } catch (err) {
            alert("Error saving lab results");
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
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lab Report - ${order?.testName || ''}</title>
            <style>
                @page { size: A4; margin: 10mm; }
                body { font-family: 'Times New Roman', Georgia, serif; margin: 0; padding: 0; color: #000; }
                @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            </style>
            </head><body>${renderedHtml}</body></html>`;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 300);
    };

    /**
     * Parse a stored resultSchema string (from the API) back into a SchemaRow array.
     * Falls back to an empty array if parsing fails.
     */
    const parseSchemaString = (raw: string | null | undefined): SchemaRow[] => {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    /**
     * Merge saved rows with the template schema. Saved rows carry the user-entered
     * `result` (and `flag`) but the schema carries the numeric ranges and the section
     * headers. The merged result has all rows from the schema, with user values
     * overlaid where they exist.
     */
    const mergeRowsWithSchema = (saved: any[], schema: SchemaRow[]): ResultRow[] => {
        if (schema.length === 0) return saved;
        // Index saved rows by their investigation name (sections have no investigation)
        const byName = new Map<string, any>();
        for (const r of saved) {
            if (r.investigation) byName.set(String(r.investigation), r);
        }
        return schema.map((s) => {
            const isSection = !!(s.section && !s.investigation);
            const savedRow = !isSection ? byName.get(s.investigation) : null;
            return {
                section: s.section,
                investigation: s.investigation,
                result: savedRow?.result ?? '',
                unit: s.unit,
                // Compute the display string from min/max when the schema
                // doesn't already include a human-readable normalRange.
                normalRange: s.normalRange || formatRange(s.normalMin, s.normalMax),
                normalMin: s.normalMin,
                normalMax: s.normalMax,
                criticalMin: s.criticalMin,
                criticalMax: s.criticalMax,
                flag: savedRow?.flag || '',
                flag_label: savedRow?.flag_label || '',
                comment: savedRow?.comment,
                isSection,
            };
        });
    };

    const updateRow = (idx: number, patch: Partial<ResultRow>) => {
        setRows((prev) => prev.map((r, i) => {
            if (i !== idx) return r;
            const merged = { ...r, ...patch };
            // Re-compute the flag instantly from the new result (no server roundtrip).
            // The server-side render in doRender() will refine this when the debounce fires.
            if (!merged.isSection) {
                const flag = computeRowFlag(
                    merged.result,
                    merged.normalMin ?? null,
                    merged.normalMax ?? null,
                    merged.criticalMin ?? null,
                    merged.criticalMax ?? null,
                );
                merged.flag = flag;
                merged.flag_label = flag ? FLAG_LABELS[flag] : '';
            }
            return merged;
        }));
    };

    if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading order details...</div>;
    if (!order) return <div style={{ padding: "2rem", textAlign: "center" }}>Lab Order not found.</div>;

    const getPriorityColor = (priority: string) => {
        if (priority === 'Emergency' || priority === 'STAT') return 'var(--danger-color)';
        if (priority === 'Urgent') return 'var(--warning-color)';
        return 'var(--primary-color)';
    };

    const flagColor = FLAG_COLORS[renderedFlag];
    const isTableMode = testInfo?.resultMode === 'table';
    const isQualitativeMode = testInfo?.resultMode === 'qualitative';

    return (
        <div className="container" style={{ maxWidth: "1100px", margin: "0 auto" }}>
            <style>{`
                @media print {
                    body { background: white !important; }
                    .no-print { display: none !important; }
                }
            `}</style>

            <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }} className="no-print">
                <Link href="/dashboard/lab" style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    <ArrowLeft size={16} /> Back to Lab Dashboard
                </Link>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    {testInfo?.hasTemplate && (formData.result || rows.some((r) => r.result) || view === 'render') && (
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

            <div className={`glass-card ${styles.formCard}`}>
                <div className={styles.patientHeader} style={{ background: "rgba(99, 102, 241, 0.05)", borderBottom: "1px solid rgba(99, 102, 241, 0.1)" }}>
                    <div className={styles.patientInfo}>
                        <h2>{order.testName}</h2>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.875rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: 'wrap' }}>
                            <Activity size={14} /> Category: {order.testCategory}
                            {testInfo?.hasTemplate && (
                                <span style={{ marginLeft: '0.5rem', padding: '0.15rem 0.5rem', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: '999px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <FileText size={11} /> {isTableMode ? 'GMC Table Template' : isQualitativeMode ? 'GMC Qualitative Template' : 'GMC Template'}
                                </span>
                            )}
                        </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Requested By</div>
                        <div style={{ fontWeight: 700 }}>Dr. {order.doctor?.name}</div>
                    </div>
                </div>

                {/* Patient details banner */}
                <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", margin: "0 1.5rem 1.5rem" }} className="no-print">
                    <h3 style={{ fontSize: "0.875rem", textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "1px", marginBottom: "1rem" }}>Patient Details</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Name</div>
                            <div style={{ fontWeight: 600 }}>{order.patient.firstName} {order.patient.lastName}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Patient ID</div>
                            <div style={{ fontWeight: 600 }}>{order.patient.patientNumber}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Gender & Age</div>
                            <div style={{ fontWeight: 600 }}>{order.patient.gender}, {new Date().getFullYear() - new Date(order.patient.dateOfBirth).getFullYear()} yrs</div>
                        </div>
                        <div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Linked Visit</div>
                            <div style={{ fontWeight: 600, color: "var(--primary-color)" }}>{order.visit?.visitNumber}</div>
                        </div>
                    </div>
                    {order.specialInstructions && (
                        <div style={{ marginTop: "1.5rem", padding: "1rem", background: "rgba(239, 68, 68, 0.05)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--danger-color)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--danger-color)", fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                                <AlertCircle size={16} /> Clinical Instructions
                            </div>
                            <div style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{order.specialInstructions}</div>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="no-print">
                    {formData.status === 'Completed' && (
                        <div style={{ margin: '0 1.5rem 1rem', padding: '0.75rem 1rem', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success-color)', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                            <CheckCircle size={16} /> <strong>Result published.</strong> You can edit and re-save if a correction is needed. Use "Report Preview" to see the formatted report.
                        </div>
                    )}

                    {/* Single-mode input (GMC template-aware) */}
                    {(!isTableMode && !isQualitativeMode) || (rows.length === 0 && testInfo?.hasTemplate) && (
                        <SingleModeResultInput
                            result={formData.result}
                            onChange={(v) => setFormData({ ...formData, result: v })}
                            testInfo={testInfo}
                            testName={order.testName}
                            categoryName={order.testCategory}
                            orderReferenceRange={order.referenceRange}
                            orderUnit={order.unit}
                            isRequired={formData.status === "Completed"}
                        />
                    )}

                    {/* Empty-state hint when a table/qualitative template has no schema */}
                    {(isTableMode || isQualitativeMode) && rows.length === 0 && !testInfo?.hasTemplate && (
                        <div style={{ margin: "0 1.5rem 1.5rem", padding: "1rem 1.25rem", background: "rgba(245, 158, 11, 0.08)", color: "var(--warning-color, #b45309)", borderRadius: "var(--radius-sm, 8px)", border: "1px solid rgba(245, 158, 11, 0.25)", fontSize: "0.875rem" }}>
                            <strong>No result schema for this {isQualitativeMode ? "qualitative" : "table-mode"} template.</strong>
                            {" "}Enter the result in the field below. The template's HTML will still render in the report preview.
                        </div>
                    )}

                    {/* Table-mode input (FBC, LFT, Urinalysis, etc.) */}
                    {(isTableMode || isQualitativeMode) && rows.length > 0 && (
                        <div style={{ padding: "0 1.5rem 1.5rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: 'center', marginBottom: '0.75rem' }}>
                                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <FileText size={16} /> Investigation Results
                                </label>
                                {renderedFlag && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {rendering && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
                                        <div style={{ padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, background: flagColor.bg, color: flagColor.text, border: `1px solid ${flagColor.border}` }}>
                                            Overall: {renderedFlag} · {FLAG_LABELS[renderedFlag]}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div style={{ background: 'white', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(99, 102, 241, 0.08)' }}>
                                            <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', width: '30%' }}>Investigation</th>
                                            <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', width: '20%' }}>Result</th>
                                            {isTableMode && <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', width: '8%' }}>Unit</th>}
                                            {isTableMode && <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', width: '20%' }}>Normal Range</th>}
                                            {isTableMode && <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', width: '14%' }}>Flag</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r, i) => {
                                            if (r.isSection) {
                                                return (
                                                    <tr key={i} style={{ background: 'rgba(99, 102, 241, 0.05)' }}>
                                                        <td colSpan={isTableMode ? 5 : 2} style={{ padding: '0.5rem 0.75rem', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--primary-color)' }}>
                                                            {r.section || r.investigation}
                                                        </td>
                                                    </tr>
                                                );
                                            }
                                            // Prefer the server-refined flag from renderedRows
                                            // (more authoritative — uses the template's
                                            // stored normalRange/criticalRange). Fall back
                                            // to the locally-computed flag in r.flag.
                                            const serverRow = renderedRows[i];
                                            const rFlag = (serverRow?.flag || r.flag) as ResultFlag;
                                            const rFlagColor = rFlag ? FLAG_COLORS[rFlag] : null;
                                            const isAbnormal = rFlag && rFlag !== 'N' && rFlag !== '';
                                            // The "Normal Range" column: prefer the
                                            // rendered string from the server, then the
                                            // row's normalRange, then format from
                                            // normalMin/Max so something is always shown.
                                            const renderedRange = (serverRow as any)?.normal_range;
                                            const displayRange = renderedRange || r.normalRange || formatRange(r.normalMin, r.normalMax);
                                            // Row tint: subtle background for abnormal values
                                            const rowBg = isAbnormal && rFlagColor
                                                ? (rFlag === 'HH' || rFlag === 'LL' ? 'rgba(220, 38, 38, 0.06)' : 'rgba(245, 158, 11, 0.06)')
                                                : 'transparent';
                                            const arrowForFlag = (f: ResultFlag) => {
                                                if (f === 'H' || f === 'HH') return f === 'HH' ? '↑↑↑' : '↑';
                                                if (f === 'L' || f === 'LL') return f === 'LL' ? '↓↓↓' : '↓';
                                                return '';
                                            };
                                            return (
                                                <tr key={i} style={{ borderTop: '1px solid #e5e7eb', background: rowBg, borderLeft: isAbnormal ? `3px solid ${rFlagColor?.border || '#dc2626'}` : '3px solid transparent' }}>
                                                    <td style={{ padding: '0.4rem 0.75rem', fontWeight: 500 }}>
                                                        {r.investigation}
                                                    </td>
                                                    <td style={{ padding: '0.4rem 0.5rem' }}>
                                                        <input
                                                            type="text"
                                                            value={r.result || ''}
                                                            onChange={(e) => updateRow(i, { result: e.target.value })}
                                                            placeholder="—"
                                                            style={{
                                                                width: '100%',
                                                                padding: '0.4rem 0.6rem',
                                                                border: isAbnormal ? `1px solid ${rFlagColor?.border}` : '1px solid var(--border-color)',
                                                                borderRadius: '6px',
                                                                fontSize: '0.85rem',
                                                                fontWeight: isAbnormal ? 700 : 500,
                                                                color: isAbnormal ? (rFlagColor?.text || '#dc2626') : 'inherit',
                                                                background: isAbnormal ? (rFlagColor?.bg || 'rgba(220, 38, 38, 0.08)') : 'transparent',
                                                            }}
                                                        />
                                                    </td>
                                                    {isTableMode && <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.unit || '—'}</td>}
                                                    {isTableMode && <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{displayRange || '—'}</td>}
                                                    {isTableMode && (
                                                        <td style={{ padding: '0.4rem 0.4rem', textAlign: 'center' }}>
                                                            {rFlag && rFlagColor ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                                    <span
                                                                        title={FLAG_LABELS[rFlag]}
                                                                        style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            minWidth: '38px',
                                                                            height: '26px',
                                                                            padding: '0 0.5rem',
                                                                            borderRadius: '6px',
                                                                            fontSize: '0.78rem',
                                                                            fontWeight: 800,
                                                                            letterSpacing: '0.5px',
                                                                            background: rFlagColor.bg,
                                                                            color: rFlagColor.text,
                                                                            border: `1.5px solid ${rFlagColor.border}`,
                                                                        }}
                                                                    >
                                                                        {rFlag}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: rFlagColor.text, letterSpacing: '0.2px' }}>
                                                                        {arrowForFlag(rFlag)} {FLAG_LABELS[rFlag]?.split(' ')[0]}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                r.result ? (
                                                                    <span title={FLAG_LABELS.N} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '38px', height: '26px', padding: '0 0.5rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.5px', background: FLAG_COLORS.N.bg, color: FLAG_COLORS.N.text, border: `1.5px solid ${FLAG_COLORS.N.border}` }}>
                                                                        N
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>—</span>
                                                                )
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

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
                                background: formData.status === "Completed" ? "var(--success-color)" : "var(--primary-color)",
                                color: "white",
                                border: "none",
                                borderRadius: "var(--radius-md)",
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                cursor: "pointer",
                            }}
                        >
                            <Save size={18} />
                            {submitting ? "Saving..." : (formData.status === "Completed" ? (order?.result || rows.some(r => r.result) ? "Update Published Result" : "Publish Results") : "Save Update")}
                        </button>
                    </div>
                </form>

                {/* Read-only print view for completed orders */}
                {formData.status === "Completed" && !submitting && view === 'render' && renderedHtml && (
                    <div style={{ padding: "1.5rem", borderTop: "1px solid var(--border-color)" }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Final Report</h3>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={() => setView('edit')} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Edit3 size={14} /> Edit
                                </button>
                                <button onClick={handlePrint} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
