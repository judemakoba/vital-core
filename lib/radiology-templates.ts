/**
 * GMC Victoria Hospital-style Radiology report template engine.
 *
 * Mirrors lib/lab-templates.ts in structure: GMC_HEADER_HTML + per-modality body +
 * GMC_FOOTER_HTML, all combined via renderTemplate().
 *
 * Per-tenant header/footer via `radiology.defaultTemplateHeader` /
 * `radiology.defaultTemplateFooter` settings. Fall back to GMC_RAD_* if empty.
 *
 * Placeholders used in the body template:
 *   {{exam_name}}, {{modality}}, {{category}}, {{clinical_notes}}, {{priority}},
 *   {{technique}}, {{findings}}, {{impression}}, {{recommendations}},
 *   {{patient_name}}, {{patient_number}}, {{patient_age}}, {{patient_gender}},
 *   {{patient_phone}}, {{doctor_name}}, {{radiologist}}, {{collected_at}},
 *   {{reported_at}}, {{visit_number}}, {{clinic_name}}, {{report_id}},
 *   {{barcode}}, {{turnaround_time}}, {{preparation_instructions}}
 */
import { getSetting } from "./settings/store";

/** Resolve the per-tenant radiology header (custom if set, else GMC default). */
export async function resolveRadHeader(): Promise<string> {
    const custom = await getSetting<string>("radiology.defaultTemplateHeader", "");
    return custom || GMC_RAD_HEADER_HTML;
}

/** Resolve the per-tenant radiology footer (custom if set, else GMC default). */
export async function resolveRadFooter(): Promise<string> {
    const custom = await getSetting<string>("radiology.defaultTemplateFooter", "");
    return custom || GMC_RAD_FOOTER_HTML;
}

/** GMC-style patient demographic header. Same 3-column label-value-label-value
 * layout as the lab report (no barcode column) so both reports look like
 * siblings of the same letterhead family. */
export const GMC_RAD_HEADER_HTML = `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: 0 auto; color: #000;">
  {{#if clinic_logo}}<div style="text-align: center; margin-bottom: 4px;">{{clinic_logo}}</div>{{/if}}
  <h1 style="text-align: center; margin: 0; font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">{{clinic_name}}</h1>
  {{#if clinic_subheader}}<p style="text-align: center; margin: 4px 0 0; font-size: 12px; color: #555;">{{clinic_subheader}}</p>{{/if}}
  {{#if clinic_email}}<p style="text-align: center; margin: 2px 0 0; font-size: 12px; color: #555;">{{clinic_email}}</p>{{/if}}
  {{#if clinic_regulatory_text}}<p style="text-align: center; margin: 2px 0 8px; font-size: 11px; color: #888;">{{clinic_regulatory_text}}</p>{{/if}}
  <h2 style="text-align: center; margin: 16px 0 12px; font-size: 16px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700;">Radiology Report</h2>
  <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-size: 12px; margin-bottom: 12px;">
    <tr>
      <td style="border: 1px solid #000; padding: 4px 8px; width: 25%; font-weight: 700; background: #f4f4f4;">Patient Name</td>
      <td style="border: 1px solid #000; padding: 4px 8px; width: 25%;">{{patient_name}}</td>
      <td style="border: 1px solid #000; padding: 4px 8px; width: 25%; font-weight: 700; background: #f4f4f4;">Patient #</td>
      <td style="border: 1px solid #000; padding: 4px 8px; width: 25%;">{{patient_number}}</td>
    </tr>
    <tr>
      <td style="border: 1px solid #000; padding: 4px 8px; font-weight: 700; background: #f4f4f4;">Age / Sex</td>
      <td style="border: 1px solid #000; padding: 4px 8px;">{{patient_age}} / {{patient_gender}}</td>
      <td style="border: 1px solid #000; padding: 4px 8px; font-weight: 700; background: #f4f4f4;">Visit #</td>
      <td style="border: 1px solid #000; padding: 4px 8px;">{{visit_number}}</td>
    </tr>
    <tr>
      <td style="border: 1px solid #000; padding: 4px 8px; font-weight: 700; background: #f4f4f4;">Referred By</td>
      <td style="border: 1px solid #000; padding: 4px 8px;">{{doctor_name}}</td>
      <td style="border: 1px solid #000; padding: 4px 8px; font-weight: 700; background: #f4f4f4;">Reported</td>
      <td style="border: 1px solid #000; padding: 4px 8px;">{{reported_at}}</td>
    </tr>
    <tr>
      <td style="border: 1px solid #000; padding: 4px 8px; font-weight: 700; background: #f4f4f4;">Exam</td>
      <td colspan="3" style="border: 1px solid #000; padding: 4px 8px; font-weight: 600;">{{exam_name}}</td>
    </tr>
  </table>
</div>
`.trim();

