import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params;
        const body = await req.json();
        const { isActive, name, categoryId, price, referenceRange, unit, description } = body;

        // Extract explicit fields to avoid Prisma relation validation issues
        const updatedTest = await prisma.labTestCatalog.update({
            where: { id },
            data: {
                ...(isActive !== undefined && { isActive }),
                ...(name !== undefined && { name }),
                ...(categoryId !== undefined && { categoryId }),
                ...(price !== undefined && { price: parseFloat(price) }),
                ...(referenceRange !== undefined && { referenceRange }),
                ...(unit !== undefined && { unit }),
                ...(description !== undefined && { description }),
            }
        });

        return NextResponse.json(updatedTest, { status: 200 });
    } catch (error: any) {
        console.error("Update Lab Test Error:", error);
        return NextResponse.json({ error: "Failed to update lab test", details: error.message }, { status: 500 });
    }
}
