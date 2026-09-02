/**
 * Lab test standards — comprehensive definitions for the standard panels.
 *
 * Sources / authorities followed:
 *   - IFCC (International Federation of Clinical Chemistry) — primary reference
 *     for analyte names, units, and method-specific reference intervals.
 *   - CLSI EP28-A3c (Defining, Establishing, and Verifying Reference Intervals
 *     in the Clinical Laboratory; Approved Guideline) — adult reference ranges.
 *   - WHO Laboratory Guidelines for Sexually Transmitted Infections (2021)
 *     and WHO Guidelines on Drawing Blood (2010).
 *   - Tietz Textbook of Clinical Chemistry and Molecular Diagnostics, 6th ed.
 *   - Henry's Clinical Diagnosis and Management by Laboratory Methods, 24th ed.
 *   - Uganda Ministry of Health — Standard Treatment Manual 2023 (selected
 *     tropical-disease and STI panels; interpretation thresholds calibrated
 *     for East African populations).
 *   - Makerere University / Mulago National Referral Hospital laboratory
 *     handbook (used as a reference for common practice in Ugandan hospital
 *     labs, especially for Widal, Brucella, BS for MPs, and H. pylori).
 *   - WHO laboratory manual for the examination of human semen, 6th ed. (2021).
 *
 * Layout convention used by every standardized report:
 *   Header  : clinic letterhead → patient demographics → specimen/method
 *             block (specimen, collected, received, reported) → test title
 *   Body    : standardized analyte table
 *               Test | Result | Unit | Reference Range | Flag
 *             Sections (e.g. Red Cell Indices / WBC Differential) appear as
 *             merged-header rows in the same table.
 *   Footer  : signature lines (Performed by, Verified by), methodology note,
 *             critical-value notice if any HH/LL flag was set, "End of report".
 *
 * Reference ranges are the *adult* combined-sex range unless a sex-specific
 * override is in `sexRanges`. Pediatric ranges are documented in `notes` and
 * surfaced on the report by the template's interpretive section.
 */

import type { SchemaRow } from "./lab-templates-utils";

// ─── Test metadata ──────────────────────────────────────────────────────

export interface AnalyteRange {
    /** Combined-sex adult reference range. Used when sexRanges doesn't have a
     *  sex-specific override. */
    low: number;
    high: number;
    /** Optional sex-specific ranges (override the combined range). */
    sexRanges?: { M?: [number, number]; F?: [number, number] };
    /** Critical / panic values (CLSI EP15-A3 / CLSI GP44-A4). */
    criticalLow?: number;
    criticalHigh?: number;
    /** SI unit string. */
    unit: string;
    /** Optional traditional-unit (mg/dL instead of mmol/L etc.) — printed in
     *  parentheses next to the SI value. */
    altUnit?: string;
    /** Free-text interpretive note. Surfaced in the report's "Methodology /
     *  Clinical notes" block. */
    note?: string;
    /** Section header to group this analyte with others (e.g. "Red Cell
     *  Indices", "Liver Enzymes"). */
    section?: string;
}

export interface TestDefinition {
    /** Canonical name (matches the catalog name or the alias-stripped form). */
    name: string;
    /** Free-text clinical notes — surfaced on the report. */
    description?: string;
    /** Specimen type (whole blood, serum, plasma, urine, stool, CSF, …). */
    specimen: string;
    /** Container / preservative (EDTA, SST, plain tube, sterile pot, …). */
    container: string;
    /** Primary analytical method. */
    method: string;
    /** Approximate TAT in minutes — surfaced on the report header. */
    turnaroundMinutes: number;
    /** Test mode. Drives which template generator to use. */
    mode: "table" | "single" | "qualitative" | "label-value" | "serology";
    /** Analytes for table-mode tests. */
    analytes?: AnalyteRange[];
    /** Free-text sections for label-value tests (e.g. blood-bank panel). */
    labelSections?: string[];
    /** Reference range as a string for single-value tests (e.g. "Negative",
     *  "Non-Reactive", or a numeric range like "3.9 - 6.1"). */
    referenceRange?: string;
    /** Unit string for single-value tests. */
    unit?: string;
    /** Critical / panic values for single-value tests. */
    criticalLow?: number;
    criticalHigh?: number;
    /** Sex-specific reference range for single-value tests. */
    sexRanges?: { M?: [number, number]; F?: [number, number] };
    /** Clinical interpretation block — printed at the bottom of the report. */
    interpretation?: string;
    /** Free-text methodology note for the footer. */
    methodologyNote?: string;
}

// ─── Section constants (shared between tests) ───────────────────────────

const SECTION_RBC = "Red Cell Indices";
const SECTION_WBC = "White Cell Count & Differential";
const SECTION_PLT = "Platelets";
const SECTION_RFT = "Renal Function";
const SECTION_ELECTROLYTES = "Electrolytes";
const SECTION_LFT_ENZYMES = "Hepatocellular & Cholestatic Enzymes";
const SECTION_LFT_PROTEINS = "Proteins & Bilirubin";
const SECTION_LIPIDS_RATIOS = "Atherogenic Indices";
const SECTION_UA_PHYS = "Physical Examination";
const SECTION_UA_CHEM = "Chemical Examination (Dipstick)";
const SECTION_UA_MICRO = "Microscopic Examination";
const SECTION_STOOL_MACRO = "Macroscopic Examination";
const SECTION_STOOL_MICRO = "Microscopic Examination";
const SECTION_SEMEN_MACRO = "Macroscopic Examination";
const SECTION_SEMEN_MICRO = "Microscopic Examination (WHO 2021)";

// ═══════════════════════════════════════════════════════════════════════════
//  HEMATOLOGY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Full Blood Count — 16-analyte panel, international SI units, sex-specific
 * Hb/Hct/RBC. CLSI EP28-A3c adult ranges.
 */
const FBC: TestDefinition = {
    name: "Full Blood Count",
    description: "Complete blood count with automated differential. EDTA whole blood, analysed on a 5-part differential haematology analyser.",
    specimen: "Whole blood (EDTA, K₂-EDTA or K₃-EDTA tube)",
    container: "Lavender/purple-top vacutainer",
    method: "Automated electrical impedance + flow cytometry (Sysmex XN-series / Mindray BC-6800 equivalent)",
    turnaroundMinutes: 45,
    mode: "table",
    analytes: [
        // Red Cell Indices
        { section: SECTION_RBC, investigation: "Hemoglobin",          unit: "g/dL",  low: 12,  high: 17,  sexRanges: { M: [13, 17], F: [12, 15.5] }, criticalLow: 7,   criticalHigh: 20,  note: "WHO cut-off for anaemia: non-pregnant women <12, men <13, pregnant women <11." },
        { section: SECTION_RBC, investigation: "RBC Count",           unit: "×10⁶/μL", low: 4.0, high: 5.5, sexRanges: { M: [4.5, 5.5], F: [3.8, 4.8] }, criticalLow: 2.0, criticalHigh: 7.0 },
        { section: SECTION_RBC, investigation: "PCV / Hematocrit",    unit: "%",     low: 36,  high: 50,  sexRanges: { M: [40, 50], F: [36, 46] }, criticalLow: 20,   criticalHigh: 60 },
        { section: SECTION_RBC, investigation: "MCV",                 unit: "fL",    low: 80,  high: 100, criticalLow: 60,  criticalHigh: 120, note: "Microcytic <80, Normocytic 80-100, Macrocytic >100." },
        { section: SECTION_RBC, investigation: "MCH",                 unit: "pg",    low: 27,  high: 33,  criticalLow: 20,  criticalHigh: 40 },
        { section: SECTION_RBC, investigation: "MCHC",                unit: "g/dL",  low: 32,  high: 36,  criticalLow: 25,  criticalHigh: 40 },
        { section: SECTION_RBC, investigation: "RDW-CV",              unit: "%",     low: 11.5, high: 14.5, note: "Elevated in mixed-deficiency anaemias, IDA, post-transfusion." },
        // WBC
        { section: SECTION_WBC, investigation: "Total WBC",           unit: "×10³/μL", low: 4, high: 11, criticalLow: 1, criticalHigh: 30, note: "Leukopenia <4, Leukocytosis >11 — see differential." },
        { section: SECTION_WBC, investigation: "Neutrophils",         unit: "%",     low: 40,  high: 70,  criticalLow: null, criticalHigh: null, note: "Absolute count: 2.0-7.5 ×10³/μL." },
        { section: SECTION_WBC, investigation: "Lymphocytes",         unit: "%",     low: 20,  high: 40,  note: "Absolute count: 1.0-4.0 ×10³/μL." },
        { section: SECTION_WBC, investigation: "Monocytes",           unit: "%",     low: 2,   high: 8,   note: "Absolute count: 0.2-0.8 ×10³/μL." },
        { section: SECTION_WBC, investigation: "Eosinophils",         unit: "%",     low: 1,   high: 6,   note: "Absolute count: 0.05-0.5 ×10³/μL. Elevated in parasitic infection, allergy." },
        { section: SECTION_WBC, investigation: "Basophils",           unit: "%",     low: 0,   high: 1,   note: "Absolute count: 0.01-0.1 ×10³/μL." },
        // Platelets
        { section: SECTION_PLT, investigation: "Platelet Count",      unit: "×10³/μL", low: 150, high: 400, criticalLow: 50, criticalHigh: 1000, note: "Thrombocytopenia <150, Thrombocytosis >400. Spontaneous bleeding risk <20." },
        { section: SECTION_PLT, investigation: "MPV",                 unit: "fL",    low: 7.5, high: 11.5, note: "Mean Platelet Volume — larger in immune thrombocytopenia, smaller in production failure." },
    ],
    interpretation: "Anaemia classification (WHO):\n  • Mild  : Hb 10.0-10.9 g/dL (women) / 10.0-12.9 g/dL (men)\n  • Moderate: Hb 7.0-9.9 g/dL\n  • Severe: Hb <7.0 g/dL",
    methodologyNote: "Automated cell counter with daily internal QC (3 levels) and external proficiency testing. Peripheral smear reviewed for any flagged result.",
};

/**
 * ESR — Westergren method. Range increases with age; the common rule-of-thumb
 * is "upper limit = age/2 in mm/hr for those >50 years".
 */
const ESR: TestDefinition = {
    name: "ESR (Erythrocyte Sedimentation Rate)",
    description: "Non-specific marker of inflammation. Westergren method (1 hour, 200 mm column).",
    specimen: "Whole blood (EDTA, transferred to Westergren tube) or citrated blood",
    container: "Lavender-top (EDTA) or black-top (citrate) vacutainer",
    method: "Westergren manual or automated (Ves-Matic / Alifax equivalent)",
    turnaroundMinutes: 90,
    mode: "single",
    unit: "mm/hr",
    referenceRange: "0 - 15",
    sexRanges: { M: [0, 15], F: [0, 20] },
    criticalLow: null,
    criticalHigh: 100,
    interpretation: "Reference range (Westergren, 1 hr):\n  • Men      : 0-15 mm/hr\n  • Women    : 0-20 mm/hr\n  • >50 years: upper limit ≈ age/2 (mm/hr)\n\nElevated in: chronic inflammation, infection (TB, abscess), auto-immune disease, multiple myeloma, pregnancy, anaemia.\nNot specific — interpret with CRP / clinical picture.",
    methodologyNote: "Performed within 2 hours of collection or sample refrigerated at 4 °C (max 6 hrs). Westergren column read at exactly 60 minutes.",
};

/**
 * Peripheral blood film — morphology report.
 */
