export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Add Diagnosis to a visit
export async function POST(
    request: Request,
    { params }: { params: { visitId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        const allowedRoles = ["DOCTOR", "ADMIN", "SUPER_ADMIN"];
        if (!session || !allowedRoles.includes(user?.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { name, code, category, notes, patientId, icdVersion } = await request.json();

        const diagnosis = await prisma.diagnosis.create({
            data: {
                visitId: params.visitId,
                patientId,
                name,
                code,
                category,
                notes,
                icdVersion,
            },
        });

        return NextResponse.json(diagnosis, { status: 201 });
    } catch (error) {
        console.error("Failed to add diagnosis:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
