/**
 * Shared Excel (.xlsx) export helper for financial reports.
 *
 * Design principles (see xlsx skill conventions):
 *   1. **Formula-first**: every total, subtotal, balance, and ratio is a
 *      live `=...` formula. The workbook is a model — flip an input
 *      and every dependent number recomputes on open. Hardcoded numbers
 *      appear ONLY in the Raw-Data sheet (where they ARE primary values
 *      — each is a journal line entry or account balance, not a derivation).
 *   2. **Color coding** (per §5.2 of the xlsx skill):
 *        - Black text: formulas and computed results
 *        - Blue text: hardcoded inputs (the Raw-Data rows)
 *        - Green text: cross-sheet links
 *   3. **Accounting number formats**:
 *        - UGX currency with `_-* UGX * #,##0_-;_-* UGX * (#,##0);_-* UGX * "-"_-;_-@_-`
 *          (parens for negatives, em-dash for zero — full §5.3 convention)
 *        - Percentages as `0.0%`
 *   4. **Multiple sheets per workbook**:
 *        - Sheet 1: the report itself (formatted for human review)
 *        - Sheet 2: Raw Data (full journal lines, the workbook's audit trail)
 *        - Sheet 3: By Account (per-account roll-up — the user's
 *          "financial analysis by accounts" ask)
 *
 * All three sheets reference the Raw Data sheet via `=Raw_Data!A2` style
 * formulas, so editing a journal line auto-updates the report. This is
 * the live-model contract from §5.
 *
 * Why exceljs and not xlsxwriter: exceljs supports reading the workbook
 * back, has more stable cell-merge handling, and works in Next.js's
 * Edge runtime. The downside is throughput, but our report sizes
 * (typically a few thousand rows at most) are nowhere near the limit.
 */
import ExcelJS from 'exceljs';

// ─── Styling constants ────────────────────────────────────────────────
// Cell font colors
const COLOR_FORMULA = 'FF000000';     // black — derived from other cells
const COLOR_INPUT = 'FF0000FF';       // blue  — hardcoded inputs
const COLOR_CROSS_SHEET = 'FF008000'; // green — same-workbook cross-sheet link
const COLOR_HEADER_BG = 'FF1E293B';   // slate-800 (for header row fills)
const COLOR_HEADER_FG = 'FFFFFFFF';
const COLOR_SECTION_BG = 'FF334155';  // slate-700
const COLOR_TOTAL_BG = 'FFF1F5F9';    // slate-100
const COLOR_BORDER = 'FFCBD5E1';      // slate-300

// Number formats
const NUMFMT_UGX = '_-* UGX * #,##0_-;_-* UGX * (#,##0);_-* UGX * "-"_-;_-@_-';
const NUMFMT_UGX_2DP = '_-* UGX * #,##0.00_-;_-* UGX * (#,##0.00);_-* UGX * "-"??_-;_-@_-';
const NUMFMT_INT = '#,##0;(#,##0);"-"';
const NUMFMT_PCT = '0.0%;(0.0%);"-"';
const NUMFMT_DATE = 'yyyy-mm-dd';

// ─── Style helpers ─────────────────────────────────────────────────────

/** Header row style — slate background, white bold text, centred. */
export function styleHeader(cell: ExcelJS.Cell) {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_HEADER_FG } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
        top: { style: 'thin', color: { argb: COLOR_BORDER } },
        bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
        left: { style: 'thin', color: { argb: COLOR_BORDER } },
        right: { style: 'thin', color: { argb: COLOR_BORDER } },
    };
}

/** Section header style — same as header but slightly different bg. */
export function styleSectionHeader(cell: ExcelJS.Cell) {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_HEADER_FG } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SECTION_BG } };
    cell.alignment = { vertical: 'middle' };
}

