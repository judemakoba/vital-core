export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/admin/tenant/branches/[id]
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== "ADMIN" && (session.user as any).role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await request.json();
        const allowed = ["name", "address", "phone", "isActive"];
        const data: any = {};
        for (const k of allowed) {
            if (k in body) data[k] = body[k];
        }
        const branch = await prisma.branch.update({ where: { id: params.id }, data });
        return NextResponse.json(branch);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update branch" }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/tenant/branches/[id]
 * Disallow deleting the main branch.
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== "ADMIN" && (session.user as any).role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const branch = await prisma.branch.findUnique({ where: { id: params.id } });
        if (!branch) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (branch.isMain) {
            return NextResponse.json({ error: "Cannot delete the main branch" }, { status: 400 });
        }
        await prisma.branch.delete({ where: { id: params.id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete branch" }, { status: 500 });
    }
}
