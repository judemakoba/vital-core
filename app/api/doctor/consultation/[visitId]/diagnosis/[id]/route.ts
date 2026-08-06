export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function DELETE(
    request: Request,
    { params }: { params: { visitId: string, id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;

        if (!session || (user?.role !== "DOCTOR" && user?.role !== "SUPER_ADMIN" && user?.role !== "ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await prisma.diagnosis.delete({
            where: { id: params.id }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Failed to remove diagnosis:", error);
        return NextResponse.json({ 
            error: "Failed to remove diagnosis", 
            details: error.message 
        }, { status: 500 });
    }
}
