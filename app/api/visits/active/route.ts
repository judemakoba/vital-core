export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ACTIVE_VISIT_STATUSES, DOCTOR_VISIBLE_STATUSES } from "@/lib/visits/status";

// Re-export the canonical lists from the central state machine so the API stays in sync.
const ACTIVE_LIST = ACTIVE_VISIT_STATUSES;
const DOCTOR_LIST = DOCTOR_VISIBLE_STATUSES;

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const statusFilter = session.user.role === 'DOCTOR'
            ? { in: DOCTOR_LIST }
            : { in: ACTIVE_LIST };

        const activeVisits = await prisma.visit.findMany({
            where: {
                status: statusFilter
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        patientNumber: true
                    }
                },
                doctor: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json(activeVisits);
    } catch (error) {
        console.error("Failed to fetch active visits:", error);
        return NextResponse.json({ error: "Failed to fetch active visits" }, { status: 500 });
    }
}
