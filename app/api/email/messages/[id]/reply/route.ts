export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from "@/lib/email-client";

/**
 * POST /api/email/messages/[id]/reply
 * Body: { to?, cc?, bcc?, subject?, bodyHtml?, bodyText? }
 *
 * Threads correctly via inReplyToId. Pre-fills To/Subject from the original
 * if not provided.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const { prisma } = await import("@/lib/prisma");
        const original = await prisma.emailMessage.findUnique({ where: { id: params.id } });
        if (!original) return NextResponse.json({ error: "Original message not found" }, { status: 404 });

        const body = await request.json();
        const to = body.to || (original.direction === "INBOUND" ? original.fromAddress : original.toAddresses);
        const subject = body.subject || (original.subject.startsWith("Re:") ? original.subject : `Re: ${original.subject}`);
        const html = body.bodyHtml;
        const text = body.bodyText;
        if (!to || (!html && !text)) {
            return NextResponse.json({ error: "to and body are required" }, { status: 400 });
        }

        const result = await sendEmail({
            to,
            cc: body.cc,
            bcc: body.bcc,
            subject,
            html,
            text,
            inReplyToId: original.id,
            fromUserId: (session.user as any).id,
            patientId: original.patientId || undefined,
            claimId: original.claimId || undefined,
            visitId: original.visitId || undefined,
            appointmentId: original.appointmentId || undefined,
            labOrderId: original.labOrderId || undefined,
        });
        return NextResponse.json(result, { status: result.success ? 201 : 500 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Failed to reply" }, { status: 500 });
    }
}
