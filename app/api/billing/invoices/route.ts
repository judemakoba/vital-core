export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BillingValidationService } from "@/lib/finance/billing-validation-service";
import { PricingEngine } from "@/lib/finance/pricing-engine";
import { ServiceType } from "@/lib/generated-prisma";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status") || "all";
        const patientId = searchParams.get("patientId");
        const visitId = searchParams.get("visitId");

        const invoices = await prisma.invoice.findMany({
            where: {
                AND: [
                    status !== "all" ? { status } : {},
                    patientId ? { patientId } : {},
                    visitId ? { visitId } : {},
                ]
            },
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                issuedBy: { select: { name: true } },
                items: true
            },
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json(invoices);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { patientId, visitId, items, dueDate } = body;

        if (!patientId || !items || items.length === 0) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Validate the invoice data before processing
        const validationResult = await BillingValidationService.validateInvoice({
            patientId,
            visitId: visitId ?? null,
            items,
            dueDate: dueDate ?? null
        });

        // If there are validation errors, return them
        if (!validationResult.isValid) {
            return NextResponse.json({
                error: "Invoice validation failed",
                validation: validationResult
            }, { status: 400 });
        }

        // Generate unique invoice number using tenant-configured format
        const today = new Date();
        const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
        const count = await prisma.invoice.count({
            where: { createdAt: { gte: todayStart } }
        });
        const { generateInvoiceNumber } = await import("@/lib/formatters");
        const invoiceNumber = await generateInvoiceNumber(count + 1, today);

        // Transform incoming items by running them through the Pricing Engine
        const processedItems = await Promise.all(items.map(async (item: any) => {
            // Determine ServiceType dynamically based on existing itemType string or map it
            // Assuming item.itemType matches ServiceType or we cast it
            const serviceType = item.itemType as ServiceType;

            const pricingResult = await PricingEngine.calculateItemPrice(
                patientId,
                item.referenceId || null,
                serviceType || null,
                item.unitPrice // Act as standard rate fallback
            );

            const finalUnitPrice = pricingResult.finalPrice;

            return {
                description: item.description,
                quantity: item.quantity,
                unitPrice: finalUnitPrice,
                totalPrice: finalUnitPrice * item.quantity,
                itemType: item.itemType,
                referenceId: item.referenceId
            };
        }));

        const totalAmount = processedItems.reduce((sum: number, item: any) => sum + item.totalPrice, 0);

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber,
                patientId,
                visitId,
                totalAmount,
                balanceDue: totalAmount,
                status: "Unpaid",
                dueDate: dueDate ? new Date(dueDate) : null,
                issuedById: session.user.id,
                items: {
                    create: processedItems
                }
            }
        });

        // Optionally, perform post-creation validation
        const postValidation = await BillingValidationService.validateCreatedInvoice(invoice.id);
        if (!postValidation.isValid) {
            // Log validation issues but don't fail the creation
            console.warn('Post-creation invoice validation issues:', postValidation);
        }

        // Automatically post to ledger (DR AR, CR Revenue)
        try {
            await AccountingService.postInvoiceToLedger(invoice.id, session.user.id);
        } catch (ledgerError) {
            console.error('Failed to post invoice to ledger:', ledgerError);
            // Don't fail invoice creation if ledger post fails — admin can backfill later
        }

        return NextResponse.json(invoice, { status: 201 });
    } catch (error) {
        console.error("Invoice creation error:", error);
        return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
    }
}