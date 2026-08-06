export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const roleFilter = searchParams.get("role");

        const users = await prisma.user.findMany({
            where: {
                isActive: true,
                ...(roleFilter ? {
                    role: {
                        name: roleFilter
                    }
                } : {})
            },
            select: {
                id: true,
                name: true,
                email: true,
                department: true,
                role: {
                    select: { name: true }
                }
            },
            orderBy: { name: "asc" }
        });

        return NextResponse.json(users);
    } catch (error) {
        console.error("Failed to fetch users:", error);
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        // STRICT ROLE CHECK
        if (!session || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Access Denied: Admin privileges required hearth" }, { status: 403 });
        }

        const { id, ...data } = await request.json();

        // Basic Input Validation
        if (!data.name || !data.email) {
            return NextResponse.json({ error: "Invalid Input: Name and Email are required" }, { status: 400 });
        }

        const user = await prisma.user.upsert({
            where: { id: id || "new" },
            update: data,
            create: data,
        });

        return NextResponse.json(user);
    } catch (error) {
        return NextResponse.json({ error: "Security Exception: Update failed" }, { status: 500 });
    }
}
