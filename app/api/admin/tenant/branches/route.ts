export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/settings/store";

/**
 * GET /api/admin/tenant/branches
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const tenantId = await getDefaultTenantId();
        const branches = await prisma.branch.findMany({
            where: { tenantId },
            orderBy: [{ isMain: "desc" }, { name: "asc" }],
        });
        return NextResponse.json(branches);
    } catch (error) {
        return NextResponse.json({ error: "Failed to list branches" }, { status: 500 });
    }
}

/**
 * POST /api/admin/tenant/branches
 * Body: { name, code, address?, phone? }
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== "ADMIN" && (session.user as any).role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await request.json();
        if (!body.name || !body.code) {
            return NextResponse.json({ error: "name and code are required" }, { status: 400 });
        }
        const tenantId = await getDefaultTenantId();
        const branch = await prisma.branch.create({
            data: {
                tenantId,
                name: body.name,
                code: body.code,
                address: body.address || null,
                phone: body.phone || null,
                isMain: body.isMain === true,
            },
        });
        return NextResponse.json(branch, { status: 201 });
    } catch (error: any) {
        if (error.code === "P2002") {
            return NextResponse.json({ error: "Branch code already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to create branch" }, { status: 500 });
    }
}
