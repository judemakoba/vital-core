import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        const tests = await prisma.labTestCatalog.findMany({
            include: {
                category: true
            },
            orderBy: {
                name: 'asc'
            }
        });

        return NextResponse.json(tests, { status: 200 });

    } catch (error: any) {
        console.error("Fetch Lab Tests Error:", error);
        return NextResponse.json({ error: "Failed to fetch lab tests", details: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, categoryId, price, referenceRange, unit, description } = body;

        if (!name || !categoryId || price === undefined) {
            return NextResponse.json({ error: "Name, category, and price are required" }, { status: 400 });
        }

        const existingTest = await prisma.labTestCatalog.findUnique({ where: { name } });
        if (existingTest) {
            return NextResponse.json({ error: "A lab test with this name already exists" }, { status: 400 });
        }

        const newTest = await prisma.labTestCatalog.create({
            data: {
                name,
                categoryId,
                price: parseFloat(price),
                referenceRange,
                unit,
                description,
                isActive: true
            }
        });

        return NextResponse.json(newTest, { status: 201 });

    } catch (error: any) {
        console.error("Create Lab Test Error:", error);
        return NextResponse.json({ error: "Failed to create lab test", details: error.message }, { status: 500 });
    }
}
