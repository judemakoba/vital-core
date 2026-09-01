export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
    type AccountRow,
    type JournalLineRow,
} from '@/lib/finance/excel-export';
import { AccountType } from '@/lib/generated-prisma';

const TENANT_NAME = 'Vital Core HMS';

/**
 * GET /api/finance/reports/trial-balance/export/xlsx?asOf=YYYY-MM-DD
 *
 * Streams an Excel workbook of the trial balance. The trial balance
 * is a self-audit tool: every account's debit and credit movement is
 * summed up to asOf, and the two sides must sum to the same total
 * (proving the books are in balance).
 *
 * Three sheets:
 *
 *   1. Trial Balance — grouped by account type, with opening balance,
 *      period debit, period credit, and ending balance per account.
 *      Every period number is a SUMIF formula over Raw Data. A
 *      "BALANCE CHECK" row asserts that total debits = total credits.
 *
 *   2. Raw Data — full posted-journal-lines up to asOf.
 *
 *   3. By Account — per-account roll-up (the "financial analysis by
 *      accounts" view). The trial balance itself is already a per-
 *      account view, so this sheet is mostly for symmetry with the
 *      other exports.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const asOfParam = searchParams.get('asOf');
        const asOf = asOfParam ? new Date(asOfParam) : new Date();
        asOf.setHours(23, 59, 59, 999);
        if (isNaN(asOf.getTime())) {
            return NextResponse.json({ error: 'Invalid asOf date' }, { status: 400 });
        }

        const [accounts, journalLines] = await Promise.all([
            prisma.chartOfAccount.findMany({
                where: { isActive: true },
                include: {
                    journalEntries: {
                        where: {
                            journalEntry: {
                                status: 'POSTED',
                                postingDate: { lte: asOf },
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
                        postingDate: { lte: asOf },
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

        const accountRows: AccountRow[] = accounts.map(acc => {
            const debit = acc.journalEntries.reduce((s, l) => s + l.debitAmount, 0);
            const credit = acc.journalEntries.reduce((s, l) => s + l.creditAmount, 0);
            return {
                accountCode: acc.accountCode,
                accountName: acc.accountName,
                category: acc.category,
                accountType: acc.accountType,
                openingBalance: acc.openingBalance,
                debit,
                credit,
                endingBalance: acc.openingBalance + debit - credit,
                isControlAccount: acc.isControlAccount,
            };
        });

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
            reportTitle: 'Trial Balance',
            reportSubtitle: `As of ${asOf.toISOString().slice(0, 10)}`,
            generatedAt: new Date().toISOString(),
            tenantName: TENANT_NAME,
            accounts: accountRows,
            journalLines: rawRows,
        };

        // Raw Data first
        const rawSheetName = addRawDataSheet(wb, ctx);

        // ── Trial Balance sheet ────────────────────────────────────────
        const tb = wb.addWorksheet('Trial Balance', {
            views: [{ state: 'frozen', ySplit: 6 }],
        });
        addReportHeader(tb, ctx);
        tb.addRow([]);

        // Column headers
        const headerRow = tb.getRow(6);
        ['Code', 'Account Name', 'Type', 'Opening', 'Debit', 'Credit', 'Closing'].forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            styleHeader(cell);
        });
        headerRow.height = 24;

        // Group by account type so the operator can scan ASSET → LIABILITY → EQUITY → REVENUE → EXPENSE
        const typeOrder: Record<string, number> = { ASSET: 0, LIABILITY: 1, EQUITY: 2, REVENUE: 3, EXPENSE: 4 };
        const sorted = [...accountRows].sort((a, b) => {
            const ta = typeOrder[a.accountType] ?? 9;
            const tb = typeOrder[b.accountType] ?? 9;
            if (ta !== tb) return ta - tb;
            return a.accountCode.localeCompare(b.accountCode);
        });

        // We display only accounts with non-zero movement or opening.
        const visible = sorted.filter(a => a.debit !== 0 || a.credit !== 0 || a.openingBalance !== 0);

        const rawAccCol = `'${rawSheetName}'!H`;
        const rawDrCol = `'${rawSheetName}'!J`;
        const rawCrCol = `'${rawSheetName}'!K`;

        let cursor = 7;
        let lastType: string | null = null;
        for (const acc of visible) {
            if (acc.accountType !== lastType) {
                // Type section header
                const secRow = tb.getRow(cursor);
                secRow.getCell(1).value = acc.accountType;
                tb.mergeCells(cursor, 1, cursor, 7);
                styleSectionHeader(secRow.getCell(1));
                secRow.height = 20;
                cursor++;
                lastType = acc.accountType;
            }
            const row = tb.getRow(cursor);
            const r = cursor;
            row.getCell(1).value = acc.accountCode;
            row.getCell(2).value = acc.accountName;
            row.getCell(3).value = acc.accountType;
            row.getCell(4).value = acc.openingBalance;
            styleInput(row.getCell(4));
            // Period debit/credit via SUMIF (green)
            row.getCell(5).value = { formula: `SUMIF(${rawAccCol}:${rawAccCol},A${r},${rawDrCol}:${rawDrCol})` };
            row.getCell(6).value = { formula: `SUMIF(${rawAccCol}:${rawAccCol},A${r},${rawCrCol}:${rawCrCol})` };
            styleCrossSheet(row.getCell(5));
            styleCrossSheet(row.getCell(6));
            // Closing = opening + debit - credit
            row.getCell(7).value = { formula: `D${r}+E${r}-F${r}` };
            styleFormula(row.getCell(7));
            for (const c of [1, 2, 3]) row.getCell(c).numFmt = '@';
            cursor++;
        }

        // Grand total row — total debits must equal total credits
        const totalRow = cursor;
        const trow = tb.getRow(totalRow);
        trow.getCell(1).value = 'TOTALS';
        tb.mergeCells(totalRow, 1, totalRow, 4);
        trow.getCell(5).value = { formula: `SUM(E7:E${totalRow - 1})` };
        trow.getCell(6).value = { formula: `SUM(F7:F${totalRow - 1})` };
        trow.getCell(7).value = { formula: `D${totalRow}+E${totalRow}-F${totalRow}` };
        for (let c = 1; c <= 7; c++) styleTotal(trow.getCell(c));
        trow.getCell(1).numFmt = '@';

        // Balance check
        const checkRow = totalRow + 1;
        const crow = tb.getRow(checkRow);
        crow.getCell(1).value = 'BALANCE CHECK (Debit − Credit)';
        tb.mergeCells(checkRow, 1, checkRow, 4);
        crow.getCell(5).value = { formula: `E${totalRow}-F${totalRow}` };
        tb.mergeCells(checkRow, 5, checkRow, 6);
        crow.getCell(7).value = { formula: `IF(ABS(E${totalRow}-F${totalRow})<1,"✅ Balanced","⚠️ Off by "&TEXT(E${totalRow}-F${totalRow},"#,##0"))` };
        for (let c = 1; c <= 7; c++) styleTotal(crow.getCell(c));
        crow.getCell(1).numFmt = '@';
        crow.getCell(7).font = { name: 'Calibri', size: 11, bold: true };

        tb.columns = [
            { width: 10 }, { width: 36 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
        ];

        // By Account sheet
        addByAccountSheet(wb, ctx, rawSheetName);

        const buffer = await workbookToBuffer(wb);
        const filename = `trial-balance_as-of_${asOf.toISOString().slice(0, 10)}.xlsx`;
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(buffer.length),
            },
        });
    } catch (error) {
        console.error('Trial balance Excel export error:', error);
        return NextResponse.json({ error: 'Failed to export trial balance' }, { status: 500 });
    }
}
