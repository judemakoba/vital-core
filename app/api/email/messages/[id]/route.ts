export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/settings/store";

/**
 * GET /api/email/messages/[id] — message detail with thread context.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const tenantId = await getDefaultTenantId();
        const message = await prisma.emailMessage.findFirst({
            where: { id: params.id, tenantId },
            include: {
                account: { select: { id: true, email: true, displayName: true, purpose: true } },
                inReplyTo: { select: { id: true, subject: true, fromAddress: true, sentAt: true } },
            },
        });
        if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
        // Mark as read if inbound
        if (message.direction === "INBOUND" && !message.readAt) {
            await prisma.emailMessage.update({ where: { id: message.id }, data: { readAt: new Date(), status: message.status === "DELIVERED" ? "READ" : message.status } });
        }
        // Get the thread (if any)
        const thread = message.threadId
            ? await prisma.emailMessage.findMany({
                  where: { tenantId, threadId: message.threadId },
                  orderBy: { createdAt: "asc" },
                  include: { account: { select: { email: true, displayName: true } } },
              })
            : [message];
        return NextResponse.json({ message, thread });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch message" }, { status: 500 });
    }
}

/**
 * PATCH /api/email/messages/[id] — mark as read / archived.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const tenantId = await getDefaultTenantId();
        const body = await request.json();
        const data: any = {};
        if (body.status) data.status = body.status;
        if (body.readAt === true) {
            data.readAt = new Date();
            const m = await prisma.emailMessage.findUnique({ where: { id: params.id } });
            if (m?.status === "DELIVERED") data.status = "READ";
        }
        const updated = await prisma.emailMessage.update({ where: { id: params.id }, data });
        return NextResponse.json(updated);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
}
