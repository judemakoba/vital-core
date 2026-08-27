import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
    renderLabReport,
    computeRowFlag,
    ResultRowRender,
    getTestSchema,
    FLAG_LABELS,
    formatRange,
} from '@/lib/lab-templates';

interface IncomingRow {
    section?: string;
    investigation: string;
    result?: string | number | null;
    unit?: string;
    normalRange?: string;
    normalMin?: number;
    normalMax?: number;
    criticalMin?: number;
    criticalMax?: number;
    comment?: string;
}

/**
 * POST /api/lab/orders/[id]/pdf
 *
 * Server-side PDF generation for a lab report. Replaces the old client-side
 * `window.open → document.write → printWindow.print()` flow that left
 * Chrome's print-engine headers/footers (date, document title, "about:blank"
 * URL, page count) all over the report. We now render the HTML on the server
 * and hand it to a headless-Chromium sidecar (services/pdf/) with
 * `displayHeaderFooter: false`, so the printed report is the report and
 * nothing else.
 *
 * Returns: application/pdf (binary)
 */
export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // 1. Look up the order. LabOrder.testName is a string, not a FK, so we
        //    resolve the LabTestCatalog by name.
        const order = await prisma.labOrder.findUnique({
            where: { id: params.id },
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true, dateOfBirth: true, gender: true, phone: true } },
                visit: { select: { visitNumber: true } },
                doctor: { select: { name: true } },
            },
        });
        if (!order) return NextResponse.json({ error: 'Lab order not found' }, { status: 404 });

        const [test, template, tenant] = await Promise.all([
            prisma.labTestCatalog.findFirst({
                where: { name: order.testName },
                include: {
                    category: { select: { name: true } },
                    resultTemplate: true,
                },
            }),
            prisma.labResultTemplate.findFirst({
                where: { labTest: { name: order.testName } },
            }),
            prisma.tenant.findFirst({
                select: {
                    name: true, address: true, city: true, region: true,
                    phone: true, email: true, taxId: true, registrationNumber: true,
                    logoUrl: true, reportFont: true,
                },
            }),
        ]);
        if (!test) return NextResponse.json({ error: 'Lab test not found in catalog' }, { status: 404 });

        const tpl = template || test.resultTemplate;
        if (!tpl) return NextResponse.json({ error: 'No template defined for this test' }, { status: 404 });

        // 2. Result mode + saved rows. Mirrors /api/lab/render.
        const resultMode: 'single' | 'table' | 'qualitative' =
            (tpl.resultMode as any) ||
            (getTestSchema(test.name)?.mode) ||
            'single';

        // Re-merge saved rows against the current schema. The lab page may have
        // captured rows against an older schema (e.g. before "Absolute Counts"
        // was added to FBC); the merge guarantees the report always reflects
        // the current template, with the user's typed values overlaid.
        const savedRows: IncomingRow[] = safeParseRows(order.resultRows) || [];
        const result = order.result ?? null;

        let rows: ResultRowRender[] = [];
        if ((resultMode === 'table' || resultMode === 'qualitative') && savedRows.length > 0) {
            rows = mergeWithSchema(savedRows, tpl.resultSchema, test.name);
        } else if (resultMode === 'table' || resultMode === 'qualitative') {
            const schema = getTestSchema(test.name);
            if (schema) {
                rows = schema.rows.map((r) => ({
                    section: r.section,
                    investigation: r.investigation,
                    result: '',
                    unit: r.unit || '',
                    normal_range: r.normalRange || formatRange(r.normalMin ?? null, r.normalMax ?? null),
                    flag: '',
                    isSection: !!(r.section && !r.investigation),
                }));
            }
        }

        // Fallback: table-mode template with no rows AND a `result` string
        // (single-mode textarea fallback). Synthesize a single row so the
        // report shows the user's typed value instead of an empty table.
        if (
            (resultMode === 'table' || resultMode === 'qualitative') &&
            rows.length === 0 &&
            result != null &&
            String(result).trim() !== ''
        ) {
            rows = [{
                investigation: test.name,
                result: String(result),
                unit: '',
                normal_range: '',
                flag: '',
                flag_label: '',
                isSection: false,
            }];
        }

        // 3. Build the render context (same shape as /api/lab/render).
        const patient = order.patient;
        const age = patient?.dateOfBirth
            ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : '';
        const patientBarcode = patient?.patientNumber ? `*${patient.patientNumber}*` : '';
        const clinicAddress = [tenant?.address, tenant?.city, tenant?.region].filter(Boolean).join(', ');
        const clinicRegulatoryText = tenant?.registrationNumber
            ? `Reg. No: ${tenant.registrationNumber}${tenant?.taxId ? `  ·  TIN: ${tenant.taxId}` : ''}`
            : (tenant?.taxId ? `TIN: ${tenant.taxId}` : '');
        const clinicSubheader = [
            clinicAddress,
            tenant?.phone ? `Tel: ${tenant.phone}` : '',
            tenant?.taxId ? `TIN: ${tenant.taxId}` : '',
        ].filter(Boolean).join(' · ');

        const ctx = {
            test_name: test.name,
            test_category: test.category?.name || '',
            result: result ?? '',
            unit: tpl.resultUnit || test.unit || '',
            normal_range: '',
            patient_name: patient ? `${patient.firstName} ${patient.lastName}` : '',
            patient_number: patient?.patientNumber || '',
            patient_age: age,
            patient_gender: patient?.gender || '',
            patient_phone: patient?.phone || '',
            doctor_name: order.doctor?.name || '',
            technician: (session as any)?.user?.name || '',
            collected_at: order.createdAt ? new Date(order.createdAt).toLocaleString() : '',
            reported_at: new Date().toLocaleString(),
            notes: 'Cash',
            visit_number: order.visit?.visitNumber || '',
            clinic_name: tenant?.name || '',
            clinic_subheader: clinicSubheader,
            clinic_address: clinicAddress,
            clinic_phone: tenant?.phone || '',
            clinic_email: tenant?.email || '',
            clinic_logo: tenant?.logoUrl || '',
            clinic_tin: tenant?.taxId || '',
            clinic_license: tenant?.registrationNumber || '',
            clinic_regulatory_text: clinicRegulatoryText,
            report_font: tenant?.reportFont || '',
            report_id: `RPT-${order.id.slice(-8).toUpperCase()}`,
            barcode: patientBarcode,
            rows,
        };

        // 4. Render the report HTML using the shared lab-templates utility.
        const rendered = renderLabReport({
            headerHtml: tpl.headerHtml,
            templateHtml: tpl.templateHtml ?? '',
            footerHtml: tpl.footerHtml,
            ctx,
            flagInputs: {
                normalRangeMin: tpl.normalRangeMin ?? null,
                normalRangeMax: tpl.normalRangeMax ?? null,
                criticalRangeMin: tpl.criticalRangeMin ?? null,
                criticalRangeMax: tpl.criticalRangeMax ?? null,
            },
        });

        // 5. Wrap the rendered body in a complete HTML document. Puppeteer
        //    needs a real <html> element so the @page CSS rules apply.
        const documentHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Lab Report - ${escapeHtml(test.name)}</title>
