/**
 * Lab result template utilities — SERVER-ONLY entry point.
 *
 * This file is imported by:
 *   • API routes under /app/api/lab/** (render, seed-defaults, etc.) — server
 *   • Server components that need to resolve per-tenant header/footer
 *
 * Client components (page.tsx with "use client") MUST import from
 * `@/lib/lab-templates-utils` instead — that file has no prisma/server
 * dependencies, so the bundler won't try to drag the prisma client into
 * the browser.
 *
 * Everything pure is re-exported from lab-templates-utils so existing
 * `import { renderTemplate, … } from "@/lib/lab-templates"` calls in
 * server code keep working unchanged.
 */
import "server-only";

import { getSetting } from "./settings/store";
import { GMC_HEADER_HTML, GMC_FOOTER_HTML } from "./lab-templates-utils";

// Re-export value-level symbols from the client-safe utils file so legacy
// server callers continue to work without changes. Types are re-exported
// separately with `export type` — TypeScript strips them at runtime, and
// mixing them into the value export list triggers "was not found" warnings.
export {
    FLAG_LABELS,
    FLAG_COLORS,
    GMC_HEADER_HTML,
    GMC_FOOTER_HTML,
    computeFlag,
    computeFlagFromValues,
    computeRowFlag,
    flagLabel,
    flagClass,
    formatRange,
    getTestSchema,
    renderTemplate,
    renderLabReport,
    defaultTemplateFor,
    parseReferenceRange,
} from "./lab-templates-utils";

export type {
    ResultFlag,
    SchemaRow,
    RenderContext,
    ResultRowRender,
    RenderLabInput,
    RenderLabOutput,
} from "./lab-templates-utils";

// ═══════════════════════════════════════════════════════════════════════════
// Per-tenant header/footer resolution (server-only — reads settings store)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns the header HTML for lab reports — uses tenant custom if set,
 * otherwise falls back to GMC_HEADER_HTML.
 */
export async function resolveLabHeader(): Promise<string> {
    const custom = await getSetting<string>("lab.defaultTemplateHeader", "");
    return custom || GMC_HEADER_HTML;
}

/**
 * Returns the footer HTML for lab reports — uses tenant custom if set,
 * otherwise falls back to GMC_FOOTER_HTML.
 */
export async function resolveLabFooter(): Promise<string> {
    const custom = await getSetting<string>("lab.defaultTemplateFooter", "");
    return custom || GMC_FOOTER_HTML;
}
