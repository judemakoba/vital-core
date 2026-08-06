import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;

        if (!session || !['DOCTOR', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { visitId } = await request.json();

        if (!visitId) {
            return NextResponse.json({ error: "Visit ID is required" }, { status: 400 });
        }

        const updatedVisit = await prisma.visit.update({
            where: { id: visitId },
            data: {
                assignedDoctorId: user.id
            }
        });

        return NextResponse.json(updatedVisit);
    } catch (error) {
        console.error("Failed to take assignment:", error);
        return NextResponse.json({ error: "Failed to transfer assignment" }, { status: 500 });
    }
}