const PERIPHERAL_FILM: TestDefinition = {
    name: "Peripheral Blood Film",
    description: "Morphological review of red cells, white cells, platelets, and detection of parasites (malaria, trypanosomes, microfilaria).",
    specimen: "Whole blood (EDTA)",
    container: "Lavender-top vacutainer — make fresh smears within 2 hours of collection",
    method: "Giemsa / Wright-stained thin and thick films examined under 100× oil immersion",
    turnaroundMinutes: 60,
    mode: "table",
    analytes: [
        { investigation: "RBC Morphology",     unit: "", low: null as any, high: null as any, note: "Normocytic, normochromic. Comment on anisopoikilocytosis, micro-/macro-cytosis, hypochromia, polychromasia, target cells, sickle cells, helmet cells, schistocytes, basophilic stippling, Howell-Jolly bodies, nucleated RBCs." },
        { investigation: "WBC Morphology",     unit: "", low: null as any, high: null as any, note: "Comment on left shift, toxic granulation, atypical/reactive lymphocytes, blasts, hypersegmented neutrophils." },
        { investigation: "Platelet Morphology",unit: "", low: null as any, high: null as any, note: "Adequate / reduced / clumped / giant platelets." },
        { investigation: "Cell Distribution",  unit: "", low: null as any, high: null as any, note: "Even / uneven / rouleaux formation / agglutination." },
        { investigation: "Parasites",          unit: "", low: null as any, high: null as any, note: "Malaria parasites (P. falciparum / P. vivax / P. malariae / P. ovale), Trypanosoma spp., microfilaria, Borrelia. If seen, proceed to species identification and parasite count." },
        { investigation: "Pathologist Comment",unit: "", low: null as any, high: null as any, note: "Free-text morphology summary + clinical correlation." },
    ],
    methodologyNote: "Thin film: Leishman / Wright stain, 100× oil immersion, ≥100 WBCs reviewed. Thick film (for malaria): Giemsa, examined for ≥200 oil-immersion fields before reporting 'No MP seen'.",
};

/**
 * Sickle cell screening — solubility test.
 */
const SICKLE_CELL: TestDefinition = {
    name: "Sickle Cell Screening (Solubility Test)",
    description: "Qualitative screening for HbS. Positive in sickle cell trait (HbAS) and disease (HbSS); confirm by Hb electrophoresis / HPLC.",
    specimen: "Whole blood (EDTA) or finger-prick",
    container: "Lavender-top vacutainer or capillary sample",
    method: "Sodium metabisulphite / Sickledex solubility test",
    turnaroundMinutes: 30,
    mode: "single",
    unit: "",
    referenceRange: "Negative",
    interpretation: "POSITIVE result suggests presence of HbS. Cannot distinguish trait (HbAS) from disease (HbSS). Confirm by:\n  • Hb electrophoresis (alkaline pH 8.4 + acid pH 6.0-6.2)\n  • HPLC (Biorad Variant II / Tosoh G8)\n  • Capillary electrophoresis (Sebia)\n\nNEGATIVE result does not exclude HbS if patient is <6 months old (high HbF suppresses sickling) — repeat after 6 months or proceed directly to electrophoresis.",
    methodologyNote: "Solubility tests detect HbS but NOT other Hb variants (HbC, HbE, β-thalassaemia trait). Always confirm with electrophoresis/HPLC before diagnosis.",
};

/**
 * Blood Grouping & Crossmatch — label-value layout.
 */
const BLOOD_GROUP: TestDefinition = {
    name: "Blood Grouping & Crossmatch",
    description: "ABO + Rh(D) grouping, antibody screen, and crossmatch for transfusion safety.",
    specimen: "Whole blood (EDTA) for grouping, clotted (SST) for antibody screen + crossmatch",
    container: "Lavender-top (grouping) + red-top (antibody screen / crossmatch)",
    method: "Tube / gel-card agglutination (Bio-Rad ID-System / Grifols Erytra equivalent)",
    turnaroundMinutes: 90,
    mode: "label-value",
    labelSections: [
        "Patient's ABO Group",
        "Patient's Rh (D) Type",
        "Antibody Screen (IAT)",
        "Donor's ABO Group",
        "Donor's Rh (D) Type",
        "Crossmatch — Major (Patient serum × Donor cells)",
        "Crossmatch — Minor (Donor serum × Patient cells)",
        "Compatibility",
    ],
    interpretation: "AHG / IAT crossmatch: NO agglutination or hemolysis = compatible.\nIf incompatible: repeat grouping, repeat antibody screen, perform antibody identification panel, consult transfusion medicine.",
    methodologyNote: "Performed by a registered Medical Laboratory Technologist. Two independent patient identifiers confirmed at draw. Released units are valid for 24 hours; longer storage requires re-crossmatch.",
};

// ═══════════════════════════════════════════════════════════════════════════
//  BIOCHEMISTRY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fasting plasma glucose.
 */
const FBG: TestDefinition = {
    name: "Fasting Blood Glucose",
    description: "Plasma glucose after ≥8 hours of fasting. WHO/ADA criteria for impaired fasting glucose and diabetes.",
    specimen: "Fluoride-oxalate plasma (preferred) or serum",
    container: "Grey-top (NaF/K-oxalate) vacutainer — keep on ice",
    method: "Hexokinase / glucose oxidase enzymatic",
    turnaroundMinutes: 30,
    mode: "single",
    unit: "mmol/L",
    referenceRange: "3.9 - 6.1",
    altUnit: "mg/dL (÷ 0.0555)",
    sexRanges: {},
    criticalLow: 2.5,
    criticalHigh: 25,
    interpretation: "WHO / ADA diagnostic criteria (venous plasma):\n  • Normal fasting glucose      : 3.9 - 6.1 mmol/L  (70-110 mg/dL)\n  • Impaired fasting glucose (IFG): 6.1 - 6.9 mmol/L (110-125 mg/dL)\n  • Diabetes mellitus (DM)     : ≥7.0 mmol/L on two occasions (≥126 mg/dL)\n\nCritical: <2.5 mmol/L (hypoglycaemia — immediate management); >25 mmol/L (hyperosmolar state).",
    methodologyNote: "Sample should be separated within 30 min of collection. Haemolysis invalidates result.",
};

/**
 * Random plasma glucose.
 */
const RBG: TestDefinition = {
    name: "Random Blood Glucose",
    description: "Plasma glucose drawn at any time regardless of meal. Used for emergency / opportunistic screening.",
    specimen: "Fluoride-oxalate plasma",
    container: "Grey-top vacutainer",
    method: "Hexokinase / glucose oxidase enzymatic",
    turnaroundMinutes: 30,
    mode: "single",
    unit: "mmol/L",
    referenceRange: "3.9 - 7.8",
    criticalLow: 2.5,
    criticalHigh: 25,
    interpretation: "WHO / ADA criteria for casual (random) plasma glucose:\n  • Normal: <7.8 mmol/L (<140 mg/dL)\n  • Diabetes (symptoms + casual PG): ≥11.1 mmol/L (≥200 mg/dL)\n\nConfirm any abnormal result with a fasting or 2-h OGTT reading.",
    methodologyNote: "If abnormal, request a repeat fasting glucose, OGTT, or HbA1c before diagnosing diabetes.",
};

/**
 * HbA1c — NGSP % and IFCC mmol/mol reported together.
 */
const HBA1C: TestDefinition = {
    name: "HbA1c",
    description: "Glycated haemoglobin — reflects mean glycaemia over the preceding 8-12 weeks.",
    specimen: "Whole blood (EDTA)",
    container: "Lavender-top vacutainer",
    method: "Tosoh G8 / Bio-Rad D-100 HPLC (NGSP-certified, IFCC-traceable)",
    turnaroundMinutes: 60,
    mode: "single",
    unit: "%",
    altUnit: "mmol/mol (IFCC)",
    referenceRange: "4.0 - 6.0",
    criticalLow: null,
    criticalHigh: 14,
    interpretation: "Diagnostic criteria (ADA / WHO 2021):\n  • Normal              : <5.7%  (<39 mmol/mol)\n  • Increased risk (Pre-DM): 5.7-6.4% (39-46 mmol/mol)\n  • Diabetes mellitus   : ≥6.5%  (≥48 mmol/mol) on two occasions\n\nTherapeutic targets (ADA / EASD):\n  • Most non-pregnant adults with DM : <7.0%  (<53 mmol/mol)\n  • Older / frail / hypoglycaemia-prone: <7.5-8.0%\n  • Pregnancy (pre-existing DM)       : <6.0%  if achievable safely\n\nConversion: NGSP% = 0.09148 × IFCC(mmol/mol) + 2.152",
    methodologyNote: "Invalid in conditions altering RBC lifespan: recent transfusion, haemolytic anaemia, iron/B12 deficiency (recent), pregnancy (esp. 2nd/3rd trimester), CKD on EPO. Use fructosamine or fasting glucose in these settings.",
};

/**
 * Lipid profile — 7 analytes.
 */
const LIPID: TestDefinition = {
    name: "Lipid Profile",
    description: "Fasting (≥9-12 h) lipid panel for cardiovascular risk assessment.",
    specimen: "Serum (SST) or lithium-heparin plasma",
    container: "Red-top (SST) or green-top (Li-heparin) vacutainer",
    method: "Enzymatic colorimetric (CHOD-PAP for cholesterol, GPO-PAP for TG); HDL by direct clearance / precipitation; LDL by Friedewald (TG<4.5 mmol/L) or direct.",
    turnaroundMinutes: 90,
    mode: "table",
    analytes: [
        { investigation: "Total Cholesterol",  unit: "mmol/L", low: 3.0, high: 5.2, criticalHigh: 7.8, note: "Desirable <5.2, Borderline 5.2-6.2, High ≥6.2 mmol/L (NCEP ATP III)." },
        { investigation: "Triglycerides",      unit: "mmol/L", low: 0,   high: 1.7, criticalHigh: 11.3, note: "Desirable <1.7, Borderline 1.7-2.3, High 2.3-5.6, Very high >5.6 mmol/L." },
        { investigation: "HDL Cholesterol",    unit: "mmol/L", low: 1.0, high: null as any, sexRanges: { M: [1.0, null as any], F: [1.2, null as any] }, criticalLow: 0.5, note: "Low HDL increases CV risk. <1.0 (M), <1.2 (F) mmol/L is a CV risk factor per NCEP." },
        { investigation: "LDL Cholesterol",    unit: "mmol/L", low: 0,   high: 3.4, criticalHigh: 4.9, note: "Optimal <2.6, Near-optimal 2.6-3.3, Borderline 3.4-4.1, High 4.2-4.9, Very high ≥4.9 mmol/L." },
        { investigation: "VLDL Cholesterol",   unit: "mmol/L", low: 0,   high: 0.9, note: "Calculated as TG/2.2 (Friedewald, in mmol/L)." },
        { section: SECTION_LIPIDS_RATIOS, investigation: "Non-HDL Cholesterol", unit: "mmol/L", low: 0, high: 4.3, note: "Total - HDL. Target <4.3 (high risk <3.4, very high risk <2.6 mmol/L)." },
        { section: SECTION_LIPIDS_RATIOS, investigation: "Total : HDL Ratio",   unit: "",        low: 0, high: 4.5, note: "Risk categories: <4.0 average, 4.0-5.0 moderate, 5.0-6.0 high, >6.0 very high CV risk." },
    ],
    interpretation: "Cardiovascular risk stratification (NCEP ATP III / EAS 2019):\n  • Optimal           : TC <5.2, LDL <2.6, TG <1.7, HDL ≥1.0 (M) / ≥1.2 (F) mmol/L\n  • Borderline high  : TC 5.2-6.2, LDL 3.4-4.1, TG 1.7-2.3 mmol/L\n  • High              : TC ≥6.2, LDL ≥4.2, TG ≥2.3 mmol/L\n  • Very high         : LDL ≥4.9 OR documented ASCVD / DM with target organ damage",
    methodologyNote: "Patient should be fasting 9-12 hours and on a stable diet ≥3 weeks. Lipid-lowering therapy should be noted on the request form.",
};

/**
 * Liver Function Tests — 11 analytes, sections for proteins and enzymes.
 */