/** GMC-style standard Radiology report body. Same bordered table layout as
 * the lab's results table — label cells with light-gray background, value
 * cells with the report content. No min-height rows (the previous version
 * had min-heights that pushed the report over one printed page). */
export function gmcRadiologyBody(examName: string, modality: string, category: string): string {
    return `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: 0 auto; color: #000;">
  <h3 style="text-align: center; margin: 0 0 8px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; color: #1e3a8a; letter-spacing: 1px;">${escapeHtml(modality || category || 'Imaging')} — ${escapeHtml(examName)}</h3>

  <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 0;">
    {{#if clinical_notes}}
    <tr>
      <td style="border: 1px solid #000; padding: 4px 8px; width: 25%; font-weight: 700; background: #f4f4f4; vertical-align: top;">Clinical Notes</td>
      <td style="border: 1px solid #000; padding: 4px 8px; white-space: pre-wrap;">{{clinical_notes}}</td>
    </tr>
    {{/if}}
    <tr>
      <td style="border: 1px solid #000; padding: 4px 8px; font-weight: 700; background: #f4f4f4; vertical-align: top;">Technique</td>
      <td style="border: 1px solid #000; padding: 4px 8px; white-space: pre-wrap; line-height: 1.5;">{{technique}}</td>
    </tr>
    <tr>
      <td style="border: 1px solid #000; padding: 4px 8px; font-weight: 700; background: #f4f4f4; vertical-align: top;">Findings</td>
      <td style="border: 1px solid #000; padding: 4px 8px; white-space: pre-wrap; line-height: 1.5;">{{findings}}</td>
    </tr>
    <tr>
      <td style="border: 1px solid #000; padding: 4px 8px; font-weight: 700; background: #f4f4f4; vertical-align: top;">Impression</td>
      <td style="border: 1px solid #000; padding: 4px 8px; white-space: pre-wrap; line-height: 1.5; font-weight: 600;">{{impression}}</td>
    </tr>
    <tr>
      <td style="border: 1px solid #000; padding: 4px 8px; font-weight: 700; background: #f4f4f4; vertical-align: top;">Recommendation</td>
      <td style="border: 1px solid #000; padding: 4px 8px; white-space: pre-wrap; line-height: 1.5;">{{recommendations}}</td>
    </tr>
  </table>
</div>
`.trim();
}

/** GMC-style footer with report approval signatures. Same label layout as
 * the lab's footer — "Performed By" / "Verified By" — so the two reports
 * read as siblings of the same letterhead family. The radiologist's name
 * fills both rows (one person typically both performs and verifies a
 * radiology exam in this clinic's workflow). */
