import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const body = await req.json();
        const { isActive, name, description } = body;

        const updated = await prisma.labCategory.update({
            where: { id: params.id },
            data: {
                ...(isActive !== undefined && { isActive }),
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
            }
        });

        return NextResponse.json(updated, { status: 200 });
    } catch (error: any) {
        console.error("Update Lab Category Error:", error);
        return NextResponse.json({ error: "Failed to update lab category", details: error.message }, { status: 500 });
    }
}
