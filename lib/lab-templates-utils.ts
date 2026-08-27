/**
 * Lab result template utilities — CLIENT-SAFE.
 *
 * This file contains pure functions and constants only. NO imports of prisma,
 * settings/store, or any server-only modules. Safe to import from React client
 * components (page.tsx with "use client") without dragging the prisma client
 * into the browser bundle.
 *
 * Server-side helpers (resolveLabHeader / resolveLabFooter, which read
 * per-tenant settings) live in lib/lab-templates.ts.
 *
 * Placeholders supported in any template section:
 *   {{patient_name}}, {{patient_number}}, {{patient_age}}, {{patient_gender}}
 *   {{visit_number}}, {{visit_date}}, {{visit_type}}, {{chief_complaint}}
 *   {{test_name}}, {{category}}, {{order_id}}, {{order_date}}
 *   {{doctor_name}}, {{technician_name}}
 *   {{clinic_name}}, {{clinic_address}}, {{clinic_phone}}, {{clinic_logo}}
 *   {{clinic_tin}}, {{clinic_license}}, {{clinic_regulatory_text}}
 *   {{flag_H}}, {{flag_L}}, {{flag_N}}, {{critical_notice}}
 *   {{#each rows}}...{{/each}} loop over result rows
 *   {{#if CONDITION}}...{{else}}...{{/if}} conditional
 */

// ═══════════════════════════════════════════════════════════════════════════
// Result flag — the canonical 5-state enumeration
// ═══════════════════════════════════════════════════════════════════════════

export type ResultFlag = "N" | "L" | "H" | "HH" | "LL" | "";

export const FLAG_LABELS: Record<ResultFlag, string> = {
    N: "Normal",
    L: "Low",
    H: "High",
    LL: "Critical Low",
    HH: "Critical High",
    "": "",
};

export const FLAG_COLORS: Record<ResultFlag, { bg: string; text: string; border: string }> = {
    N:  { bg: "rgba(16, 185, 129, 0.12)",  text: "#047857", border: "rgba(16, 185, 129, 0.4)" },
    L:  { bg: "rgba(245, 158, 11, 0.15)",  text: "#b45309", border: "rgba(245, 158, 11, 0.4)" },
    H:  { bg: "rgba(245, 158, 11, 0.15)",  text: "#b45309", border: "rgba(245, 158, 11, 0.4)" },
    LL: { bg: "rgba(239, 68, 68, 0.15)",   text: "#b91c1c", border: "rgba(239, 68, 68, 0.5)" },
    HH: { bg: "rgba(239, 68, 68, 0.15)",   text: "#b91c1c", border: "rgba(239, 68, 68, 0.5)" },
    "": { bg: "transparent", text: "inherit", border: "transparent" },
};

/** Computes a flag from a numeric value vs. normal/critical ranges. */
export function computeFlagFromValues(
    value: number,
    low: number | null,
    high: number | null,
    criticalLow: number | null = null,
    criticalHigh: number | null = null
): ResultFlag {
    if (criticalLow != null && value <= criticalLow) return "LL";
    if (criticalHigh != null && value >= criticalHigh) return "HH";
    if (low != null && value < low) return "L";
    if (high != null && value > high) return "H";
    return "N";
}

/**
 * Compute a flag from a result string + reference ranges.
 * If the result isn't numeric, returns "" (i.e. not flaggable).
 *
 *   computeFlag({ result: "12.5", normalRangeMin: 12, normalRangeMax: 16 }) → "N"
 *   computeFlag({ result: "8",   normalRangeMin: 12, normalRangeMax: 16 }) → "L"
 */
export function computeFlag(opts: {
    result: string | null | undefined;
    normalRangeMin: number | null;
    normalRangeMax: number | null;
    criticalRangeMin?: number | null;
    criticalRangeMax?: number | null;
}): ResultFlag {
    const r = (opts.result ?? "").trim();
    if (!r) return "";
    const num = parseFloat(r);
    if (!Number.isFinite(num)) return "";
    return computeFlagFromValues(
        num,
        opts.normalRangeMin,
        opts.normalRangeMax,
        opts.criticalRangeMin ?? null,
        opts.criticalRangeMax ?? null
    );
}

/**
 * Same as computeFlag but takes positional args (the lab order page uses this
 * in its on-the-fly row-update path). Returns "N" if the result is empty.
 */
export function computeRowFlag(
    result: string | null | undefined,
    normalMin: number | null,
    normalMax: number | null,
    criticalMin: number | null = null,
    criticalMax: number | null = null
): ResultFlag {
    const r = (result ?? "").trim();
    if (!r) return "N";
    const num = parseFloat(r);
    if (!Number.isFinite(num)) return "N";
    return computeFlagFromValues(num, normalMin, normalMax, criticalMin, criticalMax);
}

export function flagLabel(flag: string): string {
    return (FLAG_LABELS as any)[flag] ?? "Normal";
}

export function flagClass(flag: string): string {
    switch (flag) {
        case "H": return "flag-high";
        case "L": return "flag-low";
        case "HH":
        case "LL": return "flag-critical";
        case "N":
        default: return "flag-normal";
    }
}

/** Format a (min, max) range as a human-readable string. */
export function formatRange(min: number | null | undefined, max: number | null | undefined): string {
    const lo = min == null || !Number.isFinite(min as number) ? null : min;
    const hi = max == null || !Number.isFinite(max as number) ? null : max;
    if (lo != null && hi != null) return `${lo} - ${hi}`;
    if (lo != null) return `≥ ${lo}`;
    if (hi != null) return `≤ ${hi}`;
    return "";
}

// ═══════════════════════════════════════════════════════════════════════════
// Schema row type + per-test fallback schema map
// ═══════════════════════════════════════════════════════════════════════════

export interface SchemaRow {
    section?: string;
    investigation: string;
    unit?: string;
    normalRange?: string;
    normalMin?: number | null;
    normalMax?: number | null;
    criticalMin?: number | null;
    criticalMax?: number | null;
    isSection?: boolean;
}

