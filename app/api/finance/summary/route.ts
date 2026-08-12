import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountType } from '@/lib/generated-prisma';

export async function GET() {
    try {
        const [
            revenueAccounts,
            arAccounts,
            accounts,
            recentJournals,
            invoiceAgg,
            taxInvoiceAgg,
            paymentAgg,
        ] = await Promise.all([
            // Revenue accounts (include control accounts — 4100 etc. hold real postings)
            prisma.chartOfAccount.findMany({
                where: { accountType: AccountType.REVENUE },
                include: {
                    journalEntries: {
                        where: { journalEntry: { status: 'POSTED' } },
                        select: { creditAmount: true, debitAmount: true }
                    }
                }
            }),
            // AR account balances for reconciliation
            prisma.chartOfAccount.findMany({
                where: { accountCode: { in: ['1131', '1132'] } },
                include: {
                    journalEntries: {
                        where: { journalEntry: { status: 'POSTED' } },
                        select: { debitAmount: true, creditAmount: true }
                    }
                }
            }),
            // All active accounts for the list
            prisma.chartOfAccount.findMany({
                where: { isActive: true },
                select: {
                    id: true, accountCode: true, accountName: true,
                    accountType: true, category: true, isControlAccount: true,
                    openingBalance: true,
                },
                orderBy: { accountCode: 'asc' },
            }),
            // Recent journal entries
            prisma.journalEntry.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: {
                    createdBy: { select: { name: true } },
                    lines: {
                        include: {
                            account: { select: { accountCode: true, accountName: true } },
                        },
                    },
                },
            }),
            // Real invoice totals (canonical — preferred over journal-derived when
            // legacy data has duplicate journals from pre-idempotency retries)
            prisma.invoice.aggregate({
                _count: true,
                _sum: { totalAmount: true, amountPaid: true, balanceDue: true },
            }),
            // Only count STANDALONE TaxInvoices (parentInvoiceId is null).
            // Sub-bill TaxInvoices (linked to a legacy Invoice) are excluded to
            // avoid double-counting the same pharmacy items.
            prisma.taxInvoice.aggregate({
                where: { parentInvoiceId: null },
                _count: true,
                _sum: { totalAmount: true, amountPaid: true, balanceDue: true },
            }),
            prisma.payment.aggregate({
                _sum: { amount: true },
            }),
        ]);

        // Canonical totals from invoice/payment tables
        const totalInvoiced = (invoiceAgg._sum.totalAmount ?? 0) + (taxInvoiceAgg._sum.totalAmount ?? 0);
        const totalCollected = paymentAgg._sum.amount ?? 0;
        const totalOutstanding = (invoiceAgg._sum.balanceDue ?? 0) + (taxInvoiceAgg._sum.balanceDue ?? 0);

        // Journal-derived totals (for audit/reconciliation)
        const totalInvoicedFromJournals = revenueAccounts.reduce((sum, acc) => {
            return sum + acc.journalEntries.reduce((s, line) => s + (line.creditAmount - line.debitAmount), 0);
        }, 0);
        const totalOutstandingFromJournals = arAccounts.reduce((sum, acc) => {
            return sum + acc.journalEntries.reduce((s, line) => s + (line.debitAmount - line.creditAmount), 0);
        }, 0);

        // Status breakdown
        const [taxInvByStatus, legacyByStatus, claimsByStatus, claimsTotalPending, subBillByStatus] = await Promise.all([
            // Standalone TaxInvoices (counted in totals)
            prisma.taxInvoice.groupBy({ where: { parentInvoiceId: null }, by: ['paymentStatus'], _count: true }),
            prisma.invoice.groupBy({ by: ['status'], _count: true }),
                where: { status: { in: ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'APPROVED'] } },
                _count: true,
                _sum: { eligibleAmount: true },
            }),
            // Sub-bill TaxInvoices (linked to a parent Invoice — not counted in totals)
            prisma.taxInvoice.groupBy({ where: { parentInvoiceId: { not: null } }, by: ['paymentStatus'], _count: true, _sum: { totalAmount: true, balanceDue: true } }),
        ]);
        const paidLegacy = legacyByStatus.find(s => s.status === 'Paid')?._count ?? 0;
        const pendingLegacy = legacyByStatus.find(s => s.status === 'Unpaid')?._count ?? 0;
        const partialLegacy = legacyByStatus.find(s => s.status === 'Partial')?._count ?? 0;
        const paidTax = taxInvByStatus.find(s => s.paymentStatus === 'PAID')?._count ?? 0;
        const pendingTax = taxInvByStatus.find(s => s.paymentStatus === 'PENDING')?._count ?? 0;
        const partialTax = taxInvByStatus.find(s => s.paymentStatus === 'PARTIAL')?._count ?? 0;

        // Per-status outstanding balance: only PENDING/PARTIAL contribute to balanceDue.
        // The page's KPI sub-labels use _count, while the outstanding total is summed
        // by the page's reduce. Distribute balanceDue correctly across statuses.
        const pendingBalance = (pendingTax > 0 ? (taxInvoiceAgg._sum.balanceDue ?? 0) : 0) + (pendingLegacy > 0 ? (invoiceAgg._sum.balanceDue ?? 0) : 0);

        return NextResponse.json({
            summary: {
                totalInvoiced: Math.max(0, totalInvoiced),
                totalRevenue: Math.max(0, totalCollected),
                totalCollected: Math.max(0, totalCollected),
                totalOutstanding: Math.max(0, totalOutstanding),
                claims: {
                    byStatus: claimsByStatus.map(c => ({ status: c.status, count: c._count, totalAmount: c._sum.totalAmount ?? 0, eligibleAmount: c._sum.eligibleAmount ?? 0 })),
                    pendingCount: claimsTotalPending._count,
                    pendingEligible: claimsTotalPending._sum.eligibleAmount ?? 0,
                },
                // Audit: do journal-derived totals match the table totals?
                reconciliation: {
                    totalInvoiced: { table: totalInvoiced, journals: Math.max(0, totalInvoicedFromJournals), match: Math.abs(totalInvoiced - totalInvoicedFromJournals) < 1 },
                    totalOutstanding: { table: totalOutstanding, journals: Math.max(0, totalOutstandingFromJournals), match: Math.abs(totalOutstanding - totalOutstandingFromJournals) < 1 },
                },
                invoiceCounts: {
                    total: invoiceAgg._count + taxInvoiceAgg._count,
                    paid: paidLegacy + paidTax,
                    pending: pendingLegacy + pendingTax,
                    partial: partialLegacy + partialTax,
                },
                taxInvoiceStats: [
                    {
                        paymentStatus: 'PAID',
                        _count: paidLegacy + paidTax,
                        _sum: { totalAmount: invoiceAgg._sum.totalAmount ?? 0, amountPaid: invoiceAgg._sum.amountPaid ?? 0, balanceDue: 0 }
                    },
                    {
                        paymentStatus: 'PENDING',
                        _count: pendingLegacy + pendingTax,
                        _sum: { totalAmount: 0, amountPaid: 0, balanceDue: pendingBalance }
                    },
                    {
                        paymentStatus: 'PARTIAL',
                        _count: partialLegacy + partialTax,
                        _sum: { totalAmount: 0, amountPaid: 0, balanceDue: 0 }
                    },
                ],
            },
            accounts,
            recentJournals,
        });
    } catch (error) {
        console.error('Finance summary error:', error);
        return NextResponse.json({ error: 'Failed to load finance summary' }, { status: 500 });
    }
}
