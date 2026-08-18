export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * IPD request queue (R62).
 *
 * The doctor's request to admit a visit to IPD. Splits the medical
 * decision (doctor submits) from the operational transition (admin
 * or reception fulfils). The visit is NOT changed to INPATIENT until
 * an admin/reception user fulfils the request.
 *
 * Status state machine:
 *   PENDING  -> APPROVED   -> FULFILLED
 *   PENDING  -> REJECTED   (terminal)
 *   PENDING  -> CANCELLED  (doctor changes mind; terminal)
 *
 * Allowed roles:
 *   POST   create              DOCTOR, ADMIN, SUPER_ADMIN
 *   GET    list (own / all)    DOCTOR (own), ADMIN, RECEPTIONIST, SUPER_ADMIN
 */
const REQUESTER_ROLES = ["DOCTOR", "ADMIN", "SUPER_ADMIN"];
const REVIEWER_ROLES = ["ADMIN", "RECEPTIONIST", "SUPER_ADMIN"];

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");
        const visitId = searchParams.get("visitId");
        const mine = searchParams.get("mine") === "true";

        const where: any = {};
        if (status) where.status = status;
        if (visitId) where.visitId = visitId;

        // Doctors can only see their own requests; admin/reception see all.
        if (user.role === "DOCTOR" || mine) {
            where.requestedById = user.id;
        } else if (!REVIEWER_ROLES.includes(user.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const requests = await prisma.ipdRequest.findMany({
            where,
            include: {
                visit: {
                    include: {
                        patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true, gender: true, dateOfBirth: true } },
                    },
                },
                requestedBy: { select: { id: true, name: true, email: true } },
                reviewedBy: { select: { id: true, name: true, email: true } },
                preferredWard: { select: { id: true, name: true, type: true } },
                admission: { select: { id: true, admissionNumber: true, status: true, wardId: true, bedId: true } },
            },
            orderBy: [{ status: "asc" }, { urgency: "desc" }, { createdAt: "asc" }],
        });

        return NextResponse.json(requests);
    } catch (error) {
        console.error("Failed to fetch IPD requests:", error);
        return NextResponse.json({ error: "Failed to fetch IPD requests" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!REQUESTER_ROLES.includes(user.role)) {
            return NextResponse.json(
                { error: `Only doctors / admins can submit IPD requests (your role: ${user.role}).` },
                { status: 403 }
            );
        }

        const body = await request.json();
        const {
            visitId,
            reasonForAdmission,
            admittingDiagnosis,
            urgency,
            preferredWardId,
            preferredBedType,
            clinicalNotes,
        } = body;

        if (!visitId || !reasonForAdmission || !urgency) {
            return NextResponse.json({ error: "visitId, reasonForAdmission and urgency are required" }, { status: 400 });
        }
        if (!["EMERGENCY", "URGENT", "ELECTIVE"].includes(urgency)) {
            return NextResponse.json({ error: "urgency must be EMERGENCY, URGENT, or ELECTIVE" }, { status: 400 });
        }

        // Validate visit exists and isn't already admitted / discontinued
        const visit = await prisma.visit.findUnique({
            where: { id: visitId },
            include: { admission: true, ipdRequests: { where: { status: { in: ["PENDING", "APPROVED"] } } } },
        });
        if (!visit) {
            return NextResponse.json({ error: "Visit not found" }, { status: 404 });
        }
        if (visit.admission) {
            return NextResponse.json({ error: "Visit is already admitted to IPD" }, { status: 409 });
        }
        if (visit.ipdRequests.length > 0) {
            return NextResponse.json(
                { error: "Visit already has a pending or approved IPD request", existingRequestId: visit.ipdRequests[0].id },
                { status: 409 }
            );
        }
        if (["Completed", "Discontinued", "Cancelled", "NoShow"].includes(visit.status)) {
            return NextResponse.json({ error: `Visit is in terminal status "${visit.status}" — cannot submit an IPD request.` }, { status: 400 });
        }

        // Generate request number
        const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const count = await prisma.ipdRequest.count({ where: { createdAt: { gte: startOfToday } } });
        const seq = (count + 1).toString().padStart(3, "0");
        const requestNumber = `IPDREQ-${dateStr}-${seq}`;

        const created = await prisma.ipdRequest.create({
            data: {
                requestNumber,
                visitId,
                requestedById: user.id,
                reasonForAdmission,
                admittingDiagnosis: admittingDiagnosis || null,
                urgency,
                preferredWardId: preferredWardId || null,
                preferredBedType: preferredBedType || null,
                clinicalNotes: clinicalNotes || null,
                status: "PENDING",
            },
            include: {
                visit: { include: { patient: { select: { firstName: true, lastName: true, patientNumber: true } } } },
                requestedBy: { select: { id: true, name: true } },
                preferredWard: { select: { id: true, name: true } },
            },
        });

        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        console.error("Failed to create IPD request:", error);
        return NextResponse.json({ error: "Failed to create IPD request" }, { status: 500 });
    }
}
