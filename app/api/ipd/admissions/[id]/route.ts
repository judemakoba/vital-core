import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const admission = await prisma.admission.findUnique({
            where: { id: params.id },
            include: {
                patient: true,
                ward: true,
                bed: true,
                admittingDoctor: { select: { name: true } }
            }
        });

        if (!admission) {
            return NextResponse.json({ error: "Admission not found" }, { status: 404 });
        }

        return NextResponse.json(admission);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch admission" }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const admissionId = params.id;
        const body = await request.json();
        const { bedId, wardId, status, type } = body;

        const currentAdmission = await prisma.admission.findUnique({
            where: { id: admissionId },
            select: { bedId: true, wardId: true, status: true }
        });

        if (!currentAdmission) {
            return NextResponse.json({ error: "Admission not found" }, { status: 404 });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Handle Bed Transfer
            if (bedId && bedId !== currentAdmission.bedId) {
                // 1. Mark old bed as CLEANING
                if (currentAdmission.bedId) {
                    await tx.bed.update({
                        where: { id: currentAdmission.bedId },
                        data: { status: "CLEANING" }
                    });
                }
                // 2. Mark new bed as OCCUPIED
                await tx.bed.update({
                    where: { id: bedId },
                    data: { status: "OCCUPIED" }
                });
            }

            // Update Admission
            const updated = await tx.admission.update({
                where: { id: admissionId },
                data: {
                    bedId: bedId || undefined,
                    wardId: wardId || undefined,
                    status: status || undefined,
                    type: type || undefined
                }
            });

            return updated;
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error("Failed to update admission:", error);
        return NextResponse.json({ error: "Failed to update admission" }, { status: 500 });
    }
}
