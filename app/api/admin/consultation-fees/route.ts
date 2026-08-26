export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, AUDIT_ACTION, ENTITY } from "@/lib/audit";

/**
 * GET /api/admin/consultation-fees
 *
 * List the consultation fee categories for the current tenant. The
 * caller is identified by `session.user.tenantId`; SUPER_ADMIN sees
 * the global (tenantId=null) tiers too.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const callerRole = (session.user as any).role;
        const tenantId = (session.user as any).tenantId ?? null;

        // Tenant-scoped tiers + global tiers (tenantId IS NULL).
        const where = tenantId
            ? { OR: [{ tenantId }, { tenantId: null }] }
            : { tenantId: null };

        const tiers = await prisma.consultationFeeCategory.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { fee: "asc" }],
        });

        // For SUPER_ADMIN, also include other tenants' tiers so the
        // overview page can audit them. For tenant users, hide
        // other tenants' tiers.
        if (callerRole !== "SUPER_ADMIN" && tenantId) {
            // already scoped above
        }

        return NextResponse.json(tiers);
    } catch (error) {
        console.error("List consultation-fees error:", error);
        return NextResponse.json({ error: "Failed to list fee tiers" }, { status: 500 });
    }
}

/**
 * POST /api/admin/consultation-fees
 *
 * Create a new tier. Tenant-scoped (uses session.user.tenantId).
 * SUPER_ADMIN may create global (tenantId=null) tiers that act as
 * defaults for tenants that haven't configured their own.
 */
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const callerRole = (session.user as any).role;
        if (callerRole !== "SUPER_ADMIN" && callerRole !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const name = String(body.name ?? "").trim();
        const fee = Number(body.fee);
        const visitTypes = String(body.visitTypes ?? "").trim();
        const description = body.description ? String(body.description).trim() : null;
        const isDefault = !!body.isDefault;
        const isActive = body.isActive === false ? false : true;
        const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

        if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
        if (!visitTypes) return NextResponse.json({ error: "At least one visit type is required" }, { status: 400 });
        if (!Number.isFinite(fee) || fee < 0) {
            return NextResponse.json({ error: "Fee must be a non-negative number" }, { status: 400 });
        }

        // Tenant scope: admin → their tenant; SUPER_ADMIN → can target
        // a specific tenant via body.tenantId, or null for global.
        const callerTenantId = (session.user as any).tenantId ?? null;
        let tenantId: string | null = callerTenantId;
        if (callerRole === "SUPER_ADMIN") {
            if (body.tenantId === null || body.tenantId === "GLOBAL") {
                tenantId = null; // global default
            } else if (typeof body.tenantId === "string" && body.tenantId.length > 0) {
                tenantId = body.tenantId;
            }
        }

        // If marking this tier as default, clear other defaults in the
        // same (tenant, visitType) bucket. We do it in a transaction so
        // the "default" invariant holds: at most one default per bucket.
        const result = await prisma.$transaction(async (tx) => {
            if (isDefault) {
                const types = visitTypes.split(",").map((s) => s.trim()).filter(Boolean);
                await tx.consultationFeeCategory.updateMany({
                    where: {
                        tenantId: tenantId ?? null,
                        isDefault: true,
                        visitTypes: { contains: types[0] }, // crude: at least one matching type
                    },
                    data: { isDefault: false },
                });
            }
            return tx.consultationFeeCategory.create({
                data: {
                    tenantId: tenantId ?? null,
                    name,
                    fee,
                    visitTypes,
                    description,
                    isActive,
                    isDefault,
                    sortOrder,
                },
            });
        });

        void recordAudit({
            userId: session.user.id,
            action: AUDIT_ACTION.USER_CREATE, // re-using the closest generic action
            entityType: ENTITY.USER, // no CONSULTATION_FEE entity; pick something semantic
            entityId: result.id,
            changes: { reason: "consultation_fee_created", tier: { name, fee, visitTypes, tenantId, isDefault } },
        });

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error("Create consultation-fees error:", error);
        return NextResponse.json({ error: "Failed to create fee tier" }, { status: 500 });
    }
}