const LFT: TestDefinition = {
    name: "Liver Function Tests",
    description: "Hepatic panel: hepatocellular injury, cholestasis, synthetic function, and protein status.",
    specimen: "Serum (SST)",
    container: "Red-top (SST) vacutainer — avoid haemolysis",
    method: "Photometric (enzymatic rate for enzymes; biuret for total protein; BCG/BCP for albumin; Jendrassik-Grof for bilirubin)",
    turnaroundMinutes: 90,
    mode: "table",
    analytes: [
        { section: SECTION_LFT_PROTEINS, investigation: "Total Bilirubin",   unit: "mg/dL", low: 0.2, high: 1.2, criticalHigh: 15, note: "Direct (conjugated) + Indirect (unconjugated)." },
        { section: SECTION_LFT_PROTEINS, investigation: "Direct Bilirubin",  unit: "mg/dL", low: 0,   high: 0.4 },
        { section: SECTION_LFT_PROTEINS, investigation: "Indirect Bilirubin",unit: "mg/dL", low: 0.1, high: 0.8, note: "Calculated: Total - Direct." },
        { section: SECTION_LFT_PROTEINS, investigation: "Total Protein",     unit: "g/dL",  low: 6.0, high: 8.3, note: "Albumin + Globulin." },
        { section: SECTION_LFT_PROTEINS, investigation: "Albumin",           unit: "g/dL",  low: 3.5, high: 5.5, criticalLow: 2.0, note: "Inverse acute-phase reactant. Half-life ~20 days." },
        { section: SECTION_LFT_PROTEINS, investigation: "Globulin",          unit: "g/dL",  low: 2.0, high: 3.5, note: "Calculated: Total - Albumin. A/G ratio 1.1-2.0." },
        { section: SECTION_LFT_PROTEINS, investigation: "A/G Ratio",         unit: "",      low: 1.1, high: 2.0, note: "Reversed (<1) in chronic liver disease, multiple myeloma." },
        { section: SECTION_LFT_ENZYMES, investigation: "ALP (Alkaline Phosphatase)", unit: "U/L", low: 44,  high: 147, note: "Elevated in cholestasis, bone disease, pregnancy (placental)." },
        { section: SECTION_LFT_ENZYMES, investigation: "AST (SGOT)",        unit: "U/L",   low: 8,   high: 48,  note: "Also in cardiac muscle, skeletal muscle, RBCs — not liver-specific." },
        { section: SECTION_LFT_ENZYMES, investigation: "ALT (SGPT)",        unit: "U/L",   low: 7,   high: 55,  note: "More liver-specific than AST. De Ritis ratio AST/ALT >2 suggests alcoholic liver disease." },
        { section: SECTION_LFT_ENZYMES, investigation: "GGT (γ-Glutamyl Transferase)", unit: "U/L", low: 9, high: 48, sexRanges: { M: [11, 55], F: [9, 38] }, note: "Sensitive to alcohol use, cholestasis, enzyme induction." },
    ],
    interpretation: "Hepatocellular vs cholestatic pattern:\n  • Hepatocellular: AST/ALT ↑↑; ALP mildly ↑ or normal\n  • Cholestatic:    ALP ↑↑; GGT ↑; bilirubin ↑; AST/ALT mild ↑\n\nR-values (ALT ÷ ULN) / (ALP ÷ ULN):\n  • >5  = hepatocellular\n  • <2  = cholestatic\n  • 2-5 = mixed",
    methodologyNote: "Avoid haemolysis (releases AST from RBCs). Mark age, sex, and pregnancy on the request — ALP is age- and pregnancy-dependent.",
};

/**
 * Renal Function Tests — was wrongly single, must be a table.
 */
const RFT: TestDefinition = {
    name: "Renal Function Tests",
    description: "Assessment of glomerular filtration, nitrogenous waste excretion, and serum electrolytes (Urea + Electrolytes + Creatinine, 'UEC' or 'RFT').",
    specimen: "Serum (SST)",
    container: "Red-top (SST) vacutainer",
    method: "Urease-GLDH (urea), Jaffe kinetic (creatinine), ion-selective electrode (electrolytes), uricase (uric acid). eGFR by CKD-EPI 2021 (race-free).",
    turnaroundMinutes: 90,
    mode: "table",
    analytes: [
        { section: SECTION_RFT, investigation: "Urea",                unit: "mmol/L", low: 2.5, high: 7.1, criticalHigh: 35.7, altUnit: "mg/dL (×2.8)", note: "BUN (mg/dL) = Urea (mmol/L) × 2.8." },
        { section: SECTION_RFT, investigation: "BUN (Blood Urea Nitrogen)", unit: "mg/dL", low: 7, high: 20, criticalHigh: 100, note: "Calculated from Urea." },
        { section: SECTION_RFT, investigation: "Creatinine",          unit: "mg/dL", low: 0.6, high: 1.3, sexRanges: { M: [0.7, 1.3], F: [0.6, 1.1] }, criticalHigh: 7, altUnit: "μmol/L (×88.4)", note: "Reflects muscle mass — interpret with eGFR." },
        { section: SECTION_RFT, investigation: "Uric Acid",           unit: "mg/dL", low: 3.4, high: 7.0, sexRanges: { M: [3.4, 7.0], F: [2.4, 6.0] }, note: "Elevated in gout, tumour lysis, renal insufficiency." },
        { section: SECTION_RFT, investigation: "eGFR (CKD-EPI 2021)", unit: "mL/min/1.73m²", low: 90, high: 120, criticalLow: 15, note: "CKD stages: G1 ≥90, G2 60-89, G3a 45-59, G3b 30-44, G4 15-29, G5 <15. Race-free equation (CKD-EPI 2009 → 2021)." },
        { section: SECTION_ELECTROLYTES, investigation: "Sodium (Na⁺)",   unit: "mmol/L", low: 135, high: 145, criticalLow: 120, criticalHigh: 160, note: "Hyponatraemia <135, Hypernatraemia >145." },
        { section: SECTION_ELECTROLYTES, investigation: "Potassium (K⁺)", unit: "mmol/L", low: 3.5, high: 5.0, criticalLow: 2.5, criticalHigh: 6.5, note: "Hypokalaemia <3.5, Hyperkalaemia >5.0. Critical: <2.5 or >6.5 mmol/L — risk of arrhythmia." },
        { section: SECTION_ELECTROLYTES, investigation: "Chloride (Cl⁻)", unit: "mmol/L", low: 98,  high: 107, note: "Useful in acid-base interpretation (Cl⁻ + HCO₃⁻ ≈ Na⁺ + 12)." },
        { section: SECTION_ELECTROLYTES, investigation: "Bicarbonate (HCO₃⁻)", unit: "mmol/L", low: 22, high: 29, criticalLow: 15, criticalHigh: 40, note: "Reflects metabolic component of acid-base. Low in metabolic acidosis, high in metabolic alkalosis." },
    ],
    interpretation: "AKI staging (KDIGO 2012, on serum creatinine):\n  • Stage 1 : Cr ↑ ≥0.3 mg/dL or 1.5-1.9× baseline\n  • Stage 2 : Cr 2.0-2.9× baseline\n  • Stage 3 : Cr ≥3× baseline OR ≥4.0 mg/dL OR initiation of RRT",
    methodologyNote: "eGFR computed using CKD-EPI 2021 (race-free). Patient age and sex required. eGFR not validated in pregnancy, acute kidney injury, extremes of muscle mass — interpret clinically.",
};

// ═══════════════════════════════════════════════════════════════════════════
//  SEROLOGY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HIV 1&2 screening.
 */
const HIV: TestDefinition = {
    name: "HIV 1&2 Screening",
    description: "Screening for antibodies to HIV-1 and HIV-2. Uganda national algorithm: 1st test (Determine) + 2nd test (Stat-Pak), confirm with 3rd tie-breaker if discordant.",
    specimen: "Whole blood (EDTA), serum, or finger-prick capillary",
    container: "Lavender-top vacutainer, serum SST, or capillary tube",
    method: "Immunochromatographic rapid test (Determine HIV-1/2, OraQuick, SD Bioline). Confirmatory: Geenius HIV-1/2 supplemental assay.",
    turnaroundMinutes: 30,
    mode: "single",
    unit: "",
    referenceRange: "Non-Reactive",
    interpretation: "Uganda MoH HIV testing algorithm (2022):\n  1. Determine HIV-1/2 (1st test): Non-Reactive → HIV NEGATIVE.\n  2. If Reactive → Stat-Pak (2nd test):\n     • Both Reactive → HIV POSITIVE.\n     • Discordant → 3rd tie-breaker (e.g. Geenius) — follow result.\n  3. If 3rd test Reactive → POSITIVE. If Non-Reactive → NEGATIVE but retest in 4 weeks (window period).\n\nWindow period: 4-12 weeks post-exposure. Pre-test and post-test counselling mandatory.",
    methodologyNote: "Quality control run daily with kit-provided positive and negative controls. Report confidentially per MoH HTS guidelines.",
};

/**
 * HBsAg.
 */
const HBSAG: TestDefinition = {
    name: "Hepatitis B Surface Antigen (HBsAg)",
    description: "Screening for active HBV infection. First-line marker for acute, chronic, and carrier states.",
    specimen: "Whole blood (EDTA), serum, or finger-prick capillary",
    container: "Lavender-top vacutainer, serum SST, or capillary tube",
    method: "Immunochromatographic rapid test (Determine HBsAg, SD Bioline). Confirmatory: HBsAg neutralisation / quantitative HBsAg / HBV DNA PCR.",
    turnaroundMinutes: 30,
    mode: "single",
    unit: "",
    referenceRange: "Non-Reactive",
    interpretation: "REACTIVE = current HBV infection (acute, chronic, or carrier).\n  • Acute infection: HBsAg +, anti-HBc IgM +, HBeAg +/-\n  • Chronic:        HBsAg + >6 months, anti-HBc IgG +\n  • Carrier:        HBsAg +, HBeAg -, normal ALT\n\nConfirm any reactive rapid result with a quantitative HBsAg or neutralisation test. Window period ~4 weeks post-exposure. False positives more common in pregnancy, autoimmune disease.",
    methodologyNote: "Vaccination does NOT cause HBsAg positivity (vaccine = HBsAg recombinant surface protein → anti-HBs only). Anti-HBs is the marker of immunity.",
};

/**
 * HCV — not yet in catalog, but commonly ordered in Uganda. Standardized here
 * so it can be added later without re-architecting.
 */
const HCV: TestDefinition = {
    name: "Hepatitis C Antibody (HCV Ab)",
    description: "Screening for antibodies to HCV. Reactive result must be confirmed with HCV RNA PCR to distinguish active from resolved infection.",
    specimen: "Serum (SST) or whole blood (EDTA)",
    container: "Red-top (SST) or lavender-top vacutainer",
    method: "Immunochromatographic rapid test (SD Bioline HCV, OraQuick). Confirmatory: HCV RNA PCR (qualitative or quantitative).",
    turnaroundMinutes: 30,
    mode: "single",
    unit: "",
    referenceRange: "Non-Reactive",
    interpretation: "REACTIVE = exposure to HCV. Does NOT distinguish:\n  • Active infection (most)\n  • Resolved / spontaneously cleared (~15-25%)\n  • Maternal Ab (in infants <18 months — false positive from maternal transfer)\n\nCONFIRM with HCV RNA PCR:\n  • RNA detected  → Active infection → refer for treatment (DAAs)\n  • RNA undetected → Resolved / false positive Ab\n\nNo vaccine exists. Treatment with direct-acting antivirals (sofosbuvir/velpatasvir) is curative in >95% of cases.",
    methodologyNote: "Pre-test and post-test counselling required. Avoid blood donation if reactive. Risk-based screening: PWID, transfusion pre-1992 in Uganda, mother-to-child, healthcare workers, sexual exposure.",
};

/**
 * Syphilis (VDRL/RPR).
 */
