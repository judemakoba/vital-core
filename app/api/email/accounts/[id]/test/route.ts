export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/settings/store";

/**
 * POST /api/email/accounts/[id]/test — verify SMTP and (optionally) IMAP.
 * Body: { includeImap?: boolean }
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const tenantId = await getDefaultTenantId();
        const account = await prisma.emailAccount.findFirst({ where: { id: params.id, tenantId } });
        if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const { testEmailAccount } = await import("@/lib/email-client");
        const result = await testEmailAccount(account.id);
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Test failed" }, { status: 500 });
    }
}
