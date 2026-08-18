export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * POST /api/ipd-requests/[id]/approve
 *
 * Admin / reception / super_admin marks the request as APPROVED.
 * Approval means the clinical decision is accepted — admin will then
 * fulfil it (assign ward/bed, transition the visit, create admission)
 * via POST /api/ipd-requests/[id]/fulfill.
 *
 * Optional: override the doctor's preferred ward/bed type here.
 * Optional: add review notes (shown in the queue).
 */
const APPROVER_ROLES = ["ADMIN", "RECEPTIONIST", "SUPER_ADMIN"];

export async function POST(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (!APPROVER_ROLES.includes(user.role)) {
            return NextResponse.json(
                { error: `Only admin / reception / super_admin can approve (your role: ${user.role}).` },
                { status: 403 }
            );
        }

        const req = await prisma.ipdRequest.findUnique({ where: { id: params.id } });
        if (!req) {
            return NextResponse.json({ error: "IPD request not found" }, { status: 404 });
        }
        if (req.status !== "PENDING") {
            return NextResponse.json(
                { error: `Only PENDING requests can be approved. This request is ${req.status}.` },
                { status: 409 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const updateData: any = {
            status: "APPROVED",
            reviewedById: user.id,
            reviewedAt: new Date(),
        };
        if (typeof body.reviewNotes === "string") updateData.reviewNotes = body.reviewNotes;
        if (typeof body.preferredWardId === "string") updateData.preferredWardId = body.preferredWardId;
        if (typeof body.preferredBedType === "string") updateData.preferredBedType = body.preferredBedType;

        const updated = await prisma.ipdRequest.update({
            where: { id: params.id },
            data: updateData,
            include: {
                visit: { include: { patient: true } },
                requestedBy: { select: { id: true, name: true } },
                reviewedBy: { select: { id: true, name: true } },
                preferredWard: { select: { id: true, name: true } },
            },
        });
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to approve IPD request:", error);
        return NextResponse.json({ error: "Failed to approve IPD request" }, { status: 500 });
    }
}
