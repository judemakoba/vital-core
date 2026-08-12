import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { suggestVisitTypeForPatient } from "@/lib/visits/consultation-fee";

export const dynamic = "force-dynamic";

/**
 * GET /api/patients/[id]/visit-suggestion
 *
 * Smart visit-type suggestion based on the patient's recent visit history.
 * - Last visit within the configured follow-up window (default 14 days)
 *   → suggests FOLLOW_UP
 * - Otherwise → suggests OPD
 *
 * Returns:
 *   { suggestedType, reason, followUpWindowDays, lastVisit? }
 *
 * Used by the create-visit modal to pre-select the most likely type.
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

        const patient = await prisma.patient.findUnique({
            where: { id: patientId },
            select: { id: true },
        });
        if (!patient) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const suggestion = await suggestVisitTypeForPatient(prisma, patientId);
        return NextResponse.json(suggestion);
    } catch (error: any) {
        console.error("Visit suggestion error:", error);
        return NextResponse.json(
            { error: "Failed to compute visit suggestion", details: error.message },
            { status: 500 }
        );
    }
}
