export const dynamic = "force-dynamic";
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
        const user = (session as any)?.user;
        if (!session || (user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { name, categoryId, description, price, referenceRange, unit, template, isActive } = body;

        const updatedTest = await prisma.labTestCatalog.update({
            where: { id: params.id },
            data: {
                name,
                categoryId,
                description,
                price: parseFloat(price) || 0.0,
                referenceRange,
                unit,
                template,
                isActive: isActive !== undefined ? isActive : true
            }
        });

        return NextResponse.json(updatedTest);
    } catch (error) {
        console.error("Failed to update lab test:", error);
        return NextResponse.json({ error: "Failed to update lab test" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || (user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await prisma.labTestCatalog.delete({
            where: { id: params.id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete lab test:", error);
        return NextResponse.json({ error: "Failed to delete lab test" }, { status: 500 });
    }
}
