export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function DELETE(
    request: Request,
    { params }: { params: { visitId: string, id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;

        if (!session || (user?.role !== "DOCTOR" && user?.role !== "SUPER_ADMIN" && user?.role !== "ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        return await prisma.$transaction(async (tx) => {
            // 1. Fetch Prescription
            const prescription = await tx.prescription.findUnique({
                where: { id: params.id },
                include: {
                    dispensingLogs: true
                }
            });

            if (!prescription) {
                return NextResponse.json({ error: "Prescription not found" }, { status: 404 });
            }

            // 2. Prevent cancellation if already dispensed
            if (prescription.status === "Dispensed" || prescription.dispensingLogs.length > 0) {
                return NextResponse.json({ 
                    error: "Cannot cancel a dispensed or partially dispensed prescription" 
                }, { status: 400 });
            }

            // 3. Remove from Legacy Invoice if applicable
            const invoiceItem = await tx.invoiceItem.findFirst({
                where: {
                    itemType: "Drug",
                    referenceId: prescription.id
                }
            });

            if (invoiceItem) {
                const amount = invoiceItem.totalPrice;
                const invoiceId = invoiceItem.invoiceId;

                await tx.invoiceItem.delete({
                    where: { id: invoiceItem.id }
                });

                await tx.invoice.update({
                    where: { id: invoiceId },
                    data: {
                        totalAmount: { decrement: amount },
                        balanceDue: { decrement: amount }
                    }
                });
            }

            // 4. Delete the Prescription
            await tx.prescription.delete({
                where: { id: params.id }
            });

            return NextResponse.json({ success: true });
        });
    } catch (error: any) {
        console.error("Failed to cancel prescription:", error);
        return NextResponse.json({ 
            error: "Failed to cancel prescription", 
            details: error.message 
        }, { status: 500 });
    }
}
