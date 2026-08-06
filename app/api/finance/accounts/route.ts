import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountType } from '@/lib/generated-prisma';

// GET /api/finance/accounts
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') as AccountType | null;
        const includeInactive = searchParams.get('includeInactive') === 'true';

        const accounts = await prisma.chartOfAccount.findMany({
            where: {
                ...(type ? { accountType: type } : {}),
                ...(!includeInactive ? { isActive: true } : {}),
                parentId: null, // top-level only, children fetched nested
            },
            include: {
                children: {
                    include: {
                        children: {
                            include: { children: true },
                        },
                    },
                    orderBy: { accountCode: 'asc' },
                },
            },
            orderBy: { accountCode: 'asc' },
        });

        return NextResponse.json(accounts);
    } catch (error) {
        console.error('Fetch accounts error:', error);
        return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }
}

// POST /api/finance/accounts
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            accountCode, accountName, accountType, category,
            parentId, description, openingBalance, isTaxApplicable, taxRateId,
        } = body;

        if (!accountCode || !accountName || !accountType || !category) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const account = await prisma.chartOfAccount.create({
            data: {
                accountCode, accountName, accountType, category,
                parentId: parentId || null,
                description: description || null,
                openingBalance: openingBalance || 0,
                isTaxApplicable: isTaxApplicable || false,
                taxRateId: taxRateId || null,
            },
        });

        return NextResponse.json(account, { status: 201 });
    } catch (error: any) {
        console.error('Create account error:', error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Account code already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }
}
