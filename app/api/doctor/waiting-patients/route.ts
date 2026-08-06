export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DOCTOR_VISIBLE_STATUSES } from "@/lib/visits/status";

/**
 * Doctor waiting queue.
 * Doctors see patients strictly AFTER triage (they should never see Billing/Waiting).
 * They also need to see visits that were sent for lab/radiology/pharmacy from their consultation,
 * so they can follow up once results are back — even if the visit is currently in Radiology/Lab/Pharmacy.
 *
 * The DOCTOR_VISIBLE_STATUSES list is imported from the central visit state
 * machine (lib/visits/status.ts) so the doctor queue stays in sync with the
 * consolidated spec. The previous hardcoded list had legacy statuses only.
 */

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;

        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let statusFilter: string[] = [];

        // DOCTOR, ADMIN, and SUPER_ADMIN can see waiting patients
        if (['DOCTOR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            statusFilter = DOCTOR_VISIBLE_STATUSES;
        } else {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const fetchAll = searchParams.get("all") === "true";
        const doctorId = user?.id;

        // Fetch visits assigned to this doctor that are still active
        const waitingPatients = await prisma.visit.findMany({
            where: {
                ...(fetchAll ? {} : { assignedDoctorId: doctorId }),
                status: { in: statusFilter },
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        dateOfBirth: true,
                        gender: true,
                        phone: true,
                        patientNumber: true
                    }
                },
                labOrders: {
                    select: {
                        id: true,
                        status: true,
                        testName: true,
                        result: true
                    }
                }
            },
            orderBy: { checkInTime: "asc" }
        });

        // Add computed fields for each visit
        const patientsWithLabStatus = waitingPatients.map(visit => {
            const completedLabs = visit.labOrders.filter(o => o.status === "Completed" && o.result).length;
            const pendingLabs = visit.labOrders.filter(o => o.status !== "Completed").length;
            const hasNewResults = completedLabs > 0 && visit.status === "Consultation";

            return {
                ...visit,
                completedLabCount: completedLabs,
                pendingLabCount: pendingLabs,
                hasNewLabResults: hasNewResults
            };
        });

        return NextResponse.json(patientsWithLabStatus);
    } catch (error) {
        console.error("Failed to fetch waiting patients:", error);
        return NextResponse.json({ error: "Failed to fetch waiting patients" }, { status: 500 });
    }
}
