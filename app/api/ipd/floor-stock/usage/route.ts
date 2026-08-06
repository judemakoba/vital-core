import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { floorStockId, admissionId, quantityUsed, notes } = body;

        if (!floorStockId || !admissionId || !quantityUsed) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const floorStock = await prisma.floorStock.findUnique({
            where: { id: floorStockId },
            include: { drug: true }
        });

        if (!floorStock) {
            return NextResponse.json({ error: "Floor stock not found" }, { status: 404 });
        }

        if (floorStock.quantityOnHand < quantityUsed) {
             return NextResponse.json({ 
                 error: `Insufficient stock. Only ${floorStock.quantityOnHand} available.` 
             }, { status: 400 });
        }

        // We need a billable item for this drug to charge the patient
        // We look for a billable item with the same code or name linked to the drug,
        // or a generic "WARD_MEDICATION" billable item category.
        
        let billableItem = await prisma.billableItem.findFirst({
             where: { 
                 category: "MEDICATION",
                 itemName: { contains: floorStock.drug.name }
             }
        });

        // If not found, look for generic ward med 
        if (!billableItem) {
             billableItem = await prisma.billableItem.findFirst({
                 where: { itemCode: "WARD-MED-GENERIC" }
             });
             
             // If generic not found, we can't auto-charge, just create usage.
             // Or we could auto-create the billable item for the drug here.
             // For safety, let's just log usage without a charge if no item exists, 
             // but preferable to have the generic item.
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Deduct stock
            await tx.floorStock.update({
                where: { id: floorStockId },
                data: {
                    quantityOnHand: floorStock.quantityOnHand - quantityUsed
                }
            });

            // 2. Log usage
            const usage = await tx.floorStockUsage.create({
                data: {
                    floorStockId,
                    admissionId,
                    quantityUsed: parseInt(quantityUsed),
                    usedById: session.user.id,
                    notes
                }
            });

            // 3. Generate charge if billable item found
            if (billableItem) {
                const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
                const sequence = Math.floor(1000 + Math.random() * 9000).toString();
                const unitPrice = billableItem.standardRate || 0; // Or floorStock.drug.price 
                const totalAmount = quantityUsed * unitPrice;

                const charge = await tx.inpatientCharge.create({
                    data: {
                        chargeNumber: `CHG-MED-${dateStr}-${sequence}`,
                        admissionId,
                        billableItemId: billableItem.id,
                        chargeDate: new Date(),
                        quantity: parseFloat(quantityUsed),
                        unitPrice,
                        totalAmount,
                        patientShare: totalAmount, // Adjusted later if insurance
                        generationMethod: "TASK",
                        sourceId: usage.id, // Link charge to usage
                        createdById: session.user.id,
                        notes: `Floor stock usage: ${floorStock.drug.name}`
                    }
                });

                // Link back usage to charge
                await tx.floorStockUsage.update({
                    where: { id: usage.id },
                    data: { chargeId: charge.id }
                });
            }

            return usage;
        });

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error("Failed to record floor stock usage:", error);
        return NextResponse.json({ error: "Failed to record floor stock usage" }, { status: 500 });
    }
}
