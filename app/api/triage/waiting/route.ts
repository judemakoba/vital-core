export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        console.log(`[API] Fetching waiting visits for triage...`);

        const waitingVisits = await prisma.visit.findMany({
            where: {
                status: { in: ["Waiting", "Triage"] },
                // Only visits that haven't been triaged yet (missing key vitals)
                temperature: null,
            },
            include: {
                patient: {
                    select: {
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                    }
                },
                doctor: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        return NextResponse.json(waitingVisits);
    } catch (error) {
        console.error("Triage waiting list error:", error);
        return NextResponse.json({ error: "Failed to fetch triage queue" }, { status: 500 });
    }
}
