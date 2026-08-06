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

        // Fetch all finalised admissions in this period
        const admissions = await prisma.admission.findMany({
            where: {
                status: "DISCHARGED",
                dischargeDate: {
                    gte: startDate,
                    lte: endDate
                }
            },
            select: {
                admissionDate: true,
                dischargeDate: true,
                charges: {
                    select: {
                        totalAmount: true
                    }
                }
            }
        });

        if (admissions.length === 0) {
            return NextResponse.json({
                period: { startDate, endDate },
                metrics: {
                    totalDischarges: 0,
                    averageLengthOfStay: 0,
                    averageCostPerAdmission: 0,
                    averageCostPerDay: 0
                }
            });
        }

        let totalDays = 0;
        let totalCost = 0;

        for (const admission of admissions) {
             const adminDate = new Date(admission.admissionDate);
             const dischargeDate = new Date(admission.dischargeDate!);
             
             // Calculate length of stay (minimum 1 day)
             let los = Math.ceil((dischargeDate.getTime() - adminDate.getTime()) / (1000 * 60 * 60 * 24));
             if (los === 0) los = 1;
             
             totalDays += los;
             
             const admissionCost = admission.charges.reduce((sum, charge) => sum + charge.totalAmount, 0);
             totalCost += admissionCost;
        }

        const totalDischarges = admissions.length;
        const averageLengthOfStay = totalDays / totalDischarges;
        const averageCostPerAdmission = totalCost / totalDischarges;
        const averageCostPerDay = totalCost / totalDays;

        return NextResponse.json({
            period: { startDate, endDate },
            metrics: {
                totalDischarges,
                totalDays,
                totalCost,
                averageLengthOfStay: averageLengthOfStay.toFixed(1),
                averageCostPerAdmission: averageCostPerAdmission.toFixed(2),
                averageCostPerDay: averageCostPerDay.toFixed(2)
            }
        });

    } catch (error) {
        console.error("Failed to generate average cost report:", error);
        return NextResponse.json({ error: "Failed to generate average cost report" }, { status: 500 });
    }
}
