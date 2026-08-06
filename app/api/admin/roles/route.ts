import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        const roles = await prisma.role.findMany({
            orderBy: {
                name: 'asc'
            }
        });

        return NextResponse.json(roles, { status: 200 });

    } catch (error: any) {
        console.error("Fetch Roles Error:", error);
        return NextResponse.json({ error: "Failed to fetch roles", details: error.message }, { status: 500 });
    }
}
