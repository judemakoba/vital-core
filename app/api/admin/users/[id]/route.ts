export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, AUDIT_ACTION, ENTITY } from "@/lib/audit";

/**
 * DELETE /api/admin/users/[id]
 *
 * Soft-delete: flip isActive=false rather than removing the row. The User
 * model has 30+ operational relations (visits, prescriptions, lab orders,
 * payments, admissions, ...); a hard delete would FK-cascade-fail and would
 * destroy the audit trail for a hospital system. Soft delete keeps the
 * record for forensic / reporting reasons while immediately removing
 * login access (auth.ts gates on isActive) and hiding the user from
 * future dropdowns.
 *
 * Guards:
 *   - Caller must be SUPER_ADMIN or ADMIN.
 *   - Caller cannot deactivate themselves.
 *   - Cannot deactivate the last active SUPER_ADMIN (would lock the
 *     tenant out of admin).
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

        const targetId = params.id;

        // Self-protection: an admin shouldn't lock themselves out by
        // accident.
        if (targetId === session.user.id) {
            return NextResponse.json(
                { error: "You cannot deactivate your own account." },
                { status: 400 }
            );
        }

        const target = await prisma.user.findUnique({
            where: { id: targetId },
            include: { role: true },
        });
        if (!target) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Last-SUPER_ADMIN guard: if the target is a SUPER_ADMIN, make
        // sure at least one other active SUPER_ADMIN will remain.
        if (target.role?.name === "SUPER_ADMIN" && target.isActive) {
            const remaining = await prisma.user.count({
                where: {
                    id: { not: targetId },
                    isActive: true,
                    role: { name: "SUPER_ADMIN" },
                },
            });
            if (remaining === 0) {
                return NextResponse.json(
                    { error: "Cannot deactivate the last active SUPER_ADMIN." },
                    { status: 400 }
                );
            }
        }

        await prisma.user.update({
            where: { id: targetId },
            data: { isActive: false },
        });

        // Audit — fire-and-forget.
        void recordAudit({
            userId: session.user.id,
            action: AUDIT_ACTION.USER_UPDATE,
            entityType: ENTITY.USER,
            entityId: targetId,
            changes: {
                before: { isActive: true },
                after: { isActive: false },
                reason: "user_deactivated",
                targetEmail: target.email,
            },
        });

        return NextResponse.json({ success: true, id: targetId, isActive: false });
    } catch (error: any) {
        console.error("Deactivate user error:", error);
        return NextResponse.json(
            { error: "Failed to deactivate user", details: error.message },
            { status: 500 }
        );
    }
}