/**
 * Look up the in-code default schema for a test by name. Used as a fallback
 * when a test's DB template has no `resultSchema` (e.g. a brand-new test whose
 * template hasn't been seeded yet).
 *
 * Name-matching is permissive because the catalog often stores names with
 * parenthetical aliases ("Complete Blood Count (CBC)") while the schema map
 * uses the bare name ("Complete Blood Count"). The lookup tries, in order:
 *   1. Exact match ("Complete Blood Count (CBC)")
 *   2. Strip a trailing "(…)" alias ("Complete Blood Count")
 *   3. Use just the alias ("CBC")
 *   4. Case-insensitive fallback
 *
 * Returns `null` if no hardcoded schema matches — caller should fall back to
 * an empty single-value template.
 */
export function getTestSchema(testName: string): { rows: SchemaRow[] } | null {
    const raw = (testName || "").trim();
    if (!raw) return null;

    // Build the list of candidate keys to try, in priority order.
    const candidates: string[] = [raw];

    // Strip trailing "(…)" alias, e.g. "Complete Blood Count (CBC)" → "Complete Blood Count"
    const aliasMatch = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (aliasMatch) {
        const base = aliasMatch[1].trim();
        const alias = aliasMatch[2].trim();
        if (base) candidates.push(base);
        if (alias) candidates.push(alias);
    }

    // Also try swapping: "CBC" → "Complete Blood Count" if alias points to a known key
    for (const c of [...candidates]) {
        const swapped = ALIAS_TO_CANONICAL[c.toUpperCase()];
        if (swapped && !candidates.includes(swapped)) candidates.push(swapped);
    }

    for (const key of candidates) {
        if (TEST_SCHEMAS[key]) return { rows: TEST_SCHEMAS[key] };
    }

    // Final fallback: case-insensitive scan
    const lower = raw.toLowerCase();
    for (const key of Object.keys(TEST_SCHEMAS)) {
        if (key.toLowerCase() === lower) return { rows: TEST_SCHEMAS[key] };
    }

    return null;
}

/**
 * Maps common test-name aliases (e.g. "CBC") to their canonical schema name
 * (e.g. "Complete Blood Count"). Add more as the catalog grows.
 */
const ALIAS_TO_CANONICAL: Record<string, string> = {
    "CBC": "Complete Blood Count",
    "FBC": "Full Blood Count",
    "LFT": "Liver Function Test",
    "KFT": "Kidney Function Test",
    "RFT": "Renal Function Test",
    "TFT": "Thyroid Function Test",
    "BS": "Blood Slide for Malaria Parasites (BS)",
    "MP": "Blood Slide for Malaria Parasites (BS)",
    "MRDT": "Malaria Antigen",
    "UPT": "Pregnancy Test",
};

/**
 * Hardcoded default schemas for the most common panels. These mirror the
 * GMC-style printed report shape (3 columns: investigation / unit / ref)
 * and let the lab order page render something sensible before a template
 * has been saved to the DB.
 */
