export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/settings/store";

const ALLOWED_FIELDS = [
    "email", "displayName", "purpose",
    "smtpHost", "smtpPort", "smtpUser", "smtpPassword", "smtpSecure",
    "imapEnabled", "imapHost", "imapPort", "imapUser", "imapPassword", "imapSecure",
    "isDefault", "isActive",
];

/**
 * PATCH /api/email/accounts/[id] — update an account.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== "ADMIN" && (session.user as any).role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const tenantId = await getDefaultTenantId();
        const body = await request.json();

        // Verify ownership
        const existing = await prisma.emailAccount.findFirst({ where: { id: params.id, tenantId } });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

        // If marking as default, unset others
        if (body.isDefault === true) {
            await prisma.emailAccount.updateMany({
                where: { tenantId, isDefault: true, NOT: { id: params.id } },
                data: { isDefault: false },
            });
        }

        const data: any = {};
        for (const k of ALLOWED_FIELDS) {
            if (k in body) {
                // Don't overwrite password with empty string
                if ((k === "smtpPassword" || k === "imapPassword") && body[k] === "") continue;
                data[k] = body[k];
            }
        }
        const account = await prisma.emailAccount.update({ where: { id: params.id }, data });
        return NextResponse.json({ ...account, smtpPassword: account.smtpPassword ? "********" : "", imapPassword: account.imapPassword ? "********" : "" });
    } catch (error) {
        return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
    }
}

/**
 * DELETE /api/email/accounts/[id]
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== "ADMIN" && (session.user as any).role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const tenantId = await getDefaultTenantId();
        const existing = await prisma.emailAccount.findFirst({ where: { id: params.id, tenantId } });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (existing.isDefault) {
            return NextResponse.json({ error: "Cannot delete the default account. Set another as default first." }, { status: 400 });
        }
        await prisma.emailAccount.delete({ where: { id: params.id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
    }
}
