export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Cutoff dates
        const now = new Date();
        const cutoff30 = new Date(now); cutoff30.setDate(cutoff30.getDate() - 30);
        const cutoff60 = new Date(now); cutoff60.setDate(cutoff60.getDate() - 60);
        const cutoff12mo = new Date(now); cutoff12mo.setMonth(cutoff12mo.getMonth() - 12);

        // Run independent queries in parallel
        const [
            paymentsAgg,
            paymentsByMethod,
            expensesAgg,
            expensesByCategory,
            invoicesAgg,
            invoicesByStatus,
            itemsGroup,
        ] = await Promise.all([
            prisma.payment.aggregate({ _sum: { amount: true }, _count: true }),
            prisma.payment.groupBy({
                by: ['paymentMethod'],
                _sum: { amount: true },
                _count: true,
            }),
            prisma.expense.aggregate({ _sum: { amount: true }, _count: true }),
            prisma.expense.groupBy({
                by: ['category'],
                _sum: { amount: true },
                _count: true,
            }),
            prisma.invoice.aggregate({
                where: { status: { not: "Paid" } },
                _sum: { balanceDue: true },
                _count: true,
                _avg: { balanceDue: true },
            }),
            prisma.invoice.groupBy({
                by: ['status'],
                _sum: { balanceDue: true },
                _count: true,
            }),
            prisma.invoiceItem.groupBy({
                by: ['itemType'],
                _sum: { totalPrice: true },
                _count: true,
            }),
        ]);

        // Monthly revenue (last 12 months) — PostgreSQL-compatible
        const monthlyRevenue = await prisma.$queryRaw<Array<{ month: string; revenue: number | null; transaction_count: bigint | number }>>`
            SELECT
                TO_CHAR("createdAt", 'YYYY-MM') AS month,
                SUM("amount")::float AS revenue,
                COUNT(*)::int AS transaction_count
            FROM "Payment"
            WHERE "createdAt" >= ${cutoff12mo}
            GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
            ORDER BY month
        `;

        // Monthly expenses (last 12 months)
        const monthlyExpenses = await prisma.$queryRaw<Array<{ month: string; expenses: number | null; transaction_count: bigint | number }>>`
            SELECT
                TO_CHAR("date", 'YYYY-MM') AS month,
                SUM("amount")::float AS expenses,
                COUNT(*)::int AS transaction_count
            FROM "Expense"
            WHERE "date" >= ${cutoff12mo}
            GROUP BY TO_CHAR("date", 'YYYY-MM')
            ORDER BY month
        `;

        // Aging buckets — PostgreSQL syntax (EXTRACT(DAY FROM now() - "createdAt"))
        const invoicesAging = await prisma.$queryRaw<Array<{ age_bucket: string; invoice_count: number; amount_due: number; avg_amount_due: number; sort_order: number }>>`
            SELECT
                age_bucket,
                invoice_count,
                amount_due,
                avg_amount_due
            FROM (
                SELECT
                    CASE
                        WHEN EXTRACT(DAY FROM (now() - "createdAt")) <= 30 THEN '0-30 days'
                        WHEN EXTRACT(DAY FROM (now() - "createdAt")) <= 60 THEN '31-60 days'
                        WHEN EXTRACT(DAY FROM (now() - "createdAt")) <= 90 THEN '61-90 days'
                        ELSE '91+ days'
                    END AS age_bucket,
                    CASE
                        WHEN EXTRACT(DAY FROM (now() - "createdAt")) <= 30 THEN 1
                        WHEN EXTRACT(DAY FROM (now() - "createdAt")) <= 60 THEN 2
                        WHEN EXTRACT(DAY FROM (now() - "createdAt")) <= 90 THEN 3
                        ELSE 4
                    END AS sort_order,
                    COUNT(id)::int AS invoice_count,
                    SUM("balanceDue")::float AS amount_due,
                    AVG("balanceDue")::float AS avg_amount_due
                FROM "Invoice"
                WHERE "status" IN ('Unpaid', 'Partial')
                GROUP BY age_bucket, sort_order
            ) AS buckets
            ORDER BY sort_order
        `;

        // Cash flow summary (last 30 days)
        const cashInflow30d = await prisma.payment.aggregate({
            _sum: { amount: true },
            where: { createdAt: { gte: cutoff30 } },
        });
        const cashOutflow30d = await prisma.expense.aggregate({
            _sum: { amount: true },
            where: { date: { gte: cutoff30 } },
        });

        // Revenue last month vs previous month (for MoM growth)
        const cutoff2mo = new Date(now); cutoff2mo.setMonth(cutoff2mo.getMonth() - 2);
        const revenueLastMonthAgg = await prisma.payment.aggregate({
            _sum: { amount: true },
            where: { createdAt: { gte: cutoff60, lt: cutoff30 } },
        });
        const revenuePrevMonthAgg = await prisma.payment.aggregate({
            _sum: { amount: true },
            where: { createdAt: { gte: cutoff2mo, lt: cutoff60 } },
        });

        // Avg invoice + total visits
        const invoiceAggAvg = await prisma.invoice.aggregate({ _avg: { totalAmount: true } });
        const totalVisits = await prisma.visit.count();

        // Process payment data
        const totalRevenue = paymentsAgg._sum.amount || 0;
        const transactionCount = paymentsAgg._count || 0;
        const paymentsByMethodData = paymentsByMethod.map(method => ({
            method: method.paymentMethod || 'UNKNOWN',
            amount: method._sum.amount || 0,
            count: method._count || 0,
            percentage: totalRevenue > 0 ? ((method._sum.amount || 0) / totalRevenue) * 100 : 0,
        }));

        const monthlyRevenueTrend = monthlyRevenue.map((row: any) => ({
            month: row.month,
            revenue: Number(row.revenue) || 0,
            transactionCount: Number(row.transaction_count) || 0,
        }));

        // Process expense data
        const totalExpenses = expensesAgg._sum.amount || 0;
        const expenseTransactionCount = expensesAgg._count || 0;
        const expensesByCategoryData = expensesByCategory.map(category => ({
            category: category.category || 'UNKNOWN',
            amount: category._sum.amount || 0,
            count: category._count || 0,
            percentage: totalExpenses > 0 ? ((category._sum.amount || 0) / totalExpenses) * 100 : 0,
        }));

        const monthlyExpenseTrend = monthlyExpenses.map((row: any) => ({
            month: row.month,
            expenses: Number(row.expenses) || 0,
            transactionCount: Number(row.transaction_count) || 0,
        }));

        // Process invoices data
        const totalOutstanding = invoicesAgg._sum.balanceDue || 0;
        const outstandingCount = invoicesAgg._count || 0;
        const avgOutstanding = invoicesAgg._avg.balanceDue || 0;

        const invoicesByStatusData = invoicesByStatus.map(status => ({
            status: status.status || 'UNKNOWN',
            count: status._count || 0,
            amount: status._sum.balanceDue || 0,
            percentage: outstandingCount > 0 ? ((status._count || 0) / outstandingCount) * 100 : 0,
        }));

        const invoicesAgingData = invoicesAging.map((bucket: any) => ({
            period: bucket.age_bucket,
            invoiceCount: Number(bucket.invoice_count) || 0,
            amountDue: Number(bucket.amount_due) || 0,
            averageAmount: Number(bucket.avg_amount_due) || 0,
        }));

        // Process revenue by category
        const revenueByCategory = itemsGroup.reduce((acc: Record<string, number>, group: any) => {
            const type = group.itemType || "Other";
            acc[type] = (acc[type] || 0) + (group._sum.totalPrice || 0);
            return acc;
        }, {});

        // Cash flow
        const cashInflow30dAmount = cashInflow30d._sum.amount || 0;
        const cashOutflow30dAmount = cashOutflow30d._sum.amount || 0;
        const netCashFlow30d = cashInflow30dAmount - cashOutflow30dAmount;

        // KPIs
        const revenueLastMonth = revenueLastMonthAgg._sum.amount || 0;
        const revenuePrevMonth = revenuePrevMonthAgg._sum.amount || 0;
        const avgInvoiceAmount = invoiceAggAvg._avg.totalAmount || 0;

        const grossProfitMargin = totalRevenue > 0
            ? ((totalRevenue - totalExpenses) / totalRevenue) * 100
            : 0;

        const revenueGrowthMom = revenuePrevMonth > 0
            ? ((revenueLastMonth - revenuePrevMonth) / revenuePrevMonth) * 100
            : 0;

        const revenuePerVisit = totalVisits > 0 ? totalRevenue / totalVisits : 0;
        const invoicesPerVisit = totalVisits > 0 ? (await prisma.invoice.count()) / totalVisits : 0;

        return NextResponse.json({
            success: true,
            data: {
                summary: {
                    totalRevenue: Number(totalRevenue.toFixed(2)),
                    totalExpenses: Number(totalExpenses.toFixed(2)),
                    netIncome: Number((totalRevenue - totalExpenses).toFixed(2)),
                    grossProfitMargin: Number(grossProfitMargin.toFixed(2)),
                    totalOutstanding: Number(totalOutstanding.toFixed(2)),
                    outstandingInvoiceCount: outstandingCount,
                    averageOutstanding: Number(avgOutstanding.toFixed(2)),
                    transactionCount,
                    expenseTransactionCount,
                },
                trends: {
                    monthlyRevenue: monthlyRevenueTrend,
                    monthlyExpenses: monthlyExpenseTrend,
                },
                breakdowns: {
                    paymentsByMethod: paymentsByMethodData,
                    expensesByCategory: expensesByCategoryData,
                    revenueByCategory: Object.entries(revenueByCategory).map(([category, amount]) => ({
                        category,
                        amount: Number((amount as number).toFixed(2)),
                        percentage: totalRevenue > 0 ? ((amount as number) / totalRevenue) * 100 : 0,
                    })),
                    invoicesByStatus: invoicesByStatusData,
                    invoicesAging: invoicesAgingData,
                },
                cashFlow: {
                    inflow30d: Number(cashInflow30dAmount.toFixed(2)),
                    outflow30d: Number(cashOutflow30dAmount.toFixed(2)),
                    netFlow30d: Number(netCashFlow30d.toFixed(2)),
                },
                keyPerformanceIndicators: {
                    grossProfitMargin: Number(grossProfitMargin.toFixed(2)),
                    revenueGrowthMom: Number(revenueGrowthMom.toFixed(2)),
                    averageInvoiceAmount: Number(avgInvoiceAmount.toFixed(2)),
                    revenuePerVisit: Number(revenuePerVisit.toFixed(2)),
                    invoicesPerVisit: Number(invoicesPerVisit.toFixed(2)),
                    collectionEffectivenessIndex: 0,
                },
                metadata: {
                    reportGenerated: new Date().toISOString(),
                    dataFreshness: 'real-time',
                },
            },
        });
    } catch (error: any) {
        console.error("Financial Report Error:", error);
        return NextResponse.json({ error: "Failed to generate financial report", detail: error?.message ?? String(error) }, { status: 500 });
    }
}
