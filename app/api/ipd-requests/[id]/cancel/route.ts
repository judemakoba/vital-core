export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * POST /api/ipd-requests/[id]/cancel
 *
 * Doctor (the original requester) or admin can cancel a PENDING request.
 * After CANCELLED, the request is terminal — the visit can get a fresh
 * request from a doctor later if admission is still warranted.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const req = await prisma.ipdRequest.findUnique({ where: { id: params.id } });
        if (!req) {
            return NextResponse.json({ error: "IPD request not found" }, { status: 404 });
        }
        if (req.status !== "PENDING") {
            return NextResponse.json(
                { error: `Only PENDING requests can be cancelled. This request is ${req.status}.` },
                { status: 409 }
            );
        }

        // Only the requesting doctor (or an admin) can cancel.
        const isOwnRequest = req.requestedById === user.id;
        const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(user.role);
        if (!isOwnRequest && !isAdmin) {
            return NextResponse.json(
                { error: "Only the requesting doctor or an admin can cancel this request." },
                { status: 403 }
            );
        }

        const updated = await prisma.ipdRequest.update({
            where: { id: params.id },
            data: { status: "CANCELLED" },
        });
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to cancel IPD request:", error);
        return NextResponse.json({ error: "Failed to cancel IPD request" }, { status: 500 });
    }
}
