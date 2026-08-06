export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountType } from '@/lib/generated-prisma';

// GET /api/finance/reports/trial-balance
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const asOfDate = searchParams.get('asOf') ? new Date(searchParams.get('asOf')!) : new Date();

        // Get all accounts with their journal entry lines.
        // Include control accounts too — some postings legitimately hit the control
        // account (e.g. 4100 Clinical Revenue) when an invoice has mixed line types
        // we can't map to a specific leaf account.
        const accounts = await prisma.chartOfAccount.findMany({
            where: { isActive: true },
            include: {
                journalEntries: {
                    where: {
                        journalEntry: {
                            status: 'POSTED',
                            postingDate: { lte: asOfDate },
                        },
                    },
                    select: { debitAmount: true, creditAmount: true },
                },
            },
            orderBy: { accountCode: 'asc' },
        });

        const rows = accounts
            .map(acc => {
                const totalDebit = acc.journalEntries.reduce((s, l) => s + l.debitAmount, 0);
                const totalCredit = acc.journalEntries.reduce((s, l) => s + l.creditAmount, 0);
                const balance = acc.openingBalance + totalDebit - totalCredit;

                // Normal balance side - Assets and Expenses have debit-normal balances
                const isDebitNormal = acc.accountType === 'ASSET' || acc.accountType === 'EXPENSE';
                const debitBalance = isDebitNormal && balance > 0 ? Math.abs(balance) : 0;
                const creditBalance = !isDebitNormal && balance < 0 ? Math.abs(balance) : (!isDebitNormal ? balance : 0);

                return {
                    id: acc.id,
                    accountCode: acc.accountCode,
                    accountName: acc.accountName,
                    accountType: acc.accountType,
                    openingBalance: acc.openingBalance,
                    totalDebit,
                    totalCredit,
                    balance,
                    debitBalance: debitBalance > 0 ? debitBalance : (isDebitNormal ? 0 : 0),
                    creditBalance: creditBalance > 0 ? creditBalance : (!isDebitNormal ? 0 : 0),
                };
            })
            .filter(r => r.totalDebit !== 0 || r.totalCredit !== 0 || r.openingBalance !== 0);

        const totalDebits = rows.reduce((s, r) => s + r.totalDebit, 0);
        const totalCredits = rows.reduce((s, r) => s + r.totalCredit, 0);
        const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

        return NextResponse.json({
            asOf: asOfDate.toISOString(),
            rows,
            totals: { totalDebits, totalCredits, isBalanced },
        });
    } catch (error) {
        console.error('Trial balance error:', error);
        return NextResponse.json({ error: 'Failed to generate trial balance' }, { status: 500 });
    }
}
