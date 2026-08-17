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
        pendingRadiology,
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
        prisma.labOrder.count({ where: { status: "Ordered" } }),
        // R59: pending radiology orders — mirrors the lab count above so the
        // dashboard's "Pending Radiology" card has live data. RadiologyOrder
        // defaults to status "Ordered" (see schema.prisma line ~410), same
        // as LabOrder, so we filter on the same value.
        prisma.radiologyOrder.count({ where: { status: "Ordered" } }),
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
        pendingRadiology,
        todaysRevenue,
        canSeeRevenue,
    });
}
