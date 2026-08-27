import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { renderRadiologyReport } from '@/lib/radiology-templates';

/**
 * POST /api/radiology/orders/[id]/pdf
 *
 * Server-side PDF generation for a radiology report. Replaces the old
 * client-side `window.open → document.write → printWindow.print()` flow.
 * We now render the HTML on the server and hand it to the headless-Chromium
 * sidecar (services/pdf/) with `displayHeaderFooter: false`, so the printed
 * report is the report and nothing else.
 *
 * Returns: application/pdf (binary)
 */
export async function POST(
    _request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // 1. Look up the order with patient / visit / doctor.
        const order = await prisma.radiologyOrder.findUnique({
            where: { id: params.id },
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true, dateOfBirth: true, gender: true, phone: true } },
                visit: { select: { visitNumber: true } },
                doctor: { select: { name: true } },
            },
        });
        if (!order) return NextResponse.json({ error: 'Radiology order not found' }, { status: 404 });

        // 2. Find the catalog exam by name. RadiologyOrder.examName is a string,
        //    not a FK.
        const exam = await prisma.radiologyCatalog.findFirst({
            where: { name: order.examName },
            include: {
                category: { select: { name: true } },
                resultTemplate: true,
            },
        });
        if (!exam) return NextResponse.json({ error: 'Radiology exam not found in catalog' }, { status: 404 });

        const [template, tenant] = await Promise.all([
            prisma.radiologyResultTemplate.findUnique({
                where: { radiologyCatalogId: exam.id },
            }),
            prisma.tenant.findFirst({
                select: {
                    name: true, address: true, city: true, region: true,
                    phone: true, email: true, taxId: true, registrationNumber: true,
                    logoUrl: true, reportFont: true,
                },
            }),
        ]);
        const tpl = template || exam.resultTemplate;
        if (!tpl) return NextResponse.json({ error: 'No template defined for this exam' }, { status: 404 });

        // 3. Patient context.
        const patient = order.patient;
        const age = patient?.dateOfBirth
            ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : '';
        const patientBarcode = patient?.patientNumber ? `*${patient.patientNumber}*` : '';
        const modality = order.modality || exam.category?.name || 'Imaging';

        // 4. Clinic identity — same pattern as lab.
        const clinicAddress = [tenant?.address, tenant?.city, tenant?.region].filter(Boolean).join(', ');
        const clinicRegulatoryText = tenant?.registrationNumber
            ? `Reg. No: ${tenant.registrationNumber}${tenant?.taxId ? `  ·  TIN: ${tenant.taxId}` : ''}`
            : (tenant?.taxId ? `TIN: ${tenant.taxId}` : '');
        const clinicSubheader = [
            clinicAddress,
            tenant?.phone ? `Tel: ${tenant.phone}` : '',
            tenant?.taxId ? `TIN: ${tenant.taxId}` : '',
        ].filter(Boolean).join(' · ');

        // 5. Build the render context. Pulls technique/findings/impression/etc.
        //    from the saved order, falling back to request-body overrides
        //    (none in this flow, since the order is the source of truth).
        const ctx = {
            exam_name: exam.name,
            modality,
            category: exam.category?.name || '',
            clinical_notes: order.clinicalNotes || '',
            technique: order.technique || '',
            findings: order.findings || '',
            impression: order.impression || '',
            recommendations: order.recommendations || '',
            patient_name: patient ? `${patient.firstName} ${patient.lastName}` : '',
            patient_number: patient?.patientNumber || '',
            patient_age: age ? `${age} yrs` : '',
            patient_gender: patient?.gender || '',
            patient_phone: patient?.phone || '',
            doctor_name: order.doctor?.name || '',
            radiologist: (session as any)?.user?.name || '',
            collected_at: order.createdAt ? new Date(order.createdAt).toLocaleString() : '',
            reported_at: new Date().toLocaleString(),
            notes: 'Cash',
            visit_number: order.visit?.visitNumber || '',
            clinic_name: tenant?.name || '',
            clinic_address: clinicAddress,
            clinic_phone: tenant?.phone || '',
            clinic_email: tenant?.email || '',
            clinic_logo: tenant?.logoUrl
                ? `<img src="${tenant.logoUrl}" alt="${tenant.name || ''}" style="max-height: 60px;" />`
                : '',
            clinic_subheader: clinicSubheader,
            clinic_tin: tenant?.taxId || '',
            clinic_license: tenant?.registrationNumber || '',
            clinic_regulatory_text: clinicRegulatoryText,
            report_font: tenant?.reportFont || '',
            report_id: `RPT-${order.id.slice(-8).toUpperCase()}`,
            barcode: patientBarcode,
        };

        // 6. Render the report HTML using the shared radiology-templates utility.
        const rendered = renderRadiologyReport({
            headerHtml: tpl.headerHtml,
            templateHtml: tpl.templateHtml ?? '',
            footerHtml: tpl.footerHtml,
            ctx,
        });

        // 7. Wrap in a complete HTML document. Puppeteer needs a real <html>
        //    element so the @page CSS rules apply.
        const documentHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Radiology Report - ${escapeHtml(exam.name)}</title>
<style>
    @page { size: A4; margin: 10mm; }
    body { margin: 0; padding: 0; background: white; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>${rendered.html}</body>
</html>`;

        // 8. Hand the HTML to the pdf sidecar. The sidecar forces
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

        // 9. Stream the PDF back. Browsers render application/pdf inline in a
        //    new tab or trigger a download depending on the headers + user
        //    settings.
        const filename = `radiology-report-${order.id.slice(-8)}-${sanitizeFilename(exam.name)}.pdf`;
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
        console.error('radiology pdf error:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate PDF' }, { status: 500 });
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

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
