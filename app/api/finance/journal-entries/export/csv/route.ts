export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/finance/journal-entries/export/csv
// Streams journal entries as CSV. Supports same date/status filters as the list endpoint.
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');
        const search = searchParams.get('search') ?? '';

        const where: any = {};
        if (status) where.status = status;
        if (fromDate || toDate) {
            where.entryDate = {};
            if (fromDate) where.entryDate.gte = new Date(fromDate);
            if (toDate) {
                const to = new Date(toDate);
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

        const entries = await prisma.journalEntry.findMany({
            where,
            orderBy: { entryDate: 'desc' },
            include: {
                createdBy: { select: { name: true, email: true } },
                lines: {
                    include: {
                        account: { select: { accountCode: true, accountName: true } },
                    },
                },
            },
        });

        // CSV: one row per journal line
        const headers = [
            'Entry #', 'Date', 'Description', 'Reference', 'Ref Type', 'Status',
            'Account Code', 'Account Name', 'Line Description', 'Debit', 'Credit',
            'Total Debit', 'Total Credit', 'Created By',
        ];
        const rows: string[][] = [];
        for (const e of entries) {
            for (const line of e.lines) {
                rows.push([
                    e.entryNumber,
                    new Date(e.entryDate).toISOString().slice(0, 10),
                    e.description,
                    e.reference ?? '',
                    e.referenceType,
                    e.status,
                    line.account.accountCode,
                    line.account.accountName,
                    line.description ?? '',
                    line.debitAmount.toFixed(2),
                    line.creditAmount.toFixed(2),
                    e.totalDebit.toFixed(2),
                    e.totalCredit.toFixed(2),
                    e.createdBy?.name ?? e.createdBy?.email ?? '',
                ]);
            }
        }

        // Properly escape CSV (handle commas, quotes, newlines)
        const escape = (s: string) => {
            if (s == null) return '';
            const str = String(s);
            if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };
        const csv = [
            headers.map(escape).join(','),
            ...rows.map(r => r.map(escape).join(',')),
        ].join('\r\n');

        const filename = `journal-entries-${new Date().toISOString().slice(0, 10)}.csv`;
        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error('Journal CSV export error:', error);
        return NextResponse.json({ error: 'Failed to export journal entries' }, { status: 500 });
    }
}
