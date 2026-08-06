export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/settings/store";
import { receiveFromPostmark } from "@/lib/email-receiver";

/**
 * POST /api/email/inbound/postmark
 * Postmark inbound webhook. Configure your Postmark inbound stream
 * to forward to this URL.
 *
 * We route the inbound message to the tenant of the matched EmailAccount
 * (matched by the To: address).
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        // If Postmark is configured to forward to multiple tenants, the
        // account lookup will determine the tenant. For single-tenant
        // installs, we use the default tenant.
        const { getDefaultTenantId } = await import("@/lib/settings/store");
        const tenantId = await getDefaultTenantId();
        // (multi-tenant routing: look at body.To and find the matching EmailAccount's tenant)
        if (body?.To) {
            const account = await prisma.emailAccount.findFirst({ where: { email: body.To } });
            if (account) {
                const result = await receiveFromPostmark(account.tenantId, body);
                return NextResponse.json(result);
            }
        }
        const result = await receiveFromPostmark(tenantId, body);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Postmark inbound error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