const TEST_SCHEMAS: Record<string, SchemaRow[]> = {
    "Full Blood Count": [
        { isSection: true, section: "Red Cell Indices" },
        { investigation: "Hemoglobin",        unit: "g/dL",  normalMin: 12,   normalMax: 17,   criticalMin: 7,    criticalMax: 20 },
        { investigation: "RBC Count",         unit: "x10⁶/μL", normalMin: 4.0, normalMax: 5.5, criticalMin: 2.0, criticalMax: 7.0 },
        { investigation: "PCV / Hematocrit",  unit: "%",     normalMin: 36,   normalMax: 50,   criticalMin: 20,   criticalMax: 60 },
        { investigation: "MCV",               unit: "fL",    normalMin: 80,   normalMax: 100,  criticalMin: 60,   criticalMax: 120 },
        { investigation: "MCH",               unit: "pg",    normalMin: 27,   normalMax: 33,   criticalMin: 20,   criticalMax: 40 },
        { investigation: "MCHC",              unit: "g/dL",  normalMin: 32,   normalMax: 36,   criticalMin: 25,   criticalMax: 40 },
        { isSection: true, section: "White Cell Count" },
        { investigation: "Total WBC",         unit: "x10³/μL", normalMin: 4,  normalMax: 11,  criticalMin: 1,    criticalMax: 30 },
        { investigation: "Neutrophils",       unit: "%",     normalMin: 40,   normalMax: 70,   criticalMin: null, criticalMax: null },
        { investigation: "Lymphocytes",       unit: "%",     normalMin: 20,   normalMax: 40,   criticalMin: null, criticalMax: null },
        { investigation: "Monocytes",         unit: "%",     normalMin: 2,    normalMax: 8,    criticalMin: null, criticalMax: null },
        { investigation: "Eosinophils",       unit: "%",     normalMin: 1,    normalMax: 6,    criticalMin: null, criticalMax: null },
        { investigation: "Basophils",         unit: "%",     normalMin: 0,    normalMax: 1,    criticalMin: null, criticalMax: null },
        { isSection: true, section: "Platelets" },
        { investigation: "Platelet Count",    unit: "x10³/μL", normalMin: 150, normalMax: 400, criticalMin: 50,  criticalMax: 1000 },
    ],
    "FBC": [],
    "Complete Blood Count": [],
    "CBC": [],
    "Liver Function Test": [
        { investigation: "Total Bilirubin",   unit: "mg/dL", normalMin: 0.1, normalMax: 1.2, criticalMin: null, criticalMax: 5 },
        { investigation: "Direct Bilirubin",  unit: "mg/dL", normalMin: 0,   normalMax: 0.4, criticalMin: null, criticalMax: null },
        { investigation: "Total Protein",     unit: "g/dL",  normalMin: 6,   normalMax: 8.3, criticalMin: null, criticalMax: null },
        { investigation: "Albumin",           unit: "g/dL",  normalMin: 3.5, normalMax: 5.5, criticalMin: null, criticalMax: null },
        { investigation: "Globulin",          unit: "g/dL",  normalMin: 2,   normalMax: 3.5, criticalMin: null, criticalMax: null },
        { investigation: "ALP",               unit: "U/L",   normalMin: 44,  normalMax: 147, criticalMin: null, criticalMax: null },
        { investigation: "AST (SGOT)",        unit: "U/L",   normalMin: 8,   normalMax: 48,  criticalMin: null, criticalMax: null },
        { investigation: "ALT (SGPT)",        unit: "U/L",   normalMin: 7,   normalMax: 55,  criticalMin: null, criticalMax: null },
        { investigation: "GGT",               unit: "U/L",   normalMin: 9,   normalMax: 48,  criticalMin: null, criticalMax: null },
    ],
    "LFT": [],
    "Liver Function Tests": [],
    "Kidney Function Test": [
        { investigation: "Urea",              unit: "mg/dL", normalMin: 15,  normalMax: 45,  criticalMin: null, criticalMax: 200 },
        { investigation: "Creatinine",        unit: "mg/dL", normalMin: 0.6, normalMax: 1.3, criticalMin: null, criticalMax: 7 },
        { investigation: "Uric Acid",         unit: "mg/dL", normalMin: 3.4, normalMax: 7,   criticalMin: null, criticalMax: null },
        { investigation: "BUN",               unit: "mg/dL", normalMin: 7,   normalMax: 20,  criticalMin: null, criticalMax: null },
        { investigation: "eGFR",              unit: "mL/min/1.73m²", normalMin: 90, normalMax: 120, criticalMin: null, criticalMax: null },
    ],
    "KFT": [],
    "RFT": [],
    "Renal Function Test": [],
    "Lipid Profile": [
        { investigation: "Total Cholesterol", unit: "mg/dL", normalMin: 125, normalMax: 200, criticalMin: null, criticalMax: null },
        { investigation: "Triglycerides",     unit: "mg/dL", normalMin: 0,   normalMax: 150, criticalMin: null, criticalMax: null },
        { investigation: "HDL Cholesterol",   unit: "mg/dL", normalMin: 35,  normalMax: 60,  criticalMin: null, criticalMax: null },
        { investigation: "LDL Cholesterol",   unit: "mg/dL", normalMin: 0,   normalMax: 130, criticalMin: null, criticalMax: 190 },
        { investigation: "VLDL",              unit: "mg/dL", normalMin: 0,   normalMax: 30,  criticalMin: null, criticalMax: null },
    ],
    "Thyroid Function Test": [
        { investigation: "TSH",               unit: "μIU/mL", normalMin: 0.4, normalMax: 4.0, criticalMin: 0.1, criticalMax: 100 },
        { investigation: "Free T3",           unit: "pg/mL",  normalMin: 2.3, normalMax: 4.2, criticalMin: null, criticalMax: null },
        { investigation: "Free T4",           unit: "ng/dL",  normalMin: 0.8, normalMax: 1.8, criticalMin: null, criticalMax: null },
    ],
    "TFT": [],
    "Electrolytes": [
        { investigation: "Sodium (Na⁺)",      unit: "mmol/L", normalMin: 135, normalMax: 145, criticalMin: 120, criticalMax: 160 },
        { investigation: "Potassium (K⁺)",    unit: "mmol/L", normalMin: 3.5, normalMax: 5.0, criticalMin: 2.5, criticalMax: 6.5 },
        { investigation: "Chloride (Cl⁻)",    unit: "mmol/L", normalMin: 98,  normalMax: 107, criticalMin: null, criticalMax: null },
        { investigation: "Bicarbonate (HCO₃⁻)", unit: "mmol/L", normalMin: 22, normalMax: 29, criticalMin: null, criticalMax: null },
    ],
    "Serum Electrolytes": [],
    "Coagulation Profile": [
        { investigation: "PT",                unit: "seconds", normalMin: 11,  normalMax: 13.5, criticalMin: null, criticalMax: 30 },
        { investigation: "INR",               unit: "",      normalMin: 0.8, normalMax: 1.2, criticalMin: null, criticalMax: 4 },
        { investigation: "aPTT",              unit: "seconds", normalMin: 25, normalMax: 35, criticalMin: null, criticalMax: 60 },
        { investigation: "Bleeding Time",     unit: "minutes", normalMin: 2, normalMax: 7,  criticalMin: null, criticalMax: null },
    ],
    "Coagulation Studies": [],
    "Hemoglobin Electrophoresis": [
        { investigation: "Hemoglobin A",      unit: "%",     normalMin: 96,  normalMax: 100, criticalMin: null, criticalMax: null },
        { investigation: "Hemoglobin A2",     unit: "%",     normalMin: 1.5, normalMax: 3.5, criticalMin: null, criticalMax: null },
        { investigation: "Hemoglobin F",      unit: "%",     normalMin: 0,   normalMax: 2,   criticalMin: null, criticalMax: null },
    ],
    // ── Specialty panels ──
    "Urinalysis Dipstick": [
        { isSection: true, section: "Physical" },
        { investigation: "Appearance",        unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { investigation: "pH",                unit: "",      normalMin: 4.5, normalMax: 8,   criticalMin: null, criticalMax: null },
        { investigation: "Specific Gravity",  unit: "",      normalMin: 1.005, normalMax: 1.030, criticalMin: null, criticalMax: null },
        { isSection: true, section: "Chemical" },
        { investigation: "Glucose",           unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { investigation: "Protein",           unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { investigation: "Blood",             unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { investigation: "Ketones",           unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { investigation: "Bilirubin",         unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { investigation: "Urobilinogen",      unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { investigation: "Nitrite",           unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { investigation: "Leukocyte Esterase", unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { isSection: true, section: "Microscopic (if performed)" },
        { investigation: "RBC",               unit: "/HPF",  normalMin: 0, normalMax: 2,    criticalMin: null, criticalMax: null },
        { investigation: "WBC",               unit: "/HPF",  normalMin: 0, normalMax: 5,    criticalMin: null, criticalMax: null },
        { investigation: "Epithelial Cells",  unit: "/HPF",  normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { investigation: "Bacteria",          unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
        { investigation: "Casts",             unit: "",      normalMin: null, normalMax: null, criticalMin: null, criticalMax: null },
    ],
    "Urinalysis": [
        { investigation: "Appearance",        unit: "" },
        { investigation: "pH",                unit: "" },
        { investigation: "Specific Gravity",  unit: "" },
        { investigation: "Glucose",           unit: "" },
        { investigation: "Protein",           unit: "" },
        { investigation: "Blood",             unit: "" },
        { investigation: "Ketones",           unit: "" },
        { investigation: "Bilirubin",         unit: "" },
        { investigation: "Urobilinogen",      unit: "" },
        { investigation: "Nitrite",           unit: "" },
        { investigation: "Leukocyte Esterase", unit: "" },
    ],
    "Peripheral Blood Film Comment": [
        { investigation: "RBC Morphology",    unit: "" },
        { investigation: "WBC Morphology",    unit: "" },
        { investigation: "Platelet Morphology", unit: "" },
        { investigation: "Cell Distribution", unit: "" },
        { investigation: "Comment",           unit: "" },
    ],
    "Brucella Agglutination Test": [
        { investigation: "Brucella Abortus Titre", unit: "titer", normalMin: null, normalMax: 80, criticalMin: null, criticalMax: null },
        { investigation: "Brucella Melitensis Titre", unit: "titer", normalMin: null, normalMax: 80, criticalMin: null, criticalMax: null },
    ],
    "Brucella Agglutination Test (BAT)": [],
    "Stool Analysis": [
        { isSection: true, section: "Macroscopic" },
        { investigation: "Consistency",       unit: "" },
        { investigation: "Color",             unit: "" },
        { investigation: "Mucus",             unit: "" },
        { investigation: "Blood",             unit: "" },
        { isSection: true, section: "Microscopic" },
        { investigation: "Pus Cells",         unit: "/HPF" },
        { investigation: "RBC",               unit: "/HPF" },
        { investigation: "Parasites",         unit: "" },
        { investigation: "Ova/Cysts",         unit: "" },
        { investigation: "Fat Globules",      unit: "" },
        { investigation: "Starch Granules",   unit: "" },
    ],
    "Sputum Analysis": [
        { investigation: "Macroscopic Appearance", unit: "" },
        { investigation: "Gram Stain Result", unit: "" },
        { investigation: "Cells",             unit: "" },
        { investigation: "Bacteria",          unit: "" },
        { investigation: "AFB Smear Result",  unit: "" },
    ],
    "Differential Count": [
        { investigation: "Neutrophils",       unit: "%", normalMin: 40, normalMax: 70 },
        { investigation: "Lymphocytes",       unit: "%", normalMin: 20, normalMax: 40 },
        { investigation: "Monocytes",         unit: "%", normalMin: 2, normalMax: 8 },
        { investigation: "Eosinophils",       unit: "%", normalMin: 1, normalMax: 6 },
        { investigation: "Basophils",         unit: "%", normalMin: 0, normalMax: 1 },
    ],
};

// Make the FBC/CBC/CBC aliases share the FBC schema after declaration.
TEST_SCHEMAS["FBC"] = TEST_SCHEMAS["Full Blood Count"];
TEST_SCHEMAS["Complete Blood Count"] = TEST_SCHEMAS["Full Blood Count"];
TEST_SCHEMAS["CBC"] = TEST_SCHEMAS["Full Blood Count"];
TEST_SCHEMAS["LFT"] = TEST_SCHEMAS["Liver Function Test"];
TEST_SCHEMAS["Liver Function Tests"] = TEST_SCHEMAS["Liver Function Test"];
TEST_SCHEMAS["KFT"] = TEST_SCHEMAS["Kidney Function Test"];
TEST_SCHEMAS["RFT"] = TEST_SCHEMAS["Kidney Function Test"];
TEST_SCHEMAS["Renal Function Test"] = TEST_SCHEMAS["Kidney Function Test"];
TEST_SCHEMAS["TFT"] = TEST_SCHEMAS["Thyroid Function Test"];
TEST_SCHEMAS["Serum Electrolytes"] = TEST_SCHEMAS["Electrolytes"];
TEST_SCHEMAS["Coagulation Studies"] = TEST_SCHEMAS["Coagulation Profile"];
TEST_SCHEMAS["Brucella Agglutination Test (BAT)"] = TEST_SCHEMAS["Brucella Agglutination Test"];

// ═══════════════════════════════════════════════════════════════════════════
// Default header/footer — GMC Victoria Hospital style
// (kept here so the client can render previews without a server roundtrip)
// ═══════════════════════════════════════════════════════════════════════════

export const GMC_HEADER_HTML = `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: 0 auto; color: #000;">
  {{#if clinic_logo}}<div style="text-align: center; margin-bottom: 4px;">{{clinic_logo}}</div>{{/if}}
  <h1 style="text-align: center; margin: 0; font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">{{clinic_name}}</h1>
  {{#if clinic_subheader}}<p style="text-align: center; margin: 4px 0 0; font-size: 12px; color: #555;">{{clinic_subheader}}</p>{{/if}}
  {{#if clinic_email}}<p style="text-align: center; margin: 2px 0 0; font-size: 12px; color: #555;">{{clinic_email}}</p>{{/if}}
  {{#if clinic_regulatory_text}}<p style="text-align: center; margin: 2px 0 8px; font-size: 11px; color: #888;">{{clinic_regulatory_text}}</p>{{/if}}
  <h2 style="text-align: center; margin: 16px 0 12px; font-size: 16px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700;">Laboratory Report</h2>
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
      <td style="border: 1px solid #000; padding: 4px 8px; font-weight: 700; background: #f4f4f4;">Test</td>
      <td colspan="3" style="border: 1px solid #000; padding: 4px 8px; font-weight: 600;">{{test_name}}</td>
    </tr>
  </table>
</div>`.trim();

export const GMC_FOOTER_HTML = `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: 12px auto 0; padding-top: 12px;">
  <table style="width: 100%; font-size: 12px;">
    <tr>
      <td style="width: 50%; vertical-align: top;">
        <div style="font-weight: 700; margin-bottom: 4px;">Performed By:</div>
        <div style="padding-top: 22px; border-top: 1px solid #999;">{{technician}}</div>
      </td>
      <td style="width: 50%; vertical-align: top; text-align: right;">
        <div style="font-weight: 700; margin-bottom: 4px;">Verified By:</div>
        <div style="padding-top: 22px; border-top: 1px solid #999;">{{verified_by}}</div>
      </td>
    </tr>
  </table>
  <div style="text-align: center; font-size: 10px; color: #888; margin-top: 12px; padding-top: 6px; border-top: 1px solid #ddd;">
    <em>Report generated electronically · {{reported_at}}</em>
  </div>
</div>`.trim();

// ═══════════════════════════════════════════════════════════════════════════
// Template rendering engine
// ═══════════════════════════════════════════════════════════════════════════

export type RenderContext = {
    patient: { name: string; patientNumber: string; age: string; gender: string; dateOfBirth?: Date; phone?: string };
    visit: { visitNumber: string; date: string; type: string; chiefComplaint?: string };
    test: { name: string; category?: string; unit?: string; referenceRange?: string };
    order: { id: string; date: string; orderNumber?: string };
    doctor: { name: string };
    technician: { name: string };
    verifiedBy?: string;
    result?: string | number | null;
    reportedAt?: string;
    collectedAt?: string;
    reportId?: string;
    barcode?: string;
    /**
     * Each row carries the full ResultRowRender shape so templates can use
     * either the modern placeholders ({{investigation}}/{{result}}/{{unit}}/
     * {{normal_range}}/{{section}}/{{flag}}/{{flag_label}}/{{comment}}) or
     * the legacy {{row_name}}/{{row_value}}/{{row_unit}}/{{row_reference}}/
     * {{row_flag}} aliases. The legacy `name`/`value`/`unit`/`referenceRange`
     * fields are also populated as fallbacks.
     */
    rows: Array<{
        // Modern ResultRowRender fields
        section?: string;
        investigation?: string;
        result?: string | number | null;
        unit?: string;
        normal_range?: string;
        flag?: string;
        flag_label?: string;
        comment?: string;
        isSection?: boolean;
        // Legacy field aliases (kept for backward compat with older templates)
        name?: string;
        value?: string | number | null;
        referenceRange?: string;
    }>;
    qualitative?: { result: string; description?: string };
    notes?: string;
    resultMode: "single" | "table" | "qualitative";
    clinic: {
        name: string; address: string; phone: string; logoUrl?: string;
        taxId?: string; registrationNumber?: string; regulatoryText?: string;
        reportFont?: string;
    };
};

/**
 * Render a single row iteration block. Resolves both the modern
 * ResultRowRender-style placeholders ({{investigation}}/{{result}}/{{unit}}/
 * {{normal_range}}/{{section}}/{{flag}}/{{flag_label}}/{{comment}}) and the
 * legacy row_* aliases ({{row_name}}/{{row_value}}/{{row_unit}}/
 * {{row_reference}}/{{row_flag}}/{{row_flag_label}}/{{row_flag_class}}).
 *
 * Also handles {{#if isSection}} (and flag_xxx conditions) against the
 * CURRENT row, not the first row of the report.
 */
function renderTemplateRowBlock(body: string, row: any, rowCtx: RenderContext): string {
    // Per-row substitution map. Both naming styles resolve to the same row data.
    const rowSubs: Record<string, string> = {
        // Modern ResultRowRender field names (matches the DB-stored templates)
        investigation: row.investigation || "",
        result: row.result != null ? String(row.result) : "",
        unit: row.unit || "",
        normal_range: row.normal_range || row.referenceRange || "",
        section: row.section || "",
        flag: row.flag || "",
        flag_label: row.flag ? flagLabel(row.flag) : "",
        flag_class: row.flag ? flagClass(row.flag) : "",
        comment: row.comment || "",
        isSection: row.isSection ? "true" : "",

        // Legacy row_* aliases (kept so older GMC_HEADER/FOOTER templates still work)
        row_name: row.investigation || row.section || row.name || "",
        row_value: row.result != null ? String(row.result) : (row.value || ""),
        row_unit: row.unit || "",
        row_reference: row.normal_range || row.referenceRange || "",
        row_flag: row.flag || "",
        row_flag_label: row.flag ? flagLabel(row.flag) : "",
        row_flag_class: row.flag ? flagClass(row.flag) : "",
    };

    // Per-row if-block evaluator. isSection + flag_xxx are checked against THIS
    // row; everything else (has_notes, has_qualitative) falls back to the
    // outer ctx.
    body = body.replace(/\{\{#if (\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_, cond, ifBlock, elseBlock = "") => {
        const flag = row.flag || "N";
        const isTrue =
            cond === "isSection" ? !!row.isSection
            : cond === "flag_H" ? flag === "H" || flag === "HH"
            : cond === "flag_L" ? flag === "L" || flag === "LL"
            : cond === "flag_critical" ? flag === "HH" || flag === "LL"
            : cond === "flag_N" ? flag === "N"
            : cond === "has_notes" ? !!rowCtx.notes
            : cond === "has_qualitative" ? !!rowCtx.qualitative
            : false;
        return isTrue ? ifBlock : elseBlock;
    });

    // Substitute any {{placeholder}} inside the row block.
    return body.replace(/\{\{(\w+)\}\}/g, (_, key) => rowSubs[key] ?? `{{${key}}}`);
}

export function renderTemplate(template: string, ctx: RenderContext): string {
    if (!template) return "";

    // First handle {{#each rows}}...{{/each}}.
    //
    // Inside the loop, placeholders resolve from the *current* row using the
    // ResultRowRender field names directly ({{investigation}}, {{result}},
    // {{unit}}, {{normal_range}}, {{section}}, {{flag}}, {{flag_label}},
    // {{comment}}, {{isSection}}). The old {{row_name}}/{{row_value}}/...
    // aliases are still supported for backward compatibility.
    //
    // {{#if isSection}}/{{#if flag_xxx}} inside the loop also evaluate against
    // the *current* row (e.g. section headers). {{#if CONDITION}} outside the
    // loop still evaluates against the overall report (ctx.rows[0]?.flag for
    // flag_xxx, etc.) as before.
    template = template.replace(/\{\{#each rows\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, body) => {
        return ctx.rows
            .map((row) => {
                // Resolve a per-row ctx so {{#if isSection}} etc. can see the
                // current row's properties.
                const rowCtx: RenderContext = {
                    ...ctx,
                    rows: [row],
                };
                // Map a ResultRowRender → the row shape that the existing
                // sub map (below) and the per-row if-block expect.
                const rowRendered = {
                    ...row,
                    name: (row as any).name || (row as any).investigation || (row as any).section || "",
                    value: (row as any).value != null
                        ? String((row as any).value)
                        : ((row as any).result != null ? String((row as any).result) : ""),
                    referenceRange: (row as any).referenceRange || (row as any).normal_range || "",
                };
                return renderTemplateRowBlock(body, rowRendered, rowCtx);
            })
            .join("");
    });

    // {{#if CONDITION}}...{{else}}...{{/if}} at the OUTER (non-loop) level.
    // Same flag/notes/qualitative logic as before, plus a generic "is this
    // placeholder non-empty?" check so {{#if clinic_phone}}/{{#if clinic_address}}/
    // {{#if clinic_regulatory_text}} etc. just work. Compound names like
    // `clinic_phone` are also looked up via the same `subs` map that drives
    // the final placeholder pass — so anything the template can print, it
    // can also test.
    const subsSnapshot: Record<string, string> = {
        clinic_name: ctx.clinic?.name || "",
        clinic_address: ctx.clinic?.address || "",
        clinic_phone: ctx.clinic?.phone || "",
        clinic_email: ctx.clinic?.email || "",
        clinic_logo: ctx.clinic?.logoUrl || "",
        clinic_tin: ctx.clinic?.taxId || "",
        clinic_license: ctx.clinic?.registrationNumber || "",
        clinic_regulatory_text: ctx.clinic?.regulatoryText || "",
    };
    template = template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_, cond, ifBlock, elseBlock = "") => {
        const flag = ctx.rows[0]?.flag || "N";
        const isTrue = cond === "flag_H" ? flag === "H" || flag === "HH"
            : cond === "flag_L" ? flag === "L" || flag === "LL"
            : cond === "flag_critical" ? flag === "HH" || flag === "LL"
            : cond === "flag_N" ? flag === "N"
            : cond === "has_notes" ? !!ctx.notes
            : cond === "has_qualitative" ? !!ctx.qualitative
            // Generic truthy check: any other key is treated as a boolean
            // "is this ctx/subs field non-empty?". Lets templates do
            // {{#if clinic_phone}}...{{/if}} without us having to enumerate
            // every possible key.
            : !!((ctx as any)[cond] || subsSnapshot[cond] || "");
        return isTrue ? ifBlock : elseBlock;
    });

    // {{placeholder}} substitutions
    const subs: Record<string, string> = {
        // Patient
        patient_name: ctx.patient?.name || "",
        patient_number: ctx.patient?.patientNumber || "",
        patient_age: ctx.patient?.age || "",
        patient_gender: ctx.patient?.gender || "",
        patient_dob: ctx.patient?.dateOfBirth ? new Date(ctx.patient.dateOfBirth).toLocaleDateString() : "",
        patient_phone: ctx.patient?.phone || "",
        // Visit
        visit_number: ctx.visit?.visitNumber || "",
        visit_date: ctx.visit?.date || "",
        visit_type: ctx.visit?.type || "",
        chief_complaint: ctx.visit?.chiefComplaint || "",
        // Test
        test_name: ctx.test?.name || "",
        test_category: ctx.test?.category || "",
        test_unit: ctx.test?.unit || "",
        unit: ctx.test?.unit || "",
        test_reference: ctx.test?.referenceRange || "",
        normal_range: ctx.test?.referenceRange || "",
        // Order
        order_id: ctx.order?.id || "",
        order_date: ctx.order?.date || "",
        order_number: ctx.order?.orderNumber || "",
        // People
        doctor_name: ctx.doctor?.name || "",
        technician_name: ctx.technician?.name || "",
        technician: ctx.technician?.name || "",
        verified_by: ctx.verifiedBy || "",
        // Result
        result: ctx.result?.toString?.() ?? (ctx.result as any) ?? "",
        qualitative_result: ctx.qualitative?.result || "",
        qualitative_description: ctx.qualitative?.description || "",
        notes: ctx.notes || "",
        // Timestamps
        reported_at: ctx.reportedAt || "",
        collected_at: ctx.collectedAt || "",
        // Clinic
        clinic_name: ctx.clinic?.name || "",
        clinic_address: ctx.clinic?.address || "",
        clinic_phone: ctx.clinic?.phone || "",
        clinic_email: ctx.clinic?.email || "",
        clinic_logo: ctx.clinic?.logoUrl ? `<img src="${ctx.clinic.logoUrl}" alt="${ctx.clinic.name}" style="max-height: 60px;" />` : "",
        clinic_tin: ctx.clinic?.taxId || "",
        clinic_license: ctx.clinic?.registrationNumber || "",
        clinic_regulatory_text: ctx.clinic?.regulatoryText || "",
        // Letterhead subheader: "Address · Tel: … · TIN: …" (omits empty parts).
        clinic_subheader: [
            ctx.clinic?.address,
            ctx.clinic?.phone ? `Tel: ${ctx.clinic.phone}` : "",
            ctx.clinic?.taxId ? `TIN: ${ctx.clinic.taxId}` : "",
        ].filter(Boolean).join(" · "),
        report_font: ctx.clinic?.reportFont || "Times New Roman",
        // Report identifiers
        report_id: ctx.reportId || "",
        barcode: ctx.barcode || "",
    };

    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => subs[key] ?? `{{${key}}}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// renderLabReport — high-level "give me the full HTML for this report"
// ═══════════════════════════════════════════════════════════════════════════
//
// Combines headerHtml + templateHtml + footerHtml into a single rendered
// report. Accepts a flat snake_case context (the shape used by API routes
// and PDF tooling) and maps it to the structured `RenderContext` that
// `renderTemplate` understands.
//
// This is the function the /api/lab/render route uses to produce the final
// HTML for the report preview / PDF.

/** A single rendered result row (after server-side merge with the template schema). */
export interface ResultRowRender {
    section?: string;
    investigation?: string;
    result?: string | number | null;
    unit?: string;
    normal_range?: string;
    flag?: 'N' | 'H' | 'L' | 'HH' | 'LL' | '';
    flag_label?: string;
    comment?: string;
    isSection?: boolean;
}

/** Input for renderLabReport. */
export interface RenderLabInput {
    headerHtml?: string | null;
    templateHtml?: string | null;
    footerHtml?: string | null;
    /** Flat snake_case context — matches the shape API routes build. */
    ctx: {
        test_name?: string;
        test_category?: string;
        result?: string | number | null;
        unit?: string;
        normal_range?: string;
        qualitative_result?: string;
        qualitative_description?: string;
        patient_name?: string;
        patient_number?: string;
        patient_age?: string | number;
        patient_gender?: string;
        patient_dob?: string;
        patient_phone?: string;
        visit_number?: string;
        visit_date?: string;
        visit_type?: string;
        chief_complaint?: string;
        order_id?: string;
        order_date?: string;
        order_number?: string;
        doctor_name?: string;
        technician?: string;
        reported_at?: string;
        collected_at?: string;
        notes?: string;
        clinic_name?: string;
        clinic_address?: string;
        clinic_phone?: string;
        clinic_logo?: string;
        clinic_tin?: string;
        clinic_license?: string;
        clinic_regulatory_text?: string;
        report_font?: string;
        report_id?: string;
        barcode?: string;
        verified_by?: string;
        rows?: ResultRowRender[];
        qualitative?: { result: string; description?: string };
    };
    flagInputs?: {
        normalRangeMin?: number | null;
        normalRangeMax?: number | null;
        criticalRangeMin?: number | null;
        criticalRangeMax?: number | null;
    };
}

/** Output of renderLabReport. */
export interface RenderLabOutput {
    html: string;
    plain: string;
    flag: 'N' | 'H' | 'L' | 'HH' | 'LL' | '';
    normalRange: string;
}

export function renderLabReport(input: RenderLabInput): RenderLabOutput {
    const { headerHtml, templateHtml, footerHtml, ctx, flagInputs } = input;

    // Map flat snake_case ctx → structured RenderContext that renderTemplate expects.
    const structured: RenderContext = {
        patient: {
            name: ctx.patient_name || "",
            patientNumber: ctx.patient_number || "",
            age: ctx.patient_age != null ? String(ctx.patient_age) : "",
            gender: ctx.patient_gender || "",
            dateOfBirth: ctx.patient_dob ? new Date(ctx.patient_dob) : undefined,
            phone: ctx.patient_phone || "",
        },
        visit: {
            visitNumber: ctx.visit_number || "",
            date: ctx.visit_date || "",
            type: ctx.visit_type || "",
            chiefComplaint: ctx.chief_complaint || "",
        },
        test: {
            name: ctx.test_name || "",
            category: ctx.test_category || "",
            unit: ctx.unit || "",
            referenceRange: ctx.normal_range || "",
        },
        order: {
            id: ctx.order_id || "",
            date: ctx.order_date || "",
            orderNumber: ctx.order_number || "",
        },
        doctor: { name: ctx.doctor_name || "" },
        technician: { name: ctx.technician || "" },
        verifiedBy: ctx.verified_by || "",
        result: ctx.result ?? null,
        reportedAt: ctx.reported_at || "",
        collectedAt: ctx.collected_at || "",
        reportId: ctx.report_id || "",
        barcode: ctx.barcode || "",
        rows: (ctx.rows || []).map((r) => ({
            // Pass through the full ResultRowRender shape so templates can use
            // the modern {{investigation}}/{{result}}/{{unit}}/{{normal_range}}/
            // {{section}}/{{flag}}/{{comment}}/{{isSection}} placeholders. The
            // legacy name/value/unit/referenceRange aliases are also populated
            // for older templates.
            section: r.section,
            investigation: r.investigation,
            result: r.result,
            unit: r.unit,
            normal_range: r.normal_range,
            flag: r.flag,
            flag_label: r.flag_label,
            comment: r.comment,
            isSection: r.isSection,
            name: r.investigation || r.section || "",
            value: r.result != null ? String(r.result) : "",
            referenceRange: r.normal_range || "",
        })),
        qualitative: ctx.qualitative || (ctx.qualitative_result ? { result: String(ctx.qualitative_result), description: ctx.qualitative_description } : undefined),
        notes: ctx.notes || "",
        resultMode: "table",
        clinic: {
            name: ctx.clinic_name || "",
            address: ctx.clinic_address || "",
            phone: ctx.clinic_phone || "",
            logoUrl: ctx.clinic_logo || "",
            taxId: ctx.clinic_tin || "",
            registrationNumber: ctx.clinic_license || "",
            regulatoryText: ctx.clinic_regulatory_text || "",
            reportFont: ctx.report_font || "",
        },
    };

    // Render each section.
    const header = headerHtml ? renderTemplate(headerHtml, structured) : "";
    const body = templateHtml ? renderTemplate(templateHtml, structured) : "";
    const footer = footerHtml ? renderTemplate(footerHtml, structured) : "";

    // Compute the overall flag from the result value + range inputs.
    let flag: 'N' | 'H' | 'L' | 'HH' | 'LL' | '' = "";
    if (flagInputs && ctx.result != null && ctx.result !== "") {
        const flagResult = computeFlag({
            result: String(ctx.result),
            normalRangeMin: flagInputs.normalRangeMin ?? null,
            normalRangeMax: flagInputs.normalRangeMax ?? null,
            criticalRangeMin: flagInputs.criticalRangeMin ?? null,
            criticalRangeMax: flagInputs.criticalRangeMax ?? null,
        });
        flag = flagResult;
    } else if (ctx.rows && ctx.rows.length > 0) {
        // For table/qualitative: derive from worst row flag.
        const rowFlags = ctx.rows.map((r) => r.flag).filter(Boolean) as ('N' | 'H' | 'L' | 'HH' | 'LL')[];
        if (rowFlags.includes('HH') || rowFlags.includes('LL')) flag = rowFlags.includes('HH') ? 'HH' : 'LL';
        else if (rowFlags.includes('H') || rowFlags.includes('L')) flag = rowFlags.includes('H') ? 'H' : 'L';
        else if (rowFlags.length > 0) flag = 'N';
    }

    // Plain-text version (strip HTML tags, collapse whitespace).
    const html = [header, body, footer].filter(Boolean).join("\n");
    const plain = html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // Normal range string (formatted for display)
    const normalRange = formatRange(flagInputs?.normalRangeMin ?? null, flagInputs?.normalRangeMax ?? null);

    return { html, plain, flag, normalRange };
}

// ═══════════════════════════════════════════════════════════════════════════
// Default per-test template generators
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect whether a test is best rendered in "table" mode (multi-analyte panels
 * like FBC, LFT) vs "single" mode (single value like Hb, Glucose).
 */
const TABLE_MODE_TESTS = new Set([
    "Full Blood Count", "FBC", "Complete Blood Count", "CBC",
    "Liver Function Test", "LFT", "Liver Function Tests",
    "Kidney Function Test", "KFT", "RFT", "Renal Function Test",
    "Lipid Profile",
    "Thyroid Function Test", "TFT",
    "Electrolytes", "Serum Electrolytes",
    "Coagulation Profile", "Coagulation Studies",
    "Urinalysis",
    "Stool Analysis",
    "Differential Count",
    "Hemoglobin Electrophoresis",
]);

const QUALITATIVE_TESTS = new Set([
    "HIV Test", "HBsAg", "HCV", "VDRL", "RPR",
    "Malaria Smear", "Malaria Antigen", "MRDT",
    "Pregnancy Test", "UPT", "Beta HCG",
    "Blood Group", "Blood Grouping", "Crossmatch",
    "Mantoux Test", "TB Skin Test",
]);

export function defaultTemplateFor(opts: { testName: string; categoryName?: string; unit?: string; referenceRange?: string }): { resultMode: "single" | "table" | "qualitative"; templateHtml: string; resultSchema?: any } {
    const name = (opts.testName || "").trim();

    // Strip a trailing "(alias)" to match canonical names. Tests in the
    // catalog are commonly stored as "Complete Blood Count (CBC)" or
    // "Full Blood Count (FBC/CBC)" while the canonical set members
    // are bare ("Complete Blood Count", "Full Blood Count"). Without
    // this strip, every aliased test name falls through to `single`
    // mode even when it's a multi-analyte panel like FBC.
    const aliasMatch = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    const canonicalName = aliasMatch ? aliasMatch[1].trim() : name;

    if (QUALITATIVE_TESTS.has(name) || QUALITATIVE_TESTS.has(canonicalName)) {
        return {
            resultMode: "qualitative",
            templateHtml: `
<div style="font-family: 'Times New Roman', serif; max-width: 820px; margin: 16px auto; color: #000;">
  <h3 style="font-size: 14px; margin: 0 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">Result</h3>
  <div style="padding: 16px; background: #fafafa; border: 1px solid #ddd; font-size: 14px;">
    <strong>{{qualitative_result}}</strong>
    {{#if qualitative_description}}<div style="margin-top: 8px; font-size: 12px; color: #555;">{{qualitative_description}}</div>{{/if}}
  </div>
  {{#if has_notes}}<h3 style="font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">Notes</h3><div style="font-size: 12px;">{{notes}}</div>{{/if}}
</div>`.trim(),
        };
    }

    if (TABLE_MODE_TESTS.has(name) || TABLE_MODE_TESTS.has(canonicalName)) {
        return {
            resultMode: "table",
            templateHtml: `
<div style="font-family: 'Times New Roman', serif; max-width: 820px; margin: 16px auto; color: #000;">
  <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
    <thead>
      <tr style="background: #f4f4f4;">
        <th style="border: 1px solid #000; padding: 6px; text-align: left;">Test</th>
        <th style="border: 1px solid #000; padding: 6px; text-align: left;">Result</th>
        <th style="border: 1px solid #000; padding: 6px; text-align: left;">Unit</th>
        <th style="border: 1px solid #000; padding: 6px; text-align: left;">Reference</th>
        <th style="border: 1px solid #000; padding: 6px; text-align: center;">Flag</th>
      </tr>
    </thead>
    <tbody>
      {{#each rows}}
      <tr>
        <td style="border: 1px solid #000; padding: 6px;">{{row_name}}</td>
        <td style="border: 1px solid #000; padding: 6px; font-weight: 600;" class="{{row_flag_class}}">{{row_value}}</td>
        <td style="border: 1px solid #000; padding: 6px;">{{row_unit}}</td>
        <td style="border: 1px solid #000; padding: 6px;">{{row_reference}}</td>
        <td style="border: 1px solid #000; padding: 6px; text-align: center;" class="{{row_flag_class}}"><strong>{{row_flag}}</strong></td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{#if has_notes}}<h3 style="font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">Notes</h3><div style="font-size: 12px;">{{notes}}</div>{{/if}}
</div>`.trim(),
        };
    }

    // Single-value default
    return {
        resultMode: "single",
        templateHtml: `
<div style="font-family: 'Times New Roman', serif; max-width: 820px; margin: 16px auto; color: #000;">
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr>
      <td style="border: 1px solid #000; padding: 12px; width: 30%; font-weight: 700; background: #f4f4f4;">{{test_name}}</td>
      <td style="border: 1px solid #000; padding: 12px; font-size: 18px; font-weight: 700;" class="{{row_flag_class}}">{{row_value}} {{test_unit}}</td>
      <td style="border: 1px solid #000; padding: 12px; font-size: 12px; color: #555;">Reference: {{test_reference}}</td>
    </tr>
  </table>
  {{#if has_notes}}<h3 style="font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #000; padding-bottom: 4px;">Notes</h3><div style="font-size: 12px;">{{notes}}</div>{{/if}}
</div>`.trim(),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// Reference range parser
// ═══════════════════════════════════════════════════════════════════════════
export function parseReferenceRange(range: string | null | undefined): { normalMin: number | null; normalMax: number | null } {
    if (!range) return { normalMin: null, normalMax: null };
    const cleaned = range.replace(/[^\d.\-<>≤≥]/g, "").trim();
    const dashMatch = cleaned.match(/^([\d.]+)\s*-\s*([\d.]+)$/);
    if (dashMatch) {
        return { normalMin: parseFloat(dashMatch[1]), normalMax: parseFloat(dashMatch[2]) };
    }
    const ltMatch = cleaned.match(/^<\s*([\d.]+)$/);
    if (ltMatch) return { normalMin: null, normalMax: parseFloat(ltMatch[1]) };
    const gtMatch = cleaned.match(/^>\s*([\d.]+)$/);
    if (gtMatch) return { normalMin: parseFloat(gtMatch[1]), normalMax: null };
    return { normalMin: null, normalMax: null };
}
