export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountType, AccountCategory } from '@/lib/generated-prisma';

// GET /api/finance/reports/income-statement
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const fromDate = searchParams.get('from') ? new Date(searchParams.get('from')!) : new Date(new Date().getFullYear(), 0, 1);
        const toDate = searchParams.get('to') ? new Date(searchParams.get('to')!) : new Date();

        // Revenue accounts (include control accounts — 4100 etc. hold real postings)
        const revenueAccounts = await prisma.chartOfAccount.findMany({
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
        });

        // Expense accounts (include control accounts)
        const expenseAccounts = await prisma.chartOfAccount.findMany({
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
        });

        // Also look at tax invoices for revenue (actual billing data)
        const invoiceRevenue = await prisma.taxInvoice.groupBy({
            by: ['invoiceType'],
            where: {
                paymentStatus: { in: ['PAID', 'PARTIAL'] },
                invoiceDate: { gte: fromDate, lte: toDate },
                invoiceType: { notIn: ['CREDIT_NOTE', 'DEBIT_NOTE'] },
            },
            _sum: { amountPaid: true, totalAmount: true, taxTotal: true },
        });

        const mapAccount = (acc: any) => {
            const debit = acc.journalEntries.reduce((s: number, l: any) => s + l.debitAmount, 0);
            const credit = acc.journalEntries.reduce((s: number, l: any) => s + l.creditAmount, 0);
            const balance = credit - debit; // Revenue credit-normal
            return { ...acc, balance: Math.abs(balance), journalEntries: undefined };
        };

        const mapExpense = (acc: any) => {
            const debit = acc.journalEntries.reduce((s: number, l: any) => s + l.debitAmount, 0);
            const credit = acc.journalEntries.reduce((s: number, l: any) => s + l.creditAmount, 0);
            const balance = debit - credit; // Expense debit-normal
            return { ...acc, balance: Math.abs(balance), journalEntries: undefined };
        };

        const revenue = revenueAccounts.map(mapAccount);
        const expenses = expenseAccounts.map(mapExpense);

        // Separate COGS (Cost of Goods Sold) from operating expenses.
        // 5110 is the chart-of-accounts code for "Cost of Drugs Dispensed".
        // We also recognize any account with the "COGS" category or with name containing
        // "cost of" so future COGS accounts automatically classify correctly.
        const isCOGS = (acc: any) =>
            acc.accountCode === '5110' ||
            acc.category === 'COGS' ||
            /cost of\s+(goods|drugs|sold|dispensed|revenue)/i.test(acc.accountName);

        const cogs = expenses.filter(isCOGS);
        const operatingExpenses = expenses.filter(a => !isCOGS(a));

        const totalRevenue = revenue.reduce((s, a) => s + a.balance, 0);
        const totalCOGS = cogs.reduce((s, a) => s + a.balance, 0);
        const totalOperating = operatingExpenses.reduce((s, a) => s + a.balance, 0);
        const totalExpenses = totalCOGS + totalOperating;
        const grossProfit = totalRevenue - totalCOGS;
        const netIncome = grossProfit - totalOperating;

        // Group operating expenses by category
        const groupedExpenses: Record<string, typeof operatingExpenses> = {};
        for (const exp of operatingExpenses) {
            const cat = exp.category ?? 'OTHER_EXPENSE';
            if (!groupedExpenses[cat]) groupedExpenses[cat] = [];
            groupedExpenses[cat].push(exp);
        }

        return NextResponse.json({
            period: { from: fromDate.toISOString(), to: toDate.toISOString() },
            revenue: {
                accounts: revenue,
                total: totalRevenue,
            },
            cogs: {
                accounts: cogs,
                total: totalCOGS,
            },
            grossProfit,
            operatingExpenses: {
                grouped: groupedExpenses,
                accounts: operatingExpenses,
                total: totalOperating,
            },
            expenses: {
                // Backwards-compat: include all expenses here too for old clients
                grouped: groupedExpenses,
                accounts: expenses,
                total: totalExpenses,
            },
            invoiceRevenue,
            netIncome,
            isProfit: netIncome >= 0,
        });
    } catch (error) {
        console.error('Income statement error:', error);
        return NextResponse.json({ error: 'Failed to generate income statement' }, { status: 500 });
    }
}
