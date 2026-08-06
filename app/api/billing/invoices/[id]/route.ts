export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calculateInsurancePrice } from "@/lib/pricing-engine";
import { PricingEngine } from "@/lib/finance/pricing-engine";
import { ServiceType } from "@/lib/generated-prisma";
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const invoice = await prisma.invoice.findUnique({
            where: { id: params.id },
            include: {
                patient: true,
                items: true,
                payments: {
                    include: { receivedBy: { select: { name: true } } },
                    orderBy: { createdAt: "desc" }
                },
                issuedBy: { select: { name: true } },
                visit: true,
                claim: { include: { insurance: true } }
            }
        });

        if (!invoice) {
            return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        }

        // --- Auto-Split Logic ---
        if (!invoice.isInsurance && invoice.status === "Unpaid") {
            const isAlreadySplit = invoice.items.some(i => i.description.includes("(Copay/Non-covered)") || i.description.includes("(Cash/Non-covered)"));
            
            if (!isAlreadySplit) {
                const enrollment = await prisma.patientInsurance.findFirst({
                    where: { patientId: invoice.patientId, isActive: true },
                    include: { insurance: true }
                });

                if (enrollment) {
                // Determine splits
                const insuranceItems = [];
                const cashItems = [];
                let newInsuranceTotal = 0;
                let newCashTotal = 0;

                for (const item of invoice.items) {
                    let sType: ServiceType = "OTHER";
                    if (item.description.startsWith("Consult")) sType = "CONSULTATION";
                    else if (item.description.startsWith("Lab Test")) sType = "LAB_TEST";
                    else if (item.description.startsWith("Prescription") || item.description.startsWith("Dispensed")) sType = "PHARMACY";
                    
                    // Run through the new pricing engine
                    const pricingResult = await PricingEngine.calculateItemPrice(
                        invoice.patientId,
                        item.referenceId || null,
                        sType,
                        item.unitPrice // Standard rate
                    );

                    const finalTotalForQuantity = pricingResult.finalPrice * item.quantity;

                    // If an appliedRule exists, insurance covers it (at the agreed negotiated rate).
                    if (pricingResult.appliedRule !== null) {
                        insuranceItems.push({ 
                            description: item.description, 
                            quantity: item.quantity, 
                            unitPrice: pricingResult.finalPrice, 
                            totalPrice: finalTotalForQuantity,
                            itemType: item.itemType,
                            referenceId: item.referenceId
                        });
                        newInsuranceTotal += finalTotalForQuantity;
                    } else {
                        // Not covered by insurance rules -> cash
                        cashItems.push({
                            description: item.description + " (Not Covered by Insurance)",
                            quantity: item.quantity,
                            unitPrice: pricingResult.finalPrice,
                            totalPrice: finalTotalForQuantity,
                            itemType: item.itemType,
                            referenceId: item.referenceId
                        });
                        newCashTotal += finalTotalForQuantity;
                    }
                }

                // If mixed (has both insurance and cash), split it
                if (newInsuranceTotal > 0 && newCashTotal > 0) {
                    // 1. Update original invoice: becomes the Insurance Invoice
                    await prisma.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
                    
                    await prisma.invoice.update({
                        where: { id: invoice.id },
                        data: {
                            isInsurance: true,
                            totalAmount: newInsuranceTotal,
                            balanceDue: newInsuranceTotal,
                            items: {
                                create: insuranceItems.map(i => ({
                                    description: i.description,
                                    quantity: i.quantity,
                                    unitPrice: i.unitPrice,
                                    totalPrice: i.totalPrice,
                                    itemType: i.itemType,
                                    referenceId: i.referenceId
                                }))
                            }
                        }
                    });

                    // 2. Create entirely new Cash invoice (using tenant-configured format)
                    const today = new Date();
                    const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
                    const count = await prisma.invoice.count({
                        where: { createdAt: { gte: todayStart } }
                    });
                    const { generateInvoiceNumber } = await import("@/lib/formatters");
                    const newInvoiceNumber = await generateInvoiceNumber(count + 1, today);

                    await prisma.invoice.create({
                        data: {
                            invoiceNumber: newInvoiceNumber,
                            patientId: invoice.patientId,
                            visitId: invoice.visitId, // Allowed now because @unique is removed
                            isInsurance: false,
                            totalAmount: newCashTotal,
                            balanceDue: newCashTotal,
                            status: "Unpaid",
                            issuedById: invoice.issuedById,
                            items: {
                                create: cashItems
                            }
                        }
                    });

                    // Re-fetch updated invoice to return proper state
                    const updatedInvoice = await prisma.invoice.findUnique({
                        where: { id: invoice.id },
                        include: {
                            patient: true, items: true,
                            payments: { include: { receivedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
                            issuedBy: { select: { name: true } },
                            visit: true,
                            claim: { include: { insurance: true } }
                        }
                    });
                    return NextResponse.json(updatedInvoice);
                } else if (newInsuranceTotal > 0 && newCashTotal === 0) {
                    // Fully insurance - just mark it so
                    await prisma.invoice.update({
                        where: { id: invoice.id },
                        data: { isInsurance: true }
                    });
                    invoice.isInsurance = true;
                }
                }
            }
        }
        // --- End Auto-Split Logic ---

        return NextResponse.json(invoice);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
    }
}
