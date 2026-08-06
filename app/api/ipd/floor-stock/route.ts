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
        const wardId = searchParams.get('wardId');

        const floorStocks = await prisma.floorStock.findMany({
            where: {
                isActive: true,
                ...(wardId ? { wardId } : {})
            },
            include: {
                ward: { select: { name: true } },
                drug: true
            },
            orderBy: { drug: { name: 'asc' } }
        });

        return NextResponse.json(floorStocks);
    } catch (error) {
        console.error("Failed to fetch floor stock:", error);
        return NextResponse.json({ error: "Failed to fetch floor stock" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { wardId, drugId, quantityOnHand, reorderLevel, maxStock, batchNumber } = body;

        if (!wardId || !drugId || quantityOnHand === undefined) {
             return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Check if already exists
        const existing = await prisma.floorStock.findFirst({
            where: { wardId, drugId, batchNumber }
        });

        if (existing) {
             // Update existing
             const updated = await prisma.floorStock.update({
                 where: { id: existing.id },
                 data: {
                     quantityOnHand: existing.quantityOnHand + parseInt(quantityOnHand),
                     reorderLevel: reorderLevel ? parseInt(reorderLevel) : undefined,
                     maxStock: maxStock ? parseInt(maxStock) : undefined
                 }
             });
             return NextResponse.json(updated);
        }

        const newStock = await prisma.floorStock.create({
            data: {
                wardId,
                drugId,
                batchNumber,
                quantityOnHand: parseInt(quantityOnHand),
                reorderLevel: parseInt(reorderLevel) || 10,
                maxStock: parseInt(maxStock) || 100
            }
        });

        return NextResponse.json(newStock, { status: 201 });
    } catch (error) {
        console.error("Failed to create floor stock:", error);
        return NextResponse.json({ error: "Failed to create floor stock" }, { status: 500 });
    }
}
