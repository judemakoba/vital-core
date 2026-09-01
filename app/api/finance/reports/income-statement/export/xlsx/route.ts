export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountType } from '@/lib/generated-prisma';
import {
    newReportWorkbook,
    addReportHeader,
    addRawDataSheet,
    addByAccountSheet,
    workbookToBuffer,
    styleSectionHeader,
    styleTotal,
    styleFormula,
    styleCrossSheet,
    styleInput,
    styleHeader,
    styleLabel,
    type AccountRow,
    type JournalLineRow,
} from '@/lib/finance/excel-export';

const TENANT_NAME = 'Vital Core HMS';

/**
 * GET /api/finance/reports/income-statement/export/xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Streams an Excel workbook of the income statement (P&L) for the requested
 * period. Three sheets:
 *
 *   1. Income Statement — formatted for human review. Every subtotal and
 *      total is a live `=...` formula over the Raw Data sheet, so editing
 *      a journal line auto-updates the report. Color-coded per the
 *      finance-export conventions (black = formula, green = cross-sheet
 *      link, blue = primary input on Raw Data).
 *
 *   2. Raw Data — every posted journal line in the period. The workbook's
 *      single source of truth; the report and by-account sheets both
 *      link to it.
 *
 *   3. By Account — per-account roll-up for the "financial analysis by
 *      accounts" ask. Shows opening balance, period debit, period credit,
 *      net movement, and ending balance for every account that moved in
 *      the period. All values are SUMIF formulas over Raw Data.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const fromParam = searchParams.get('from');
        const toParam = searchParams.get('to');
        const fromDate = fromParam ? new Date(fromParam) : new Date(new Date().getFullYear(), 0, 1);
        const toDate = toParam ? new Date(toParam) : new Date();
        toDate.setHours(23, 59, 59, 999);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return NextResponse.json({ error: 'Invalid from/to date' }, { status: 400 });
        }

        // Pull all active revenue and expense accounts with their movement
        // in the period. The route also fetches every posted journal line
        // in the period so the Raw Data sheet is complete.
        const [revenueAccounts, expenseAccounts, journalLines] = await Promise.all([
            prisma.chartOfAccount.findMany({
                where: { accountType: AccountType.REVENUE, isActive: true },
                include: {
                    journalEntries: {
                        where: {
                            journalEntry: {
                                status: 'POSTED',
                                postingDate: { gte: fromDate, lte: toDate },
                            },
                        },
                        select: { debitAmount: true, creditAmount: true },
                    },
                },
                orderBy: { accountCode: 'asc' },
            }),
            prisma.chartOfAccount.findMany({
                where: { accountType: AccountType.EXPENSE, isActive: true },
                include: {
                    journalEntries: {
                        where: {
                            journalEntry: {
                                status: 'POSTED',
                                postingDate: { gte: fromDate, lte: toDate },
                            },
                        },
                        select: { debitAmount: true, creditAmount: true },
                    },
                },
                orderBy: { accountCode: 'asc' },
            }),
            prisma.journalEntryLine.findMany({
                where: {
                    journalEntry: {
                        status: 'POSTED',
                        postingDate: { gte: fromDate, lte: toDate },
                    },
                },
                include: {
                    account: { select: { accountCode: true, accountName: true, accountType: true, category: true, isControlAccount: true, openingBalance: true } },
                    journalEntry: {
                        select: {
                            entryNumber: true,
                            entryDate: true,
                            postingDate: true,
                            reference: true,
                            referenceType: true,
                            description: true,
                            status: true,
                        },
                    },
                },
                orderBy: [{ journalEntry: { postingDate: 'asc' } }, { id: 'asc' }],
            }),
        ]);

        // ── Project account rows for the income statement ───────────────
        // Revenue: balance = credit - debit (credit-normal)
        // Expense: balance = debit - credit (debit-normal)
        const accountRows: AccountRow[] = [];
        for (const acc of [...revenueAccounts, ...expenseAccounts]) {
            const debit = acc.journalEntries.reduce((s, l) => s + l.debitAmount, 0);
            const credit = acc.journalEntries.reduce((s, l) => s + l.creditAmount, 0);
            const isDebitNormal = acc.accountType === AccountType.EXPENSE;
            const endingBalance = isDebitNormal ? debit - credit : credit - debit;
            accountRows.push({
                accountCode: acc.accountCode,
                accountName: acc.accountName,
                category: acc.category,
                accountType: acc.accountType,
                openingBalance: acc.openingBalance,
                debit,
                credit,
                endingBalance,
                isControlAccount: acc.isControlAccount,
            });
        }

        // ── Project raw journal lines ───────────────────────────────────
        const rawRows: JournalLineRow[] = journalLines.map(line => ({
            entryNumber: line.journalEntry.entryNumber,
            postingDate: line.journalEntry.postingDate.toISOString().slice(0, 10),
            entryDate: line.journalEntry.entryDate.toISOString().slice(0, 10),
            reference: line.journalEntry.reference,
            referenceType: line.journalEntry.referenceType,
            description: line.journalEntry.description,
            status: line.journalEntry.status,
            accountCode: line.account.accountCode,
            accountName: line.account.accountName,
            debitAmount: line.debitAmount,
            creditAmount: line.creditAmount,
            lineDescription: line.description,
        }));

        // ── Build the workbook ──────────────────────────────────────────
        const wb = newReportWorkbook();
        const ctx = {
            reportTitle: 'Income Statement (Profit & Loss)',
            reportSubtitle: `Period: ${fromDate.toISOString().slice(0, 10)} — ${toDate.toISOString().slice(0, 10)}`,
            generatedAt: new Date().toISOString(),
            tenantName: TENANT_NAME,
            accounts: accountRows,
            journalLines: rawRows,
        };

        // Raw Data first — the other sheets link to it
        const rawSheetName = addRawDataSheet(wb, ctx);

        // ── Income Statement sheet (the formatted report) ───────────────
        const is = wb.addWorksheet('Income Statement', {
            views: [{ state: 'frozen', ySplit: 6 }],
        });
        addReportHeader(is, ctx);
        // Skip a row after the header block
        is.addRow([]);
        const headerRow = is.getRow(6);
        ['Code', 'Account', 'Category', 'Debit', 'Credit', 'Balance'].forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            styleHeader(cell);
        });
        headerRow.height = 24;

        // Revenue section
        const revenue = accountRows.filter(a => a.accountType === 'REVENUE' && (a.endingBalance !== 0 || a.debit !== 0 || a.credit !== 0));
        const expenses = accountRows.filter(a => a.accountType === 'EXPENSE' && (a.endingBalance !== 0 || a.debit !== 0 || a.credit !== 0));
        const isCOGS = (acc: AccountRow) =>
            acc.accountCode === '5110' ||
            acc.category === 'COGS' ||
            /cost of\s+(goods|drugs|sold|dispensed|revenue)/i.test(acc.accountName);
        const cogs = expenses.filter(isCOGS);
        const opex = expenses.filter(a => !isCOGS(a));

        const rawAccCol = `'${rawSheetName}'!H:H`;
        const rawDrCol = `'${rawSheetName}'!J:J`;
        const rawCrCol = `'${rawSheetName}'!K:K`;

        const writeSection = (
            title: string,
            rows: AccountRow[],
            startRow: number,
            sign: 'credit' | 'debit' // which side means "increase"
        ): { lastRow: number; totalRow: number; firstRow: number } => {
            // Section header
            const secRow = is.getRow(startRow);
            secRow.getCell(1).value = title;
            is.mergeCells(startRow, 1, startRow, 6);
            styleSectionHeader(secRow.getCell(1));
            secRow.height = 22;

            // Account rows
            const firstDataRow = startRow + 1;
            rows.forEach((acc, i) => {
                const r = firstDataRow + i;
                const row = is.getRow(r);
                row.getCell(1).value = acc.accountCode;
                row.getCell(2).value = acc.accountName;
                row.getCell(3).value = acc.category;
                // Debit/Credit come from Raw Data via SUMIF (green)
                row.getCell(4).value = { formula: `SUMIF(${rawAccCol},A${r},${rawDrCol})` };
                row.getCell(5).value = { formula: `SUMIF(${rawAccCol},A${r},${rawCrCol})` };
                // Balance = credit - debit (revenue) or debit - credit (expense)
                // We use a sign parameter to keep the formula general
                row.getCell(6).value = { formula: sign === 'credit' ? `E${r}-D${r}` : `D${r}-E${r}` };
                styleCrossSheet(row.getCell(4));
                styleCrossSheet(row.getCell(5));
                styleFormula(row.getCell(6));
                for (const c of [1, 2, 3]) row.getCell(c).numFmt = '@';
            });

            // Subtotal row
            const totalRow = firstDataRow + rows.length;
            const tr = is.getRow(totalRow);
            tr.getCell(1).value = `Total ${title.toLowerCase()}`;
            is.mergeCells(totalRow, 1, totalRow, 3);
            tr.getCell(4).value = { formula: `SUM(D${firstDataRow}:D${totalRow - 1})` };
            tr.getCell(5).value = { formula: `SUM(E${firstDataRow}:E${totalRow - 1})` };
            tr.getCell(6).value = { formula: `SUM(F${firstDataRow}:F${totalRow - 1})` };
            for (let c = 1; c <= 6; c++) styleTotal(tr.getCell(c));
            tr.getCell(1).numFmt = '@';
            tr.getCell(2).numFmt = '@';
            tr.getCell(3).numFmt = '@';

            return { firstRow: firstDataRow, lastRow: totalRow - 1, totalRow };
        };

        let cursor = 7; // row after the column-header
        const revSec = writeSection('REVENUE', revenue, cursor, 'credit');
        cursor = revSec.totalRow + 2;

        let cogsSec: { firstRow: number; lastRow: number; totalRow: number } | null = null;
        if (cogs.length > 0) {
            cogsSec = writeSection('COST OF GOODS SOLD', cogs, cursor, 'debit');
            cursor = cogsSec.totalRow + 2;
        }

        const opexSec = writeSection('OPERATING EXPENSES', opex, cursor, 'debit');
        cursor = opexSec.totalRow + 2;

        // Gross profit (only if we have COGS)
        if (cogsSec) {
            const gpRow = is.getRow(cursor);
            gpRow.getCell(1).value = 'GROSS PROFIT';
            is.mergeCells(cursor, 1, cursor, 5);
            styleLabel(gpRow.getCell(1), true);
            gpRow.getCell(6).value = { formula: `F${revSec.totalRow}-F${cogsSec.totalRow}` };
            styleTotal(gpRow.getCell(6));
            cursor++;
        }

        // Net income
        const niRow = is.getRow(cursor);
        niRow.getCell(1).value = 'NET INCOME';
        is.mergeCells(cursor, 1, cursor, 5);
        styleLabel(niRow.getCell(1), true);
        const opexTotalRef = cogsSec ? `F${opexSec.totalRow}` : `F${opexSec.totalRow}`;
        const netFormula = cogsSec
            ? `F${revSec.totalRow}-F${cogsSec.totalRow}-${opexTotalRef}`
            : `F${revSec.totalRow}-${opexTotalRef}`;
        niRow.getCell(6).value = { formula: netFormula };
        styleTotal(niRow.getCell(6));

        // Column widths
        is.columns = [
            { width: 10 }, { width: 36 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 18 },
        ];

        // By Account sheet
        addByAccountSheet(wb, ctx, rawSheetName);

        // Reorder so the report sheet is first
        // (exceljs's orderNo lets us set the tab order explicitly)
        wb.worksheets.forEach((ws, idx) => {
            ws.orderNo = idx;
        });

        const buffer = await workbookToBuffer(wb);
        const filename = `income-statement_${fromDate.toISOString().slice(0, 10)}_to_${toDate.toISOString().slice(0, 10)}.xlsx`;
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(buffer.length),
            },
        });
    } catch (error) {
        console.error('Income statement Excel export error:', error);
        return NextResponse.json({ error: 'Failed to export income statement' }, { status: 500 });
    }
}
