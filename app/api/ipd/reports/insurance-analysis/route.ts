export const dynamic = 'force-dynamic';
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
        const startDateStr = searchParams.get('startDate');
        const endDateStr = searchParams.get('endDate');

        const startDate = startDateStr ? new Date(startDateStr) : new Date(new Date().setMonth(new Date().getMonth() - 1));
        const endDate = endDateStr ? new Date(endDateStr) : new Date();

        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        const dateFilter = { gte: startDate, lte: endDate };

        // Single query: sum insuranceShare grouped by insurance company via admission → patient → insurance
        // Prisma doesn't support multi-hop groupBy, so we use two lean queries:
        // Q1 — aggregate totals per patient (which maps 1:1 to insurance)
        const chargeAggregates = await prisma.inpatientCharge.groupBy({
            by: ['admissionId'],
            where: {
                chargeDate: dateFilter,
                insuranceShare: { gt: 0 }
            },
            _sum: { insuranceShare: true },
            _count: { admissionId: true }
        });

        if (chargeAggregates.length === 0) {
            return NextResponse.json({
                period: { startDate, endDate },
                totalInsuranceRevenue: 0,
                breakdown: []
            });
        }

        // Q2 — resolve admissionId → insuranceCompany in one batch query
        const admissionIds = chargeAggregates.map(r => r.admissionId);
        const admissions = await prisma.admission.findMany({
            where: { id: { in: admissionIds } },
            select: {
                id: true,
                patient: {
                    select: {
                        insurance: { select: { id: true, name: true } }
                    }
                }
            }
        });

        // Build lookup map: admissionId → insurance
        const admissionInsuranceMap = new Map(
            admissions
                .filter(a => a.patient.insurance)
                .map(a => [a.id, a.patient.insurance!])
        );

        // Aggregate in memory (minimal, O(n) over already-grouped rows)
        const insuranceAnalysis: Record<string, {
            companyName: string;
            totalClaims: number;
            totalAmount: number;
        }> = {};
        let totalInsuranceRevenue = 0;

        for (const row of chargeAggregates) {
            const insurance = admissionInsuranceMap.get(row.admissionId);
            if (!insurance) continue;

            const amount = row._sum.insuranceShare ?? 0;
            totalInsuranceRevenue += amount;

            if (!insuranceAnalysis[insurance.id]) {
                insuranceAnalysis[insurance.id] = {
                    companyName: insurance.name,
                    totalClaims: 0,
                    totalAmount: 0
                };
            }
            insuranceAnalysis[insurance.id].totalAmount += amount;
            insuranceAnalysis[insurance.id].totalClaims += 1; // 1 admission per row
        }

        return NextResponse.json({
            period: { startDate, endDate },
            totalInsuranceRevenue,
            breakdown: Object.values(insuranceAnalysis).sort((a, b) => b.totalAmount - a.totalAmount)
        });

    } catch (error) {
        console.error("Failed to generate insurance analysis report:", error);
        return NextResponse.json({ error: "Failed to generate insurance analysis report" }, { status: 500 });
    }
}
