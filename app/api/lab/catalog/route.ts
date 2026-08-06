export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";

        const catalog = await prisma.labTestCatalog.findMany({
            where: search ? {
                name: { contains: search, mode: "insensitive" }
            } : { isActive: true },
            include: {
                category: true,
                resultTemplate: {
                    select: {
                        id: true,
                        templateName: true,
                        resultMode: true,
                        resultSchema: true,
                        normalRangeMin: true,
                        normalRangeMax: true,
                        criticalRangeMin: true,
                        criticalRangeMax: true,
                        resultUnit: true,
                        headerHtml: true,
                        templateHtml: true,
                        footerHtml: true,
                    },
                },
            },
            orderBy: { name: "asc" }
        });

        return NextResponse.json(catalog);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch lab catalog" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || (user?.role !== 'ADMIN' && user?.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { name, categoryId, description, price, referenceRange, unit, template } = body;

        if (!name || !categoryId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const test = await prisma.labTestCatalog.create({
            data: {
                name,
                categoryId,
                description,
                price: parseFloat(price) || 0.0,
                referenceRange,
                unit,
                template
            }
        });

        return NextResponse.json(test, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to add lab test" }, { status: 500 });
    }
}
