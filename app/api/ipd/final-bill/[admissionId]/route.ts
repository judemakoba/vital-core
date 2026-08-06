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

        const admission = await prisma.admission.findUnique({
            where: { id: admissionId },
            include: {
                patient: true,
                ward: true,
                bed: true,
                charges: {
                    where: { isBilled: false }, // Only get unbilled charges
                    include: { billableItem: true }
                },
                deposits: {
                    where: { remainingBalance: { gt: 0 } } // Only get deposits with remaining balance
                }
            }
        });

        if (!admission) {
            return NextResponse.json({ error: "Admission not found" }, { status: 404 });
        }

        // Aggregate Charges by Category
        const categoryTotals: Record<string, number> = {};
        let subtotal = 0;
        let taxTotal = 0;
        let discountTotal = 0;
        let grandTotal = 0;
        let insuranceShareTotal = 0;
        let patientShareTotal = 0;

        for (const charge of admission.charges) {
             const cat = charge.billableItem.category;
             if (!categoryTotals[cat]) categoryTotals[cat] = 0;
             
             categoryTotals[cat] += charge.totalAmount;
             
             subtotal += (charge.quantity * charge.unitPrice);
             discountTotal += charge.discountAmount;
             taxTotal += charge.taxAmount;
             grandTotal += charge.totalAmount;
             insuranceShareTotal += charge.insuranceShare || 0;
             patientShareTotal += charge.patientShare || 0;
        }

        // Aggregate Deposits
        let totalDepositsAvailable = 0;
        for (const deposit of admission.deposits) {
             totalDepositsAvailable += deposit.remainingBalance;
        }

        const balanceDue = Math.max(0, patientShareTotal - totalDepositsAvailable);
        const refundDue = Math.max(0, totalDepositsAvailable - patientShareTotal);

        return NextResponse.json({
            admissionId: admission.id,
            patient: admission.patient,
            admissionDate: admission.admissionDate,
            dischargeDate: admission.dischargeDate || new Date(),
            ward: admission.ward?.name,
            bed: admission.bed?.bedNumber,
            unbilledChargesCount: admission.charges.length,
            categoryTotals,
            financials: {
                subtotal,
                discountTotal,
                taxTotal,
                grandTotal,
                insuranceShareTotal,
                patientShareTotal,
                totalDepositsAvailable,
                balanceDue,
                refundDue
            },
            unappliedDeposits: admission.deposits
        });

    } catch (error) {
        console.error("Failed to generate final bill:", error);
        return NextResponse.json({ error: "Failed to generate final bill" }, { status: 500 });
    }
}
