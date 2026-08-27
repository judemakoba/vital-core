import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { renderRadiologyReport } from '@/lib/radiology-templates';

/**
 * POST /api/radiology/render
 *
 * Renders a Radiology report (header + body + footer) into HTML + plain text.
 * The clinic name/address/phone/regulatory text are pulled from the Tenant
 * row (i.e. Admin → Clinic/Hospital Settings) — no hardcoded clinic strings
 * live in this route.
 *
 * Body: {
 *   radiologyCatalogId: string,        // exam to look up
 *   orderId?: string,                  // pull patient/visit/doctor context
 *   technique?, findings?, impression?, recommendations?,
 *   clinicalNotes?, modality?,
 *   overrideHeaderHtml?, overrideTemplateHtml?, overrideFooterHtml?,
 *   classLabel?, reportId?
 * }
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const {
            radiologyCatalogId,
            orderId,
            technique,
            findings,
            impression,
            recommendations,
            clinicalNotes,
            modality: inputModality,
            overrideHeaderHtml,
            overrideTemplateHtml,
            overrideFooterHtml,
            classLabel,
            reportId,
        } = body;

        if (!radiologyCatalogId) {
            return NextResponse.json({ error: 'radiologyCatalogId is required' }, { status: 400 });
        }

        const [exam, template, order, tenant] = await Promise.all([
            prisma.radiologyCatalog.findUnique({
                where: { id: radiologyCatalogId },
                include: { category: { select: { name: true } }, resultTemplate: true },
            }),
            prisma.radiologyResultTemplate.findUnique({ where: { radiologyCatalogId } }),
            orderId
                ? prisma.radiologyOrder.findUnique({
                      where: { id: orderId },
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

        if (!exam) return NextResponse.json({ error: 'Radiology exam not found' }, { status: 404 });

        const tpl = template || exam.resultTemplate;
        if (!tpl && !overrideTemplateHtml) {
            return NextResponse.json({ error: 'No template defined for this exam' }, { status: 404 });
        }

        // Patient context
        const patient = order?.patient;
        const age = patient?.dateOfBirth
            ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : '';
        const patientBarcode = patient?.patientNumber ? `*${patient.patientNumber}*` : '';

        // Modality falls back to category name (e.g. "X-Ray", "Ultrasound", "CT Scan", "MRI")
        const modality = inputModality || order?.modality || exam.category?.name || 'Imaging';

        // Build clinic identity from the Tenant row (or fall back gracefully).
        // The radiology report header/footer pulls {{clinic_name}}/{{clinic_address}}/
        // {{clinic_phone}}/{{clinic_logo}}/{{clinic_tin}}/{{clinic_license}}/
        // {{clinic_regulatory_text}} from this — there's no hardcoded "Vital Core
        // Hospital" anywhere in the route anymore.
        const clinicAddress = [tenant?.address, tenant?.city, tenant?.region]
            .filter(Boolean)
            .join(', ');
        const clinicRegulatoryText = tenant?.registrationNumber
            ? `Reg. No: ${tenant.registrationNumber}${tenant?.taxId ? `  ·  TIN: ${tenant.taxId}` : ''}`
            : (tenant?.taxId ? `TIN: ${tenant.taxId}` : '');
        // Letterhead subheader: "Address · Tel: … · TIN: …" (omits empty parts).
        const clinicSubheader = [
            clinicAddress,
            tenant?.phone ? `Tel: ${tenant.phone}` : "",
            tenant?.taxId ? `TIN: ${tenant.taxId}` : "",
        ].filter(Boolean).join(" · ");

        const ctx = {
            exam_name: exam.name,
            modality,
            category: exam.category?.name || '',
            clinical_notes: clinicalNotes ?? order?.clinicalNotes ?? '',
            technique: technique ?? order?.technique ?? '',
            findings: findings ?? order?.findings ?? '',
            impression: impression ?? order?.impression ?? '',
            recommendations: recommendations ?? order?.recommendations ?? '',
            patient_name: patient ? `${patient.firstName} ${patient.lastName}` : '',
            patient_number: patient?.patientNumber || '',
            patient_age: age ? `${age} yrs` : '',
            patient_gender: patient?.gender || '',
            patient_phone: patient?.phone || '',
            doctor_name: order?.doctor?.name || '',
            radiologist: (session as any)?.user?.name || '',
            collected_at: order?.createdAt ? new Date(order.createdAt).toLocaleString() : '',
            reported_at: new Date().toLocaleString(),
            notes: classLabel || 'Cash',
            visit_number: order?.visit?.visitNumber || '',
            clinic_name: tenant?.name || '',
            clinic_address: clinicAddress,
            clinic_phone: tenant?.phone || '',
            clinic_email: tenant?.email || '',
            // Match the lab: clinic_logo is the rendered <img> tag (so the
            // GMC_RAD_HEADER template can use {{clinic_logo}} directly).
            clinic_logo: tenant?.logoUrl
                ? `<img src="${tenant.logoUrl}" alt="${tenant.name}" style="max-height: 60px;" />`
                : '',
            clinic_subheader: clinicSubheader,
            clinic_tin: tenant?.taxId || '',
            clinic_license: tenant?.registrationNumber || '',
            clinic_regulatory_text: clinicRegulatoryText,
            report_font: tenant?.reportFont || '',
            report_id: reportId || `RAD-${Date.now().toString(36).toUpperCase()}`,
            barcode: patientBarcode,
            turnaround_time: exam.turnaroundTime || '',
            preparation_instructions: exam.preparationInstructions || '',
        };

        const rendered = renderRadiologyReport({
            headerHtml: overrideHeaderHtml ?? tpl?.headerHtml,
            templateHtml: overrideTemplateHtml ?? tpl?.templateHtml ?? '',
            footerHtml: overrideFooterHtml ?? tpl?.footerHtml,
            ctx,
        });

        return NextResponse.json({
            html: rendered.html,
            plain: rendered.plain,
            modality,
            category: exam.category?.name || '',
            template: tpl
                ? {
                      id: tpl.id,
                      templateName: tpl.templateName,
                      headerHtml: tpl.headerHtml,
                      templateHtml: tpl.templateHtml,
                      footerHtml: tpl.footerHtml,
                      isActive: tpl.isActive,
                  }
                : null,
        });
    } catch (error: any) {
        console.error('Radiology render error:', error);
        return NextResponse.json({ error: error.message || 'Failed to render template' }, { status: 500 });
    }
}
