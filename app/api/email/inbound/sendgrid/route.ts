export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { receiveFromSendGrid } from "@/lib/email-receiver";

/**
 * POST /api/email/inbound/sendgrid
 * SendGrid Inbound Parse webhook. SendGrid POSTs form-urlencoded data.
 */
export async function POST(request: Request) {
    try {
        const ct = request.headers.get("content-type") || "";
        let body: Record<string, any> = {};
        if (ct.includes("application/json")) {
            body = await request.json();
        } else {
            const fd = await request.formData();
            for (const [k, v] of fd.entries()) body[k] = v;
        }
        const { getDefaultTenantId } = await import("@/lib/settings/store");
        const tenantId = await getDefaultTenantId();
        if (body.to) {
            const account = await prisma.emailAccount.findFirst({ where: { email: body.to } });
            if (account) {
                const result = await receiveFromSendGrid(account.tenantId, body);
                return NextResponse.json(result);
            }
        }
        const result = await receiveFromSendGrid(tenantId, body);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error("SendGrid inbound error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