<style>
    @page { size: A4; margin: 10mm; }
    body { margin: 0; padding: 0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>${rendered.html}</body>
</html>`;

        // 6. Hand the HTML to the pdf sidecar. The sidecar forces
        //    displayHeaderFooter: false, so all four circled items in the
        //    old print preview (date, document title, "about:blank" URL,
        //    "1/1" page count) are gone.
        const pdfServiceUrl = process.env.PDF_SERVICE_URL || 'http://pdf:3001';
        const pdfRes = await fetch(`${pdfServiceUrl}/render`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ html: documentHtml }),
        });
        if (!pdfRes.ok) {
            const errText = await pdfRes.text().catch(() => '');
            console.error('pdf service error:', pdfRes.status, errText);
            return NextResponse.json(
                { error: 'PDF service failed', status: pdfRes.status, body: errText },
                { status: 502 }
            );
        }
        const pdfBuffer = await pdfRes.arrayBuffer();

        // 7. Stream the PDF back to the client. The browser's default behavior
        //    for application/pdf is to open it in a new tab / trigger download.
        const filename = `lab-report-${order.id.slice(-8)}-${sanitizeFilename(test.name)}.pdf`;
        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Length': String(pdfBuffer.byteLength),
                'Content-Disposition': `inline; filename="${filename}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error: any) {
        console.error('lab pdf error:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate PDF' }, { status: 500 });
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function safeParseRows(s: string | null | undefined): IncomingRow[] | null {
    if (!s) return null;
    try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function mergeWithSchema(
    incoming: IncomingRow[],
    resultSchemaJson: string | null | undefined,
    testName: string
): ResultRowRender[] {
    let schemaRows: any[] | null = null;
    if (resultSchemaJson) {
        try {
            const parsed = JSON.parse(resultSchemaJson);
            if (Array.isArray(parsed)) schemaRows = parsed;
        } catch { /* ignore */ }
    }
    if (!schemaRows) {
        const fallback = getTestSchema(testName);
        if (fallback) schemaRows = fallback.rows as any[];
    }
    if (!schemaRows || schemaRows.length === 0) {
        return incoming.map((r) => ({
            section: r.section,
            investigation: r.investigation,
            result: r.result,
            unit: r.unit,
            normal_range: r.normalRange || formatRange(r.normalMin ?? null, r.normalMax ?? null),
            flag: computeRowFlag(r.result, r.normalMin ?? null, r.normalMax ?? null, r.criticalMin ?? null, r.criticalMax ?? null),
            flag_label: '',
            comment: r.comment,
            isSection: !r.investigation,
        }));
    }
    const byName = new Map<string, IncomingRow>();
    for (const r of incoming) if (r.investigation) byName.set(String(r.investigation), r);
    return schemaRows.map((s) => {
        const isSection = !!(s.section && !s.investigation);
        const inc = !isSection ? byName.get(s.investigation) : null;
        const result = inc?.result ?? '';
        const normalMin = inc?.normalMin ?? s.normalMin ?? null;
        const normalMax = inc?.normalMax ?? s.normalMax ?? null;
        const normalRange = inc?.normalRange ?? s.normalRange ?? formatRange(normalMin, normalMax);
        const flag = computeRowFlag(result, normalMin, normalMax, inc?.criticalMin ?? s.criticalMin ?? null, inc?.criticalMax ?? s.criticalMax ?? null);
        return {
            section: s.section,
            investigation: s.investigation,
            result,
            unit: inc?.unit ?? s.unit,
            normal_range: normalRange,
            flag,
            flag_label: flag ? FLAG_LABELS[flag] : '',
            comment: inc?.comment,
            isSection,
        };
    });
}

function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeFilename(s: string): string {
    return s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';
}