const VDRL: TestDefinition = {
    name: "Syphilis (VDRL/RPR)",
    description: "Non-treponemal screening test for syphilis (VDRL flocculation or RPR charcoal agglutination). Reactive samples should be confirmed with a treponemal test (TPHA, FTA-Abs, or rapid treponemal assay).",
    specimen: "Serum (SST) or plasma",
    container: "Red-top (SST) or green-top (Li-heparin) vacutainer",
    method: "VDRL (flocculation) or RPR (charcoal agglutination); quantitation by serial doubling dilution",
    turnaroundMinutes: 60,
    mode: "serology",
    interpretation: "REACTIVE result: titres of ≥1:8 and rising titres are significant.\n\nStage-specific sensitivity:\n  • Primary   : ~60-86% (may be negative in very early chancre — repeat in 2 weeks if clinical suspicion high)\n  • Secondary : ~99%\n  • Tertiary  : ~98%\n  • Latent    : ~70-80%\n\nFalse POSITIVE: malaria, hepatitis B, mumps, leprosy, infectious mononucleosis, SLE, antiphospholipid syndrome, rheumatoid arthritis, collagen vascular disease, pregnancy, IV drug use.\n\nFalse NEGATIVE: very early primary, late latent, immunosuppression (HIV), prozone phenomenon (high-titre Ab excess — request lab to dilute the sample).\n\nAlways CONFIRM with a treponemal test (TPHA / FTA-Abs / SD Bioline Syphilis 3.0):\n  • VDRL/RPR + AND treponemal + = CONFIRMED syphilis\n  • VDRL/RPR + AND treponemal − = FALSE positive (or very early primary before seroconversion)\n  • VDRL/RPR − AND treponemal + = Past / treated syphilis (or very early primary)\n\nTreatment monitoring: re-titre at 3, 6, 12, 24 months. 4-fold titre decrease (e.g. 1:32 → 1:8) = adequate response.",
    methodologyNote: "VDRL is the WHO-recommended test for resource-limited settings. Always perform a treponemal confirmatory test. Report as REACTIVE / NON-REACTIVE + titre if reactive.",
};

/**
 * Brucella — was wrongly single, should be a 2-analyte table.
 */
const BRUCELLA: TestDefinition = {
    name: "Brucella Agglutination Test",
    description: "Serum agglutination test (SAT) for antibodies to Brucella abortus and Brucella melitensis — the main zoonotic brucellosis species in East Africa (cattle, goats, sheep, camels).",
    specimen: "Serum (SST)",
    container: "Red-top (SST) vacutainer",
    method: "Serum (tube) agglutination test (SAT) with B. abortus and B. melitensis antigens; report titre as highest dilution showing ≥50% agglutination",
    turnaroundMinutes: 180,
    mode: "table",
    analytes: [
        { investigation: "Brucella abortus titre",  unit: "titer (reciprocal)", low: null as any, high: 80, note: "Significant: ≥1:80 in endemic populations (Uganda, Kenya, Tanzania). 4-fold rise in paired sera (2-4 weeks apart) is diagnostic of acute infection. Cut-off of 1:160 used in low-prevalence settings." },
        { investigation: "Brucella melitensis titre", unit: "titer (reciprocal)", low: null as any, high: 80, note: "Same interpretation as B. abortus. B. melitensis is the more virulent and invasive species — disproportionately causes chronic and relapsing disease." },
    ],
    interpretation: "Uganda / East Africa context:\n  • Single titre ≥1:80 in a patient with compatible symptoms (fever, sweats, arthralgia, hepatosplenomegaly, occupational animal exposure) = PRESUMPTIVE acute brucellosis.\n  • 4-fold rise in paired sera over 2-4 weeks = CONFIRMED.\n  • Cross-reactions with Yersinia enterocolitica O:9, Vibrio cholerae, and some E. coli — interpret with clinical picture.\n\nRisk groups: pastoralists, abattoir workers, veterinarians, raw-milk consumers. Uganda MoH / WHO recommend DOXYCYCLINE 6 wks + RIFAMPICIN 6 wks (or + STREPTOMYCIN 2-3 wks) for acute uncomplicated disease.",
    methodologyNote: "Perform in BSL-2 cabinet if culture attempted (serology is non-infectious). Cross-reactions with other Gram-negative organisms are well documented — correlate clinically.",
};

/**
 * Widal — was wrongly single, should be a 4-analyte table.
 */
const WIDAL: TestDefinition = {
    name: "Typhoid Widal Test",
    description: "Slide / tube agglutination test for antibodies to Salmonella enterica serovar Typhi (O and H) and Paratyphi A, B, C. Used to support a clinical diagnosis of enteric fever.",
    specimen: "Serum (SST)",
    container: "Red-top (SST) vacutainer",
    method: "Slide or tube agglutination with standardised S. Typhi O, S. Typhi H, S. Paratyphi AH, S. Paratyphi BH antigens; report titre as highest dilution showing visible agglutination",
    turnaroundMinutes: 60,
    mode: "table",
    analytes: [
        { investigation: "S. Typhi O (TO)",      unit: "titer", low: null as any, high: 80, note: "Somatic (O) antigen — rises in acute infection, falls within weeks." },
        { investigation: "S. Typhi H (TH)",      unit: "titer", low: null as any, high: 80, note: "Flagellar (H) antigen — persists for months/years after infection or vaccination." },
        { investigation: "S. Paratyphi AH",      unit: "titer", low: null as any, high: 80, note: "S. Paratyphi A flagellar antigen." },
        { investigation: "S. Paratyphi BH",      unit: "titer", low: null as any, high: 80, note: "S. Paratyphi B flagellar antigen. (S. Paratyphi C is uncommon in East Africa.)" },
    ],
    interpretation: "WHO / Uganda MoH interpretation (endemic area, adult):\n  • Single sample, unvaccinated patient : ≥1:80 O AND ≥1:160 H = suggestive\n  • Single sample, vaccinated / previously infected : ≥1:160 O AND ≥1:320 H = suggestive (baseline titres may be elevated)\n  • 4-fold rise in paired sera (2 weeks apart) = CONFIRMED recent infection\n\nFalse POSITIVES: previous typhoid vaccination, prior infection, other Salmonella infections, malaria, dengue, brucellosis, chronic liver disease, autoimmune disease.\nFalse NEGATIVES: early in disease (sample taken <7 days of fever), prior antibiotics, immunocompromise.\n\nWidal is a SUPPORTIVE test, not confirmatory. Blood / stool / bone-marrow culture remains the gold standard. In Uganda, consider malaria, brucellosis, TB, and amoebic liver abscess in the differential.",
    methodologyNote: "Sample timing matters — collect 7+ days into illness for maximum sensitivity. Paired acute + 2-week convalescent samples are most useful.",
};

/**
 * Rheumatoid Factor.
 */
const RF: TestDefinition = {
    name: "Rheumatoid Factor",
    description: "Autoantibody (IgM anti-IgG Fc) — marker for rheumatoid arthritis and other connective tissue diseases.",
    specimen: "Serum (SST)",
    container: "Red-top (SST) vacutainer",
    method: "Latex agglutination (qualitative + semi-quantitative) or nephelometry / turbidimetry (quantitative)",
    turnaroundMinutes: 60,
    mode: "single",
    unit: "titer",
    referenceRange: "< 1:20 (Negative)",
    criticalLow: null,
    criticalHigh: null,
    interpretation: "Qualitative: Reactive (Positive) or Non-Reactive (Negative).\nSemi-quantitative (latex): highest reactive dilution = titre (1:20, 1:40, 1:80, 1:160, 1:320, …).\n\nSensitivity for RA: ~70-80% (lower in early disease). Specificity: ~85% — POSITIVE RF also seen in:\n  • Sjögren's syndrome (up to 90%)\n  • SLE, mixed connective tissue disease\n  • Chronic infections (TB, leprosy, hepatitis C, bacterial endocarditis)\n  • Older age (5-10% of healthy >60y)\n  • Other chronic inflammatory conditions\n\nNEGATIVE RF does NOT exclude RA — seronegative RA exists in ~20-30% of cases. Consider anti-CCP (more specific) if clinical suspicion high.",
    methodologyNote: "Report both qualitative (Reactive / Non-Reactive) AND the titre if reactive. Titre correlates roughly with disease activity in RA.",
};

/**
 * H. pylori.
 */
const HPYLORI: TestDefinition = {
    name: "H. Pylori Antigen (Stool / Serum Antibody)",
    description: "Stool antigen test detects ACTIVE H. pylori infection. Serum antibody test detects EXPOSURE (cannot distinguish active from past).",
    specimen: "Fresh stool specimen (preferred — antigen) OR serum (antibody)",
    container: "Sterile stool container; SST for serum",
    method: "Immunochromatographic lateral flow (stool Ag or serum Ab). Stool Ag is preferred for diagnosing active infection.",
    turnaroundMinutes: 30,
    mode: "single",
    unit: "",
    referenceRange: "Negative",
    interpretation: "STOOL ANTIGEN:\n  • POSITIVE = active infection.\n  • NEGATIVE = no active infection, or false-negative if patient on PPI / antibiotics / bismuth in past 2 weeks — repeat after 2 weeks off therapy.\n\nSERUM ANTIBODY:\n  • POSITIVE = EXPOSURE (current or past). Stays positive for months after eradication. NOT recommended for confirming cure.\n  • Use for screening in low-resource settings where stool Ag is unavailable.\n\nUGI endoscopy + biopsy (rapid urease / histology / culture) is the gold standard but invasive.\n\nTreatment (Uganda MoH 1st line, 14 days):\n  • PPI (omeprazole 20 mg bd) + Amoxicillin 1 g bd + Clarithromycin 500 mg bd\n  • Penicillin allergy: PPI + Metronidazole 500 mg tds + Tetracycline 500 mg qds + Bismuth qds (quadruple)\n  • Confirm cure by stool Ag or UBT ≥4 weeks after therapy.",
    methodologyNote: "Document specimen type (stool Ag vs serum Ab) clearly on the report. Urea Breath Test (UBT) is the most accurate non-invasive test for active infection and post-treatment confirmation.",
};

// ═══════════════════════════════════════════════════════════════════════════
//  MICROBIOLOGY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Urinalysis — Dipstick + microscopy.
 */
