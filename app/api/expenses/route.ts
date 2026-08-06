export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AccountingService } from "@/lib/finance/accounting-service";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const expenses = await prisma.expense.findMany({
            include: { recordedBy: { select: { name: true } } },
            orderBy: { date: "desc" }
        });

        return NextResponse.json(expenses);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { category, description, amount, date, paymentMethod } = body;

        const expense = await prisma.expense.create({
            data: {
                category,
                description,
                amount: parseFloat(amount),
                date: date ? new Date(date) : new Date(),
                paymentMethod,
                recordedById: session.user.id
            }
        });

        // Automatically post to ledger
        try {
            await AccountingService.postExpenseToLedger(expense.id, session.user.id);
        } catch (ledgerError) {
            console.error('Failed to post manual expense to ledger:', ledgerError);
            // We don't block the expense creation if ledger fails, but in a strict system we might.
        }

        return NextResponse.json(expense, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to record expense" }, { status: 500 });
    }
}