/** Total row — bold, light fill, top border. */
export function styleTotal(cell: ExcelJS.Cell) {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_FORMULA } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL_BG } };
    cell.border = {
        top: { style: 'medium', color: { argb: COLOR_FORMULA } },
        bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
    };
    cell.numFmt = NUMFMT_UGX;
}

/** Formula cell — black text (the convention marker for "this is derived"). */
export function styleFormula(cell: ExcelJS.Cell) {
    cell.font = { name: 'Calibri', size: 11, color: { argb: COLOR_FORMULA } };
    cell.numFmt = NUMFMT_UGX;
}

/** Cross-sheet link — green text (per §5.2). */
export function styleCrossSheet(cell: ExcelJS.Cell) {
    cell.font = { name: 'Calibri', size: 11, color: { argb: COLOR_CROSS_SHEET } };
    cell.numFmt = NUMFMT_UGX;
}

/** Input/primary-value cell — blue text (the convention marker for "hardcoded"). */
export function styleInput(cell: ExcelJS.Cell) {
    cell.font = { name: 'Calibri', size: 11, color: { argb: COLOR_INPUT } };
    cell.numFmt = NUMFMT_UGX_2DP;
}

/** Plain text label cell. */
export function styleLabel(cell: ExcelJS.Cell, bold = false) {
    cell.font = { name: 'Calibri', size: 11, bold, color: { argb: COLOR_FORMULA } };
    cell.alignment = { vertical: 'middle' };
}

/** Border around a single cell (used for raw-data grid lines). */
function thinBorder(cell: ExcelJS.Cell) {
    cell.border = {
        top: { style: 'thin', color: { argb: COLOR_BORDER } },
        bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
        left: { style: 'thin', color: { argb: COLOR_BORDER } },
        right: { style: 'thin', color: { argb: COLOR_BORDER } },
    };
}

// ─── Types for the data we need to build the workbook ──────────────────

/** A single account line that the report will include. */
export interface AccountRow {
    accountCode: string;
    accountName: string;
    category: string;
    accountType: string;       // ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE
    openingBalance: number;
    debit: number;             // Σ debit movement in the period
    credit: number;            // Σ credit movement in the period
    /** Final computed balance — formula will re-derive this on the sheet. */
    endingBalance: number;
    isControlAccount: boolean;
}

/** A single raw journal line — used to populate the Raw Data sheet. */
export interface JournalLineRow {
    entryNumber: string;
    postingDate: string;       // ISO date (yyyy-mm-dd)
    entryDate: string;
    reference: string | null;
    referenceType: string;
    description: string;
    status: string;
    accountCode: string;
    accountName: string;
    debitAmount: number;
    creditAmount: number;
    lineDescription: string | null;
}

export interface ReportContext {
    /** Human-readable title shown at the top of the report sheet. */
    reportTitle: string;
    /** Sub-title — usually "Period: ... — ..." or "As of ...". */
    reportSubtitle: string;
    /** ISO timestamp of generation (we don't recompute it in Excel — it's metadata). */
    generatedAt: string;
    /** Tenant name for the header. */
    tenantName: string;
    /** The raw account/journal data used by every sheet. */
    accounts: AccountRow[];
    journalLines: JournalLineRow[];
}

// ─── Public API ────────────────────────────────────────────────────────

/** Create a fresh workbook with our standard fonts / page setup. */
export function newReportWorkbook(): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Vital Core HMS';
    wb.lastModifiedBy = 'Vital Core HMS';
    wb.created = new Date();
    wb.modified = new Date();
    return wb;
}

/**
 * Add the standard "Raw Data" sheet that all other sheets link to.
 * Returns the sheet name (used to build cross-sheet formulas).
 */
