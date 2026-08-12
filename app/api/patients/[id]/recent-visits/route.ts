import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getVisitSettings } from "@/lib/visits/consultation-fee";

export const dynamic = "force-dynamic";

/**
 * GET /api/patients/[id]/recent-visits
 *
 * Returns the patient's most recent Completed visits that are eligible
 * to be linked as a `linkedPriorVisitId` for a FOLLOW_UP visit. The list
 * is filtered to:
 *   - status = Completed
 *   - type ∈ {OPD, FOLLOW_UP, VACCINATION, ANTENATAL, SCHEDULED}
 *   - checkInTime (or createdAt) within the configured follow-up window
 *     (default 14 days, read from settings.visit.followUpWindowDays)
 *
 * Limited to the 20 most recent.
 *
 * Used by the create-visit modal's FOLLOW_UP prior-visit picker.
 */
export async function GET(
    _request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = params.id;

        const { followUpWindowDays } = await getVisitSettings();

        // If window is 0, "no time limit" — return all eligible Completed visits.
        // Otherwise restrict to last `followUpWindowDays` days, measured by
        // `createdAt` (always populated) — `checkInTime` may be null for some
        // legacy rows and Prisma's OR-mixed null+comparison is brittle.
        const since = followUpWindowDays > 0
            ? new Date(Date.now() - followUpWindowDays * 86400000)
            : new Date(0);

        const visits = await prisma.visit.findMany({
            where: {
                patientId,
                status: "Completed",
                type: { in: ["OPD", "FOLLOW_UP", "VACCINATION", "ANTENATAL", "SCHEDULED"] },
                createdAt: { gte: since },
            },
            orderBy: { checkInTime: "desc" },
            take: 20,
            select: {
                id: true,
                visitNumber: true,
                type: true,
                checkInTime: true,
                status: true,
                chiefComplaint: true,
            },
        });

        return NextResponse.json(visits);
    } catch (error: any) {
        console.error("Recent visits error:", error);
        return NextResponse.json(
            { error: "Failed to load recent visits", details: error.message },
            { status: 500 }
        );
    }
}
