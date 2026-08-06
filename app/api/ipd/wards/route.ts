import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const wards = await prisma.ward.findMany({
            include: { 
                beds: {
                    include: {
                        admissions: {
                            where: { status: 'ADMITTED' },
                            include: { patient: { select: { firstName: true, lastName: true } } }
                        }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });
        return NextResponse.json(wards);
    } catch (error) {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { name, type, capacity, description } = await request.json();
        
        if (!name || !type || !capacity) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const ward = await prisma.ward.create({
            data: {
                name,
                type,
                capacity: parseInt(capacity),
                description,
                // Automatically generate beds based on capacity
                beds: {
                    create: Array.from({ length: parseInt(capacity) }).map((_, i) => ({
                        bedNumber: `${name.substring(0, 3).toUpperCase()}-${(i + 1).toString().padStart(2, '0')}`,
                        type: "STANDARD",
                        status: "AVAILABLE",
                        ratePerDay: 0
                    }))
                }
            },
            include: { beds: true }
        });

        return NextResponse.json(ward, { status: 201 });
    } catch (error) {
        console.error("Failed to create ward:", error);
        return NextResponse.json({ error: "Failed to create ward" }, { status: 500 });
    }
}
