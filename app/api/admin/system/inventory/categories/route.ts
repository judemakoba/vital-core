import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        const categories = await prisma.drugCategory.findMany({
            orderBy: {
                name: 'asc'
            }
        });

        return NextResponse.json(categories, { status: 200 });

    } catch (error: any) {
        console.error("Fetch Categories Error:", error);
        return NextResponse.json({ error: "Failed to fetch categories", details: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, code, description } = body;

        // Validation
        if (!name || !code) {
            return NextResponse.json({ error: "Name and code are required" }, { status: 400 });
        }

        // Check duplicates
        const existingCode = await prisma.drugCategory.findUnique({ where: { code } });
        if (existingCode) return NextResponse.json({ error: "Category code already in use" }, { status: 400 });
        
        const existingName = await prisma.drugCategory.findUnique({ where: { name } });
        if (existingName) return NextResponse.json({ error: "Category name already exists" }, { status: 400 });

        const newCategory = await prisma.drugCategory.create({
            data: {
                name,
                code,
                description,
                isActive: true
            }
        });

        return NextResponse.json(newCategory, { status: 201 });

    } catch (error: any) {
        console.error("Create Category Error:", error);
        return NextResponse.json({ error: "Failed to create category", details: error.message }, { status: 500 });
    }
}
