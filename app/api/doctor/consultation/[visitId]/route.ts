import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decideNextStatusAfterConsultation, VISIT_STATUS } from "@/lib/visits/status";

export async function GET(
    request: Request,
    { params }: { params: { visitId: string } }
) {
    try {
        const session = (await getServerSession(authOptions)) as any;
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const visitId = params.visitId;
        const visit = await prisma.visit.findUnique({
            where: { id: visitId },
            include: {
                patient: true,
                diagnoses: true,
                prescriptions: true,
                labOrders: true,
                radiologyOrders: true,
            },
        });

        if (!visit) {
            return NextResponse.json({ error: "Visit not found" }, { status: 404 });
        }

        // ── Access Control ──────────────────────────────────────
        const userId = session.user?.id;
        const userRole = session.user?.role;
        const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
        const isAssignedDoctor = userId && visit.assignedDoctorId === userId;

        if (!isAdmin && !isAssignedDoctor) {
            return NextResponse.json({ error: "Access Denied: You are not authorized to view this consultation." }, { status: 403 });
        }
        // ────────────────────────────────────────────────────────

        return NextResponse.json(visit);
    } catch (error) {
        console.error("Failed to fetch visit for consultation:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { visitId: string } }
) {
    try {
        const session = (await getServerSession(authOptions)) as any;
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const visitId = params.visitId;
        const visit = await prisma.visit.findUnique({
            where: { id: visitId },
            select: { assignedDoctorId: true, status: true }
        });

        if (!visit) {
            return NextResponse.json({ error: "Visit not found" }, { status: 404 });
        }

        // Guard: can only start consultation once triage is complete.
        // The "closing" branch handles Finish Consultation (and any other closing intent);
        // the server then decides the actual next status based on pending lab/rad/rx orders.
        const body = await request.json();
        const requestedStatus: string | undefined = body?.status;
        // Treat a "Finish Consultation" signal as: explicit status === "Completed" or "Billing",
        // OR a `finishing: true` flag in the body. The frontend uses one of these.
        const isClosing = requestedStatus === "Completed"
            || requestedStatus === "Billing"
            || body?.finishing === true;

        if (!isClosing) {
            // Allowed pre-consultation / active-consultation statuses.
            // R55b: include "InConsultation" (the new canonical per the
            // consolidated visit-cycle spec) alongside the legacy alias
            // "Consultation", so that any code path that writes the new
            // status doesn't immediately 400 the doctor's save.
            const allowedStatuses = [
                "Triaged", "InConsultation", "Consultation",
                "Laboratory", "Radiology", "Pharmacy",
            ];
            if (!allowedStatuses.includes(visit.status)) {
                return NextResponse.json(
                    { error: `Cannot start consultation for visit in "${visit.status}" status. Patient must complete payment and triage first.` },
                    { status: 400 }
                );
            }
        } else {
            // Even when closing, refuse if visit is in a terminal state
            const terminalStatuses = ["Completed", "Cancelled", "NoShow", "Dispensed"];
            if (terminalStatuses.includes(visit.status)) {
                return NextResponse.json(
                    { error: `Cannot finish consultation — visit is already in terminal state "${visit.status}".` },
                    { status: 400 }
                );
            }
        }

        // ── Access Control ──────────────────────────────────────
        const userId = session.user?.id;
        const userRole = session.user?.role;
        const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
        const isAssignedDoctor = userId && visit.assignedDoctorId === userId;

        if (!isAdmin && !isAssignedDoctor) {
            return NextResponse.json({ error: "Access Denied: You are not authorized to modify this consultation." }, { status: 403 });
        }
        // ────────────────────────────────────────────────────────

        const { subjective, objective, assessment, treatmentPlan, status } = body;

        // Server decides the next status when finishing consultation, based on pending services.
        // Priority per spec: pending lab → pending radiology → pending pharmacy → FinalBilling.
        let nextStatus: string = status || "Consultation";
        if (isClosing) {
            nextStatus = await decideNextStatusAfterConsultation(prisma, visitId);
        }

        const updatedVisit = await prisma.visit.update({
            where: { id: visitId },
            data: {
                subjective,
                objective,
                assessment,
                treatmentPlan,
                status: nextStatus,
                // Stamp completedTime for any closing transition (Lab/Rad/Pharmacy/FinalBilling).
                // The doctor finished the consultation; from there, downstream services or billing handle the rest.
                completedTime: isClosing ? new Date() : undefined,
            },
        });

        return NextResponse.json({
            ...updatedVisit,
            // Hint to the UI: what stage did we route to? Useful for the auto-advance to the right place.
            _routedTo: isClosing ? nextStatus : undefined,
        });
    } catch (error) {
        console.error("Failed to update consultation notes:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
