export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = (await getServerSession(authOptions)) as any;
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";
        const version = searchParams.get("version") || "ICD-11";

        if (version === "ICD-11") {
            const codes = await (prisma as any).iCD11Code.findMany({
                where: {
                    OR: [
                        { code: { contains: search, mode: "insensitive" } },
                        { title: { contains: search, mode: "insensitive" } },
                    ],
                },
                take: 20,
            });
            return NextResponse.json(codes);
        }

        // For ICD-10, we could have a similar table or a search logic if added later.
        // For now, let's just return empty or a small list of common ones if you have them.
        return NextResponse.json([]);
    } catch (error) {
        console.error("Failed to fetch ICD codes:", error);
        return NextResponse.json({ error: "Failed to fetch ICD codes" }, { status: 500 });
    }
}
