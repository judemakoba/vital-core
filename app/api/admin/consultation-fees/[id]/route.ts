export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, AUDIT_ACTION, ENTITY } from "@/lib/audit";

/**
 * PATCH /api/admin/consultation-fees/[id]
 *
 * Update a tier. Whitelisted fields: name, fee, visitTypes, description,
 * isActive, isDefault, sortOrder. Caller must be the tier's tenant
 * admin or SUPER_ADMIN.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const callerRole = (session.user as any).role;
        if (callerRole !== "SUPER_ADMIN" && callerRole !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const id = params.id;
        const existing = await prisma.consultationFeeCategory.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        // Tenant-scope check
        const callerTenantId = (session.user as any).tenantId ?? null;
        if (
            callerRole !== "SUPER_ADMIN" &&
            existing.tenantId &&
            existing.tenantId !== callerTenantId
        ) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const data: Record<string, unknown> = {};
        if ("name" in body) {
            const v = String(body.name ?? "").trim();
            if (!v) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
            data.name = v;
        }
        if ("fee" in body) {
            const v = Number(body.fee);
            if (!Number.isFinite(v) || v < 0) {
                return NextResponse.json({ error: "Fee must be a non-negative number" }, { status: 400 });
            }
            data.fee = v;
        }
        if ("visitTypes" in body) {
            const v = String(body.visitTypes ?? "").trim();
            if (!v) return NextResponse.json({ error: "visitTypes cannot be empty" }, { status: 400 });
            data.visitTypes = v;
        }
        if ("description" in body) {
            data.description = body.description ? String(body.description).trim() : null;
        }
        if ("isActive" in body) data.isActive = !!body.isActive;
        if ("isDefault" in body) data.isDefault = !!body.isDefault;
        if ("sortOrder" in body) {
            const v = Number(body.sortOrder);
            if (Number.isFinite(v)) data.sortOrder = v;
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
        }

        // If isDefault is being set true, clear others in the same bucket
        const updated = await prisma.$transaction(async (tx) => {
            if (data.isDefault === true) {
                const types = (data.visitTypes as string ?? existing.visitTypes)
                    .split(",").map((s) => s.trim()).filter(Boolean);
                await tx.consultationFeeCategory.updateMany({
                    where: {
                        id: { not: id },
                        tenantId: existing.tenantId ?? null,
                        isDefault: true,
                        visitTypes: { contains: types[0] },
                    },
                    data: { isDefault: false },
                });
            }
            return tx.consultationFeeCategory.update({ where: { id }, data });
        });

        void recordAudit({
            userId: session.user.id,
            action: AUDIT_ACTION.USER_UPDATE,
            entityType: ENTITY.USER,
            entityId: id,
            changes: { reason: "consultation_fee_updated", before: before(existing), after: data },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Update consultation-fees error:", error);
        return NextResponse.json({ error: "Failed to update fee tier" }, { status: 500 });
    }
}

/**
 * DELETE /api/admin/consultation-fees/[id]
 *
 * Hard-delete the tier. Soft-delete via isActive=false is preferred if
 * the tier has ever been applied to a visit (audit-trail integrity),
 * so we expose both — DELETE here is the hard one, used by admin "remove
 * unused tier" actions. PATCH with isActive=false is the safer path
 * for tiers with history.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const callerRole = (session.user as any).role;
        if (callerRole !== "SUPER_ADMIN" && callerRole !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const id = params.id;
        const existing = await prisma.consultationFeeCategory.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const callerTenantId = (session.user as any).tenantId ?? null;
        if (
            callerRole !== "SUPER_ADMIN" &&
            existing.tenantId &&
            existing.tenantId !== callerTenantId
        ) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await prisma.consultationFeeCategory.delete({ where: { id } });

        void recordAudit({
            userId: session.user.id,
            action: AUDIT_ACTION.USER_UPDATE,
            entityType: ENTITY.USER,
            entityId: id,
            changes: { reason: "consultation_fee_deleted", tier: { name: existing.name, fee: existing.fee, visitTypes: existing.visitTypes } },
        });

        return NextResponse.json({ success: true, id });
    } catch (error) {
        console.error("Delete consultation-fees error:", error);
        return NextResponse.json({ error: "Failed to delete fee tier" }, { status: 500 });
    }
}

function before(t: any) {
    const { id, createdAt, updatedAt, tenantId, ...rest } = t;
    return rest;
}