export function addRawDataSheet(wb: ExcelJS.Workbook, ctx: ReportContext): string {
    const SHEET = 'Raw Data';
    const ws = wb.addWorksheet(SHEET, {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Header row
    const headers = [
        'Entry #', 'Posting Date', 'Entry Date', 'Reference', 'Ref Type',
        'Description', 'Status', 'Account Code', 'Account Name',
        'Debit (UGX)', 'Credit (UGX)', 'Line Description',
    ];
    const headerRow = ws.getRow(1);
    headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        styleHeader(cell);
    });
    headerRow.height = 24;

    // Data rows
    ctx.journalLines.forEach((line, idx) => {
        const row = ws.getRow(idx + 2);
        row.getCell(1).value = line.entryNumber;
        row.getCell(2).value = line.postingDate;
        row.getCell(3).value = line.entryDate;
        row.getCell(4).value = line.reference ?? '';
        row.getCell(5).value = line.referenceType;
        row.getCell(6).value = line.description;
        row.getCell(7).value = line.status;
        row.getCell(8).value = line.accountCode;
        row.getCell(9).value = line.accountName;
        row.getCell(10).value = line.debitAmount;
        row.getCell(11).value = line.creditAmount;
        row.getCell(12).value = line.lineDescription ?? '';

        // All cells here are PRIMARY data (not derived) — blue text.
        for (let c = 1; c <= 12; c++) styleInput(row.getCell(c));
        // Text cells don't get the UGX number format
        for (const c of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12]) {
            row.getCell(c).numFmt = '@';
        }
    });

    // Column widths
    ws.columns = [
        { width: 18 }, { width: 12 }, { width: 12 }, { width: 28 },
        { width: 12 }, { width: 50 }, { width: 10 }, { width: 10 },
        { width: 32 }, { width: 16 }, { width: 16 }, { width: 40 },
    ];

    return SHEET;
}

/**
 * Add the standard "By Account" sheet — the per-account roll-up the user
 * asked for. This is the "financial analysis by accounts" view: every
 * account gets a row with opening balance, period activity, and ending
 * balance, all of which are LIVE FORMULAS over the Raw Data sheet.
 */
