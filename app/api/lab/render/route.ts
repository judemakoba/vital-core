import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { renderLabReport, computeRowFlag, ResultRowRender, getTestSchema, FLAG_LABELS, formatRange } from '@/lib/lab-templates';

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
 * POST /api/lab/render
 *
 * Renders a lab result report (header + table + footer) into HTML + plain text.
 * The clinic name/address/phone/regulatory text are pulled from the Tenant
 * row (i.e. Admin → Clinic/Hospital Settings) — no hardcoded clinic strings
 * live in this route.
 *
 * Body: {
 *   labTestId: string,
 *   labOrderId?: string,    // pull patient/visit context from this order
 *   result?: string|number, // single-mode raw result
 *   rows?: IncomingRow[],   // table-mode rows
 *   notes?: string,
 *   classLabel?: string,    // shown in GMC header (e.g. "Cash", "Insurance")
 *   reportId?: string,      // shown in GMC header
 *   overrideHeaderHtml?: string,
 *   overrideTemplateHtml?: string,
 *   overrideFooterHtml?: string,
 * }
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const {
            labTestId,
            labOrderId,
            result,
            rows: incomingRows,
            notes,
            classLabel,
            reportId,
            overrideHeaderHtml,
            overrideTemplateHtml,
            overrideFooterHtml,
        } = body;

        if (!labTestId) {
            return NextResponse.json({ error: 'labTestId is required' }, { status: 400 });
        }

        const [test, template, order, tenant] = await Promise.all([
            prisma.labTestCatalog.findUnique({
                where: { id: labTestId },
                include: {
                    category: { select: { name: true } },
                    resultTemplate: true,
                },
            }),
            prisma.labResultTemplate.findUnique({ where: { labTestId } }),
            labOrderId
                ? prisma.labOrder.findUnique({
                      where: { id: labOrderId },
                      include: {
                          patient: { select: { firstName: true, lastName: true, patientNumber: true, dateOfBirth: true, gender: true, phone: true } },
                          visit: { select: { visitNumber: true } },
                          doctor: { select: { name: true } },
                      },
                  })
                : Promise.resolve(null),
            // Clinic/Hospital identity — drives the report header/footer name,
            // address, phone, regulatory text. Falls back gracefully if no
            // tenant row exists (single-DB deploy, fresh install).
            prisma.tenant.findFirst({
                select: {
                    name: true,
                    address: true,
                    city: true,
                    region: true,
                    phone: true,
                    email: true,
                    taxId: true,
                    registrationNumber: true,
                    logoUrl: true,
                    reportFont: true,
                },
            }),
        ]);

        if (!test) return NextResponse.json({ error: 'Lab test not found' }, { status: 404 });

        const tpl = template || test.resultTemplate;
        if (!tpl && !overrideTemplateHtml) {
            return NextResponse.json({ error: 'No template defined for this test' }, { status: 404 });
        }

        // Decide result mode
        const resultMode: 'single' | 'table' | 'qualitative' =
            (tpl?.resultMode as any) ||
            (getTestSchema(test.name)?.mode) ||
            'single';

        // Build rows for table / qualitative modes
        let rows: ResultRowRender[] = [];

        // Helper: server-side merge of incoming rows with the template's resultSchema.
        // This guarantees the report always reflects the *current* template — even if
        // the saved data was captured against an older version of the schema (e.g.
        // before new sections like "Absolute Counts" were added to the FBC template).
        const mergeWithSchema = (incoming: IncomingRow[]): ResultRowRender[] => {
            // Try the template's stored schema first, then fall back to the in-code schema map
            let schemaRows: any[] | null = null;
            if (tpl?.resultSchema) {
                try {
                    const parsed = JSON.parse(tpl.resultSchema);
                    if (Array.isArray(parsed)) schemaRows = parsed;
                } catch { /* ignore */ }
            }
            if (!schemaRows) {
                const fallback = getTestSchema(test.name);
                if (fallback) schemaRows = fallback.rows as any[];
            }
            if (!schemaRows || schemaRows.length === 0) return incoming.map((r) => {
                // Compute the display string from min/max when not provided.
                const range = r.normalRange || formatRange(r.normalMin ?? null, r.normalMax ?? null);
                return {
                    section: r.section,
                    investigation: r.investigation,
                    result: r.result,
                    unit: r.unit,
                    normal_range: range,
                    flag: computeRowFlag(r.result, r.normalMin ?? null, r.normalMax ?? null, r.criticalMin ?? null, r.criticalMax ?? null),
                    flag_label: '',
                    comment: r.comment,
                    isSection: !r.investigation,
                };
            });

            // Index incoming by investigation name
            const byName = new Map<string, IncomingRow>();
            for (const r of incoming) {
                if (r.investigation) byName.set(String(r.investigation), r);
            }
            return schemaRows.map((s) => {
                const isSection = !!(s.section && !s.investigation);
                const inc = !isSection ? byName.get(s.investigation) : null;
                const result = inc?.result ?? '';
                // Prefer the incoming row's range, fall back to the schema's
                // stored string, then format from min/max so something is
                // always shown.
                const normalMin = inc?.normalMin ?? s.normalMin ?? null;
                const normalMax = inc?.normalMax ?? s.normalMax ?? null;
                const normalRange = inc?.normalRange ?? s.normalRange ?? formatRange(normalMin, normalMax);
                const flag = computeRowFlag(
                    result,
                    normalMin,
                    normalMax,
                    inc?.criticalMin ?? s.criticalMin ?? null,
                    inc?.criticalMax ?? s.criticalMax ?? null,
                );
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
        };

        if ((resultMode === 'table' || resultMode === 'qualitative') && Array.isArray(incomingRows) && incomingRows.length > 0) {
            // Server-side merge: the page may send rows captured against an older
            // schema. We always re-merge against the current template so the report
            // shows every section/investigation the template defines.
            rows = mergeWithSchema(incomingRows);
        } else if (resultMode === 'table' || resultMode === 'qualitative') {
            // No incoming rows yet — render an empty table from the schema
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

        // Patient context
        const patient = order?.patient;
        const age = patient?.dateOfBirth
            ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : '';
        const patientBarcode = patient?.patientNumber ? `*${patient.patientNumber}*` : '';

        // Build clinic identity from the Tenant row (or fall back gracefully).
        // The lab report header/footer pulls {{clinic_name}}/{{clinic_address}}/
        // {{clinic_phone}}/{{clinic_logo}}/{{clinic_tin}}/{{clinic_license}}/
        // {{clinic_regulatory_text}} from this — there's no hardcoded "Vital Core
        // Hospital" anywhere in the route anymore.
        const clinicAddress = [tenant?.address, tenant?.city, tenant?.region]
            .filter(Boolean)
            .join(', ');
        const clinicRegulatoryText = tenant?.registrationNumber
            ? `Reg. No: ${tenant.registrationNumber}${tenant?.taxId ? `  ·  TIN: ${tenant.taxId}` : ''}`
            : (tenant?.taxId ? `TIN: ${tenant.taxId}` : '');
        const ctx = {
            test_name: test.name,
            test_category: test.category?.name || '',
            result: result ?? '',
            unit: tpl?.resultUnit || test.unit || '',
            normal_range: '',
            patient_name: patient ? `${patient.firstName} ${patient.lastName}` : '',
            patient_number: patient?.patientNumber || '',
            patient_age: age,
            patient_gender: patient?.gender || '',
            patient_phone: patient?.phone || '',
            doctor_name: order?.doctor?.name || '',
            technician: (session as any)?.user?.name || '',
            collected_at: order?.createdAt ? new Date(order.createdAt).toLocaleString() : '',
            reported_at: new Date().toLocaleString(),
            notes: notes || classLabel || 'Cash',
            visit_number: order?.visit?.visitNumber || '',
            clinic_name: tenant?.name || '',
            clinic_address: clinicAddress,
            clinic_phone: tenant?.phone || '',
            clinic_email: tenant?.email || '',
            clinic_logo: tenant?.logoUrl || '',
            clinic_tin: tenant?.taxId || '',
            clinic_license: tenant?.registrationNumber || '',
            clinic_regulatory_text: clinicRegulatoryText,
            report_font: tenant?.reportFont || '',
            report_id: reportId || `RPT-${Date.now().toString(36).toUpperCase()}`,
            barcode: patientBarcode,
            rows,
        };

        const rendered = renderLabReport({
            headerHtml: overrideHeaderHtml ?? tpl?.headerHtml,
            templateHtml: overrideTemplateHtml ?? tpl?.templateHtml ?? '',
            footerHtml: overrideFooterHtml ?? tpl?.footerHtml,
            ctx,
            flagInputs: {
                normalRangeMin: tpl?.normalRangeMin ?? null,
                normalRangeMax: tpl?.normalRangeMax ?? null,
                criticalRangeMin: tpl?.criticalRangeMin ?? null,
                criticalRangeMax: tpl?.criticalRangeMax ?? null,
            },
        });

        // Compute overall flag from row flags (worst-case)
        let overallFlag: 'N' | 'H' | 'L' | 'HH' | 'LL' | '' = rendered.flag;
        if (rows.length > 0) {
            const flags = rows.map((r) => r.flag).filter((f) => f) as ('H' | 'L' | 'HH' | 'LL' | 'N')[];
            if (flags.includes('HH') || flags.includes('LL')) overallFlag = flags.includes('HH') ? 'HH' : 'LL';
            else if (flags.includes('H') || flags.includes('L')) overallFlag = flags.includes('H') ? 'H' : 'L';
            else if (flags.length > 0) overallFlag = 'N';
        }

        return NextResponse.json({
            flag: overallFlag,
            normalRange: rendered.normalRange,
            html: rendered.html,
            plain: rendered.plain,
            testName: test.name,
            unit: ctx.unit,
            referenceRange: test.referenceRange || '',
            resultMode,
            rows: rows.map((r) => ({
                ...r,
                flag: r.flag,
                flag_label: r.flag ? FLAG_LABELS[r.flag] : '',
            })),
            template: tpl
                ? {
                      id: tpl.id,
                      templateName: tpl.templateName,
                      resultMode: tpl.resultMode,
                      resultSchema: tpl.resultSchema,
                      normalRangeMin: tpl.normalRangeMin,
                      normalRangeMax: tpl.normalRangeMax,
                      criticalRangeMin: tpl.criticalRangeMin,
                      criticalRangeMax: tpl.criticalRangeMax,
                      resultUnit: tpl.resultUnit,
                  }
                : null,
        });
    } catch (error: any) {
        console.error('Template render error:', error);
        return NextResponse.json({ error: error.message || 'Failed to render template' }, { status: 500 });
    }
}
