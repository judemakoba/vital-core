export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Doctor's "Completed Today" list.
 *
 * Returns visits that THIS doctor has finished (completedTime is set) since
 * local midnight. The list auto-empties at midnight because the WHERE clause
 * is `completedTime >= startOfToday`, so yesterday's completions naturally
 * roll out without any cron job.
 *
 * The list is rendered in read-only mode on the doctor dashboard, so the
 * doctor can review what they finished today but can't edit it.
 *
 * R61: replaces the placeholder "Completed Today: 0" stat card and powers
 * the new "Completed Tasks" tab on the doctor dashboard.
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;

        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only doctors / admins can read this — nurses / reception don't
        // have a "today's completed consults" concept.
        if (!['DOCTOR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Local-time start-of-day so "today" matches the doctor's wall clock,
        // not UTC. Server is configured for EAT (+0300), so this is correct
        // for the dev environment and the LXC production target.
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const doctorId = user?.id;
        const visits = await prisma.visit.findMany({
            where: {
                assignedDoctorId: doctorId,
                completedTime: { gte: startOfToday },
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                        gender: true,
                        dateOfBirth: true,
                    },
                },
            },
            orderBy: { completedTime: "desc" },
        });

        return NextResponse.json(visits);
    } catch (error) {
        console.error("Failed to fetch completed-today visits:", error);
        return NextResponse.json({ error: "Failed to fetch completed-today visits" }, { status: 500 });
    }
}