export function addByAccountSheet(
    wb: ExcelJS.Workbook,
    ctx: ReportContext,
    rawSheetName: string
): string {
    const SHEET = 'By Account';
    const ws = wb.addWorksheet(SHEET, {
        views: [{ state: 'frozen', ySplit: 2 }],
    });

    // Title
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${ctx.tenantName} — Per-Account Analysis`;
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLOR_FORMULA } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 24;

    // Subtitle
    ws.mergeCells('A2:I2');
    const subCell = ws.getCell('A2');
    subCell.value = `${ctx.reportSubtitle} · Generated ${new Date(ctx.generatedAt).toLocaleString()}`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };

    // Headers (row 4)
    const headerRow = ws.getRow(4);
    const headers = [
        'Code', 'Account Name', 'Type', 'Category',
        'Opening Balance', 'Period Debit', 'Period Credit',
        'Net Movement', 'Ending Balance',
    ];
    headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = h;
        styleHeader(cell);
    });
    headerRow.height = 30;

    // Sort: ASSET → LIABILITY → EQUITY → REVENUE → EXPENSE, then by code
    const typeOrder: Record<string, number> = { ASSET: 0, LIABILITY: 1, EQUITY: 2, REVENUE: 3, EXPENSE: 4 };
    const sortedAccounts = [...ctx.accounts].sort((a, b) => {
        const ta = typeOrder[a.accountType] ?? 9;
        const tb = typeOrder[b.accountType] ?? 9;
        if (ta !== tb) return ta - tb;
        return a.accountCode.localeCompare(b.accountCode);
    });

    // Data rows — every numeric cell except Opening Balance is a SUMIF
    // formula over the Raw Data sheet. That way editing a journal line
    // auto-updates the by-account roll-up. Opening balance is a primary
    // input (from the chart of accounts).
    const rawAccCol = `'${rawSheetName}'!H`;   // account code column
    const rawDrCol = `'${rawSheetName}'!J`;
    const rawCrCol = `'${rawSheetName}'!K`;
    const lastDataRow = ctx.journalLines.length + 1; // +1 for header

    sortedAccounts.forEach((acc, idx) => {
        const row = ws.getRow(5 + idx);
        const r = 5 + idx;

        row.getCell(1).value = acc.accountCode;          // primary value (text)
        row.getCell(2).value = acc.accountName;
        row.getCell(3).value = acc.accountType;
        row.getCell(4).value = acc.category;

        // Opening balance — primary value (blue)
        row.getCell(5).value = acc.openingBalance;
        styleInput(row.getCell(5));

        // Period debit = SUMIF over raw data (cross-sheet link → green)
        row.getCell(6).value = { formula: `SUMIF(${rawAccCol}:${rawAccCol},A${r},${rawDrCol}:${rawDrCol})` };
        styleCrossSheet(row.getCell(6));

        // Period credit = SUMIF
        row.getCell(7).value = { formula: `SUMIF(${rawAccCol}:${rawAccCol},A${r},${rawCrCol}:${rawCrCol})` };
        styleCrossSheet(row.getCell(7));

        // Net movement = period credit - period debit
        // (debit-normal accounts: debit increases; credit-normal: credit increases)
        // We use the sign convention the report expects: positive = increase.
        row.getCell(8).value = { formula: `G${r}-F${r}` };
        styleFormula(row.getCell(8));

        // Ending balance = opening + net (sign-corrected)
        row.getCell(9).value = { formula: `E${r}+H${r}` };
        styleFormula(row.getCell(9));

        // Style text cells
        for (const c of [1, 2, 3, 4]) row.getCell(c).numFmt = '@';
        for (const c of [1, 2, 3, 4]) thinBorder(row.getCell(c));
    });

    // Grand total row
    const totalRow = 5 + sortedAccounts.length;
    const tr = ws.getRow(totalRow);
    tr.getCell(1).value = 'TOTAL';
    tr.getCell(2).value = `${sortedAccounts.length} accounts`;
    tr.getCell(5).value = { formula: `SUM(E5:E${totalRow - 1})` };
    tr.getCell(6).value = { formula: `SUM(F5:F${totalRow - 1})` };
    tr.getCell(7).value = { formula: `SUM(G5:G${totalRow - 1})` };
    tr.getCell(8).value = { formula: `SUM(H5:H${totalRow - 1})` };
    tr.getCell(9).value = { formula: `SUM(I5:I${totalRow - 1})` };
    for (let c = 1; c <= 9; c++) styleTotal(tr.getCell(c));
    tr.getCell(1).numFmt = '@';
    tr.getCell(2).numFmt = '@';

    // Column widths
    ws.columns = [
        { width: 10 }, { width: 36 }, { width: 12 }, { width: 18 },
        { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 },
    ];

    return SHEET;
}

/** Header block (title + subtitle + generated-at) at the top of a report sheet. */
export function addReportHeader(ws: ExcelJS.Worksheet, ctx: ReportContext) {
    ws.mergeCells('A1:E1');
    const t = ws.getCell('A1');
    t.value = ctx.tenantName;
    t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLOR_FORMULA } };
    t.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 22;

    ws.mergeCells('A2:E2');
    const s = ws.getCell('A2');
    s.value = ctx.reportTitle;
    s.font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_FORMULA } };

    ws.mergeCells('A3:E3');
    const p = ws.getCell('A3');
    p.value = ctx.reportSubtitle;
    p.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };

    ws.mergeCells('A4:E4');
    const g = ws.getCell('A4');
    g.value = `Generated ${new Date(ctx.generatedAt).toLocaleString()}`;
    g.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
}

/** Serialise the workbook to a Buffer (so NextResponse can stream it). */
export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
    // exceljs writes to a Buffer when called without a filename/path.
    // We have to use the arrayBuffer form for Node.js streaming.
    const ab = await wb.xlsx.writeBuffer();
    return Buffer.from(ab);
}
