export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTenant, updateTenant } from "@/lib/settings/store";

/**
 * GET /api/admin/tenant
 * Returns the singleton Tenant row (clinic identity).
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const tenant = await getTenant();
        return NextResponse.json(tenant || {});
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch tenant" }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/tenant
 * Body: partial Tenant fields. Whitelisted.
 */
export async function PATCH(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== "ADMIN" && (session.user as any).role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await request.json();
        const updated = await updateTenant(body);
        if (!updated) {
            return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
        }
        return NextResponse.json({ success: true, tenant: updated });
    } catch (error) {
        console.error("Tenant PATCH error:", error);
        return NextResponse.json({ error: "Failed to update tenant" }, { status: 500 });
    }
}
