import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const visitId = params.id;
        console.log(`[API] Recording triage for visit ID: ${visitId}`);
        const body = await request.json();
        const {
            bloodPressure,
            heartRate,
            temperature,
            weight,
            height,
            priority
        } = body;

        // Guard: only visits in Triage status can be triaged
        const visit = await prisma.visit.findUnique({ where: { id: visitId } });
        if (!visit) {
            return NextResponse.json({ error: "Visit not found" }, { status: 404 });
        }
        if (visit.status !== "Triage") {
            return NextResponse.json(
                { error: `Cannot record triage for visit in "${visit.status}" status. Patient must complete payment first.` },
                { status: 400 }
            );
        }

        // Update the visit with vitals and change status to Triaged
        const updatedVisit = await prisma.visit.update({
            where: { id: visitId },
            data: {
                bloodPressure,
                heartRate,
                temperature,
                weight: parseFloat(weight) || null,
                height: parseFloat(height) || null,
                priority: priority || "Normal",
                status: "Triaged"
            }
        });

        return NextResponse.json(updatedVisit);
    } catch (error) {
        console.error("Triage recording error:", error);
        return NextResponse.json({ error: "Failed to record triage data" }, { status: 500 });
    }
}