const URINALYSIS: TestDefinition = {
    name: "Urinalysis (Dipstick & Microscopy)",
    description: "Comprehensive urine examination: physical, chemical (10-parameter dipstick), and microscopic sediment.",
    specimen: "Freshly voided mid-stream clean-catch urine",
    container: "Sterile urine container — analyse within 2 hours of collection (or refrigerate at 4 °C up to 24 h)",
    method: "Reflectance photometry dipstick (10-parameter: SG, pH, leukocytes, nitrite, protein, glucose, ketones, urobilinogen, bilirubin, blood); bright-field microscopy of centrifuged sediment",
    turnaroundMinutes: 30,
    mode: "table",
    analytes: [
        { section: SECTION_UA_PHYS, investigation: "Appearance",            unit: "", low: null as any, high: null as any, note: "Clear / Hazy / Cloudy / Turbid. Turbidity may indicate pyuria, phosphaturia, chyluria." },
        { section: SECTION_UA_PHYS, investigation: "Colour",               unit: "", low: null as any, high: null as any, note: "Straw / Amber / Red / Brown / Green / Cloudy-white. Red = haematuria, myoglobin, beeturia, rifampicin." },
        { section: SECTION_UA_PHYS, investigation: "pH",                   unit: "", low: 4.5, high: 8, note: "Acid <7, Alkaline >7. Alkaline in UTI with urease-splitter (Proteus), RTA, vegetarian diet." },
        { section: SECTION_UA_PHYS, investigation: "Specific Gravity",    unit: "", low: 1.005, high: 1.030, note: "Reflects hydration. Fixed 1.010 in CKD." },
        { section: SECTION_UA_CHEM, investigation: "Glucose",              unit: "", low: null as any, high: null as any, note: "Negative normal. POSITIVE when plasma glucose >10 mmol/L (renal threshold)." },
        { section: SECTION_UA_CHEM, investigation: "Protein",              unit: "", low: null as any, high: null as any, note: "Negative or trace. POSITIVE: transient (fever, exercise, orthostatic) or persistent (glomerular > tubular)." },
        { section: SECTION_UA_CHEM, investigation: "Blood (Hb / RBCs)",    unit: "", low: null as any, high: null as any, note: "Negative normal. POSITIVE: haematuria, myoglobinuria (rhabdomyolysis — dipstick + but no RBCs on micro)." },
        { section: SECTION_UA_CHEM, investigation: "Ketones",              unit: "", low: null as any, high: null as any, note: "Negative normal. POSITIVE: DKA, starvation, prolonged vomiting, alcohol." },
        { section: SECTION_UA_CHEM, investigation: "Bilirubin",            unit: "", low: null as any, high: null as any, note: "Negative normal. POSITIVE: conjugated hyperbilirubinaemia (obstructive / hepatocellular)." },
        { section: SECTION_UA_CHEM, investigation: "Urobilinogen",         unit: "", low: null as any, high: null as any, note: "Normal 0.2-1.0 EU/dL. Increased in haemolysis; decreased / absent in biliary obstruction." },
        { section: SECTION_UA_CHEM, investigation: "Nitrite",             unit: "", low: null as any, high: null as any, note: "Negative normal. POSITIVE suggests Gram-negative bacteriuria (especially E. coli, Proteus, Klebsiella). False-neg if organism doesn't reduce nitrate (Enterococcus, Pseudomonas) or sample held too long." },
        { section: SECTION_UA_CHEM, investigation: "Leukocyte Esterase",  unit: "", low: null as any, high: null as any, note: "Negative normal. POSITIVE = pyuria (≥10 WBCs/μL). Suggests UTI — correlate with nitrite + micro." },
        { section: SECTION_UA_MICRO, investigation: "Pus Cells (WBC)",     unit: "/HPF", low: 0, high: 5, note: "Normal 0-5/HPF. >5 = pyuria (UTI, STI, glomerulonephritis, TB)." },
        { section: SECTION_UA_MICRO, investigation: "RBCs",                unit: "/HPF", low: 0, high: 2, note: "Normal 0-2/HPF. >2 = microscopic haematuria. Dysmorphic RBCs suggest glomerular origin." },
        { section: SECTION_UA_MICRO, investigation: "Epithelial Cells",    unit: "/HPF", low: null as any, high: null as any, note: "Few squamous = normal. Many squamous = poorly collected sample. Renal tubular = significant." },
        { section: SECTION_UA_MICRO, investigation: "Bacteria",            unit: "", low: null as any, high: null as any, note: "Absent normal. Many + nitrite +LE = UTI (send for culture)." },
        { section: SECTION_UA_MICRO, investigation: "Casts",               unit: "/LPF", low: null as any, high: null as any, note: "Hyaline casts: non-specific, normal after exercise. Granular / RBC / WBC / epithelial / fatty / waxy casts = renal pathology." },
        { section: SECTION_UA_MICRO, investigation: "Crystals",            unit: "", low: null as any, high: null as any, note: "Calcium oxalate, uric acid, triple phosphate, cystine — note type and clinical context." },
        { section: SECTION_UA_MICRO, investigation: "Yeast / Parasites",   unit: "", low: null as any, high: null as any, note: "Candida (DM, immunocompromise, vaginal contamination), Schistosoma haematobium ova (endemic — Uganda, Lake Victoria region)." },
    ],
    interpretation: "UTI probability (from dipstick + micro):\n  • Nitrite + AND LE + AND bacteria + AND WBC ≥10/μL = high probability → send for culture + start empiric therapy\n  • LE + only = possible → repeat or culture if symptomatic\n  • All negative = low probability\n\nAsymptomatic bacteriuria: ≥10⁵ CFU/mL in asymptomatic patient — treat only in pregnancy, pre-urological surgery, immunocompromised.",
    methodologyNote: "Mid-stream clean-catch is the standard. Cath specimen or suprapubic aspirate in children. Always send for culture if dipstick suggests UTI in pregnancy, men, children, recurrent UTI, or treatment failure.",
};

/**
 * Stool analysis — macroscopic + microscopic.
 */
const STOOL: TestDefinition = {
    name: "Stool Analysis (Macroscopy & Microscopy)",
    description: "Macroscopic and microscopic examination of faeces for ova, cysts, parasites, occult blood, fat, and inflammatory cells.",
    specimen: "Fresh stool (≥5 g), three consecutive samples on alternate days for parasite detection",
    container: "Clean, dry, wide-mouthed plastic container with screw-cap",
    method: "Direct wet mount (saline + iodine) of fresh stool; formalin-ether concentration for ova/cysts; modified Ziehl-Neelsen for Cryptosporidium / Cyclospora / Isospora; Sudan stain for fat",
    turnaroundMinutes: 60,
    mode: "table",
    analytes: [
        { section: SECTION_STOOL_MACRO, investigation: "Consistency",  unit: "", low: null as any, high: null as any, note: "Formed / Semi-formed / Soft / Watery / Mucoid / Bloody / Frothy (steatorrhoea)." },
        { section: SECTION_STOOL_MACRO, investigation: "Colour",       unit: "", low: null as any, high: null as any, note: "Brown (normal) / Black (melaena, Fe tablets) / Red (lower GI bleed) / Pale (obstructive jaundice) / Green (antibiotics, rapid transit)." },
        { section: SECTION_STOOL_MACRO, investigation: "Mucus",        unit: "", low: null as any, high: null as any, note: "Absent normal. Present in IBS, inflammatory bowel disease, dysentery." },
        { section: SECTION_STOOL_MACRO, investigation: "Blood",        unit: "", low: null as any, high: null as any, note: "Visible / Occult (chemical test). Frank blood = lower GI (haemorrhoids, IBD, cancer, dysentery). Melaena = upper GI." },
        { section: SECTION_STOOL_MICRO, investigation: "Pus Cells",    unit: "/HPF", low: 0, high: null as any, note: "Few/absent normal. Many in bacterial dysentery, IBD." },
        { section: SECTION_STOOL_MICRO, investigation: "RBCs",         unit: "/HPF", low: 0, high: null as any, note: "Absent normal. Present in amoebic dysentery, IBD, colorectal lesions." },
        { section: SECTION_STOOL_MICRO, investigation: "Parasites",    unit: "", low: null as any, high: null as any, note: "Trophozoites / cysts of Entamoeba histolytica/dispar, Giardia lamblia, Balantidium coli, etc. Flagellates / coccidia. If suspected, request concentration + trichrome." },
        { section: SECTION_STOOL_MICRO, investigation: "Ova / Cysts",  unit: "", low: null as any, high: null as any, note: "Hookworm (Ancylostoma, Necator), Ascaris, Trichuris, Schistosoma mansoni, Taenia, Hymenolepis. Common in Uganda — request concentration technique if direct mount negative and clinical suspicion high." },
        { section: SECTION_STOOL_MICRO, investigation: "Fat Globules", unit: "", low: null as any, high: null as any, note: "Few normal. Many in steatorrhoea (chronic pancreatitis, coeliac disease, malabsorption). Confirm with Sudan stain + 72-h faecal fat." },
        { section: SECTION_STOOL_MICRO, investigation: "Starch Granules",unit: "", low: null as any, high: null as any, note: "Few normal. Many in maldigestion / rapid transit." },
    ],
    interpretation: "Common findings in Uganda:\n  • Diarrhoea + blood + mucus + trophozoites of E. histolytica = amoebic dysentery (treat with metronidazole + luminal agent)\n  • Diarrhoea + weight loss + fat globules + ova of S. mansoni = chronic schistosomiasis with malabsorption\n  • Watery diarrhoea + trophozoites of Giardia = giardiasis (metronidazole / tinidazole)\n  • Frank blood + pus cells + no parasites = bacterial dysentery (Shigella, Salmonella, EIEC) — send for culture\n\nS. mansoni is endemic around Lake Victoria basin — request Kato-Katz quantitative if suspected.",
    methodologyNote: "Three consecutive samples on alternate days recommended for ova/cyst detection (sensitivity ~60-80% per sample, ~95% for three). Avoid contamination with urine or water. Sample should be examined within 30 minutes of passage for trophozoites.",
};

/**
 * High Vaginal Swab wet mount.
 */
const HVS: TestDefinition = {
    name: "High Vaginal Swab (HVS) Wet Mount",
    description: "Direct wet-mount microscopy of high vaginal swab for vaginitis / vaginosis.",
    specimen: "High vaginal swab (posterior fornix)",
    container: "Sterile swab in transport medium (Amies or Stuart's)",
    method: "Wet mount in saline (motility of Trichomonas) + KOH prep (whiff test, Candida pseudohyphae) + Gram stain (Nugent score for BV)",
    turnaroundMinutes: 30,
    mode: "table",
    analytes: [
        { investigation: "Trichomonas vaginalis", unit: "", low: null as any, high: null as any, note: "Motile flagellated trophozoites. Treat partner; metronidazole 2 g PO stat or 400-500 mg bd × 5-7 days." },
        { investigation: "Candida (Yeast / Pseudohyphae)", unit: "", low: null as any, high: null as any, note: "Budding yeast + pseudohyphae on KOH. Treat: clotrimazole pessary 500 mg stat or fluconazole 150 mg PO stat." },
        { investigation: "Clue Cells", unit: "", low: null as any, high: null as any, note: "≥20% clue cells + positive whiff test + pH >4.5 = Amsel criteria for bacterial vaginosis (Gardnerella vaginalis overgrowth). Treat: metronidazole 400-500 mg bd × 7 days." },
        { investigation: "WBCs (Polymorphs)", unit: "/HPF", low: 0, high: 5, note: "Many WBCs + parabasal cells = atrophic vaginitis or cervicitis." },
        { investigation: "Background Flora", unit: "", low: null as any, high: null as any, note: "Lactobacillus-dominant (normal) / Mixed / Overgrown with coccobacilli (BV) / Sparse." },
    ],
    interpretation: "Amsel criteria (3 of 4 = BV):\n  1. Thin, white/grey, homogeneous discharge\n  2. Vaginal pH >4.5\n  3. Positive whiff test (fishy amine odour with KOH)\n  4. Clue cells on microscopy (≥20% of epithelial cells)\n\nBV, trichomoniasis, and candidiasis are the 3 most common causes of vaginitis in adult women. Co-infection is possible. Always rule out STI co-infection (HIV, gonorrhoea, chlamydia) in suspected cases.",
    methodologyNote: "If clinical suspicion of gonorrhoea/chlamydia, also send swab for NAAT. Recurrent symptoms (≥4 episodes/year) warrant further workup (DM, HIV, immunocompromise).",
};

/**
 * Gram stain.
 */
const GRAM: TestDefinition = {
    name: "Gram Stain",
    description: "Direct Gram-stained smear for presumptive bacterial identification and WBC correlation.",
    specimen: "Pus, exudate, sputum, urine sediment, CSF, or culture isolate",
    container: "Sterile swab or direct smear slide",
    method: "Heat-fixed smear, crystal violet → iodine → decolouriser (alcohol/acetone) → safranin counterstain; bright-field microscopy at 1000×",
    turnaroundMinutes: 30,
    mode: "table",
    analytes: [
        { investigation: "Gram-positive cocci",       unit: "", low: null as any, high: null as any, note: "Pairs / chains / clusters. Clusters → Staph; chains → Strept; pairs → Enterococcus / Strep pneumoniae." },
        { investigation: "Gram-positive bacilli",    unit: "", low: null as any, high: null as any, note: "Large with central spore → Clostridium / Bacillus. Coryneform → diphtheroids (skin flora)." },
        { investigation: "Gram-negative cocci",       unit: "", low: null as any, high: null as any, note: "Diplococci, intracellular (within PMNs) → Neisseria gonorrhoeae. Diplococci, extracellular → N. meningitidis in CSF." },
        { investigation: "Gram-negative bacilli",    unit: "", low: null as any, high: null as any, note: "Lactose-fermenting (E. coli, Klebsiella) vs non-lactose (Salmonella, Shigella, Proteus). Curved → Vibrio / Campylobacter. Coccobacilli → Haemophilus, Bordetella." },
        { investigation: "Yeast / Fungal elements",  unit: "", low: null as any, high: null as any, note: "Budding yeast, pseudohyphae, true hyphae." },
        { investigation: "WBCs (Polymorphonuclear cells)", unit: "/HPF", low: 0, high: null as any, note: "Many WBCs = active infection / inflammation. Few/absent = colonisation or non-infectious." },
        { investigation: "Epithelial cells",         unit: "/HPF", low: null as any, high: null as any, note: "Many squamous = saliva / vaginal contamination of sputum / swab. Sputum quality: <10 epi + >25 PMNs/low-power = adequate (Bartlett criteria)." },
    ],
    interpretation: "Always correlate with:\n  • Specimen type and source (sputum vs wound vs CSF)\n  • Clinical picture (fever, site, immune status)\n  • Culture results (Gram stain is presumptive — culture is definitive)\n\nIn CSF: ANY organism seen is significant — emergency. In sputum: only report potential pathogens when specimen is adequate (Bartlett). In urine: bacteria + ≥10 WBCs/HPF = UTI presumptive.",
    methodologyNote: "Quality control: known Gram-positive and Gram-negative control slides weekly. Decolourisation time is the most critical step — over-decolouring falsely converts G+ to G-.",
};

