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
        const admissionId = searchParams.get('admissionId');

        if (!admissionId) {
            return NextResponse.json({ error: "admissionId is required" }, { status: 400 });
        }

        const charges = await prisma.inpatientCharge.findMany({
            where: { admissionId },
            include: {
                billableItem: true,
                nurse: { select: { name: true } },
                createdBy: { select: { name: true } },
                invoice: { select: { invoiceNumber: true } }
            },
            orderBy: { chargeDate: 'desc' }
        });

        return NextResponse.json(charges);
    } catch (error) {
        console.error("Failed to fetch charges:", error);
        return NextResponse.json({ error: "Failed to fetch charges" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { 
            admissionId, 
            billableItemId, 
            chargeDate, 
            quantity, 
            unitPrice, 
            discountAmount = 0,
            taxAmount = 0,
            notes,
            nurseId,
            sourceId 
        } = body;

        if (!admissionId || !billableItemId || !chargeDate || !quantity || unitPrice === undefined) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Generate unique charge number
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const chargeCount = await prisma.inpatientCharge.count({
            where: {
                createdAt: {
                    gte: new Date(new Date().setHours(0, 0, 0, 0)),
                }
            }
        });
        const sequence = (chargeCount + 1).toString().padStart(4, '0');
        const chargeNumber = `CHG-${dateStr}-${sequence}`;

        // Calculate insurance share (simplified logic, should be improved based on requirements)
        // Usually, the UI calculates this and sends it, or we calculate it here based on active insurance.
        const totalAmount = (quantity * unitPrice) - discountAmount + taxAmount;
        let insuranceShare = 0;
        let patientShare = totalAmount;
        
        const admission = await prisma.admission.findUnique({
             where: { id: admissionId },
             include: { patient: { include: { insurance: true } } }
        });

        if (admission?.patient?.hasInsurance) {
             insuranceShare = body.insuranceShare || 0;
             patientShare = body.patientShare !== undefined ? body.patientShare : totalAmount - insuranceShare;
        }

        const charge = await prisma.inpatientCharge.create({
            data: {
                chargeNumber,
                admissionId,
                billableItemId,
                chargeDate: new Date(chargeDate),
                quantity: parseFloat(quantity),
                unitPrice: parseFloat(unitPrice),
                discountAmount: parseFloat(discountAmount),
                taxAmount: parseFloat(taxAmount),
                totalAmount,
                
                generationMethod: "MANUAL",
                sourceId,
                
                nurseId,
                notes,
                insuranceShare,
                patientShare,
                
                createdById: session.user.id
            },
            include: {
                billableItem: true
            }
        });

        return NextResponse.json(charge, { status: 201 });
    } catch (error) {
        console.error("Failed to create manual charge:", error);
        return NextResponse.json({ error: "Failed to create manual charge" }, { status: 500 });
    }
}
