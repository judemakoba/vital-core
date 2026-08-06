export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const appointment = await prisma.appointment.findUnique({
            where: { id: params.id },
            include: { patient: true, doctor: true }
        });

        if (!appointment) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(appointment);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch appointment" }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const { status } = body;

        const appointment = await prisma.appointment.update({
            where: { id: params.id },
            data: { status }
        });

        return NextResponse.json(appointment);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update appointment" }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await prisma.appointment.update({
            where: { id: params.id },
            data: { status: "Cancelled" }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to cancel appointment" }, { status: 500 });
    }
}
