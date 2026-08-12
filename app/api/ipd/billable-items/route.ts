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
        const category = searchParams.get('category');
        const search = searchParams.get('search');
        const activeOnly = searchParams.get('activeOnly') !== 'false'; // Default to true

        const where: any = {
            ...(activeOnly ? { isActive: true } : {}),
            ...(category ? { category } : {}),
            ...(search ? {
                OR: [
                    { itemCode: { contains: search, mode: 'insensitive' } },
                    { itemName: { contains: search, mode: 'insensitive' } }
                ]
            } : {})
        };

        const items = await prisma.billableItem.findMany({
            where,
            include: {
                taxRate: true,
                revenueAccount: true,
            },
            orderBy: [
                { category: 'asc' },
                { itemName: 'asc' }
            ]
        });

        return NextResponse.json(items);
    } catch (error) {
        console.error("Failed to fetch billable items:", error);
        return NextResponse.json({ error: "Failed to fetch billable items" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        
        // Basic validation
        if (!body.itemCode || !body.itemName || !body.category || !body.frequency || !body.application || body.standardRate === undefined) {
             return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Check if itemCode exists
        const existing = await prisma.billableItem.findUnique({
            where: { itemCode: body.itemCode }
        });

        if (existing) {
             return NextResponse.json({ error: "Item Code already exists" }, { status: 400 });
        }

        const item = await prisma.billableItem.create({
            data: {
                itemCode: body.itemCode,
                itemName: body.itemName,
                description: body.description,
                category: body.category,
                subCategory: body.subCategory,
                frequency: body.frequency,
                application: body.application,
                defaultQuantity: body.defaultQuantity || 1,
                unitOfMeasure: body.unitOfMeasure,
                standardRate: body.standardRate,
                memberRate: body.memberRate,
                staffRate: body.staffRate,
                taxRateId: body.taxRateId,
                isTaxable: body.isTaxable !== false,
                revenueAccountId: body.revenueAccountId,
                autoApplyRules: body.autoApplyRules || null,
                isActive: body.isActive !== false,
                requiresAuth: body.requiresAuth || false,
                requiresApproval: body.requiresApproval || false,
            }
        });

        return NextResponse.json(item, { status: 201 });
    } catch (error) {
        console.error("Failed to create billable item:", error);
        return NextResponse.json({ error: "Failed to create billable item" }, { status: 500 });
    }
}
