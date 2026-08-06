import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountingService } from '@/lib/finance/accounting-service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// GET /api/finance/expenses
// Returns expenses with optional date range, category, and search filters.
// Response shape: { expenses, total, totalAmount, count }
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');
        const category = searchParams.get('category');
        const search = searchParams.get('search') ?? '';

        const where: any = {};
        if (fromDate || toDate) {
            where.date = {};
            if (fromDate) where.date.gte = new Date(fromDate);
            if (toDate) {
                const to = new Date(toDate);
                to.setHours(23, 59, 59, 999);
                where.date.lte = to;
            }
        }
        if (category) where.category = category;
        if (search) {
            where.OR = [
                { description: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [expenses, totalAmount] = await Promise.all([
            prisma.expense.findMany({
                where,
                include: { recordedBy: { select: { name: true, email: true } } },
                orderBy: { date: 'desc' },
            }),
            prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
        ]);

        return NextResponse.json({
            expenses,
            totalAmount: totalAmount._sum.amount ?? 0,
            count: totalAmount._count,
        });
    } catch (error) {
        console.error('Expenses fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
    }
}

// POST /api/finance/expenses
// Records a manual operating expense. Auto-posts to ledger.
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ACCOUNTANT')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { category, description, amount, date, paymentMethod } = body;

        if (!category || !description || !amount) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        const amt = Number(amount);
        if (amt <= 0) {
            return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
        }

        const expense = await prisma.expense.create({
            data: {
                category,
                description,
                amount: amt,
                date: date ? new Date(date) : new Date(),
                paymentMethod: paymentMethod || null,
                recordedById: session.user.id,
            },
        });

        // Auto-post to ledger
        try {
            await AccountingService.postExpenseToLedger(expense.id, session.user.id);
        } catch (ledgerError) {
            console.error('Failed to post manual expense to ledger:', ledgerError);
        }

        return NextResponse.json(expense, { status: 201 });
    } catch (error) {
        console.error('Expense create error:', error);
        return NextResponse.json({ error: 'Failed to record expense' }, { status: 500 });
    }
}
