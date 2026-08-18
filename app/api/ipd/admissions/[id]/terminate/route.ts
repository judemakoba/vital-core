export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * POST /api/ipd/admissions/[id]/terminate
 *
 * R63: admin-override termination of an active admission. Use case:
 * "this admission was created in error" / "patient left against
 * medical advice" / "patient transferred to another hospital".
 *
 * What it does:
 *   1. Marks admission.status = "CANCELLED"
 *   2. Sets dischargeDate = now, cancelledAt = now
 *   3. Records cancelledById (the admin) and cancellationReason (required)
 *   4. Releases the bed (status -> CLEANING, so housekeeping picks it up)
 *   5. Does NOT touch the Visit. The doctor can decide whether to
 *      re-admit (via a fresh IpdRequest) or treat as OPD.
 *   6. Does NOT settle any bills. Charges / deposits stay as-is so
 *      finance can handle them. Use the normal discharge workflow
 *      (via /api/ipd/final-bill/[id]/settle) if you want bill settlement.
 *
 * Distinct from the existing discharge path (final-bill/settle) which
 * is the "patient finished treatment and left happy" flow.
 */
const ADMIN_ROLES = ["ADMIN", "RECEPTIONIST", "SUPER_ADMIN"];

export async function POST(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!ADMIN_ROLES.includes(user.role)) {
            return NextResponse.json(
                { error: `Only admin / reception / super_admin can terminate admissions (your role: ${user.role}).` },
                { status: 403 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const reason = (body.reason || "").trim();
        if (!reason || reason.length < 5) {
            return NextResponse.json(
                { error: "A reason (>= 5 chars) is required when terminating an admission. Recorded for the audit log." },
                { status: 400 }
            );
        }

        const admission = await prisma.admission.findUnique({
            where: { id: params.id },
            select: { id: true, status: true, bedId: true, visitId: true },
        });
        if (!admission) {
            return NextResponse.json({ error: "Admission not found" }, { status: 404 });
        }
        if (admission.status !== "ADMITTED") {
            return NextResponse.json(
                { error: `Cannot terminate — admission is already ${admission.status}.` },
                { status: 409 }
            );
        }

        const now = new Date();
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.admission.update({
                where: { id: params.id },
                data: {
                    status: "CANCELLED",
                    dischargeDate: now,
                    cancelledAt: now,
                    cancelledById: user.id,
                    cancellationReason: reason,
                },
                include: {
                    patient: true,
                    ward: true,
                    bed: true,
                    admittingDoctor: { select: { id: true, name: true, email: true } },
                    cancelledBy: { select: { id: true, name: true, email: true } },
                },
            });

            // Release the bed (CLEANING -> housekeeping can mark it ready later)
            if (admission.bedId) {
                await tx.bed.update({ where: { id: admission.bedId }, data: { status: "CLEANING" } });
            }

            return updated;
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error("Failed to terminate admission:", error);
        return NextResponse.json({ error: "Failed to terminate admission" }, { status: 500 });
    }
}
