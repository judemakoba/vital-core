import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        const categories = await prisma.labCategory.findMany({
            orderBy: {
                name: 'asc'
            }
        });

        return NextResponse.json(categories, { status: 200 });
    } catch (error: any) {
        console.error("Fetch Lab Categories Error:", error);
        return NextResponse.json({ error: "Failed to fetch lab categories", details: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, description } = body;

        if (!name) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        const existingCategory = await prisma.labCategory.findUnique({ where: { name } });
        if (existingCategory) {
            return NextResponse.json({ error: "A lab category with this name already exists" }, { status: 400 });
        }

        const newCategory = await prisma.labCategory.create({
            data: {
                name,
                description,
                isActive: true
            }
        });

        return NextResponse.json(newCategory, { status: 201 });
    } catch (error: any) {
        console.error("Create Lab Category Error:", error);
        return NextResponse.json({ error: "Failed to create lab category", details: error.message }, { status: 500 });
    }
}
