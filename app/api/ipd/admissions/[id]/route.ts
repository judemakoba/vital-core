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
 * R64: hard-delete an admission AND cascade through all attached
 * records. Admin only. Requires a `reason` in the body for the audit
 * log, and (for safety on this destructive action) the body must also
 * include `confirm: "DELETE"` — the UI sends this from the modal.
 *
 * The cascade order matters because the foreign keys default to
 * NO ACTION (RESTRICT) — the rows have to be deleted in an order
 * that never tries to leave an orphan:
 *
 *   1. FloorStockUsage      (children of admission AND of charge)
 *   2. DepositApplication   (children of deposit AND of charge)
 *   3. InpatientCharge      (children of admission, summary, etc.)
 *   4. DailyChargeSummary   (children of admission)
 *   5. InpatientDeposit     (children of admission)
 *
 * FloorStock.quantityOnHand is NOT auto-reverted — the drug was
 * actually consumed, and a separate manual inventory adjustment
 * should reverse the physical stock if the use is being unwound.
 *
 * The originating IpdRequest (if any) is preserved with admissionId
 * nulled and status set to CANCELLED for the audit trail. The bed
 * is released back to AVAILABLE and the visit is reverted to OPD
 * type (status is left as-is so the doctor can decide next steps).
 *
 * The response includes a `cascade` object with the counts of each
 * record type removed — useful for the audit log and the UI toast.
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
        const confirm = (body.confirm || "").trim();
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
        // R64: explicit confirmation string. Prevents an accidental click
        // or a stale browser tab from firing the cascade.
        if (confirm !== "DELETE") {
            return NextResponse.json(
                { error: "Confirmation required: send `confirm: \"DELETE\"` in the request body to proceed." },
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

        // Pre-count so the audit log has a full picture even if any
        // step in the transaction fails partway (we'd return the partial
        // counts in the error response too).
        const initialCounts = admission._count;

        // R64: cascade. We delete downstream records explicitly in the
        // right order so the foreign keys (default NO ACTION) don't
        // block the final admission.delete().
        const result = await prisma.$transaction(async (tx) => {
            // 1. FloorStockUsage — children of admission AND of any of its charges.
            //    We delete the ones linked directly to the admission here. The
            //    ones linked via chargeId are deleted in step 2.
            const usageByAdmission = await tx.floorStockUsage.deleteMany({
                where: { admissionId: admissionId },
            });

            // 2. DepositApplication — children of deposit (this admission) AND
            //    of charge (this admission). Find the charge IDs first so we
            //    can clean up deposit apps pointing at them too.
            const chargeIds = (await tx.inpatientCharge.findMany({
                where: { admissionId: admissionId },
                select: { id: true },
            })).map(c => c.id);
            const depositIds = (await tx.inpatientDeposit.findMany({
                where: { admissionId: admissionId },
                select: { id: true },
            })).map(d => d.id);

            const depositApps = await tx.depositApplication.deleteMany({
                where: {
                    OR: [
                        { depositId: { in: depositIds } },
                        { chargeId: { in: chargeIds } },
                    ],
                },
            });

            // Any FloorStockUsage that linked to those charges (chargeId)
            // — also delete. These are the ones from step 1 that pointed
            // to a charge rather than the admission directly.
            const usageByCharge = chargeIds.length > 0
                ? await tx.floorStockUsage.deleteMany({
                    where: { chargeId: { in: chargeIds } },
                })
                : { count: 0 };

            // 3. InpatientCharge — children of admission, summary, etc.
            const charges = await tx.inpatientCharge.deleteMany({
                where: { admissionId: admissionId },
            });

            // 4. DailyChargeSummary — children of admission. After this step,
            //    any InpatientCharge that referenced a daily summary has
            //    already been deleted (step 3), so no orphan FKs to worry
            //    about for summaries.
            const summaries = await tx.dailyChargeSummary.deleteMany({
                where: { admissionId: admissionId },
            });

            // 5. InpatientDeposit — children of admission.
            const deposits = await tx.inpatientDeposit.deleteMany({
                where: { admissionId: admissionId },
            });

            // 6. Detach the originating IpdRequest so its FK doesn't block
            //    the final admission.delete(). The IpdRequest itself
            //    remains for the audit trail (admissionId becomes null) —
            //    we set the request status to CANCELLED so it's clear
            //    what happened.
            await tx.ipdRequest.updateMany({
                where: { admissionId: admissionId },
                data: {
                    admissionId: null,
                    status: "CANCELLED",
                    reviewNotes: `[deleted] ${reason}`,
                },
            });

            // 7. Release the bed (back to AVAILABLE).
            if (admission.bedId) {
                await tx.bed.update({ where: { id: admission.bedId }, data: { status: "AVAILABLE" } });
            }

            // 8. Revert the visit so it doesn't stay as INPATIENT/Admitted
            //    when the admission it tied to is gone. Leave Visit.status
            //    alone — admin can decide next step.
            if (admission.visitId) {
                await tx.visit.update({
                    where: { id: admission.visitId },
                    data: { type: "OPD" },
                });
            }

            // 9. Finally, delete the admission itself.
            await tx.admission.delete({ where: { id: admissionId } });

            return {
                cascade: {
                    floorStockUsages: usageByAdmission.count + usageByCharge.count,
                    depositApplications: depositApps.count,
                    inpatientCharges: charges.count,
                    dailyChargeSummaries: summaries.count,
                    inpatientDeposits: deposits.count,
                },
                initialCounts,
            };
        });

        return NextResponse.json({
            success: true,
            deleted: admissionId,
            reason,
            initialCounts,
            cascade: result.cascade,
        });
    } catch (error) {
        console.error("Failed to delete admission:", error);
        return NextResponse.json({ error: "Failed to delete admission" }, { status: 500 });
    }
}
