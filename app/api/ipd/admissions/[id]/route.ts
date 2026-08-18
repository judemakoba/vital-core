import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * R63: per-admission management endpoints.
 *   GET    /api/ipd/admissions/[id]      detail (existing)
 *   PATCH  /api/ipd/admissions/[id]      modify (extend: ward / bed / type / notes)
 *   DELETE /api/ipd/admissions/[id]      hard-delete (admin only, with reason)
 *
 * The PATCH was already partially implemented for bed transfers; this
 * version adds support for ward changes, type changes, and notes
 * (a new optional field on Admission).
 *
 * DELETE is for records that were created in error (admin override).
 * The cascade rules on the schema are: charges, deposits, daily summaries,
 * floor stock usages are CASCADE-delete. IpdRequest back-relation is RESTRICT
 * (default) so we explicitly null it out before deleting the admission.
 */
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const admission = await prisma.admission.findUnique({
            where: { id: params.id },
            include: {
                patient: true,
                ward: true,
                bed: true,
                admittingDoctor: { select: { id: true, name: true, email: true } },
                cancelledBy: { select: { id: true, name: true, email: true } },
            }
        });

        if (!admission) {
            return NextResponse.json({ error: "Admission not found" }, { status: 404 });
        }

        return NextResponse.json(admission);
    } catch (error) {
        console.error("Failed to fetch admission:", error);
        return NextResponse.json({ error: "Failed to fetch admission" }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!ADMIN_ROLES.includes(user.role)) {
            return NextResponse.json(
                { error: `Only admin / super_admin can modify admissions (your role: ${user.role}).` },
                { status: 403 }
            );
        }

        const admissionId = params.id;
        const body = await request.json();
        const { bedId, wardId, type, notes, status, dischargeDate } = body;

        const current = await prisma.admission.findUnique({
            where: { id: admissionId },
            select: { bedId: true, wardId: true, status: true },
        });
        if (!current) {
            return NextResponse.json({ error: "Admission not found" }, { status: 404 });
        }
        if (current.status !== "ADMITTED") {
            return NextResponse.json(
                { error: `Cannot modify a ${current.status} admission. Use the appropriate action (terminate, etc.).` },
                { status: 409 }
            );
        }

        // Ward change: validate the new ward exists
        if (wardId !== undefined && wardId !== current.wardId) {
            const ward = await prisma.ward.findUnique({ where: { id: wardId } });
            if (!ward) {
                return NextResponse.json({ error: `Ward ${wardId} not found` }, { status: 400 });
            }
        }
        // Bed change: validate the new bed is available, in the same ward
        if (bedId !== undefined && bedId !== null && bedId !== current.bedId) {
            const bed = await prisma.bed.findUnique({ where: { id: bedId } });
            if (!bed) {
                return NextResponse.json({ error: `Bed ${bedId} not found` }, { status: 400 });
            }
            if (bed.status !== "AVAILABLE") {
                return NextResponse.json(
                    { error: `Bed ${bed.bedNumber} is not available (status: ${bed.status})` },
                    { status: 409 }
                );
            }
            if (wardId && bed.wardId !== wardId) {
                return NextResponse.json(
                    { error: `Bed ${bed.bedNumber} belongs to a different ward than the one specified.` },
                    { status: 400 }
                );
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            // Bed transfer
            if (bedId !== undefined && bedId !== current.bedId) {
                if (current.bedId) {
                    await tx.bed.update({ where: { id: current.bedId }, data: { status: "CLEANING" } });
                }
                if (bedId) {
                    await tx.bed.update({ where: { id: bedId }, data: { status: "OCCUPIED" } });
                }
            }

            // Build the update payload
            const updateData: any = {};
            if (bedId !== undefined) updateData.bedId = bedId;
            if (wardId !== undefined) updateData.wardId = wardId;
            if (type !== undefined) updateData.type = type;
            if (notes !== undefined) updateData.notes = notes;
            if (status !== undefined) updateData.status = status;
            if (dischargeDate !== undefined) updateData.dischargeDate = dischargeDate ? new Date(dischargeDate) : null;

            return tx.admission.update({
                where: { id: admissionId },
                data: updateData,
                include: {
                    patient: true,
                    ward: true,
                    bed: true,
                    admittingDoctor: { select: { id: true, name: true, email: true } },
                },
            });
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error("Failed to update admission:", error);
        return NextResponse.json({ error: "Failed to update admission" }, { status: 500 });
    }
}

/**
 * DELETE /api/ipd/admissions/[id]
 * Hard-delete an admission. Admin only. Requires a `reason` in the body
 * for the audit log. Refuses if there are downstream records
 * (charges, deposits, daily summaries, floor-stock usages) — those
 * should be settled / cleaned up first via the discharge workflow,
 * not silently destroyed.
 *
 * IpdRequest back-relation has a unique admissionId; we null it
 * before deleting so the FK doesn't block the delete.
 */
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!ADMIN_ROLES.includes(user.role)) {
            return NextResponse.json(
                { error: `Only admin / super_admin can delete admissions (your role: ${user.role}).` },
                { status: 403 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const reason = (body.reason || "").trim();
        if (!reason) {
            return NextResponse.json(
                { error: "A reason is required when deleting an admission. This is recorded for the audit log." },
                { status: 400 }
            );
        }
        if (reason.length < 5) {
            return NextResponse.json(
                { error: "Reason must be at least 5 characters — please describe why this record needs to be removed." },
                { status: 400 }
            );
        }

        const admissionId = params.id;
        const admission = await prisma.admission.findUnique({
            where: { id: admissionId },
            include: {
                _count: {
                    select: {
                        charges: true,
                        deposits: true,
                        dailySummaries: true,
                        floorStockUsages: true,
                    },
                },
            },
        });
        if (!admission) {
            return NextResponse.json({ error: "Admission not found" }, { status: 404 });
        }

        const downstreamCount =
            admission._count.charges +
            admission._count.deposits +
            admission._count.dailySummaries +
            admission._count.floorStockUsages;
        if (downstreamCount > 0) {
            return NextResponse.json(
                {
                    error:
                        `This admission has ${downstreamCount} downstream record(s) (charges / deposits / summaries / floor-stock usage). ` +
                        `Discharge the patient first (or settle/void the records) before deleting.`,
                    counts: admission._count,
                },
                { status: 409 }
            );
        }

        await prisma.$transaction(async (tx) => {
            // 1. Detach the originating IpdRequest so its FK doesn't block
            //    the delete. The IpdRequest itself remains for the audit trail
            //    (admissionId becomes null) — we set the request status to
            //    CANCELLED so it's clear what happened.
            await tx.ipdRequest.updateMany({
                where: { admissionId: admissionId },
                data: {
                    admissionId: null,
                    status: "CANCELLED",
                    reviewNotes: `[deleted] ${reason}`,
                },
            });
            // 2. Release the bed (back to AVAILABLE)
            if (admission.bedId) {
                await tx.bed.update({ where: { id: admission.bedId }, data: { status: "AVAILABLE" } });
            }
            // 3. Revert the visit so it doesn't stay as INPATIENT/Admitted
            //    when the admission it tied to is gone.
            if (admission.visitId) {
                await tx.visit.update({
                    where: { id: admission.visitId },
                    data: { type: "OPD" },
                    // Leave Visit.status alone — admin can decide next step.
                });
            }
            // 4. Delete the admission. Cascade will sweep related records
            //    (the counts check above guarantees there are no charges /
            //    deposits / summaries / floor-stock rows to lose).
            await tx.admission.delete({ where: { id: admissionId } });
        });

        return NextResponse.json({ success: true, deleted: admissionId, reason });
    } catch (error) {
        console.error("Failed to delete admission:", error);
        return NextResponse.json({ error: "Failed to delete admission" }, { status: 500 });
    }
}
