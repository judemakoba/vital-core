export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type") || "variance";
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const budgetYear = searchParams.get("budgetYear") || new Date().getFullYear().toString();

        // Validate date parameters
        if (!startDate || !endDate) {
            return NextResponse.json(
                { error: "startDate and endDate parameters are required" },
                { status: 400 }
            );
        }

        const dateFilter = {
            createdAt: {
                gte: new Date(startDate),
                lte: new Date(endDate)
            }
        };

        if (type === "variance") {
            // Budget vs Actual Variance Analysis
            const [
                actualRevenue,
                actualExpenses,
                budgetedRevenue,
                budgetedExpenses,
                revenueByDepartmentVariance,
                expenseByCategoryVariance
            ] = await Promise.all([
                // Actual revenue for period
                prisma.payment.aggregate({
                    where: dateFilter,
                    _sum: { amount: true }
                }),

                // Actual expenses for period
                prisma.expense.aggregate({
                    where: dateFilter,
                    _sum: { amount: true }
                }),

                // Budgeted revenue for period (from Budget module)
                prisma.budgetLine.aggregate({
                    where: {
                        budget: {
                            fiscalYear: {
                                startDate: { lte: new Date(endDate) },
                                endDate: { gte: new Date(startDate) }
                            },
                            budgetType: "OPERATING"
                        }
                    },
                    _sum: {
                        // This would need to map months to the date range
                        // Simplified for now
                        month1Amount: true,
                        month2Amount: true,
                        month3Amount: true,
                        month4Amount: true,
                        month5Amount: true,
                        month6Amount: true,
                        month7Amount: true,
                        month8Amount: true,
                        month9Amount: true,
                        month10Amount: true,
                        month11Amount: true,
                        month12Amount: true
                    }
                }),

                // Budgeted expenses for period
                prisma.budgetLine.aggregate({
                    where: {
                        budget: {
                            fiscalYear: {
                                startDate: { lte: new Date(endDate) },
                                endDate: { gte: new Date(startDate) }
                            },
                            budgetType: "OPERATING"
                        }
                    },
                    _sum: {
                        month1Amount: true,
                        month2Amount: true,
                        month3Amount: true,
                        month4Amount: true,
                        month5Amount: true,
                        month6Amount: true,
                        month7Amount: true,
                        month8Amount: true,
                        month9Amount: true,
                        month10Amount: true,
                        month11Amount: true,
                        month12Amount: true
                    }
                }),

                // Revenue by department variance (actual vs budgeted)
                prisma.$queryRaw`
                    SELECT
                        ii.itemType as department,
                        COALESCE(SUM(ii.total_price), 0) as actual_amount,
                        0 as budgeted_amount, // Would join with budget table
                        COALESCE(SUM(ii.total_price), 0) - 0 as variance,
                        CASE WHEN 0 = 0 THEN 0 ELSE (COALESCE(SUM(ii.total_price), 0) - 0) / 0 * 100 END as variance_percent
                    FROM InvoiceItem ii
                    JOIN Invoice i ON ii.invoice_id = i.id
                    WHERE i.created_at BETWEEN ? AND ?
                    GROUP BY ii.itemType
                `,
                [startDate, endDate],

                // Expense by category variance
                prisma.$queryRaw`
                    SELECT
                        e.category,
                        COALESCE(SUM(e.amount), 0) as actual_amount,
                        0 as budgeted_amount,
                        COALESCE(SUM(e.amount), 0) - 0 as variance,
                        CASE WHEN 0 = 0 THEN 0 ELSE (COALESCE(SUM(e.amount), 0) - 0) / 0 * 100 END as variance_percent
                    FROM Expense e
                    WHERE e.date BETWEEN ? AND ?
                    GROUP BY e.category
                `,
                [startDate, endDate]
            ]);

            const actualRevenueValue = actualRevenue._sum.amount || 0;
            const actualExpensesValue = actualExpenses._sum.amount || 0;
            const budgetedRevenueValue = budgetedRevenue._sum?.totalAmount ?? 0;
            const budgetedExpensesValue = budgetedExpenses._sum?.totalAmount ?? 0;

            const revenueVariance = actualRevenueValue - budgetedRevenueValue;
            const expenseVariance = actualExpensesValue - budgetedExpensesValue;
            const revenueVariancePercent = budgetedRevenueValue !== 0 ?
                (revenueVariance / budgetedRevenueValue) * 100 : 0;
            const expenseVariancePercent = budgetedExpensesValue !== 0 ?
                (expenseVariance / budgetedExpensesValue) * 100 : 0;

            return NextResponse.json({
                success: true,
                data: {
                    varianceAnalysis: {
                        period: {
                            start: startDate,
                            end: endDate
                        },
                        summary: {
                            actualRevenue: parseFloat(actualRevenueValue.toFixed(2)),
                            budgetedRevenue: parseFloat(budgetedRevenueValue.toFixed(2)),
                            revenueVariance: parseFloat(revenueVariance.toFixed(2)),
                            revenueVariancePercent: parseFloat(revenueVariancePercent.toFixed(2)),
                            actualExpenses: parseFloat(actualExpensesValue.toFixed(2)),
                            budgetedExpenses: parseFloat(budgetedExpensesValue.toFixed(2)),
                            expenseVariance: parseFloat(expenseVariance.toFixed(2)),
                            expenseVariancePercent: parseFloat(expenseVariancePercent.toFixed(2)),
                            netIncomeVariance: parseFloat((revenueVariance - expenseVariance).toFixed(2))
                        },
                        departmentalVariance: revenueByDepartmentVariance.map(dept => ({
                            department: dept.department || 'UNKNOWN',
                            actualAmount: parseFloat(dept.actual_amount) || 0,
                            budgetedAmount: parseFloat(dept.budgeted_amount) || 0,
                            variance: parseFloat(dept.variance) || 0,
                            variancePercent: parseFloat(dept.variance_percent) || 0
                        })),
                        expenseCategoryVariance: expenseByCategoryVariance.map(cat => ({
                            category: cat.category || 'UNKNOWN',
                            actualAmount: parseFloat(cat.actual_amount) || 0,
                            budgetedAmount: parseFloat(cat.budgeted_amount) || 0,
                            variance: parseFloat(cat.variance) || 0,
                            variancePercent: parseFloat(cat.variance_percent) || 0
                        }))
                    },
                    metadata: {
                        budgetYear: budgetYear,
                        analysisType: "budget_vs_actual",
                        generatedAt: new Date().toISOString()
                    }
                }
            });
        }

        if (type === "forecast") {
            // Simple forecasting based on historical trends
            const [
                historicalRevenue,
                historicalExpenses,
                visitTrends,
                patientGrowth
            ] = await Promise.all([
                // Last 12 months revenue trend
                prisma.$queryRaw`
                    SELECT
                        DATE_FORMAT(created_at, '%Y-%m') as month,
                        SUM(amount) as revenue
                    FROM Payment
                    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
                    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                    ORDER BY month
                `,

                // Last 12 months expenses trend
                prisma.$queryRaw`
                    SELECT
                        DATE_FORMAT(date, '%Y-%m') as month,
                        SUM(amount) as expenses
                    FROM Expense
                    WHERE date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
                    GROUP BY DATE_FORMAT(date, '%Y-%m')
                    ORDER BY month
                `,

                // Visit trends
                prisma.$queryRaw`
                    SELECT
                        DATE_FORMAT(created_at, '%Y-%m') as month,
                        COUNT(*) as visits
                    FROM Visit
                    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
                    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                    ORDER BY month
                `,

                // Patient registration trends
                prisma.$queryRaw`
                    SELECT
                        DATE_FORMAT(created_at, '%Y-%m') as month,
                        COUNT(*) as new_patients
                    FROM Patient
                    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
                    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                    ORDER BY month
                `
            ]);

            // Simple linear forecast (in production, would use more sophisticated models)
            const forecastRevenue = forecastBasedOnTrend(historicalRevenue, 3); // 3-month forecast
            const forecastExpenses = forecastBasedOnTrend(historicalExpenses, 3);
            const forecastVisits = forecastBasedOnTrend(visitTrends, 3);
            const forecastPatients = forecastBasedOnTrend(patientGrowth, 3);

            return NextResponse.json({
                success: true,
                data: {
                    forecast: {
                        horizonMonths: 3,
                        revenue: forecastRevenue,
                        expenses: forecastExpenses,
                        visits: forecastVisits,
                        patientRegistrations: forecastPatients,
                        assumptions: [
                            "Linear trend based on last 12 months",
                            "No seasonal adjustments applied",
                            "External factors not considered"
                        ]
                    },
                    metadata: {
                        generatedAt: new Date().toISOString(),
                        modelType: "linear_trend_extrapolation"
                    }
                }
            });
        }

        if (type === "productivity") {
            // Provider and department productivity metrics
            const [
                providerRevenue,
                providerVisitCount,
                departmentUtilization,
                averageRevenuePerProvider
            ] = await Promise.all([
                // Revenue by provider (doctor)
                prisma.$queryRaw`
                    SELECT
                        u.name as provider_name,
                        u.id as provider_id,
                        COUNT(DISTINCT i.id) as invoice_count,
                        COALESCE(SUM(i.total_amount), 0) as total_revenue,
                        COALESCE(AVG(i.total_amount), 0) as avg_revenue_per_invoice
                    FROM Invoice i
                    JOIN Visit v ON i.visit_id = v.id
                    JOIN User u ON v.assigned_doctor_id = u.id
                    WHERE i.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                    GROUP BY u.id, u.name
                    ORDER BY total_revenue DESC
                `,

                // Visit count by provider
                prisma.$queryRaw`
                    SELECT
                        u.name as provider_name,
                        u.id as provider_id,
                        COUNT(v.id) as visit_count
                    FROM Visit v
                    JOIN User u ON v.assigned_doctor_id = u.id
                    WHERE v.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                    GROUP BY u.id, u.name
                    ORDER BY visit_count DESC
                `,

                // Department bed utilization
                prisma.$queryRaw`
                    SELECT
                        w.name as ward_name,
                        w.id as ward_id,
                        COUNT(b.id) as total_beds,
                        SUM(CASE WHEN b.status = 'OCCUPIED' THEN 1 ELSE 0 END) as occupied_beds,
                        (SUM(CASE WHEN b.status = 'OCCUPIED' THEN 1 ELSE 0 END) / COUNT(b.id)) * 100 as occupancy_rate
                    FROM Ward w
                    LEFT JOIN Bed b ON w.id = b.ward_id
                    GROUP BY w.id, w.name
                `,

                // Average revenue per provider visit
                prisma.$queryRaw`
                    SELECT
                        u.name as provider_name,
                        COALESCE(AVG(i.total_amount), 0) as avg_revenue_per_visit
                    FROM Invoice i
                    JOIN Visit v ON i.visit_id = v.id
                    JOIN User u ON v.assigned_doctor_id = u.id
                    WHERE i.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                    GROUP BY u.id, u.name
                `
            ]);

            return NextResponse.json({
                success: true,
                data: {
                    providerProductivity: {
                        revenueByProvider: providerRevenue.map(p => ({
                            providerName: p.provider_name,
                            providerId: p.provider_id,
                            invoiceCount: parseInt(p.invoice_count) || 0,
                            totalRevenue: parseFloat(p.total_revenue) || 0,
                            avgRevenuePerInvoice: parseFloat(p.avg_revenue_per_invoice) || 0
                        })),
                        visitVolumeByProvider: providerVisitCount.map(p => ({
                            providerName: p.provider_name,
                            providerId: p.provider_id,
                            visitCount: parseInt(p.visit_count) || 0
                        }))
                    },
                    departmentUtilization: departmentUtilization.map(d => ({
                        wardName: d.ward_name,
                        wardId: d.ward_id,
                        totalBeds: parseInt(d.total_beds) || 0,
                        occupiedBeds: parseInt(d.occupied_beds) || 0,
                        occupancyRate: parseFloat(d.occupancy_rate) || 0
                    })),
                    averageRevenuePerProvider: averageRevenuePerProvider.map(p => ({
                        providerName: p.provider_name,
                        avgRevenuePerVisit: parseFloat(p.avg_revenue_per_visit) || 0
                    }))
                },
                metadata: {
                    analysisPeriod: "last_6_months",
                    generatedAt: new Date().toISOString()
                }
            });
        }

        return NextResponse.json({ error: "Invalid analytics type" }, { status: 400 });
    } catch (error) {
        console.error("Advanced Financial Analytics Error:", error);
        return NextResponse.json({ error: "Failed to generate financial analytics" }, { status: 500 });
    }
}

