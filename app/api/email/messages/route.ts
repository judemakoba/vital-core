export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/settings/store";
import { sendEmail } from "@/lib/email-client";

/**
 * GET /api/email/messages — list messages (inbox/outbox/unified).
 * Query params:
 *   direction = INBOUND | OUTBOUND | (omitted = both)
 *   accountId = filter by account
 *   status = filter by status
 *   patientId = filter by patient
 *   claimId = filter by claim
 *   search = subject/from/to contains
 *   threadId = only messages in a thread
 *   page, limit
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const tenantId = await getDefaultTenantId();
        const { searchParams } = new URL(request.url);
        const direction = searchParams.get("direction");
        const accountId = searchParams.get("accountId");
        const status = searchParams.get("status");
        const patientId = searchParams.get("patientId");
        const claimId = searchParams.get("claimId");
        const search = searchParams.get("search");
        const threadId = searchParams.get("threadId");
        const page = Number(searchParams.get("page") || "1");
        const limit = Math.min(Number(searchParams.get("limit") || "50"), 200);
        const skip = (page - 1) * limit;

        const where: any = { tenantId };
        if (direction === "INBOUND" || direction === "OUTBOUND") where.direction = direction;
        if (accountId) where.accountId = accountId;
        if (status) where.status = status;
        if (patientId) where.patientId = patientId;
        if (claimId) where.claimId = claimId;
        if (threadId) where.threadId = threadId;
        if (search) {
            where.OR = [
                { subject: { contains: search, mode: "insensitive" } },
                { fromAddress: { contains: search, mode: "insensitive" } },
                { toAddresses: { contains: search, mode: "insensitive" } },
                { bodyText: { contains: search, mode: "insensitive" } },
            ];
        }

        const [items, total] = await Promise.all([
            prisma.emailMessage.findMany({
                where, orderBy: { createdAt: "desc" }, skip, take: limit,
                include: {
                    account: { select: { id: true, email: true, displayName: true, purpose: true } },
                },
            }),
            prisma.emailMessage.count({ where }),
        ]);

        return NextResponse.json({ data: items, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        return NextResponse.json({ error: "Failed to list messages" }, { status: 500 });
    }
}

/**
 * POST /api/email/messages — send a new outbound email.
 * Body: SendEmailOptions
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const body = await request.json();
        if (!body.to || !body.subject) {
            return NextResponse.json({ error: "to and subject are required" }, { status: 400 });
        }
        const result = await sendEmail({ ...body, fromUserId: (session.user as any).id });
        return NextResponse.json(result, { status: result.success ? 201 : 500 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Failed to send" }, { status: 500 });
    }
}
