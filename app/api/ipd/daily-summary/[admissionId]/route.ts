import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
    request: Request,
    { params }: { params: { admissionId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const admissionId = params.admissionId;

        // Fetch finalized summaries
        const summaries = await prisma.dailyChargeSummary.findMany({
            where: { admissionId },
            orderBy: { chargeDate: 'desc' },
            include: {
                charges: {
                    include: {
                        billableItem: true
                    }
                },
                finalizedBy: {
                    select: { name: true }
                }
            }
        });

        // Also compile today's pending summary (unfinalized) by aggregating raw charges for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const unfinalizedCharges = await prisma.inpatientCharge.findMany({
            where: {
                admissionId,
                dailyChargeSummaryId: null, // Not yet linked to a finalized summary
            },
            include: {
                billableItem: true
            }
        });

        // Group unfinalized charges by date
        const pendingSummariesMap = new Map();
        
        for (const charge of unfinalizedCharges) {
             const dateStr = new Date(charge.chargeDate).toISOString().split('T')[0];
             if (!pendingSummariesMap.has(dateStr)) {
                 pendingSummariesMap.set(dateStr, {
                     chargeDate: new Date(charge.chargeDate),
                     roomId: "pending",
                     isFinalized: false,
                     roomBoardTotal: 0,
                     nursingTotal: 0,
                     medicalTotal: 0,
                     medicationTotal: 0,
                     procedureTotal: 0,
                     labTotal: 0,
                     radiologyTotal: 0,
                     sundryTotal: 0,
                     otherTotal: 0,
                     subtotal: 0,
                     taxTotal: 0,
                     grandTotal: 0,
                     insuranceTotal: 0,
                     patientTotal: 0,
                     charges: []
                 });
             }
             
             const summary = pendingSummariesMap.get(dateStr);
             summary.charges.push(charge);
             
             const cat = charge.billableItem.category;
             const amt = charge.totalAmount;
             
             if (cat === "ROOM_BOARD") summary.roomBoardTotal += amt;
             else if (cat === "NURSING_FEE") summary.nursingTotal += amt;
             else if (cat === "MEDICAL_FEE") summary.medicalTotal += amt;
             else if (cat === "MEDICATION") summary.medicationTotal += amt;
             else if (cat === "PROCEDURE") summary.procedureTotal += amt;
             else if (cat === "LABORATORY") summary.labTotal += amt;
             else if (cat === "RADIOLOGY") summary.radiologyTotal += amt;
             else if (cat === "SUNDRY") summary.sundryTotal += amt;
             else summary.otherTotal += amt;

             summary.subtotal += charge.quantity * charge.unitPrice - charge.discountAmount;
             summary.taxTotal += charge.taxAmount;
             summary.grandTotal += charge.totalAmount;
             summary.insuranceTotal += charge.insuranceShare || 0;
             summary.patientTotal += charge.patientShare || 0;
        }

        const pendingSummaries = Array.from(pendingSummariesMap.values());

        // Sort pending summaries descending by date
        pendingSummaries.sort((a, b) => b.chargeDate.getTime() - a.chargeDate.getTime());

        return NextResponse.json({
            finalized: summaries,
            pending: pendingSummaries
        });

    } catch (error) {
        console.error("Failed to fetch daily summaries:", error);
        return NextResponse.json({ error: "Failed to fetch daily summaries" }, { status: 500 });
    }
}
