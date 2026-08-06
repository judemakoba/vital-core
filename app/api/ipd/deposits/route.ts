import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const admissionId = searchParams.get('admissionId');

        const deposits = await prisma.inpatientDeposit.findMany({
            where: admissionId ? { admissionId } : undefined,
            include: {
                receivedBy: { select: { name: true } },
                applications: {
                    include: {
                        charge: { include: { billableItem: true } },
                        invoice: true
                    }
                }
            },
            orderBy: { depositDate: 'desc' }
        });

        return NextResponse.json(deposits);
    } catch (error) {
        console.error("Failed to fetch deposits:", error);
        return NextResponse.json({ error: "Failed to fetch deposits" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { admissionId, amount, paymentMethod, notes, receiptNumber } = body;

        if (!admissionId || !amount || !paymentMethod) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Generate unique deposit number
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const count = await prisma.inpatientDeposit.count({
            where: {
                createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            }
        });
        const sequence = (count + 1).toString().padStart(4, '0');
        const depositNumber = `DEP-${dateStr}-${sequence}`;

        const deposit = await prisma.inpatientDeposit.create({
            data: {
                depositNumber,
                admissionId,
                depositDate: new Date(),
                amount: parseFloat(amount),
                paymentMethod,
                remainingBalance: parseFloat(amount),
                isFullyApplied: false,
                notes,
                receiptNumber,
                receivedById: session.user.id
            }
        });

        // Also create a standard Payment record to track it in finances? 
        // This depends on the system's ledger design. Usually Deposits go to an Unearned Revenue/Liability account.
        // For now, we trust the deposit record.

        return NextResponse.json(deposit, { status: 201 });
    } catch (error) {
        console.error("Failed to create deposit:", error);
        return NextResponse.json({ error: "Failed to create deposit" }, { status: 500 });
    }
}
