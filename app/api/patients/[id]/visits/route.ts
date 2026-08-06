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
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const visits = await prisma.visit.findMany({
            where: { patientId: params.id },
            include: {
                doctor: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json(visits);
    } catch (error) {
        console.error("Fetch patient visits error:", error);
        return NextResponse.json({ error: "Failed to fetch visit history" }, { status: 500 });
    }
}