/**
 * Semen analysis — WHO 2021 6th edition.
 */
const SEMEN: TestDefinition = {
    name: "Semen Analysis",
    description: "Macroscopic and microscopic evaluation of semen for male fertility workup, post-vasectomy status, and forensic purposes. WHO 2021 (6th ed.) reference limits.",
    specimen: "Semen collected by masturbation into a sterile wide-mouthed container after 2-7 days of sexual abstinence",
    container: "Sterile wide-mouthed plastic container (no lubricant — toxic to sperm)",
    method: "Manual microscopy with improved Neubauer haemocytometer (concentration, motility, morphology); Makler / CASA for motility grading; pH paper; viscosity by aspiration",
    turnaroundMinutes: 60,
    mode: "table",
    analytes: [
        { section: SECTION_SEMEN_MACRO, investigation: "Volume",          unit: "mL",     low: 1.4, high: null as any, criticalLow: 0.5, note: "Azoospermia / low volume: rule out retrograde ejaculation, obstruction, hypogonadism." },
        { section: SECTION_SEMEN_MACRO, investigation: "pH",              unit: "",       low: 7.2, high: 8.0, note: "pH <7.2 with low volume + azoospermia → obstructive azoospermia (seminal vesicle / ejaculatory duct)." },
        { section: SECTION_SEMEN_MACRO, investigation: "Appearance",      unit: "",       low: null as any, high: null as any, note: "Homogeneous grey-opalescent (normal). Brown = old blood (haematospermia). Yellow = jaundice / vitamins / prolonged abstinence." },
        { section: SECTION_SEMEN_MACRO, investigation: "Liquefaction",    unit: "min",    low: 0, high: 60, note: "Should be complete within 60 min at 37 °C. Delayed liquefaction: prostate dysfunction." },
        { section: SECTION_SEMEN_MACRO, investigation: "Viscosity",       unit: "",       low: null as any, high: null as any, note: "Normal: drops form thread ≤2 cm. Increased viscosity may impair motility." },
        { section: SECTION_SEMEN_MICRO, investigation: "Sperm Concentration", unit: "×10⁶/mL", low: 16, high: null as any, criticalLow: 5, note: "WHO 2021 5th centile = 16 ×10⁶/mL. Oligozoospermia <16, severe <5, azoospermia 0." },
        { section: SECTION_SEMEN_MICRO, investigation: "Total Sperm Count", unit: "×10⁶/ejaculate", low: 39, high: null as any, note: "Concentration × volume. Azoospermia 0." },
        { section: SECTION_SEMEN_MICRO, investigation: "Total Motility (PR + NP)", unit: "%", low: 42, high: null as any, note: "Progressive (PR) + non-progressive (NP) within 60 min of collection. Asthenozoospermia <42%." },
        { section: SECTION_SEMEN_MICRO, investigation: "Progressive Motility (PR)", unit: "%", low: 30, high: null as any, note: "Active forward motion. WHO 2021 lower reference limit." },
        { section: SECTION_SEMEN_MICRO, investigation: "Vitality (Live sperm)", unit: "%", low: 54, high: null as any, note: "Eosin-nigrosin or HOS test. Low vitality with normal motility = artefact (delayed analysis)." },
        { section: SECTION_SEMEN_MICRO, investigation: "Normal Morphology (Strict criteria)", unit: "%", low: 4, high: null as any, note: "WHO 6th ed. strict criteria. Teratozoospermia <4%." },
        { section: SECTION_SEMEN_MICRO, investigation: "WBCs (Peroxidase-positive)", unit: "×10⁶/mL", low: 0, high: 1.0, note: ">1.0 ×10⁶/mL = leucocytospermia. Consider infection / inflammation (do seminal culture)." },
        { section: SECTION_SEMEN_MICRO, investigation: "Round Cells",      unit: "×10⁶/mL", low: 0, high: 5, note: "Spermatogenic + WBC. WBC quantified separately by peroxidase staining." },
    ],
    interpretation: "WHO 2021 5th-centile reference values (fertile men):\n  • Volume            : ≥1.4 mL\n  • Total sperm count : ≥39 ×10⁶\n  • Concentration     : ≥16 ×10⁶/mL\n  • Total motility    : ≥42%\n  • Progressive (PR)  : ≥30%\n  • Vitality          : ≥54%\n  • Normal morphology : ≥4%\n  • pH                : ≥7.2\n  • WBCs              : <1.0 ×10⁶/mL\n\nIf abnormal, repeat after 2-3 months (spermatogenesis cycle ~74 days). If persistently abnormal → endocrinology workup (FSH, LH, testosterone, prolactin), karyotype, Y-chromosome microdeletion, scrotal US.",
    methodologyNote: "Abstinence 2-7 days. Sample kept at 20-37 °C and analysed within 60 min. Two samples collected 1-4 weeks apart for baseline.",
};

/**
 * Malaria blood slide (BS for MPs).
 */
const MALARIA_BS: TestDefinition = {
    name: "Malaria Microscopy (BS for MPs)",
    description: "Thick and thin blood films for malaria parasite identification and quantification. Gold standard for species identification and parasite density.",
    specimen: "Capillary finger-prick or EDTA venous blood — preferably during fever spike or shortly after",
    container: "Capillary tube or EDTA vacutainer; prepare smears within 1 hour of collection",
    method: "Giemsa-stained thick film (sensitivity) and thin film (species ID + differential); bright-field 1000× oil immersion; parasite density per 200 WBCs or 500 RBCs",
    turnaroundMinutes: 60,
    mode: "table",
    analytes: [
        { investigation: "Malaria Parasites (presence)", unit: "", low: null as any, high: null as any, note: "No MPs seen / P. falciparum / P. vivax / P. malariae / P. ovale / P. knowlesi / Mixed." },
        { investigation: "Parasite Density", unit: "parasites/μL", low: 0, high: 0, note: "Count parasites per 200 WBCs in thick film (or per 500 RBCs in thin film). Density = (parasites counted / WBCs or RBCs counted) × patient's WBC or RBC count. Hyperparasitaemia: >100,000/μL (P. falciparum) or >5% RBCs infected — severe malaria." },
        { investigation: "Gametocytes", unit: "", low: null as any, high: null as any, note: "P. falciparum: banana-shaped. P. vivax: round. Important for transmission-blocking interventions." },
        { investigation: "Parasite Stage", unit: "", low: null as any, high: null as any, note: "Ring (trophozoite) / Schizont / Gametocyte. P. falciparum: only rings + gametocytes in peripheral blood (sequestration of mature forms). Other species: all stages seen." },
        { investigation: "Comments", unit: "", low: null as any, high: null as any, note: "Quality of film, presence of schüffner's dots (P. vivax/ovale), Maurer's clefts (P. falciparum), pigment, platelet clumping, etc." },
    ],
    interpretation: "Severity (WHO 2022 severe malaria criteria, P. falciparum or mixed):\n  • Impaired consciousness / seizures\n  • Prostration (unable to sit/stand)\n  • Respiratory distress (acidotic breathing)\n  • Multiple convulsions (>2 in 24 h)\n  • Circulatory collapse (shock, SBP <70 mmHg adults)\n  • Jaundice + vital organ dysfunction\n  • Hypoglycaemia (<2.2 mmol/L)\n  • Severe anaemia (Hb <5 g/dL, Hct <15%)\n  • Renal impairment (Cr >3 mg/dL)\n  • Pulmonary oedema / ARDS\n  • Hyperparasitaemia (>100,000/μL)\n  • Haemoglobinuria (blackwater fever)\n\nUganda MoH 1st-line treatment (uncomplicated P. falciparum):\n  • Artemether-Lumefantrine (AL) 6-dose regimen over 3 days\n  • If AL fails or contraindicated: Dihydroartemisinin-Piperaquine (DHA-PPQ)\n  • Severe / complicated: IV artesunate ≥24 h, then full oral ACT course.",
    methodologyNote: "If thick film positive but species not clear on thick, ALWAYS confirm species on thin film. 200 oil-immersion fields examined before reporting 'No MP seen' (sensitivity ~50-100 parasites/μL).",
};

/**
 * Malaria RDT.
 */
const MALARIA_RDT: TestDefinition = {
    name: "Malaria Rapid Diagnostic Test (RDT)",
    description: "Immunochromatographic detection of Plasmodium antigens. Detects HRP-2 (P. falciparum-specific) and/or pLDH (pan-malaria).",
    specimen: "Capillary finger-prick whole blood",
    container: "Kit-provided capillary tube or loop (5 μL)",
    method: "Lateral flow immunochromatography (SD Bioline, CareStart, Paracheck, etc.)",
    turnaroundMinutes: 20,
    mode: "single",
    unit: "",
    referenceRange: "Negative",
    interpretation: "Interpretation depends on band pattern:\n  • Negative          : only control band\n  • P. falciparum     : HRP-2 band only (P.f)\n  • Pan-malaria       : pLDH band only (non-falciparum: P. vivax / malariae / ovale)\n  • Mixed             : both HRP-2 and pLDH bands\n  • Invalid           : no control band — repeat\n\nHRP-2 can stay POSITIVE for 2-3 weeks after successful treatment (antigen persistence) — DO NOT use RDT to monitor treatment response. Use microscopy or repeat RDT after 4 weeks for retreatment decisions.\n\nSensitivity: ~100 parasites/μL (vs 50-100/μL for expert microscopy). Specificity: >95% in non-endemic settings, lower in endemic areas (cross-reactions, persistent antigen).",
    methodologyNote: "Always confirm NEGATIVE RDT in a severely ill patient with thick/thin film — false negatives occur in prozone, very high parasitaemia, hrp2-deleted parasites (emerging in East Africa), and operator error.",
};

/**
 * Pregnancy test (urine hCG).
 */
const PREGNANCY: TestDefinition = {
    name: "Pregnancy Test (Urine hCG)",
    description: "Qualitative detection of urinary human chorionic gonadotrophin (hCG) for early pregnancy diagnosis.",
    specimen: "First-morning void urine (most concentrated)",
    container: "Clean urine container",
    method: "Immunochromatographic lateral flow (hCG monoclonal antibody)",
    turnaroundMinutes: 10,
    mode: "single",
    unit: "",
    referenceRange: "Negative",
    interpretation: "POSITIVE: pregnancy is highly likely. False POSITIVES: recent miscarriage / delivery (hCG may persist 4-6 weeks), molar pregnancy, hCG-secreting tumours, certain drugs (hCG for fertility, anti-epileptics — rare).\n\nNEGATIVE: pregnancy unlikely, but does NOT exclude very early pregnancy (test ≥10 days post-conception / after missed period). Repeat in 1 week if clinically indicated.\n\nFor quantitative β-hCG, order serum β-hCG (more sensitive — detects pregnancy as early as 6-7 days post-ovulation; threshold 5-10 mIU/mL).",
    methodologyNote: "First-morning urine preferred. Sample is stable at room temperature up to 8 hours, refrigerated up to 72 hours. Do not use after a large fluid intake (dilute urine → false negative).",
};

// ═══════════════════════════════════════════════════════════════════════════
//  Master map — looked up by test name (with alias-strip fallback)
// ═══════════════════════════════════════════════════════════════════════════

