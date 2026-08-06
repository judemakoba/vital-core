export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== 'PHARMACIST' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';
        const drugId = searchParams.get('drugId');

        const batches = await prisma.drugBatch.findMany({
            where: {
                AND: [
                    drugId ? { drugId } : {},
                    { quantityRemaining: { gt: 0 } }, // only batches with stock
                    search ? {
                        OR: [
                            { batchNumber: { contains: search, mode: 'insensitive' } },
                            { drug: { name: { contains: search, mode: 'insensitive' } } },
                            { drug: { genericName: { contains: search, mode: 'insensitive' } } }
                        ]
                    } : {}
                ]
            },
            include: {
                drug: {
                    select: {
                        name: true,
                        genericName: true,
                        dosageForm: true,
                        strength: true
                    }
                },
                supplier: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                expiryDate: 'asc' // FEFO: soonest-expiry first, valid batches naturally come first
            }
        });

        const now = new Date();
        // Annotate each batch with isExpired so the UI can block selection and warn the pharmacist
        const annotated = batches.map(b => ({
            ...b,
            isExpired: new Date(b.expiryDate) < now,
        }));

        return NextResponse.json(annotated);
    } catch (error) {
        console.error('Failed to fetch batches:', error);
        return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 });
    }
}
