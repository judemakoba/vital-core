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
        const { date, admissionId } = body;
        
        // Target date for billing run (default to today if not provided)
        const targetDate = date ? new Date(date) : new Date();
        targetDate.setHours(0, 0, 0, 0);

        // Get admissions to process
        const admissions = await prisma.admission.findMany({
            where: {
                status: "ADMITTED",
                ...(admissionId ? { id: admissionId } : {})
            },
            include: {
                ward: true,
                bed: true,
                patient: true
            }
        });

        let newChargesGenerated = 0;
        let errors = [];

        // Fetch auto-billable items (ROOM_BOARD, DAILY SUNDRIES, NURSING_FEE)
        const autoItems = await prisma.billableItem.findMany({
            where: {
                isActive: true,
                application: "AUTO",
                OR: [
                    { frequency: "DAILY" },
                    { category: "ROOM_BOARD" },
                    { category: "NURSING_FEE" },
                    { category: "SUNDRY" }
                ]
            }
        });

        for (const admission of admissions) {
            try {
                // Determine day of stay
                const admissionDate = new Date(admission.admissionDate);
                admissionDate.setHours(0, 0, 0, 0);
                const dayOfStay = Math.floor((targetDate.getTime() - admissionDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                if (dayOfStay < 1) continue; // Admission is in the future relative to targetDate

                // Check if a daily summary already exists for this date
                const existingSummary = await prisma.dailyChargeSummary.findFirst({
                    where: {
                        admissionId: admission.id,
                        chargeDate: targetDate
                    }
                });

                if (existingSummary && existingSummary.isFinalized) {
                    continue; // Skip if already finalized
                }

                const newChargesData = [];

                // 1. Room & Board Charge
                if (admission.ward && admission.bed) {
                    const roomItems = autoItems.filter(i => i.category === "ROOM_BOARD");
                    // Typically there's one primary room board item.
                    if (roomItems.length > 0) {
                        const rItem = roomItems[0];
                        
                        // Check if already charged today for this item
                        const charged = await prisma.inpatientCharge.findFirst({
                            where: {
                                admissionId: admission.id,
                                billableItemId: rItem.id,
                                chargeDate: targetDate,
                                generationMethod: "AUTO"
                            }
                        });

                        if (!charged) {
                            const rate = admission.bed.ratePerDay || rItem.standardRate;
                            newChargesData.push({
                                billableItemId: rItem.id,
                                chargeDate: targetDate,
                                quantity: 1,
                                unitPrice: rate,
                                totalAmount: rate,
                                generationMethod: "AUTO",
                                createdById: session.user.id,
                                notes: `Day ${dayOfStay} Room & Board (${admission.ward.name} - ${admission.bed.bedNumber})`
                            });
                        }
                    }
                }

                // 2. Daily Sundries
                const sundryItems = autoItems.filter(i => i.category === "SUNDRY" && i.frequency === "DAILY");
                for (const sItem of sundryItems) {
                     const charged = await prisma.inpatientCharge.findFirst({
                        where: {
                            admissionId: admission.id,
                            billableItemId: sItem.id,
                            chargeDate: targetDate,
                            generationMethod: "AUTO"
                        }
                    });

                    if (!charged) {
                        newChargesData.push({
                            billableItemId: sItem.id,
                            chargeDate: targetDate,
                            quantity: sItem.defaultQuantity,
                            unitPrice: sItem.standardRate,
                            totalAmount: sItem.standardRate * sItem.defaultQuantity,
                            generationMethod: "AUTO",
                            createdById: session.user.id,
                            notes: `Day ${dayOfStay} Daily Sundry`
                        });
                    }
                }

                // Create Charges
                for(const chargeData of newChargesData) {
                    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
                    const sequence = Math.floor(1000 + Math.random() * 9000).toString();
                    
                    await prisma.inpatientCharge.create({
                        data: {
                            ...chargeData,
                            admissionId: admission.id,
                            chargeNumber: `CHG-AUTO-${dateStr}-${sequence}`,
                            patientShare: chargeData.totalAmount, // Adjust for insurance logic later
                            taxAmount: 0,
                            discountAmount: 0,
                            insuranceShare: 0
                        }
                    });
                    newChargesGenerated++;
                }

            } catch (err: any) {
                errors.push({ admissionId: admission.id, error: err.message });
            }
        }

        return NextResponse.json({
            success: true,
            message: `Daily billing run complete. Generated ${newChargesGenerated} new auto-charges.`,
            newChargesGenerated,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error("Failed daily billing run:", error);
        return NextResponse.json({ error: "Failed daily billing run" }, { status: 500 });
    }
}