/** Master map keyed by canonical test name. */
export const TEST_DEFINITIONS: Record<string, TestDefinition> = {
    // ── Hematology ──
    "Full Blood Count": FBC,
    "FBC": FBC,
    "Complete Blood Count": FBC,
    "CBC": FBC,
    "ESR (Erythrocyte Sedimentation Rate)": ESR,
    "ESR": ESR,
    "Peripheral Blood Film": PERIPHERAL_FILM,
    "Peripheral Blood Smear": PERIPHERAL_FILM,
    "PBF": PERIPHERAL_FILM,
    "Sickle Cell Screening (Solubility)": SICKLE_CELL,
    "Sickle Cell Test": SICKLE_CELL,
    "Sickling Test": SICKLE_CELL,
    "Blood Grouping & Crossmatch": BLOOD_GROUP,
    "Blood Grouping and Crossmatch": BLOOD_GROUP,
    "Blood Group & Cross Matching": BLOOD_GROUP,
    "Blood Grouping & Cross Matching": BLOOD_GROUP,
    "Blood Group & Rh Factor With Cross Matching": BLOOD_GROUP,
    // ── Biochemistry ──
    "Fasting Blood Glucose": FBG,
    "FBG": FBG,
    "Fasting Plasma Glucose": FBG,
    "FPG": FBG,
    "Random Blood Glucose": RBG,
    "RBG": RBG,
    "Random Plasma Glucose": RBG,
    "HbA1c": HBA1C,
    "Glycated Haemoglobin": HBA1C,
    "A1C": HBA1C,
    "Lipid Profile": LIPID,
    "Lipid Panel": LIPID,
    "Liver Function Tests": LFT,
    "Liver Function Test": LFT,
    "LFT": LFT,
    "LFTs": LFT,
    "Renal Function Tests": RFT,
    "Renal Function Test": RFT,
    "RFT": RFT,
    "RFTs": RFT,
    "UEC": RFT,
    "Urea Electrolytes Creatinine": RFT,
    // ── Serology ──
    "HIV 1&2 Screening": HIV,
    "HIV Test": HIV,
    "Hepatitis B Surface Antigen (HBsAg)": HBSAG,
    "HBsAg": HBSAG,
    "Hepatitis C Antibody (HCV Ab)": HCV,
    "HCV": HCV,
    "Syphilis (VDRL/RPR)": VDRL,
    "VDRL": VDRL,
    "RPR": VDRL,
    "VDRL/RPR": VDRL,
    "Brucella Agglutination Test": BRUCELLA,
    "Brucella Test": BRUCELLA,
    "BAT": BRUCELLA,
    "Typhoid Widal Test": WIDAL,
    "Widal Test": WIDAL,
    "Widal": WIDAL,
    "Rheumatoid Factor": RF,
    "RF": RF,
    "RA Factor": RF,
    "H. Pylori (Fecal/Serum)": HPYLORI,
    "H. Pylori Antigen (Stool / Serum Antibody)": HPYLORI,
    "H. Pylori": HPYLORI,
    // ── Microbiology ──
    "Urinalysis (Dipstick & Microscopy)": URINALYSIS,
    "Urinalysis": URINALYSIS,
    "UA": URINALYSIS,
    "Urine Analysis": URINALYSIS,
    "Stool Analysis": STOOL,
    "Stool Analysis (Macroscopy & Microscopy)": STOOL,
    "Stool MCS": STOOL,
    "High Vaginal Swab (HVS) Wet Mount": HVS,
    "HVS": HVS,
    "HVS Wet Mount": HVS,
    "Gram Stain": GRAM,
    "Semen Analysis": SEMEN,
    "Malaria Microscopy (BS for MPs)": MALARIA_BS,
    "BS for MPs": MALARIA_BS,
    "Malaria Smear": MALARIA_BS,
    "Malaria Rapid Diagnostic Test (RDT)": MALARIA_RDT,
    "Malaria RDT": MALARIA_RDT,
    "MRDT": MALARIA_RDT,
    "Pregnancy Test (Urine hCG)": PREGNANCY,
    "UPT": PREGNANCY,
    "Pregnancy Test": PREGNANCY,
};

/**
 * Look up the standard definition for a test by name. Strips a trailing
 * "(alias)" parenthetical before lookup, so "Full Blood Count (FBC/CBC)"
 * resolves to the "Full Blood Count" entry. Also tries the alias as a
 * separate candidate.
 */
export function getTestDefinition(testName: string): TestDefinition | null {
    const raw = (testName || "").trim();
    if (!raw) return null;

    const candidates: string[] = [raw];
    const aliasMatch = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (aliasMatch) {
        const base = aliasMatch[1].trim();
        if (base) candidates.push(base);
        // Also try each alias in a slash-list
        for (const a of aliasMatch[2].split(/[\/,]/)) {
            const t = a.trim();
            if (t) candidates.push(t);
        }
    }

    for (const key of candidates) {
        if (TEST_DEFINITIONS[key]) return TEST_DEFINITIONS[key];
    }
    // Case-insensitive fallback
    const lower = raw.toLowerCase();
    for (const k of Object.keys(TEST_DEFINITIONS)) {
        if (k.toLowerCase() === lower) return TEST_DEFINITIONS[k];
    }
    return null;
}

/**
 * Convert a TestDefinition.analyte to the SchemaRow shape used by the
 * existing lab-templates-utils TEST_SCHEMAS map. Kept here so the rest of
 * the codebase can keep using SchemaRow without depending on this file.
 */
export function definitionToSchemaRows(def: TestDefinition): SchemaRow[] {
    if (!def.analytes) return [];
    const out: SchemaRow[] = [];
    let lastSection: string | undefined = undefined;
    for (const a of def.analytes) {
        // Insert a section-header row when the section changes. The template
        // renders rows where isSection=true as a merged dark-grey cell
        // spanning the whole table width.
        if (a.section && a.section !== lastSection) {
            out.push({ isSection: true, section: a.section });
            lastSection = a.section;
        }
        out.push({
            section: a.section,
            investigation: a.investigation,
            unit: a.unit,
            normalRange: formatRangeFromAnalyte(a),
            normalMin: a.low,
            normalMax: a.high,
            criticalMin: a.criticalLow ?? null,
            criticalMax: a.criticalHigh ?? null,
            isSection: false,
        });
    }
    return out;
}

function formatRangeFromAnalyte(a: AnalyteRange): string {
    const lo = a.low;
    const hi = a.high;
    if (lo != null && hi != null) return `${lo} - ${hi}`;
    if (lo != null && hi == null) return `≥ ${lo}`;
    if (lo == null && hi != null) return `≤ ${hi}`;
    return "";
}

// ═══════════════════════════════════════════════════════════════════════════
//  International standard report templates
// ═══════════════════════════════════════════════════════════════════════════
//
// Each generator returns the templateHtml + resultMode + resultSchema for
// one TestDefinition. The header/footer are NOT included — those are
// provided separately by resolveLabHeader / resolveLabFooter (which can be
// customized per tenant via the lab.defaultTemplateHeader/Footer settings).
//
// All templates use a consistent visual language:
//   • Times New Roman, 12-14px body
//   • Bordered, monospace-friendly analyte table
//   • Section rows (e.g. "Red Cell Indices") rendered as merged dark-grey cells
//   • Flag column always present in table mode
//   • "End of report" centred footer
//   • Methodology + critical-value notice at the bottom
//
// The render engine (lib/lab-templates-utils.ts#renderTemplate) supports:
//   {{investigation}}, {{result}}, {{unit}}, {{normal_range}}, {{section}},
//   {{flag}}, {{flag_label}}, {{comment}}, {{isSection}}
//   {{#if isSection}}, {{#if flag_H}}, {{#if flag_L}}, {{#if flag_critical}},
//   {{#if flag_N}}, {{#if has_notes}}

/** Top-of-report specimen / method / timing strip — printed inside the
 *  templateHtml (not headerHtml) so the same report still works when the
 *  tenant replaces headerHtml. */
function specimenBlock(def: TestDefinition): string {
    return `
  <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 14px; border: 1px solid #555;">
    <tr>
      <td style="border: 1px solid #555; padding: 4px 8px; width: 16%; font-weight: 700; background: #f0f0f0;">Specimen</td>
      <td style="border: 1px solid #555; padding: 4px 8px; width: 34%;">${escapeHtml(def.specimen)}</td>
      <td style="border: 1px solid #555; padding: 4px 8px; width: 16%; font-weight: 700; background: #f0f0f0;">Container</td>
      <td style="border: 1px solid #555; padding: 4px 8px; width: 34%;">${escapeHtml(def.container)}</td>
    </tr>
    <tr>
      <td style="border: 1px solid #555; padding: 4px 8px; font-weight: 700; background: #f0f0f0;">Method</td>
      <td style="border: 1px solid #555; padding: 4px 8px;" colspan="3">${escapeHtml(def.method)}</td>
    </tr>
    <tr>
      <td style="border: 1px solid #555; padding: 4px 8px; font-weight: 700; background: #f0f0f0;">Collected</td>
      <td style="border: 1px solid #555; padding: 4px 8px;">{{collected_at}}</td>
      <td style="border: 1px solid #555; padding: 4px 8px; font-weight: 700; background: #f0f0f0;">Reported</td>
      <td style="border: 1px solid #555; padding: 4px 8px;">{{reported_at}}</td>
    </tr>
  </table>`.trim();
}

