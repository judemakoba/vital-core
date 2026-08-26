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

        // Pick the right Prisma model by version. Default to ICD-11 if
        // the caller didn't specify (or specified something unknown).
        const modelName = version === "ICD-10" ? "iCD10Code" : "iCD11Code";
        const versionTag = version === "ICD-10" ? "ICD-10" : "ICD-11";

        const codes = await (prisma as any)[modelName].findMany({
            where: {
                OR: [
                    { code: { contains: search, mode: "insensitive" } },
                    { title: { contains: search, mode: "insensitive" } },
                ],
            },
            take: 20,
            orderBy: { code: "asc" },
        });

        // Tag each row with the version so the UI can label them.
        // The code/title are the same shape across both models.
        return NextResponse.json(codes.map((c: any) => ({ ...c, version: versionTag })));
    } catch (error) {
        console.error("Failed to fetch ICD codes:", error);
        return NextResponse.json({ error: "Failed to fetch ICD codes" }, { status: 500 });
    }
}
