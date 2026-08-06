import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'DOCTOR') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const doctorId = session.user.id;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const appointments = await prisma.appointment.findMany({
            where: {
                doctorId,
                date: {
                    gte: today,
                    lt: tomorrow
                }
            },
            include: {
                patient: {
                    select: { firstName: true, lastName: true, dateOfBirth: true, gender: true }
                }
            },
            orderBy: { date: "asc" }
        });

        return NextResponse.json(appointments);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch schedule" }, { status: 500 });
    }
}
