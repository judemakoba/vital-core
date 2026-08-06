export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/settings/store";

/**
 * GET /api/email/accounts — list EmailAccounts for the current tenant.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const tenantId = await getDefaultTenantId();
        const accounts = await prisma.emailAccount.findMany({
            where: { tenantId },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        });
        // Mask passwords in the response
        const safe = accounts.map((a) => ({ ...a, smtpPassword: a.smtpPassword ? "********" : "", imapPassword: a.imapPassword ? "********" : "" }));
        return NextResponse.json(safe);
    } catch (error) {
        return NextResponse.json({ error: "Failed to list accounts" }, { status: 500 });
    }
}

/**
 * POST /api/email/accounts — create a new EmailAccount.
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== "ADMIN" && (session.user as any).role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const tenantId = await getDefaultTenantId();
        const body = await request.json();
        if (!body.email || !body.smtpHost || !body.smtpUser || !body.smtpPassword) {
            return NextResponse.json({ error: "email, smtpHost, smtpUser, smtpPassword are required" }, { status: 400 });
        }
        // If this is marked as default, unset the others
        if (body.isDefault) {
            await prisma.emailAccount.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } });
        }
        const account = await prisma.emailAccount.create({
            data: {
                tenantId,
                email: body.email,
                displayName: body.displayName || null,
                purpose: body.purpose || "NOTIFICATIONS",
                smtpHost: body.smtpHost,
                smtpPort: body.smtpPort || 587,
                smtpUser: body.smtpUser,
                smtpPassword: body.smtpPassword,
                smtpSecure: body.smtpSecure || false,
                imapEnabled: body.imapEnabled || false,
                imapHost: body.imapHost || null,
                imapPort: body.imapPort || null,
                imapUser: body.imapUser || null,
                imapPassword: body.imapPassword || null,
                imapSecure: body.imapSecure !== false,
                isDefault: body.isDefault || false,
                isActive: body.isActive !== false,
            },
        });
        return NextResponse.json({ ...account, smtpPassword: "********", imapPassword: "********" }, { status: 201 });
    } catch (error: any) {
        if (error.code === "P2002") {
            return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }
}
