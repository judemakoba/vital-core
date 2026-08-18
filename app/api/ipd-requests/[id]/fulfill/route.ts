export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { VISIT_STATUS } from "@/lib/visits/status";

/**
 * POST /api/ipd-requests/[id]/fulfill
 *
 * Admin / reception / super_admin fulfils an APPROVED (or PENDING) IPD
 * request. This is the moment the visit actually transitions to IPD:
 *
 *   1. Generate admission number
 *   2. Create Admission record (status: ADMITTED, type: ELECTIVE/EMERGENCY)
 *   3. Mark bed OCCUPIED (if a bed was assigned)
 *   4. Create initial InpatientDeposit (if an opening deposit was provided)
 *   5. Update Visit.type = INPATIENT, Visit.status = Admitted
 *   6. Update IpdRequest.status = FULFILLED, link to admissionId
 *
 * All in a single prisma.$transaction so a partial failure doesn't leave
 * the system in an inconsistent state (e.g. admission created but visit
 * still showing as OPD).
 */
const REVIEWER_ROLES = ["ADMIN", "RECEPTIONIST", "SUPER_ADMIN"];

export async function POST(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!REVIEWER_ROLES.includes(user.role)) {
            return NextResponse.json(
                { error: `Only admin / reception / super_admin can fulfil IPD requests (your role: ${user.role}).` },
                { status: 403 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const { wardId, bedId, initialDeposit } = body;

        const req = await prisma.ipdRequest.findUnique({
            where: { id: params.id },
            include: { visit: { include: { admission: true } } },
        });
        if (!req) {
            return NextResponse.json({ error: "IPD request not found" }, { status: 404 });
        }
        if (req.status !== "APPROVED" && req.status !== "PENDING") {
            return NextResponse.json(
                { error: `Only PENDING or APPROVED requests can be fulfilled. This request is ${req.status}.` },
                { status: 409 }
            );
        }
        if (req.visit.admission) {
            return NextResponse.json(
                { error: "Visit is already admitted to IPD" },
                { status: 409 }
            );
        }
        if (["Completed", "Discontinued", "Cancelled", "NoShow"].includes(req.visit.status)) {
            return NextResponse.json(
                { error: `Visit is in terminal status "${req.visit.status}" — cannot be admitted.` },
                { status: 400 }
            );
        }

        // The wardId on the request is the doctor's preference; the fulfill
        // request body can override it (admin may place patient elsewhere).
        const finalWardId = wardId || req.preferredWardId || undefined;
        const finalBedId = bedId || undefined;

        if (finalBedId) {
            const bed = await prisma.bed.findUnique({ where: { id: finalBedId } });
            if (!bed) {
                return NextResponse.json({ error: `Bed ${finalBedId} not found` }, { status: 400 });
            }
            if (bed.status !== "AVAILABLE") {
                return NextResponse.json(
                    { error: `Bed ${bed.bedNumber} is not available (status: ${bed.status})` },
                    { status: 409 }
                );
            }
            if (finalWardId && bed.wardId !== finalWardId) {
                return NextResponse.json(
                    { error: `Bed ${bed.bedNumber} belongs to a different ward than the one specified.` },
                    { status: 400 }
                );
            }
        }

        // Generate admission number
        const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const result = await prisma.$transaction(async (tx) => {
            const admCount = await tx.admission.count({ where: { createdAt: { gte: startOfToday } } });
            const admSeq = (admCount + 1).toString().padStart(3, "0");
            const admissionNumber = `IPD-${dateStr}-${admSeq}`;

            // 1. Create the Admission
            const admission = await tx.admission.create({
                data: {
                    admissionNumber,
                    patientId: req.visit.patientId,
                    visitId: req.visitId,
                    wardId: finalWardId,
                    bedId: finalBedId,
                    type: req.urgency === "EMERGENCY" ? "EMERGENCY" : (req.urgency === "ELECTIVE" ? "ELECTIVE" : "ELECTIVE"),
                    status: "ADMITTED",
                    admittingDoctorId: req.requestedById,
                },
            });

            // 2. Mark bed OCCUPIED
            if (finalBedId) {
                await tx.bed.update({
                    where: { id: finalBedId },
                    data: { status: "OCCUPIED" },
                });
            }

            // 3. Initial deposit (optional)
            if (initialDeposit && parseFloat(initialDeposit) > 0) {
                const depCount = await tx.inpatientDeposit.count({ where: { createdAt: { gte: startOfToday } } });
                const depSeq = (depCount + 1).toString().padStart(4, "0");
                await tx.inpatientDeposit.create({
                    data: {
                        depositNumber: `DEP-${dateStr}-${depSeq}`,
                        admissionId: admission.id,
                        depositDate: new Date(),
                        amount: parseFloat(initialDeposit),
                        paymentMethod: "CASH",
                        remainingBalance: parseFloat(initialDeposit),
                        receivedById: user.id,
                        notes: "Initial admission deposit",
                    },
                });
            }

            // 4. Update the visit: type = INPATIENT, status = Admitted
            await tx.visit.update({
                where: { id: req.visitId },
                data: {
                    type: "INPATIENT",
                    status: VISIT_STATUS.Admitted,
                },
            });

            // 5. Update the IPD request: FULFILLED + link to admission
            const updatedRequest = await tx.ipdRequest.update({
                where: { id: params.id },
                data: {
                    status: "FULFILLED",
                    admissionId: admission.id,
                    fulfilledAt: new Date(),
                    reviewedById: user.id,
                    reviewedAt: new Date(),
                    reviewNotes: req.reviewNotes
                        ? `${req.reviewNotes}\n\n---\nFulfilled by ${user.name || user.email}.`
                        : `Fulfilled by ${user.name || user.email}.`,
                },
                include: {
                    visit: { include: { patient: true, admission: true } },
                    admission: true,
                    requestedBy: { select: { id: true, name: true } },
                    reviewedBy: { select: { id: true, name: true } },
                    preferredWard: { select: { id: true, name: true } },
                },
            });

            return updatedRequest;
        });

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        console.error("Failed to fulfil IPD request:", error);
        return NextResponse.json({ error: "Failed to fulfil IPD request" }, { status: 500 });
    }
}
