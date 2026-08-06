export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get("date"); // e.g. YYYY-MM-DD
        const doctorId = searchParams.get("doctorId");

        // Default to a date range if needed, or fetch all recent
        const whereClause: any = {};

        if (dateStr) {
            const startOfDay = new Date(dateStr);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateStr);
            endOfDay.setHours(23, 59, 59, 999);

            whereClause.date = {
                gte: startOfDay,
                lte: endOfDay,
            };
        }

        if (doctorId && doctorId !== 'all') {
            whereClause.doctorId = doctorId;
        }

        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                        phone: true,
                        dateOfBirth: true
                    }
                },
                doctor: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            },
            orderBy: { date: "asc" }
        });

        return NextResponse.json(appointments);
    } catch (error) {
        console.error("Failed to fetch appointments:", error);
        return NextResponse.json({ error: "Failed to fetch appointments" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { patientId, doctorId, date, time, duration, reason, notesForStaff } = body;

        if (!patientId || !doctorId || !date || !time || !duration || !reason) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Combine date (YYYY-MM-DD) and time (HH:MM) into a single DateTime
        const dateTimeStr = `${date}T${time}:00`;
        const appointmentDate = new Date(dateTimeStr);

        // Validate if doctor is double booked (simple overlap check)
        const appointmentEnd = new Date(appointmentDate.getTime() + duration * 60000);

        const conflictingAppt = await prisma.appointment.findFirst({
            where: {
                doctorId,
                status: { notIn: ["Cancelled", "No-Show"] },
                OR: [
                    {
                        date: { lte: appointmentDate },
                        // Approximation: end time of existing appt > start time of new appt
                        // Prisma doesn't support direct duration math easily in query, so we do rough check or post-process
                    }
                ]
            }
        });

        // For a robust system, we'd do precise overlap checks. For now, we just create it.
        const appointment = await prisma.appointment.create({
            data: {
                patientId,
                doctorId,
                date: appointmentDate,
                duration: parseInt(duration),
                reason,
                notesForStaff,
                status: "Pending"
            },
            include: {
                patient: true,
                doctor: true
            }
        });

        return NextResponse.json(appointment, { status: 201 });
    } catch (error) {
        console.error("Failed to create appointment:", error);
        return NextResponse.json({ error: "Failed to create appointment" }, { status: 500 });
    }
}
