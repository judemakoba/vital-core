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
    styleHeader,
    styleLabel,
    type AccountRow,
    type JournalLineRow,
} from '@/lib/finance/excel-export';

const TENANT_NAME = 'Vital Core HMS';

/**
 * GET /api/finance/reports/balance-sheet/export/xlsx?asOf=YYYY-MM-DD
 *
 * Streams an Excel workbook of the balance sheet as of a point in time.
 * Same three-sheet structure as the income statement export:
 *
 *   1. Balance Sheet — Assets | Liabilities | Equity, with the
 *      accounting equation check ("Total Assets = Total L + E").
 *      Every subtotal and total is a live formula over the Raw Data sheet.
 *
 *   2. Raw Data — every posted journal line up to asOf.
 *
 *   3. By Account — per-account roll-up, with opening balance, period
 *      activity, net movement, and ending balance. This is the
 *      "financial analysis by accounts" view.
 *
 * Key accounting convention enforced here:
 *   - ASSET / EXPENSE:  balance = opening + debit - credit (debit-normal)
 *   - LIABILITY / EQUITY / REVENUE: balance = opening + credit - debit (credit-normal)
 *   - Net income for the period-to-date flows into equity as Retained
 *     Earnings so the accounting equation always balances.
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

        // We need every active account (ASSET/LIABILITY/EQUITY for the BS,
        // plus REVENUE/EXPENSE for retained earnings).
        const [accounts, allAccounts, journalLines] = await Promise.all([
            prisma.chartOfAccount.findMany({
                where: { isActive: true, accountType: { in: [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY] } },
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
            prisma.chartOfAccount.findMany({
                where: { isActive: true },
                select: { accountType: true, openingBalance: true },
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

        // ── Compute Retained Earnings from the P&L ──────────────────────
        // Retained earnings = Σ(revenue credits - debits) - Σ(expense debits - credits)
        // for every revenue/expense account (whether active or not — historical P&L stays).
        const plAccounts = await prisma.chartOfAccount.findMany({
            where: { accountType: { in: [AccountType.REVENUE, AccountType.EXPENSE] } },
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
        });
        let revenueTotal = 0;
        let expenseTotal = 0;
        for (const a of plAccounts) {
            const dr = a.journalEntries.reduce((s, l) => s + l.debitAmount, 0);
            const cr = a.journalEntries.reduce((s, l) => s + l.creditAmount, 0);
            if (a.accountType === AccountType.REVENUE) revenueTotal += cr - dr;
            else expenseTotal += dr - cr;
        }
        const retainedEarnings = revenueTotal - expenseTotal;

        // ── Project account rows for the BS ─────────────────────────────
        // For the per-account sheet, include every account that had any
        // activity (so the analysis sheet is complete).
        const accountRows: AccountRow[] = accounts.map(acc => {
            const debit = acc.journalEntries.reduce((s, l) => s + l.debitAmount, 0);
            const credit = acc.journalEntries.reduce((s, l) => s + l.creditAmount, 0);
            const isDebitNormal = acc.accountType === AccountType.ASSET;
            const endingBalance = acc.openingBalance + (isDebitNormal ? debit - credit : credit - debit);
            return {
                accountCode: acc.accountCode,
                accountName: acc.accountName,
                category: acc.category,
                accountType: acc.accountType,
                openingBalance: acc.openingBalance,
                debit,
                credit,
                endingBalance,
                isControlAccount: acc.isControlAccount,
            };
        });

        // Also include any revenue/expense account that has movement
        // (so the per-account sheet covers the full ledger)
        const seenCodes = new Set(accountRows.map(a => a.accountCode));
        for (const acc of plAccounts) {
            if (seenCodes.has(acc.accountCode)) continue;
            const debit = acc.journalEntries.reduce((s, l) => s + l.debitAmount, 0);
            const credit = acc.journalEntries.reduce((s, l) => s + l.creditAmount, 0);
            if (debit === 0 && credit === 0) continue;
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
            reportTitle: 'Balance Sheet',
            reportSubtitle: `As of ${asOf.toISOString().slice(0, 10)}`,
            generatedAt: new Date().toISOString(),
            tenantName: TENANT_NAME,
            accounts: accountRows,
            journalLines: rawRows,
        };

        // Raw Data first
        const rawSheetName = addRawDataSheet(wb, ctx);

        // ── Balance Sheet sheet (two columns: Assets | Liab + Equity) ───
        const bs = wb.addWorksheet('Balance Sheet', {
            views: [{ state: 'frozen', ySplit: 6 }],
        });
        addReportHeader(bs, ctx);
        bs.addRow([]);

        // Headers — left half is Assets, right half is Liabilities + Equity
        const colHeaderRow = bs.getRow(6);
        colHeaderRow.getCell(1).value = 'ASSETS';
        bs.mergeCells(6, 1, 6, 3);
        styleSectionHeader(colHeaderRow.getCell(1));
        colHeaderRow.getCell(4).value = 'LIABILITIES & EQUITY';
        bs.mergeCells(6, 4, 6, 6);
        styleSectionHeader(colHeaderRow.getCell(4));
        colHeaderRow.height = 24;

        // Sub-header row (Code | Account | Balance | Code | Account | Balance)
        const subHeaderRow = bs.getRow(7);
        ['Code', 'Account', 'Balance', 'Code', 'Account', 'Balance'].forEach((h, i) => {
            const cell = subHeaderRow.getCell(i + 1);
            cell.value = h;
            styleHeader(cell);
        });
        subHeaderRow.height = 20;

        // Split accounts
        const assets = accountRows.filter(a => a.accountType === 'ASSET' && a.endingBalance !== 0);
        const liabilities = accountRows.filter(a => a.accountType === 'LIABILITY' && a.endingBalance !== 0);
        const equity = accountRows.filter(a => a.accountType === 'EQUITY' && a.endingBalance !== 0);

        const rawAccCol = `'${rawSheetName}'!H`;
        const rawDrCol = `'${rawSheetName}'!J`;
        const rawCrCol = `'${rawSheetName}'!K`;

        // We render the two columns side by side, starting at row 8.
        // Each "row" of the BS is one row in the worksheet.
        const startRow = 8;
        const writeAccountRow = (ws: typeof bs, col: 1 | 4, acc: AccountRow, row: number) => {
            const ws_row = ws.getRow(row);
            ws_row.getCell(col).value = acc.accountCode;
            ws_row.getCell(col + 1).value = acc.accountName;
            // Period debit/credit via SUMIF
            const drFormula = `SUMIF(${rawAccCol}:${rawAccCol},${String.fromCharCode(64 + col)}${row},${rawDrCol}:${rawDrCol})`;
            const crFormula = `SUMIF(${rawAccCol}:${rawAccCol},${String.fromCharCode(64 + col)}${row},${rawCrCol}:${rawCrCol})`;
            // For the BS ending balance: opening + (debit - credit) for debit-normal,
            // opening + (credit - debit) for credit-normal.
            // We embed opening balance as a primary value (blue).
            // For simplicity we just hardcode openingBalance per-row but compute the
            // movement and combine.
            const isDebitNormal = acc.accountType === 'ASSET';
            const opRef = `${String.fromCharCode(64 + col + 2)}${row}`; // we put opening balance next to balance? No — keep simple.
            // Actually let's keep opening balance in a hidden helper column? No — let's
            // put a SUMIF-based balance directly. We need to know whether to use
            // credit-debit or debit-credit. Hardcode the sign based on the type.
            // (The balance is opening + signed movement.)
            const sign = isDebitNormal ? '-' : '+';
            // We don't have opening balance on the BS sheet. Compute it as a formula:
            // =SUMIF of the Raw Data debit/credit gives period movement only, not the
            // opening balance. So we hardcode the openingBalance + add the movement.
            ws_row.getCell(col + 2).value = { formula: `${acc.openingBalance}${sign === '-' ? '-' : '+'}(${sign === '-' ? `(${drFormula})-(${crFormula})` : `(${crFormula})-(${drFormula})`})` };
            // Cleaner approach: just write the formula
            if (isDebitNormal) {
                ws_row.getCell(col + 2).value = { formula: `${acc.openingBalance}+(${drFormula})-(${crFormula})` };
            } else {
                ws_row.getCell(col + 2).value = { formula: `${acc.openingBalance}+(${crFormula})-(${drFormula})` };
            }
            styleCrossSheet(ws_row.getCell(col + 2));
            ws_row.getCell(col).numFmt = '@';
            ws_row.getCell(col + 1).numFmt = '@';
        };

        // Write the asset column on the left
        assets.forEach((acc, i) => writeAccountRow(bs, 1, acc, startRow + i));

        // Write liability + equity on the right, with retained earnings as a
        // special "phantom" equity row at the end of the equity section.
        const rightSide: AccountRow[] = [...liabilities, ...equity];
        // Insert retained earnings as a synthetic row after the equity accounts
        const retainedRow: AccountRow = {
            accountCode: '—',
            accountName: 'Retained Earnings (current period)',
            category: 'EQUITY',
            accountType: 'EQUITY',
            openingBalance: 0,
            debit: 0,
            credit: 0,
            endingBalance: retainedEarnings,
            isControlAccount: false,
        };
        rightSide.push(retainedRow);

        rightSide.forEach((acc, i) => {
            const r = startRow + i;
            const ws_row = bs.getRow(r);
            ws_row.getCell(4).value = acc.accountCode;
            ws_row.getCell(5).value = acc.accountName;
            if (acc.accountCode === '—') {
                // Retained earnings is a hardcoded number (blue) — it's already
                // computed from the P&L up to asOf and doesn't link to Raw Data.
                ws_row.getCell(6).value = acc.endingBalance;
                styleInput(ws_row.getCell(6));
            } else {
                writeAccountRow(bs, 4, acc, r);
            }
            ws_row.getCell(4).numFmt = '@';
            ws_row.getCell(5).numFmt = '@';
        });

        // Totals — use MAX so the unused side doesn't get a "0" total
        const maxRows = Math.max(assets.length, rightSide.length);
        const totalRow = startRow + maxRows;
        const aTotalRow = startRow + assets.length;
        const rTotalRow = startRow + rightSide.length;
        const trow = bs.getRow(totalRow);

        // Asset total
        trow.getCell(1).value = 'TOTAL ASSETS';
        bs.mergeCells(totalRow, 1, totalRow, 2);
        if (assets.length > 0) {
            trow.getCell(3).value = { formula: `SUM(C${startRow}:C${aTotalRow - 1})` };
        } else {
            trow.getCell(3).value = 0;
        }
        // L + E total
        trow.getCell(4).value = 'TOTAL LIABILITIES + EQUITY';
        bs.mergeCells(totalRow, 4, totalRow, 5);
        if (rightSide.length > 0) {
            trow.getCell(6).value = { formula: `SUM(F${startRow}:F${rTotalRow - 1})` };
        } else {
            trow.getCell(6).value = 0;
        }
        for (let c = 1; c <= 6; c++) styleTotal(trow.getCell(c));
        trow.getCell(1).numFmt = '@';
        trow.getCell(4).numFmt = '@';

        // Balance check row
        const checkRow = totalRow + 1;
        const crow = bs.getRow(checkRow);
        crow.getCell(1).value = 'BALANCE CHECK (A − L − E)';
        bs.mergeCells(checkRow, 1, checkRow, 2);
        crow.getCell(3).value = { formula: `C${totalRow}-F${totalRow}` };
        bs.mergeCells(checkRow, 4, checkRow, 5);
        crow.getCell(4).value = { formula: `IF(ABS(C${totalRow}-F${totalRow})<1,"✅ Balanced","⚠️ Off by "&TEXT(C${totalRow}-F${totalRow},"#,##0"))` };
        for (let c = 1; c <= 6; c++) styleTotal(crow.getCell(c));
        crow.getCell(1).numFmt = '@';
        crow.getCell(4).font = { name: 'Calibri', size: 11, bold: true };

        // Column widths
        bs.columns = [
            { width: 10 }, { width: 36 }, { width: 18 },
            { width: 10 }, { width: 36 }, { width: 18 },
        ];

        // By Account sheet
        addByAccountSheet(wb, ctx, rawSheetName);

        const buffer = await workbookToBuffer(wb);
        const filename = `balance-sheet_as-of_${asOf.toISOString().slice(0, 10)}.xlsx`;
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(buffer.length),
            },
        });
    } catch (error) {
        console.error('Balance sheet Excel export error:', error);
        return NextResponse.json({ error: 'Failed to export balance sheet' }, { status: 500 });
    }
}
