import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const id = params.id;
        const body = await request.json();

        // Prevent modification of itemCode typically, or handle with care
        const updatedItem = await prisma.billableItem.update({
            where: { id },
            data: {
                itemName: body.itemName,
                description: body.description,
                category: body.category,
                subCategory: body.subCategory,
                frequency: body.frequency,
                application: body.application,
                defaultQuantity: body.defaultQuantity,
                unitOfMeasure: body.unitOfMeasure,
                standardRate: body.standardRate,
                memberRate: body.memberRate,
                staffRate: body.staffRate,
                taxRateId: body.taxRateId,
                isTaxable: body.isTaxable,
                revenueAccountId: body.revenueAccountId,
                autoApplyRules: body.autoApplyRules,
                isActive: body.isActive,
                requiresAuth: body.requiresAuth,
                requiresApproval: body.requiresApproval,
            }
        });

        return NextResponse.json(updatedItem);
    } catch (error) {
        console.error("Failed to update billable item:", error);
        return NextResponse.json({ error: "Failed to update billable item" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const id = params.id;
        
        // Instead of hard delete, we often soft delete or just make inactive
        // Check if item has been used in charges
        const usageCount = await prisma.inpatientCharge.count({
            where: { billableItemId: id }
        });

        if (usageCount > 0) {
             // Soft delete
             const deactivated = await prisma.billableItem.update({
                 where: { id },
                 data: { isActive: false }
             });
             return NextResponse.json({ message: "Item deactivated as it has existing charges.", item: deactivated });
        }

        const deleted = await prisma.billableItem.delete({
             where: { id }
        });
        
        return NextResponse.json({ message: "Item deleted successfully.", item: deleted });

    } catch (error) {
        console.error("Failed to delete billable item:", error);
        return NextResponse.json({ error: "Failed to delete billable item" }, { status: 500 });
    }
}
