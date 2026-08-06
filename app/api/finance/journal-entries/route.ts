import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/finance/journal-entries
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') ?? '1');
        const limit = parseInt(searchParams.get('limit') ?? '20');
        const status = searchParams.get('status');
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');
        const search = searchParams.get('search') ?? '';
        const skip = (page - 1) * limit;

        const where: any = {};
        if (status) where.status = status;
        if (fromDate || toDate) {
            where.entryDate = {};
            if (fromDate) where.entryDate.gte = new Date(fromDate);
            if (toDate) {
                const to = new Date(toDate);
                // Include the whole end day
                to.setHours(23, 59, 59, 999);
                where.entryDate.lte = to;
            }
        }
        if (search) {
            where.OR = [
                { entryNumber: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { reference: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [entries, total] = await Promise.all([
            prisma.journalEntry.findMany({
                where,
                skip,
                take: limit,
                orderBy: { entryDate: 'desc' },
                include: {
                    createdBy: { select: { name: true } },
                    approvedBy: { select: { name: true } },
                    lines: {
                        include: {
                            account: { select: { accountCode: true, accountName: true } },
                        },
                    },
                },
            }),
            prisma.journalEntry.count({ where }),
        ]);

        return NextResponse.json({ entries, total, page, limit });
    } catch (error) {
        console.error('Fetch journals error:', error);
        return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 });
    }
}

// POST /api/finance/journal-entries
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { entryDate, description, reference, referenceType, lines, createdById } = body;

        if (!lines || lines.length < 2) {
            return NextResponse.json({ error: 'Journal entry requires at least 2 lines' }, { status: 400 });
        }

        const totalDebit = lines.reduce((sum: number, l: any) => sum + (l.debitAmount || 0), 0);
        const totalCredit = lines.reduce((sum: number, l: any) => sum + (l.creditAmount || 0), 0);

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            return NextResponse.json({
                error: `Journal entry is not balanced. Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}`,
            }, { status: 400 });
        }

        // Auto-generate entry number inside a transaction to avoid race conditions.
        // Per-month counter (e.g. JNL-202607-0001) so concurrent inserts don't collide.
        // Numbering format/prefix come from tenant settings.
        const { generateJournalNumber, getSetting } = await import("@/lib/formatters");
        const byMonth = await getSetting<boolean>("finance.journalNumberingByMonth", true);
        const entry = await prisma.$transaction(async (tx) => {
            const d = entryDate ? new Date(entryDate) : new Date();
            const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
            const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

            const monthCount = byMonth
                ? await tx.journalEntry.count({ where: { entryDate: { gte: monthStart, lte: monthEnd } } })
                : await tx.journalEntry.count();
            const entryNumber = await generateJournalNumber(monthCount + 1, d);

            return await tx.journalEntry.create({
                data: {
                    entryNumber,
                    entryDate: new Date(entryDate),
                    postingDate: new Date(entryDate),
                    description,
                    reference: reference || null,
                    referenceType: referenceType || 'ADJUSTMENT',
                    totalDebit,
                    totalCredit,
                    status: 'POSTED',
                    createdById,
                    lines: {
                        create: lines.map((l: any) => ({
                            accountId: l.accountId,
                            debitAmount: l.debitAmount || 0,
                            creditAmount: l.creditAmount || 0,
                            description: l.description || null,
                        })),
                    },
                },
                include: {
                    lines: {
                        include: {
                            account: { select: { accountCode: true, accountName: true } },
                        },
                    },
                },
            });
        });

        return NextResponse.json(entry, { status: 201 });
    } catch (error) {
        console.error('Create journal error:', error);
        return NextResponse.json({ error: 'Failed to create journal entry' }, { status: 500 });
    }
}
