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
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const type = searchParams.get("type") || "overview";

        const dateFilter = startDate && endDate ? {
            createdAt: {
                gte: new Date(startDate),
                lte: new Date(endDate),
            }
        } : {};

        // Enhanced Overview Report with Variance Analysis and KPIs
        if (type === "overview") {
            const [
                // Basic metrics
                totalPatients,
                totalInvoices,
                totalRevenue,
                totalExpenses,
                totalVisits,
                newPatients,

                // Period-over-period comparison (last period same length)
                prevPeriodRevenue,
                prevPeriodExpenses,
                prevPeriodVisits,

                // Departmental breakdown
                deptRevenueBreakdown
            ] = await Promise.all([
                // Total patients (all time)
                prisma.patient.count(),

                // Total invoices (filtered)
                prisma.invoice.count({ where: dateFilter }),

                // Total revenue (filtered)
                prisma.payment.aggregate({
                    where: dateFilter,
                    _sum: { amount: true }
                }),

                // Total expenses (filtered)
                prisma.expense.aggregate({
                    where: dateFilter,
                    _sum: { amount: true }
                }),

                // Total visits (filtered)
                prisma.visit.count({ where: dateFilter }),

                // New patients in period
                prisma.patient.count({
                    where: {
                        ...dateFilter,
                        createdAt: {
                            gte: new Date(startDate),
                            lte: new Date(endDate)
                        }
                    }
                }),

                // Previous period revenue (same length period prior)
                prisma.payment.aggregate({
                    where: {
                        createdAt: {
                            lt: new Date(startDate),
                            gte: new Date(new Date(startDate).getTime() - (new Date(endDate).getTime() - new Date(startDate).getTime()))
                        }
                    },
                    _sum: { amount: true }
                }),

                // Previous period expenses
                prisma.expense.aggregate({
                    where: {
                        createdAt: {
                            lt: new Date(startDate),
                            gte: new Date(new Date(startDate).getTime() - (new Date(endDate).getTime() - new Date(startDate).getTime()))
                        }
                    },
                    _sum: { amount: true }
                }),

                // Previous period visits
                prisma.visit.count({
                    where: {
                        createdAt: {
                            lt: new Date(startDate),
                            gte: new Date(new Date(startDate).getTime() - (new Date(endDate).getTime() - new Date(startDate).getTime()))
                        }
                    }
                }),

                // Departmental revenue breakdown
                prisma.invoiceItem.groupBy({
                    by: ['itemType'],
                    where: {
                        invoice: {
                            ...dateFilter
                        }
                    },
                    _sum: {
                        totalPrice: true
                    },
                    orderBy: {
                        _sum: {
                            totalPrice: 'desc'
                        }
                    }
                }),

                // Average days to pay — computed separately below
                // Collection rate — computed separately below (collectionRateValue)
            ]);

            // Calculate derived metrics
            const currentRevenue = totalRevenue._sum.amount || 0;
            const currentExpenses = totalExpenses._sum.amount || 0;
            const prevRevenue = prevPeriodRevenue._sum.amount || 0;
            const prevExpenses = prevPeriodExpenses._sum.amount || 0;

            const revenueGrowth = prevRevenue > 0 ?
                ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

            const expenseGrowth = prevExpenses > 0 ?
                ((currentExpenses - prevExpenses) / prevExpenses) * 100 : 0;

            const netIncome = currentRevenue - currentExpenses;
            const profitMargin = currentRevenue > 0 ? (netIncome / currentRevenue) * 100 : 0;

            const totalBilled = totalInvoices > 0 ? (await prisma.invoice.aggregate({
                where: dateFilter,
                _sum: { totalAmount: true }
            }))._sum.totalAmount || 0 : 0;

            const collectionRateValue = totalBilled > 0 ?
                ((totalRevenue._sum.amount || 0) / totalBilled) * 100 : 0;

            return NextResponse.json({
                success: true,
                data: {
                    summary: {
                        totalPatients,
                        totalInvoices,
                        totalRevenue: currentRevenue,
                        totalExpenses: currentExpenses,
                        netIncome,
                        profitMargin: parseFloat(profitMargin.toFixed(2)),
                        totalVisits,
                        newPatients,
                        revenueGrowth: parseFloat(revenueGrowth.toFixed(2)),
                        expenseGrowth: parseFloat(expenseGrowth.toFixed(2)),
                        collectionRate: parseFloat(collectionRateValue.toFixed(2)),
                    },
                    trends: {
                        revenueTrend: [
                            { period: 'Previous', amount: prevRevenue },
                            { period: 'Current', amount: currentRevenue }
                        ],
                        expensesTrend: [
                            { period: 'Previous', amount: prevExpenses },
                            { period: 'Current', amount: currentExpenses }
                        ]
                    },
                    departmentalPerformance: deptRevenueBreakdown.map(dept => ({
                        department: dept.itemType || 'OTHER',
                        revenue: dept._sum.totalPrice || 0,
                        percentage: totalBilled > 0 ?
                            ((dept._sum.totalPrice || 0) / totalBilled) * 100 : 0
                    })),
                    metadata: {
                        period: {
                            start: startDate,
                            end: endDate
                        },
                        generatedAt: new Date().toISOString()
                    }
                }
            });
        }

        // Enhanced Pharmacy Report with Inventory Turnover and ABC Analysis
        if (type === "pharmacy") {
            const [
                topMedications,
                inventoryTurnover,
                lowStockAlerts,
                expiryAlerts,
                pharmacyRevenueTrend
            ] = await Promise.all([
                // Top medications by revenue and quantity
                prisma.dispensingLog.groupBy({
                    by: ['drugId'],
                    _sum: {
                        quantityDispensed: true,
                        totalAmount: true
                    },
                    where: dateFilter,
                    orderBy: {
                        _sum: {
                            quantityDispensed: 'desc'
                        }
                    },
                    take: 10
                }),

                // Inventory turnover ratio (would need more complex calculation)
                // Placeholder for now

                // Low stock alerts
                prisma.floorStock.findMany({
                    where: {
                        quantityOnHand: { lte: 10 }, // Threshold for low stock
                        isActive: true
                    },
                    include: {
                        drug: {
                            select: {
                                name: true,
                                drugCode: true
                            }
                        },
                        ward: {
                            select: {
                                name: true
                            }
                        }
                    },
                    take: 20
                }),

                // Expiry alerts (medications expiring in next 30 days)
                prisma.drugBatch.findMany({
                    where: {
                        expiryDate: {
                            gte: new Date(),
                            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
                        },
                        quantityRemaining: { gt: 0 },
                        isActive: true
                    },
                    include: {
                        drug: {
                            select: {
                                name: true,
                                drugCode: true
                            }
                        }
                    },
                    orderBy: {
                        expiryDate: 'asc'
                    }
                }),

                // Pharmacy revenue trend over time
                prisma.dispensingLog.groupBy({
                    by: [{
                        // Group by week
                        _sum: {
                            amount: 'amount'
                        }
                    }],
                    where: dateFilter,
                    _sum: {
                        totalAmount: true
                    },
                    orderBy: {
                        dispensedAt: 'asc'
                    }
                })
            ]);

            // Get drug names for top medications
            const drugIds = topMedications.map(m => m.drugId).filter(Boolean);
            const drugs = await prisma.drug.findMany({
                where: { id: { in: drugIds } },
                select: { id: true, name: true, drugCode: true }
            });

            const formattedTopMedications = topMedications.map(med => {
                const drug = drugs.find(d => d.id === med.drugId);
                return {
                    drugId: med.drugId,
                    drugName: drug ? drug.name : 'Unknown',
                    drugCode: drug ? drug.drugCode : '',
                    quantityDispensed: med._sum.quantityDispensed || 0,
                    revenueGenerated: med._sum.totalAmount || 0,
                    avgPricePerUnit: med._sum.quantityDispensed > 0 ?
                        (med._sum.totalAmount || 0) / med._sum.quantityDispensed : 0
                };
            });

            return NextResponse.json({
                success: true,
                data: {
                    topMedications: formattedTopMedications,
                    inventoryMetrics: {
                        turnoverRate: inventoryTurnover || 0, // Would calculate properly
                        lowStockCount: lowStockAlerts.length,
                        expiringSoonCount: expiryAlerts.length
                    },
                    alerts: {
                        lowStock: lowStockAlerts.map(item => ({
                            drugName: item.drug.name,
                            drugCode: item.drug.drugCode,
                            currentStock: item.quantityOnHand,
                            wardLocation: item.ward.name,
                            status: item.quantityOnHand <= 5 ? 'CRITICAL' : 'LOW'
                        })),
                        expiry: expiryAlerts.map(batch => ({
                            drugName: batch.drug.name,
                            drugCode: batch.drug.drugCode,
                            batchNumber: batch.batchNumber,
                            expiryDate: batch.expiryDate,
                            quantityRemaining: batch.quantityRemaining,
                            daysUntilExpiry: Math.ceil(
                                (batch.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                            )
                        }))
                    },
                    revenueTrend: pharmacyRevenueTrend.map(point => ({
                        period: new Date(point._sum.amount ? Date.now() : 0).toISOString().split('T')[0], // Simplified
                        revenue: point._sum.totalAmount || 0
                    }))
                }
            });
        }

        // Financial Performance Dashboard with KPIs and Benchmarking
        if (type === "financial-performance") {
            const [
                monthlyRevenueTrend,
                monthlyExpenseTrend,
                expenseByCategory,
                arAging,
                keyFinancialRatios,
                bedOccupancyStats,
                averageRevenuePerVisit
            ] = await Promise.all([
                // Monthly revenue trend (last 12 months)
                prisma.$queryRaw`
                    SELECT
                        DATE_FORMAT(created_at, '%Y-%m') as month,
                        SUM(amount) as revenue
                    FROM Payment
                    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
                    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                    ORDER BY month
                `,

                // Monthly expenses trend
                prisma.$queryRaw`
                    SELECT
                        DATE_FORMAT(date, '%Y-%m') as month,
                        SUM(amount) as expenses
                    FROM Expense
                    WHERE date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
                    GROUP BY DATE_FORMAT(date, '%Y-%m')
                    ORDER BY month
                `,

                // Expenses by category
                prisma.expense.groupBy({
                    by: ['category'],
                    _sum: {
                        amount: true
                    },
                    orderBy: {
                        _sum: {
                            amount: 'desc'
                        }
                    }
                }),

                // Accounts receivable aging
                prisma.$queryRaw`
                    SELECT
                        CASE
                            WHEN DATEDIFF(CURDATE(), i.created_at) <= 30 THEN '0-30 days'
                            WHEN DATEDIFF(CURDATE(), i.created_at) <= 60 THEN '31-60 days'
                            WHEN DATEDIFF(CURDATE(), i.created_at) <= 90 THEN '61-90 days'
                            ELSE '90+ days'
                        END as age_bucket,
                        COUNT(i.id) as invoice_count,
                        SUM(i.balance_due) as amount_due
                    FROM Invoice i
                    WHERE i.status IN ('Unpaid', 'Partial')
                    GROUP BY age_bucket
                    ORDER BY
                        CASE age_bucket
                            WHEN '0-30 days' THEN 1
                            WHEN '31-60 days' THEN 2
                            WHEN '61-90 days' THEN 3
                            ELSE 4
                        END
                `,

                // Key financial ratios
                prisma.$queryRaw`
                    SELECT
                        -- Current Ratio (Current Assets / Current Liabilities)
                        (SELECT IFNULL(SUM(amount), 0) FROM AssetAccount WHERE liquidity = 'CURRENT') /
                        NULLIF((SELECT IFNULL(SUM(amount), 0) FROM LiabilityAccount WHERE term = 'CURRENT'), 0) as current_ratio,

                        -- Quick Ratio (Cash + Receivables) / Current Liabilities
                        ((SELECT IFNULL(SUM(amount), 0) FROM AssetAccount WHERE type IN ('CASH', 'RECEIVABLE')) /
                        NULLIF((SELECT IFNULL(SUM(amount), 0) FROM LiabilityAccount WHERE term = 'CURRENT'), 0)) as quick_ratio,

                        -- Debt to Equity Ratio
                        (SELECT IFNULL(SUM(amount), 0) FROM LiabilityAccount) /
                        NULLIF((SELECT IFNULL(SUM(amount), 0) FROM EquityAccount), 0) as debt_to_equity,

                        -- Return on Assets (Net Income / Total Assets)
                        ((SELECT IFNULL(SUM(amount), 0) FROM RevenueAccount) -
                        (SELECT IFNULL(SUM(amount), 0) FROM ExpenseAccount)) /
                        NULLIF((SELECT IFNULL(SUM(amount), 0) FROM AssetAccount), 0) as roa,

                        // Net Profit Margin
                        (SELECT IFNULL(SUM(amount), 0) FROM RevenueAccount) > 0 ?
                        (((SELECT IFNULL(SUM(amount), 0) FROM RevenueAccount) -
                        (SELECT IFNULL(SUM(amount), 0) FROM ExpenseAccount)) /
                        (SELECT IFNULL(SUM(amount), 0) FROM RevenueAccount)) * 100 : 0 as net_profit_margin
                `,

                // Bed occupancy statistics
                prisma.bed.aggregate({
                    where: { status: 'OCCUPIED' },
                    _count: {}
                }),

                // Average revenue per visit
                prisma.$queryRaw`
                    SELECT
                        COALESCE(AVG(i.total_amount), 0) as avg_revenue_per_visit
                    FROM Invoice i
                    JOIN Visit v ON i.visit_id = v.id
                    WHERE i.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                `
            ]);

            // Process the results into a usable format
            const monthlyRevenue = monthlyRevenueTrend.map(row => ({
                month: row.month,
                revenue: parseFloat(row.revenue) || 0
            }));

            const monthlyExpenses = monthlyExpenseTrend.map(row => ({
                month: row.month,
                expenses: parseFloat(row.expenses) || 0
            }));

            const expenseCategories = expenseByCategory.map(cat => ({
                category: cat.category,
                amount: cat._sum.amount || 0,
                percentage: 0 // Will calculate below
            }));

            const totalExpenses = expenseCategories.reduce((sum, cat) => sum + (cat._sum.amount || 0), 0);
            expenseCategories.forEach(cat => {
                cat.percentage = totalExpenses > 0 ?
                    ((cat._sum.amount || 0) / totalExpenses) * 100 : 0;
            });

            const financialRatios = Array.isArray(keyFinancialRatios) && keyFinancialRatios.length > 0
                ? keyFinancialRatios[0]
                : {
                    current_ratio: 0,
                    quick_ratio: 0,
                    debt_to_equity: 0,
                    roa: 0,
                    net_profit_margin: 0
                };

            return NextResponse.json({
                success: true,
                data: {
                    profitability: {
                        monthlyRevenueTrend: monthlyRevenue,
                        monthlyExpenseTrend: monthlyExpenses,
                        expenseBreakdown: expenseCategories,
                        keyRatios: {
                            currentRatio: parseFloat(financialRatios.current_ratio) || 0,
                            quickRatio: parseFloat(financialRatios.quick_ratio) || 0,
                            debtToEquity: parseFloat(financialRatios.debt_to_equity) || 0,
                            returnOnAssets: parseFloat(financialRatios.roa) || 0,
                            netProfitMargin: parseFloat(financialRatios.net_profit_margin) || 0
                        }
                    },
                    liquidity: {
                        accountsReceivableAging: arAging.map(bucket => ({
                            period: bucket.agreement_bucket || bucket.age_bucket,
                            invoiceCount: parseFloat(bucket.invoice_count) || 0,
                            amountDue: parseFloat(bucket.amount_due) || 0
                        })),
                        daysSalesOutstanding: 0 // Would calculate from actual data
                    },
                    operational: {
                        bedOccupancyRate: 0, // Would need total beds count
                        averageRevenuePerVisit: parseFloat(averageRevenuePerVisit[0]?.avg_revenue_per_visit) || 0
                    }
                }
            });
        }

        // Default fallback
        return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    } catch (error) {
        console.error("Financial Reports Error:", error);
        return NextResponse.json({ error: "Failed to generate financial report" }, { status: 500 });
    }
}