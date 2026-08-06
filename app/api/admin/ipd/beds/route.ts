import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const wardId = searchParams.get('wardId');

        const beds = await prisma.bed.findMany({
            where: wardId ? { wardId } : {},
            include: { ward: true },
            orderBy: { bedNumber: 'asc' }
        });
        return NextResponse.json(beds);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch beds" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { wardId, bedNumber, type, features, ratePerDay } = body;

        const bed = await prisma.bed.create({
            data: {
                wardId,
                bedNumber,
                type,
                features,
                ratePerDay: parseFloat(ratePerDay),
                status: "AVAILABLE"
            }
        });

        return NextResponse.json(bed);
    } catch (error) {
        return NextResponse.json({ error: "Failed to create bed" }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { id, bedNumber, type, features, ratePerDay, status } = body;

        const bed = await prisma.bed.update({
            where: { id },
            data: {
                bedNumber,
                type,
                features,
                ratePerDay: parseFloat(ratePerDay),
                status
            }
        });

        return NextResponse.json(bed);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update bed" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

        // Check for active admissions
        const admissionsCount = await prisma.admission.count({ 
            where: { bedId: id, status: "ADMITTED" } 
        });
        if (admissionsCount > 0) {
            return NextResponse.json({ error: "Cannot delete bed with active admission" }, { status: 400 });
        }

        await prisma.bed.delete({ where: { id } });
        return NextResponse.json({ message: "Bed deleted" });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete bed" }, { status: 500 });
    }
}
