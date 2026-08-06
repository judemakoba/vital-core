import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
    try {
        const wards = await prisma.ward.findMany({
            include: { beds: true },
            orderBy: { name: 'asc' }
        });
        return NextResponse.json(wards);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch wards" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, type, capacity, description } = body;

        const ward = await prisma.ward.create({
            data: {
                name,
                type,
                capacity: parseInt(capacity),
                description
            }
        });

        return NextResponse.json(ward);
    } catch (error) {
        return NextResponse.json({ error: "Failed to create ward" }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { id, name, type, capacity, description } = body;

        const ward = await prisma.ward.update({
            where: { id },
            data: {
                name,
                type,
                capacity: parseInt(capacity),
                description
            }
        });

        return NextResponse.json(ward);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update ward" }, { status: 500 });
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

        // Check for dependencies (beds, admissions)
        const bedsCount = await prisma.bed.count({ where: { wardId: id } });
        if (bedsCount > 0) {
            return NextResponse.json({ error: "Cannot delete ward with existing beds" }, { status: 400 });
        }

        await prisma.ward.delete({ where: { id } });
        return NextResponse.json({ message: "Ward deleted" });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete ward" }, { status: 500 });
    }
}
