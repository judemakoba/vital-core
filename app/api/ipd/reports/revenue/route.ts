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

        // Adjust dates to cover full days
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        const charges = await prisma.inpatientCharge.findMany({
            where: {
                chargeDate: {
                    gte: startDate,
                    lte: endDate
                }
            },
            select: {
                totalAmount: true,
                insuranceShare: true,
                patientShare: true,
                discountAmount: true,
                taxAmount: true,
                billableItem: {
                    select: {
                        category: true
                    }
                }
            }
        });

        const revenueByCategory: Record<string, number> = {};
        let totalRevenue = 0;
        let totalInsuranceShare = 0;
        let totalPatientShare = 0;
        let totalDiscount = 0;
        let totalTax = 0;

        for (const charge of charges) {
             const cat = charge.billableItem.category;
             if (!revenueByCategory[cat]) revenueByCategory[cat] = 0;
             
             revenueByCategory[cat] += charge.totalAmount;
             
             totalRevenue += charge.totalAmount;
             totalInsuranceShare += charge.insuranceShare || 0;
             totalPatientShare += charge.patientShare !== null ? charge.patientShare : charge.totalAmount;
             totalDiscount += charge.discountAmount;
             totalTax += charge.taxAmount;
        }

        return NextResponse.json({
            period: { startDate, endDate },
            summary: {
                totalRevenue,
                totalInsuranceShare,
                totalPatientShare,
                totalDiscount,
                totalTax
            },
            revenueByCategory
        });

    } catch (error) {
        console.error("Failed to generate revenue report:", error);
        return NextResponse.json({ error: "Failed to generate revenue report" }, { status: 500 });
    }
}