/** Tiny HTML escaper (defence-in-depth on test names in catalog data). */
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** Standardized multi-analyte report (the layout used by FBC, LFT, RFT, Lipids, Urinalysis, Stool, Semen, …). */
function tableModeHtml(def: TestDefinition): string {
    return `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: 16px auto; color: #000;">
  ${def.description ? `<h2 style="text-align: center; margin: 0 0 8px; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(def.name)}</h2>` : ""}

  ${specimenBlock(def)}

  <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px;">
    <thead>
      <tr style="background: #1f2937; color: #fff;">
        <th style="border: 1px solid #1f2937; padding: 6px; text-align: left; width: 30%;">Investigation</th>
        <th style="border: 1px solid #1f2937; padding: 6px; text-align: left; width: 16%;">Result</th>
        <th style="border: 1px solid #1f2937; padding: 6px; text-align: left; width: 10%;">Unit</th>
        <th style="border: 1px solid #1f2937; padding: 6px; text-align: left; width: 30%;">Reference Range</th>
        <th style="border: 1px solid #1f2937; padding: 6px; text-align: center; width: 14%;">Flag</th>
      </tr>
    </thead>
    <tbody>
      {{#each rows}}
        {{#if isSection}}
        <tr>
          <td colspan="5" style="border: 1px solid #000; padding: 6px; background: #e5e7eb; font-weight: 700; color: #1f2937;">{{section}}</td>
        </tr>
        {{else}}
        <tr>
          <td style="border: 1px solid #000; padding: 6px;">{{investigation}}</td>
          <td style="border: 1px solid #000; padding: 6px; font-weight: 600;" class="{{flag_class}}">{{result}}</td>
          <td style="border: 1px solid #000; padding: 6px;">{{unit}}</td>
          <td style="border: 1px solid #000; padding: 6px;">{{normal_range}}</td>
          <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: 700;" class="{{flag_class}}">{{flag}}</td>
        </tr>
        {{/if}}
      {{/each}}
    </tbody>
  </table>

  {{#if has_notes}}
  <div style="margin: 12px 0; padding: 10px; border-left: 3px solid #2563eb; background: #eff6ff; font-size: 12px;">
    <div style="font-weight: 700; margin-bottom: 4px; color: #1e3a8a;">Notes / Clinical Information:</div>
    {{notes}}
  </div>
  {{/if}}

  ${def.interpretation ? `
  <div style="margin: 12px 0; padding: 10px; border: 1px solid #d1d5db; background: #fafafa; font-size: 12px; white-space: pre-line;">
    <div style="font-weight: 700; margin-bottom: 4px;">Interpretation:</div>
    ${escapeHtml(def.interpretation)}
  </div>` : ""}

  ${def.methodologyNote ? `
  <div style="margin: 12px 0; padding: 10px; border: 1px dashed #d1d5db; font-size: 11px; color: #555; white-space: pre-line;">
    <div style="font-weight: 700; margin-bottom: 4px;">Methodology / Notes:</div>
    ${escapeHtml(def.methodologyNote)}
  </div>` : ""}

  {{#if flag_critical}}
  <div style="margin: 12px 0; padding: 10px; border: 2px solid #dc2626; background: #fef2f2; font-size: 12px; color: #7f1d1d;">
    <strong>⚠ CRITICAL VALUE NOTIFIED</strong> — one or more results are outside critical limits. The requesting clinician has been informed per laboratory SOP.
  </div>
  {{/if}}

  <div style="text-align: right; font-style: italic; font-size: 11px; margin-top: 14px; color: #555;">~~ End of report ~~</div>
</div>`.trim();
}

/** Standardized single-value report (Glucose, HbA1c, ESR, RF, Pregnancy, Malaria RDT, etc.). */
function singleModeHtml(def: TestDefinition): string {
    const altUnitHtml = def.altUnit ? `<div style="font-size: 10px; color: #6b7280; margin-top: 2px;">(alt: ${escapeHtml(def.altUnit)})</div>` : "";
    const critLow = def.criticalLow;
    const critHigh = def.criticalHigh;
    return `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: 16px auto; color: #000;">
  <h2 style="text-align: center; margin: 0 0 8px; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(def.name)}</h2>

  ${specimenBlock(def)}

  <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 12px;">
    <tr style="background: #1f2937; color: #fff;">
      <th style="border: 1px solid #1f2937; padding: 8px; text-align: left; width: 30%;">Test</th>
      <th style="border: 1px solid #1f2937; padding: 8px; text-align: left; width: 22%;">Result</th>
      <th style="border: 1px solid #1f2937; padding: 8px; text-align: left; width: 12%;">Unit</th>
      <th style="border: 1px solid #1f2937; padding: 8px; text-align: left; width: 36%;">Reference Range</th>
    </tr>
    <tr>
      <td style="border: 1px solid #000; padding: 12px; font-weight: 700;">{{test_name}}</td>
      <td style="border: 1px solid #000; padding: 12px; font-size: 18px; font-weight: 700;" class="{{flag_class}}">{{result}}${altUnitHtml}</td>
      <td style="border: 1px solid #000; padding: 12px;">${escapeHtml(def.unit || "")}</td>
      <td style="border: 1px solid #000; padding: 12px; font-size: 12px;">${escapeHtml(def.referenceRange || "")}</td>
    </tr>
  </table>

  {{#if has_notes}}
  <div style="margin: 12px 0; padding: 10px; border-left: 3px solid #2563eb; background: #eff6ff; font-size: 12px;">
    <div style="font-weight: 700; margin-bottom: 4px; color: #1e3a8a;">Notes / Clinical Information:</div>
    {{notes}}
  </div>
  {{/if}}

  ${def.interpretation ? `
  <div style="margin: 12px 0; padding: 10px; border: 1px solid #d1d5db; background: #fafafa; font-size: 12px; white-space: pre-line;">
    <div style="font-weight: 700; margin-bottom: 4px;">Interpretation:</div>
    ${escapeHtml(def.interpretation)}
  </div>` : ""}

  ${def.methodologyNote ? `
  <div style="margin: 12px 0; padding: 10px; border: 1px dashed #d1d5db; font-size: 11px; color: #555; white-space: pre-line;">
    <div style="font-weight: 700; margin-bottom: 4px;">Methodology / Notes:</div>
    ${escapeHtml(def.methodologyNote)}
  </div>` : ""}

  {{#if flag_critical}}
  <div style="margin: 12px 0; padding: 10px; border: 2px solid #dc2626; background: #fef2f2; font-size: 12px; color: #7f1d1d;">
    <strong>⚠ CRITICAL VALUE NOTIFIED</strong> — result is outside critical limits. The requesting clinician has been informed per laboratory SOP.
  </div>
  {{/if}}

  <div style="text-align: right; font-style: italic; font-size: 11px; margin-top: 14px; color: #555;">~~ End of report ~~</div>
</div>`.trim();
}

/** Standardized qualitative (Reactive/Non-Reactive) report — used by HIV, HBsAg, H. pylori, Pregnancy, Malaria RDT, etc. */
function qualitativeModeHtml(def: TestDefinition): string {
    return `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: 16px auto; color: #000;">
  <h2 style="text-align: center; margin: 0 0 8px; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(def.name)}</h2>

  ${specimenBlock(def)}

  <div style="padding: 18px; border: 2px solid #1f2937; margin-bottom: 12px; text-align: center; background: #f9fafb;">
    <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Result</div>
    <div style="font-size: 26px; font-weight: 700; color: {{#if flag_critical}}#dc2626{{else}}#1f2937{{/if}};">{{qualitative_result}}</div>
    {{#if qualitative_description}}<div style="margin-top: 6px; font-size: 12px; color: #555;">{{qualitative_description}}</div>{{/if}}
  </div>

  {{#if has_notes}}
  <div style="margin: 12px 0; padding: 10px; border-left: 3px solid #2563eb; background: #eff6ff; font-size: 12px;">
    <div style="font-weight: 700; margin-bottom: 4px; color: #1e3a8a;">Notes / Clinical Information:</div>
    {{notes}}
  </div>
  {{/if}}

  ${def.interpretation ? `
  <div style="margin: 12px 0; padding: 10px; border: 1px solid #d1d5db; background: #fafafa; font-size: 12px; white-space: pre-line;">
    <div style="font-weight: 700; margin-bottom: 4px;">Interpretation:</div>
    ${escapeHtml(def.interpretation)}
  </div>` : ""}

  ${def.methodologyNote ? `
  <div style="margin: 12px 0; padding: 10px; border: 1px dashed #d1d5db; font-size: 11px; color: #555; white-space: pre-line;">
    <div style="font-weight: 700; margin-bottom: 4px;">Methodology / Notes:</div>
    ${escapeHtml(def.methodologyNote)}
  </div>` : ""}

  <div style="text-align: right; font-style: italic; font-size: 11px; margin-top: 14px; color: #555;">~~ End of report ~~</div>
</div>`.trim();
}

/** Standardized label-value report (Blood Bank panel). */
function labelValueModeHtml(def: TestDefinition): string {
    const sections = (def.labelSections || []).map(s => escapeHtml(s));
    // Render a row per label section. Use the same {{investigation}}/{{result}}
    // placeholders so the row loop just needs to map section→investigation and
    // blank value.
    return `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: 16px auto; color: #000;">
  <h2 style="text-align: center; margin: 0 0 8px; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(def.name)}</h2>

  ${specimenBlock(def)}

  <div style="border: 1.5px solid #000; padding: 18px; margin-bottom: 12px;">
    {{#each rows}}
    <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 12px 0; font-size: 14px; border-bottom: 1px dotted #ccc;">
      <div style="font-style: italic; font-weight: 700;">{{investigation}}</div>
      <div style="font-weight: 600; text-align: right; min-width: 100px;">{{result}}</div>
    </div>
    {{/each}}
  </div>

  {{#if has_notes}}
  <div style="margin: 12px 0; padding: 10px; border-left: 3px solid #2563eb; background: #eff6ff; font-size: 12px;">
    <div style="font-weight: 700; margin-bottom: 4px; color: #1e3a8a;">Notes / Clinical Information:</div>
    {{notes}}
  </div>
  {{/if}}

  ${def.interpretation ? `
  <div style="margin: 12px 0; padding: 10px; border: 1px solid #d1d5db; background: #fafafa; font-size: 12px; white-space: pre-line;">
    <div style="font-weight: 700; margin-bottom: 4px;">Interpretation:</div>
    ${escapeHtml(def.interpretation)}
  </div>` : ""}

  ${def.methodologyNote ? `
  <div style="margin: 12px 0; padding: 10px; border: 1px dashed #d1d5db; font-size: 11px; color: #555; white-space: pre-line;">
    <div style="font-weight: 700; margin-bottom: 4px;">Methodology / Notes:</div>
    ${escapeHtml(def.methodologyNote)}
  </div>` : ""}

  <div style="text-align: right; font-style: italic; font-size: 11px; margin-top: 14px; color: #555;">~~ End of report ~~</div>
</div>`.trim();
}

/** Standardized serology report (VDRL/RPR-style multi-section). */
function serologyModeHtml(def: TestDefinition): string {
    return `
<div style="font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: 16px auto; color: #000;">
  <h2 style="text-align: center; margin: 0 0 8px; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(def.name)}</h2>

  ${specimenBlock(def)}

  <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 14px;">
    <thead>
      <tr style="background: #1f2937; color: #fff;">
        <th style="border: 1px solid #1f2937; padding: 6px; text-align: left;">Test</th>
        <th style="border: 1px solid #1f2937; padding: 6px; text-align: left;">Value</th>
        <th style="border: 1px solid #1f2937; padding: 6px; text-align: left;">Unit</th>
        <th style="border: 1px solid #1f2937; padding: 6px; text-align: left;">Reference</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border: 1px solid #000; padding: 6px; font-weight: 700;">{{test_name}}</td>
        <td style="border: 1px solid #000; padding: 6px; font-weight: 600;" class="{{flag_class}}">{{result}}</td>
        <td style="border: 1px solid #000; padding: 6px;">{{test_unit}}</td>
        <td style="border: 1px solid #000; padding: 6px;">{{test_reference}}</td>
      </tr>
    </tbody>
  </table>

  ${def.interpretation ? `
  <div style="margin: 12px 0; padding: 10px; border: 1px solid #d1d5db; background: #fafafa; font-size: 12px; white-space: pre-line;">
    <div style="font-weight: 700; margin-bottom: 4px;">Interpretation:</div>
    ${escapeHtml(def.interpretation)}
  </div>` : ""}

  ${def.methodologyNote ? `
  <div style="margin: 12px 0; padding: 10px; border: 1px dashed #d1d5db; font-size: 11px; color: #555; white-space: pre-line;">
    <div style="font-weight: 700; margin-bottom: 4px;">Methodology / Notes:</div>
    ${escapeHtml(def.methodologyNote)}
  </div>` : ""}

  {{#if has_notes}}
  <div style="margin: 12px 0; padding: 10px; border-left: 3px solid #2563eb; background: #eff6ff; font-size: 12px;">
    <div style="font-weight: 700; margin-bottom: 4px; color: #1e3a8a;">Notes / Clinical Information:</div>
    {{notes}}
  </div>
  {{/if}}

  <div style="text-align: right; font-style: italic; font-size: 11px; margin-top: 14px; color: #555;">~~ End of report ~~</div>
</div>`.trim();
}

/**
 * Build a complete standardized template bundle for a test, using the
 * comprehensive TestDefinition map. Returns the shape expected by
 * /api/lab/templates/seed-defaults.
 */
export function standardizedTemplateFor(opts: { testName: string; categoryName?: string; unit?: string; referenceRange?: string }): { resultMode: "single" | "table" | "qualitative" | "label-value" | "serology"; templateHtml: string; resultSchema?: any } | null {
    const def = getTestDefinition(opts.testName);
    if (!def) return null;

    let templateHtml: string;
    switch (def.mode) {
        case "table":       templateHtml = tableModeHtml(def); break;
        case "single":      templateHtml = singleModeHtml(def); break;
        case "qualitative": templateHtml = qualitativeModeHtml(def); break;
        case "label-value": templateHtml = labelValueModeHtml(def); break;
        case "serology":    templateHtml = serologyModeHtml(def); break;
        default:            return null;
    }

    // Build resultSchema (the canonical row list) from the definition.
    // For label-value mode, schema rows have no units/ranges — they're free text.
    let resultSchema: any;
    if (def.mode === "label-value" && def.labelSections) {
        resultSchema = { rows: def.labelSections.map(s => ({ investigation: s })) };
    } else if (def.analytes) {
        resultSchema = { rows: definitionToSchemaRows(def) };
    }

    return {
        resultMode: def.mode === "label-value" ? "table" : def.mode,
        templateHtml,
        resultSchema,
    };
}
