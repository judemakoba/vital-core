import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params;

        // Check if there are any drugs using this category
        const associatedDrugs = await prisma.drug.findFirst({
            where: { categoryId: id }
        });

        if (associatedDrugs) {
            return NextResponse.json({ 
                error: "Cannot deactivate category. It is currently assigned to one or more drugs." 
            }, { status: 400 });
        }

        // Instead of hard delete, we'll set isActive = false
        const updatedCategory = await prisma.drugCategory.update({
            where: { id },
            data: { isActive: false }
        });

        return NextResponse.json({ message: "Category deactivated successfully", category: updatedCategory }, { status: 200 });
    } catch (error: any) {
        console.error("Deactivate Category Error:", error);
        return NextResponse.json({ error: "Failed to deactivate category", details: error.message }, { status: 500 });
    }
}
