import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { suggestVisitTypeForPatient } from "@/lib/visits/consultation-fee";

/**
 * GET /api/patients/[id]/visit-suggestion
 *
 * Returns a suggested VisitType for a NEW visit based on the patient's
 * recent visit history. Used by the cashier UI to pre-select FOLLOW_UP
 * when a patient was seen recently (saves them from charging an unnecessary
 * consultation fee).
 *
 * Response:
 *   { suggestedType: 'OPD' | 'FOLLOW_UP' | ..., reason: string, lastVisit: {...} | null }
 */
export async function GET(
    _request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const suggestion = await suggestVisitTypeForPatient(prisma, params.id);
        return NextResponse.json(suggestion);
    } catch (error: any) {
        console.error("Visit suggestion error:", error);
        return NextResponse.json(
            { error: "Failed to compute visit suggestion", details: error.message },
            { status: 500 }
        );
    }
}
