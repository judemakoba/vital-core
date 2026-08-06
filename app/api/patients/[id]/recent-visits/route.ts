export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getVisitSettings } from "@/lib/visits/consultation-fee";
import { VISIT_STATUS } from "@/lib/visits/status";

/**
 * GET /api/patients/[id]/recent-visits
 *
 * Returns the patient's recent COMPLETED visits that are eligible to be
 * linked as the `linkedPriorVisitId` of a new FOLLOW_UP visit. Per the
 * consolidated spec (R45):
 *
 *   - Must be in status "Completed"
 *   - Type must be OPD / FOLLOW_UP / VACCINATION / ANTENATAL / SCHEDULED
 *   - Must be within the configured follow-up window (default 14 days)
 *
 * Used by the visit creation modal to populate the prior-visit picker.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = params.id;

        const patient = await prisma.patient.findUnique({
            where: { id: patientId },
            select: { id: true },
        });
        if (!patient) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const { followUpWindowDays } = await getVisitSettings();
        const cutoff = new Date(Date.now() - (followUpWindowDays > 0 ? followUpWindowDays : 14) * 86400000);

        const ALLOWED_TYPES = ["OPD", "FOLLOW_UP", "VACCINATION", "ANTENATAL", "SCHEDULED"];

        const visits = await prisma.visit.findMany({
            where: {
                patientId,
                status: VISIT_STATUS.Completed,
                type: { in: ALLOWED_TYPES as any },
                checkInTime: { gte: cutoff },
            },
            select: {
                id: true,
                visitNumber: true,
                type: true,
                checkInTime: true,
                status: true,
            },
            orderBy: { checkInTime: "desc" },
            take: 10,
        });

        return NextResponse.json(visits);
    } catch (error: any) {
        console.error("Failed to fetch recent visits:", error);
        return NextResponse.json(
            { error: "Failed to fetch recent visits", details: error.message },
            { status: 500 }
        );
    }
}
