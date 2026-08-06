export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ITEM_SUB_STATUS } from "@/lib/visits/status";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== "LAB_TECH" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const statusParam = searchParams.get("status") || "Ordered";
        const statuses = statusParam.split(",");

        // Consolidated visit cycle spec (R45): lab dashboard visibility
        // defaults to orders that are ready to be worked on (InProgress) +
        // recently fulfilled (Fulfilled). AwaitingPayment (unpaid, hidden)
        // and Unfulfilled (cancelled, hidden) are excluded unless the caller
        // explicitly asks for them via `?subStatus=...`.
        const subStatusParam = searchParams.get("subStatus");
        const subStatusFilter = subStatusParam
            ? subStatusParam.split(",")
            : [ITEM_SUB_STATUS.InProgress, ITEM_SUB_STATUS.Fulfilled];

        const labOrders = await prisma.labOrder.findMany({
            where: {
                status: { in: statuses },
                subStatus: { in: subStatusFilter },
            },
            include: {
                patient: {
                    select: {
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                        gender: true,
                        dateOfBirth: true
                    }
                },
                doctor: {
                    select: {
                        name: true
                    }
                },
                visit: {
                    select: {
                        visitNumber: true
                    }
                }
            },
            orderBy: [
                { priority: "desc" },
                { createdAt: "asc" }
            ]
        });

        return NextResponse.json(labOrders);
    } catch (error) {
        console.error("Failed to fetch lab orders:", error);
        return NextResponse.json({ error: "Failed to fetch lab orders" }, { status: 500 });
    }
}
