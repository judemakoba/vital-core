import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(
    request: Request,
    { params }: { params: { admissionId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const admissionId = params.admissionId;
        const body = await request.json();
        
        // Additional payment details if the deposit didn't cover everything
        const { additionalPaymentAmount, paymentMethod, notes } = body;

        const admission = await prisma.admission.findUnique({
            where: { id: admissionId },
            include: {
                patient: true,
                charges: {
                    where: { isBilled: false },
                    include: { billableItem: true }
                },
                deposits: {
                    where: { remainingBalance: { gt: 0 } },
                    orderBy: { depositDate: 'asc' } // Apply oldest deposits first
                }
            }
        });

        if (!admission) {
             return NextResponse.json({ error: "Admission not found" }, { status: 404 });
        }
        if (admission.charges.length === 0) {
             return NextResponse.json({ error: "No unbilled charges found for this admission" }, { status: 400 });
        }

        // 1. Calculate totals
        let subtotal = 0;
        let taxTotal = 0;
        let discountTotal = 0;
        let grandTotal = 0;
        let patientShareTotal = 0;

        for (const charge of admission.charges) {
             subtotal += (charge.quantity * charge.unitPrice);
             discountTotal += charge.discountAmount;
             taxTotal += charge.taxAmount;
             grandTotal += charge.totalAmount;
             patientShareTotal += charge.patientShare !== null ? charge.patientShare : charge.totalAmount;
        }

        // We only bill the patient share to the patient invoice.
        // but IPD sets the foundation.

        // Create the core Invoice (use tenant-configured format; add IPD tag for clarity)
        const { generateInvoiceNumber } = await import("@/lib/formatters");
        const sequence = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Prepare to apply deposits
        let amountToSettle = patientShareTotal;
        let totalDepositsApplied = 0;
        const depositApplications: { depositId: string; amountApplied: number; remainingBalanceAfter: number }[] = [];
        
        for (const deposit of admission.deposits) {
             if (amountToSettle <= 0) break;
             
             let amountToTake = Math.min(amountToSettle, deposit.remainingBalance);
             
             amountToSettle -= amountToTake;
             totalDepositsApplied += amountToTake;
             
             depositApplications.push({
                 depositId: deposit.id,
                 amountApplied: amountToTake,
                 remainingBalanceAfter: deposit.remainingBalance - amountToTake
             });
        }

        // Apply additional payment if provided
        const newPaymentAmount = additionalPaymentAmount ? parseFloat(additionalPaymentAmount) : 0;
        const totalPaid = totalDepositsApplied + newPaymentAmount;
        const balanceDue = Math.max(0, patientShareTotal - totalPaid);

        // TRANSACTION: Create invoice, items, payments, update deposits, mark charges billed, discharge patient
        const result = await prisma.$transaction(async (tx) => {
            // A. Create Invoice
            const invoice = await tx.invoice.create({
                data: {
                    invoiceNumber: await generateInvoiceNumber(parseInt(sequence) || 1, new Date()) + `-IPD`,
                    patientId: admission.patientId,
                    visitId: admission.visitId, // Optional, since it's an admission
                    totalAmount: patientShareTotal,
                    amountPaid: totalPaid,
                    balanceDue: balanceDue,
                    status: balanceDue <= 0 ? "PAID" : "UNPAID",
                    issuedById: session.user.id
                }
            });

            // B. Create Invoice Items
            for (const charge of admission.charges) {
                 await tx.invoiceItem.create({
                     data: {
                         invoiceId: invoice.id,
                         description: charge.billableItem.itemName,
                         quantity: charge.quantity,
                         unitPrice: charge.unitPrice,
                         totalPrice: charge.patientShare !== null ? charge.patientShare : charge.totalAmount,
                         itemType: charge.billableItem.category,
                         referenceId: charge.id
                     }
                 });

                 // Mark charge as billed
                 await tx.inpatientCharge.update({
                     where: { id: charge.id },
                     data: { isBilled: true, invoiceId: invoice.id }
                 });
            }

            // C. Apply Deposits
            for (const app of depositApplications) {
                 await tx.depositApplication.create({
                     data: {
                         depositId: app.depositId,
                         invoiceId: invoice.id,
                         amountApplied: app.amountApplied,
                         appliedById: session.user.id
                     }
                 });

                 await tx.inpatientDeposit.update({
                     where: { id: app.depositId },
                     data: {
                         remainingBalance: app.remainingBalanceAfter,
                         isFullyApplied: app.remainingBalanceAfter === 0
                     }
                 });
                 
                 // Create Payment record for the allocated deposit
                 await tx.payment.create({
                     data: {
                         invoiceId: invoice.id,
                         amount: app.amountApplied,
                         paymentMethod: "DEPOSIT_APPLICATION",
                         receivedById: session.user.id,
                         notes: `Applied from deposit`
                     }
                 });
            }

            // D. Add new payment if applicable
            if (newPaymentAmount > 0) {
                 await tx.payment.create({
                     data: {
                         invoiceId: invoice.id,
                         amount: newPaymentAmount,
                         paymentMethod: paymentMethod || "CASH",
                         receivedById: session.user.id,
                         notes: notes || "Final Settlement Payment"
                     }
                 });
            }

            // E. Discharge Patient (Update admission status)
            await tx.admission.update({
                where: { id: admissionId },
                data: {
                    status: "DISCHARGED",
                    dischargeDate: new Date()
                }
            });

            // F. Update Bed Status
            if (admission.bedId) {
                await tx.bed.update({
                    where: { id: admission.bedId },
                    data: { status: "CLEANING" }
                });
            }

            return invoice;
        });

        return NextResponse.json({
            success: true,
            invoice: result,
            message: "Final bill settled and patient discharged successfully."
        });

    } catch (error) {
        console.error("Failed to settle final bill:", error);
        return NextResponse.json({ error: "Failed to settle final bill" }, { status: 500 });
    }
}
