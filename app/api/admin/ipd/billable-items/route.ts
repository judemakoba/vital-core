import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
    try {
        const items = await prisma.billableItem.findMany({
            orderBy: { itemName: 'asc' }
        });
        return NextResponse.json(items);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch billable items" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { itemCode, itemName, description, category, frequency, application, standardRate, isActive } = body;

        const item = await prisma.billableItem.create({
            data: {
                itemCode,
                itemName,
                description,
                category,
                frequency,
                application,
                standardRate: parseFloat(standardRate),
                isActive: isActive ?? true
            }
        });

        return NextResponse.json(item);
    } catch (error) {
        return NextResponse.json({ error: "Failed to create billable item" }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { id, itemCode, itemName, description, category, frequency, application, standardRate, isActive } = body;

        const item = await prisma.billableItem.update({
            where: { id },
            data: {
                itemCode,
                itemName,
                description,
                category,
                frequency,
                application,
                standardRate: parseFloat(standardRate),
                isActive: isActive ?? true
            }
        });

        return NextResponse.json(item);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update billable item" }, { status: 500 });
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

        // Check for dependencies (charges)
        const chargesCount = await prisma.inpatientCharge.count({ where: { billableItemId: id } });
        if (chargesCount > 0) {
            return NextResponse.json({ error: "Cannot delete item with existing charges" }, { status: 400 });
        }

        await prisma.billableItem.delete({ where: { id } });
        return NextResponse.json({ message: "Billable item deleted" });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete billable item" }, { status: 500 });
    }
}