export const GMC_RAD_FOOTER_HTML = `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: 12px auto 0; padding-top: 12px;">
  <table style="width: 100%; font-size: 12px;">
    <tr>
      <td style="width: 50%; vertical-align: top;">
        <div style="font-weight: 700; margin-bottom: 4px;">Performed By:</div>
        <div style="padding-top: 22px; border-top: 1px solid #999;">{{radiologist}}</div>
      </td>
      <td style="width: 50%; vertical-align: top; text-align: right;">
        <div style="font-weight: 700; margin-bottom: 4px;">Verified By:</div>
        <div style="padding-top: 22px; border-top: 1px solid #999;">{{radiologist}}</div>
      </td>
    </tr>
  </table>
  <div style="text-align: center; font-size: 10px; color: #888; margin-top: 12px; padding-top: 6px; border-top: 1px solid #ddd;">
    <em>Report generated electronically · {{reported_at}}</em>
  </div>
</div>
`.trim();

export interface RadiologyRenderContext {
    exam_name?: string;
    modality?: string;
    category?: string;
    clinical_notes?: string;
    technique?: string;
    findings?: string;
    impression?: string;
    recommendations?: string;
    patient_name?: string;
    patient_number?: string;
    patient_age?: string;
    patient_gender?: string;
    patient_phone?: string;
    doctor_name?: string;
    radiologist?: string;
    collected_at?: string;
    reported_at?: string;
    notes?: string;
    visit_number?: string;
    clinic_name?: string;
    clinic_address?: string;
    clinic_phone?: string;
    clinic_email?: string;
    clinic_logo?: string;
    clinic_tin?: string;
    clinic_license?: string;
    clinic_regulatory_text?: string;
    report_font?: string;
    report_id?: string;
    barcode?: string;
    turnaround_time?: string;
    preparation_instructions?: string;
}

/** Build a default GMC template for a Radiology exam. */
export function defaultRadiologyTemplate(opts: {
    examName: string;
    modality: string;
    category: string;
}): { templateName: string; templateHtml: string; headerHtml: string; footerHtml: string } {
    return {
        templateName: 'Standard Report',
        templateHtml: gmcRadiologyBody(opts.examName, opts.modality, opts.category),
        headerHtml: GMC_RAD_HEADER_HTML,
        footerHtml: GMC_RAD_FOOTER_HTML,
    };
}

/** Render a full Radiology report by stitching header + body + footer. */
export function renderRadiologyReport(opts: {
    headerHtml?: string | null;
    templateHtml: string;
    footerHtml?: string | null;
    ctx: RadiologyRenderContext;
}): { html: string; plain: string } {
    const header = opts.headerHtml ? expandTokens(opts.headerHtml, opts.ctx) : '';
    const body = expandTokens(opts.templateHtml, opts.ctx);
    const footer = opts.footerHtml ? expandTokens(opts.footerHtml, opts.ctx) : '';
    const html = [header, body, footer].filter(Boolean).join('\n');
    return { html, plain: stripHtml(html) };
}

// --- Token engine (replicated from lab-templates to keep modules independent) ---

function expandTokens(template: string, ctx: RadiologyRenderContext): string {
    let out = template;
    // {{#if KEY}}...{{else}}...{{/if}}  OR  {{#if KEY}}...{{/if}}
    for (let i = 0; i < 10; i++) {
        const prev = out;
        out = out.replace(
            /\{\{#if\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
            (_m, key: string, truthyBody: string, falsyBody?: string) => {
                const v = lookupCI(ctx, key);
                const truthy = !!(v) && v !== '' && v !== '0' && v !== 'false';
                return truthy ? truthyBody : (falsyBody || '');
            }
        );
        if (out === prev) break;
    }
    // {{KEY}} simple substitution
    out = out.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, key: string) => {
        const v = lookupCI(ctx, key);
        return v == null ? '' : String(v);
    });
    return out;
}

function lookupCI(obj: any, key: string): any {
    if (obj == null) return undefined;
    if (obj[key] !== undefined) return obj[key];
    const k = key.toLowerCase();
    for (const objKey of Object.keys(obj)) {
        if (objKey.toLowerCase() === k) return obj[objKey];
    }
    return undefined;
}

function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