// Helper function for simple trend-based forecasting
function forecastBasedOnTrend(historicalData, periodsToForecast) {
    if (!historicalData || historicalData.length < 2) {
        return Array(periodsToForecast).fill({ month: "Forecast", value: 0 });
    }

    // Calculate average month-over-month change
    const changes = [];
    for (let i = 1; i < historicalData.length; i++) {
        const prev = parseFloat(historicalData[i-1].revenue || historicalData[i-1].expenses ||
                              historicalData[i-1].visits || historicalData[i-1].new_patients) || 0;
        const curr = parseFloat(historicalData[i].revenue || historicalData[i].expenses ||
                               historicalData[i].visits || historicalData[i].new_patients) || 0;
        if (prev !== 0) {
            changes.push((curr - prev) / prev);
        }
    }

    const avgChange = changes.length > 0 ?
        changes.reduce((sum, change) => sum + change, 0) / changes.length :
        0;

    const lastValue = parseFloat(historicalData[historicalData.length - 1].revenue ||
                               historicalData[historicalData.length - 1].expenses ||
                               historicalData[historicalData.length - 1].visits ||
                               historicalData[historicalData.length - 1].new_patients) || 0;

    const forecast = [];
    let currentValue = lastValue;

    for (let i = 0; i < periodsToForecast; i++) {
        currentValue = currentValue * (1 + avgChange);
        const forecastDate = new Date();
        forecastDate.setMonth(forecastDate.getMonth() + i + 1);
        forecast.push({
            month: forecastDate.toISOString().split('T')[0].substring(0, 7), // YYYY-MM
            value: parseFloat(currentValue.toFixed(2))
        });
    }

    return forecast;
}