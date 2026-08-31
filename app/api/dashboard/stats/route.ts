import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);
    const userRole = session?.user?.role as string | undefined;
    const canSeeRevenue = userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "ACCOUNTANT" || userRole === "CASHIER";

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const [
        totalPatients,
        patientsAttendedToday,
        appointmentsToday,
        pendingPrescriptions,
        pendingLabs,
        pendingLabsInProgress,
        pendingRadiology,
        pendingRadiologyInProgress,
        todaysPayments,
    ] = await Promise.all([
        prisma.patient.count({ where: { isActive: true } }),
        prisma.visit.count({
            where: { createdAt: { gte: startOfDay, lte: endOfDay } },
        }),
        prisma.appointment.count({
            where: { date: { gte: startOfDay, lte: endOfDay } },
        }),
        prisma.prescription.count({ where: { status: "Pending" } }),
        // Count lab orders that still need attention: Ordered (cashier hasn't
        // collected yet) + InProgress (paid, lab tech hasn't entered results).
        // Excludes Completed (results published) and Cancelled. This is the
        // work the dashboard should surface to the lab/ops team.
        prisma.labOrder.count({ where: { status: { in: ["Ordered", "InProgress"] } } }),
        // Subset of pendingLabs: only those that are paid (InProgress) and
        // waiting for the lab tech to enter results. Useful as a "results
        // to publish" indicator on the dashboard.
        prisma.labOrder.count({ where: { status: "InProgress" } }),
        // R59: pending radiology orders — mirrors the lab count above so the
        // dashboard's "Pending Radiology" card has live data. Same Ordered +
        // InProgress semantics as the lab count.
        prisma.radiologyOrder.count({ where: { status: { in: ["Ordered", "InProgress"] } } }),
        prisma.radiologyOrder.count({ where: { status: "InProgress" } }),
        prisma.payment.findMany({
            where: { createdAt: { gte: startOfDay, lte: endOfDay } },
            select: { amount: true },
        }),
    ]);

    const todaysRevenue = todaysPayments.reduce((sum, p) => sum + p.amount, 0);

    return NextResponse.json({
        totalPatients,
        patientsAttendedToday,
        appointmentsToday,
        pendingPrescriptions,
        pendingLabs,
        pendingLabsInProgress,
        pendingRadiology,
        pendingRadiologyInProgress,
        todaysRevenue,
        canSeeRevenue,
    });
}
