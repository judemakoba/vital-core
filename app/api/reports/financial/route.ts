export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Parse a YYYY-MM-DD query param into a Date. Falls back to `fallback` if missing/invalid.
function parseDateParam(value: string | null, fallback: Date): Date {
    if (!value) return fallback;
    const d = new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return d;
}

// ISO date string for the first instant of a date (used as `gte` for inclusive lower bound)
function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

// Last instant of a date (used as `lte` so the chosen day is fully included)
function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // ── Date range (optional, all three are query params) ─────────────────────
        // ?from=YYYY-MM-DD&?to=YYYY-MM-DD  → inclusive
        // ?preset=1m|3m|ytd|1y|all          → ignored if from/to also present
        // Default: last 30 days for cash flow, all-time for cumulative KPIs (preserves
        // old behaviour for callers that don't pass dates).
        const { searchParams } = new URL(request.url);
        const fromParam = searchParams.get("from");
        const toParam = searchParams.get("to");
        const preset = searchParams.get("preset");

        const now = new Date();
        let fromDate: Date | null = fromParam ? parseDateParam(fromParam, now) : null;
        let toDate: Date | null = toParam ? parseDateParam(toParam, now) : null;
        if (!fromDate && !toDate && preset) {
            toDate = new Date(now);
            if (preset === "1m") fromDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
            else if (preset === "3m") fromDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
            else if (preset === "1y") fromDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            else if (preset === "ytd") fromDate = new Date(now.getFullYear(), 0, 1);
            else if (preset === "all") fromDate = new Date(2000, 0, 1);
        }

        // Effective range objects — null means "no lower/upper bound"
        const fromBound = fromDate ? startOfDay(fromDate) : null;
        const toBound = toDate ? endOfDay(toDate) : null;
        const dateRangeActive = !!fromBound || !!toBound;
        const dateWhere = (key: "createdAt" | "date") => ({
            ...(fromBound || toBound ? { [key]: { ...(fromBound ? { gte: fromBound } : {}), ...(toBound ? { lte: toBound } : {}) } } : {}),
        });

        // Backwards-compat cutoffs (used for the 30d/60d/12mo KPIs that don't yet
        // honour the range — kept so the existing dashboard charts stay sensible when
        // the user just clicks Refresh without picking a range).
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
            prisma.payment.aggregate({ where: dateWhere("createdAt"), _sum: { amount: true }, _count: true }),
            prisma.payment.groupBy({
                by: ['paymentMethod'],
                where: dateWhere("createdAt"),
                _sum: { amount: true },
                _count: true,
            }),
            prisma.expense.aggregate({ where: dateWhere("date"), _sum: { amount: true }, _count: true }),
            prisma.expense.groupBy({
                by: ['category'],
                where: dateWhere("date"),
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

        // Monthly revenue (last 12 months from `fromDate` if set, else now-12mo)
        // PostgreSQL-compatible
        const monthlyFrom = fromBound ?? cutoff12mo;
        const monthlyRevenue = await prisma.$queryRaw<Array<{ month: string; revenue: number | null; transaction_count: bigint | number }>>`
            SELECT
                TO_CHAR("createdAt", 'YYYY-MM') AS month,
                SUM("amount")::float AS revenue,
                COUNT(*)::int AS transaction_count
            FROM "Payment"
            WHERE "createdAt" >= ${monthlyFrom}
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
            WHERE "date" >= ${monthlyFrom}
            GROUP BY TO_CHAR("date", 'YYYY-MM')
            ORDER BY month
        `;

        // Aging buckets — point-in-time snapshot of all outstanding invoices
        // (independent of the user-supplied date range — aging is a now-snapshot by definition)
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

        // Cash flow summary (last 30 days, fixed window — independent of user range)
        const cashInflow30d = await prisma.payment.aggregate({
            _sum: { amount: true },
            where: { createdAt: { gte: cutoff30 } },
        });
        const cashOutflow30d = await prisma.expense.aggregate({
            _sum: { amount: true },
            where: { date: { gte: cutoff30 } },
        });

        // Revenue last month vs previous month (for MoM growth) — uses fixed 30d/60d cutoffs
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
                    range: {
                        from: fromBound?.toISOString() ?? null,
                        to: toBound?.toISOString() ?? null,
                        preset: preset ?? null,
                        active: dateRangeActive,
                    },
                },
            },
        });
    } catch (error: any) {
        console.error("Financial Report Error:", error);
        return NextResponse.json({ error: "Failed to generate financial report", detail: error?.message ?? String(error) }, { status: 500 });
    }
}
