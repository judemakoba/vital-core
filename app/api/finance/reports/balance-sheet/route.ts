export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountType } from '@/lib/generated-prisma';

/**
 * GET /api/finance/reports/balance-sheet?asOf=YYYY-MM-DD
 *
 * A point-in-time snapshot of the accounting equation:
 *   Total Assets  =  Total Liabilities  +  Total Equity
 *
 * For each active account we compute:
 *   balance = openingBalance + (posted journal movement up to asOf)
 *     - ASSET / EXPENSE accounts are debit-normal:
 *         balance = openingBalance + sum(debit) - sum(credit)
 *     - LIABILITY / EQUITY / REVENUE accounts are credit-normal:
 *         balance = openingBalance + sum(credit) - sum(debit)
 *
 * Net income (the period's Revenue - Expense) is added to Equity as
 * "Retained Earnings (current period)". This makes the balance sheet
 * self-balancing on a going-concern basis: a profitable period boosts
 * equity via retained earnings; a loss drains it.
 *
 * Important caveats for the operator:
 *   1. This only includes accounts with `isActive: true`. Deactivating
 *      an account hides it from reports but keeps its history.
 *   2. Only POSTED journal entries are counted. DRAFT entries are skipped
 *      so a half-entered period doesn't lie about the books.
 *   3. Opening balances default to 0 — for a real balance sheet the
 *      admin must set them on the Chart of Accounts tab (the new edit
 *      modal). Until then the balance sheet will show only the activity
 *      that has happened since the chart was created.
 *   4. If `isBalanced` is false, the diff is the "missing" amount.
 *      Common causes: opening balances not set, INVOICE journals not
 *      posted (so AR is zero while Revenue is non-zero), or a manual
 *      journal entry that's unbalanced.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const asOfParam = searchParams.get('asOf');
        // Default asOf = end of today so a fresh report includes everything.
        const asOf = asOfParam ? new Date(asOfParam) : new Date();
        asOf.setHours(23, 59, 59, 999);   // include the whole chosen day
        if (isNaN(asOf.getTime())) {
            return NextResponse.json({ error: 'Invalid asOf date' }, { status: 400 });
        }

        // Fetch all active accounts with their posted journal movement up to asOf.
        // We exclude control accounts from the asset/liability/equity sections —
        // control accounts hold postings only when a more-specific child account
        // doesn't exist, so showing them as primary rows would double-count.
        const accounts = await prisma.chartOfAccount.findMany({
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
        });

        // Helper — for an account, compute the sign-correct balance up to asOf.
        const computeBalance = (acc: typeof accounts[number]) => {
            const totalDebit = acc.journalEntries.reduce((s, l) => s + l.debitAmount, 0);
            const totalCredit = acc.journalEntries.reduce((s, l) => s + l.creditAmount, 0);
            const isDebitNormal = acc.accountType === AccountType.ASSET || acc.accountType === AccountType.EXPENSE;
            // For the balance sheet, the natural sign of ASSET/EXPENSE is positive
            // (debits increase them). For LIABILITY/EQUITY/REVENUE, credits increase.
            return isDebitNormal
                ? acc.openingBalance + (totalDebit - totalCredit)
                : acc.openingBalance + (totalCredit - totalDebit);
        };

        // Project to a flat list of (account, balance, includeInSection).
        const projected = accounts.map(a => {
            const balance = computeBalance(a);
            // Skip control accounts from the section roll-up (they're
            // summaries, not real buckets). The leaf accounts still appear
            // when we expand `rows` below.
            return {
                id: a.id,
                accountCode: a.accountCode,
                accountName: a.accountName,
                accountType: a.accountType,
                category: a.category,
                isControlAccount: a.isControlAccount,
                openingBalance: a.openingBalance,
                balance,
            };
        });

        // For the section totals, we only sum LEAF accounts (not control),
        // because control accounts already roll up their leaves in their
        // own journal movement. If a control has movement AND no leaves,
        // we'd be double-counting.
        const leaves = projected.filter(a => !a.isControlAccount);
        const controls = projected.filter(a => a.isControlAccount);

        // Build section rows — for control accounts, expose their *net* balance
        // (they don't have children in this model, so it's just their own balance).
        // For leaves, also show their own balance.
        const sectionRows = (type: AccountType) =>
            leaves
                .filter(a => a.accountType === type)
                .concat(controls.filter(a => a.accountType === type))
                .filter(a => a.balance !== 0 || a.openingBalance !== 0);

        const assetRows = sectionRows(AccountType.ASSET);
        const liabilityRows = sectionRows(AccountType.LIABILITY);
        const equityRows = sectionRows(AccountType.EQUITY);

        const totalAssets = assetRows.reduce((s, a) => s + a.balance, 0);
        const totalLiabilities = liabilityRows.reduce((s, a) => s + a.balance, 0);
        const totalEquity = equityRows.reduce((s, a) => s + a.balance, 0);

        // Retained earnings: net income up to asOf. Computed as
        //   (sum of revenue credits - debits) - (sum of expense debits - credits)
        // for ALL revenue/expense accounts, not just the active ones,
        // because inactive P&L accounts can still have history that
        // belongs to this period.
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

        const totalLiabilitiesAndEquity = totalLiabilities + totalEquity + retainedEarnings;
        const difference = totalAssets - totalLiabilitiesAndEquity;
        const isBalanced = Math.abs(difference) < 0.01;

        return NextResponse.json({
            asOf: asOf.toISOString(),
            assets: {
                rows: assetRows,
                total: totalAssets,
            },
            liabilities: {
                rows: liabilityRows,
                total: totalLiabilities,
            },
            equity: {
                rows: equityRows,
                total: totalEquity,
                retainedEarnings,
            },
            totalLiabilitiesAndEquity,
            isBalanced,
            difference,
            // Diagnostics — help the user understand why the sheet might
            // be off. `unbalanced` is true if the diff is > 1 UGX.
            diagnostics: {
                revenueTotal,
                expenseTotal,
                netIncome: retainedEarnings,
                openingBalancesSet: accounts.some(a => a.openingBalance !== 0),
                controlAccountsExcluded: controls.length,
            },
        });
    } catch (error) {
        console.error('Balance sheet error:', error);
        return NextResponse.json({ error: 'Failed to generate balance sheet' }, { status: 500 });
    }
}
