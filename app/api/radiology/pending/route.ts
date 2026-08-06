export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ITEM_SUB_STATUS } from '@/lib/visits/status';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || !['LAB_TECH', 'RADIOLOGIST', 'ADMIN', 'SUPER_ADMIN'].includes(session.user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const statusParam = searchParams.get('status') || 'Ordered,InProgress';
        const statuses = statusParam.split(',');

        // Consolidated visit cycle spec (R45): radiology dashboard visibility
        // defaults to InProgress + Fulfilled. AwaitingPayment (unpaid) and
        // Unfulfilled (cancelled) are hidden unless the caller explicitly asks
        // for them via `?subStatus=...`.
        const subStatusParam = searchParams.get('subStatus');
        const subStatusFilter = subStatusParam
            ? subStatusParam.split(',')
            : [ITEM_SUB_STATUS.InProgress, ITEM_SUB_STATUS.Fulfilled];

        const orders = await prisma.radiologyOrder.findMany({
            where: {
                status: { in: statuses },
                subStatus: { in: subStatusFilter },
            },
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true, gender: true, dateOfBirth: true } },
                doctor: { select: { name: true } },
                visit: { select: { visitNumber: true } },
            },
            orderBy: [
                { priority: 'desc' },
                { createdAt: 'asc' },
            ],
        });

        return NextResponse.json(orders);
    } catch (error) {
        console.error('Radiology pending error:', error);
        return NextResponse.json({ error: 'Failed to fetch pending orders' }, { status: 500 });
    }
}
