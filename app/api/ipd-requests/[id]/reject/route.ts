export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * POST /api/ipd-requests/[id]/reject
 *
 * Admin / reception / super_admin rejects a PENDING request. Requires
 * a `reviewNotes` reason for the audit trail. Terminal state — the
 * visit can still get a new IPD request from a doctor later if the
 * clinical picture changes.
 */
const REVIEWER_ROLES = ["ADMIN", "RECEPTIONIST", "SUPER_ADMIN"];

export async function POST(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!REVIEWER_ROLES.includes(user.role)) {
            return NextResponse.json(
                { error: `Only admin / reception / super_admin can reject (your role: ${user.role}).` },
                { status: 403 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const reason = (body.reviewNotes || "").trim();
        if (!reason) {
            return NextResponse.json(
                { error: "reviewNotes is required when rejecting an IPD request (reason for rejection)." },
                { status: 400 }
            );
        }

        const req = await prisma.ipdRequest.findUnique({ where: { id: params.id } });
        if (!req) {
            return NextResponse.json({ error: "IPD request not found" }, { status: 404 });
        }
        if (req.status !== "PENDING") {
            return NextResponse.json(
                { error: `Only PENDING requests can be rejected. This request is ${req.status}.` },
                { status: 409 }
            );
        }

        const updated = await prisma.ipdRequest.update({
            where: { id: params.id },
            data: {
                status: "REJECTED",
                reviewedById: user.id,
                reviewedAt: new Date(),
                reviewNotes: reason,
            },
        });
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to reject IPD request:", error);
        return NextResponse.json({ error: "Failed to reject IPD request" }, { status: 500 });
    }
}
