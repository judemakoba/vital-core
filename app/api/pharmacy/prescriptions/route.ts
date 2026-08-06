export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ITEM_SUB_STATUS, VISIT_STATUS } from '@/lib/visits/status';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== 'PHARMACIST' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';

        // Fetch visits that have pending prescriptions.
        //
        // Visit status filter is intentionally BROAD: a visit may be in "Radiology"
        // or "Laboratory" status because the doctor also ordered imaging/labs, but
        // it can still have a Pending prescription that needs dispensing. Patients
        // don't always do pharmacy first — they may bounce between Lab → Radiology
        // → Pharmacy. The pharmacy queue should show ALL visits with unfilled
        // prescriptions, regardless of the current "stage" the visit is in.
        //
        // We exclude only terminal states where dispensing makes no sense
        // (Cancelled, no-show, Discontinued). "Completed" stays in so a late
        // pickup is still visible to the pharmacist.
        //
        // R51 (lock removal): prescription visibility is NO LONGER gated on
        // `subStatus = InProgress`. The pharmacist can dispense an
        // AwaitingPayment prescription — the dispense route creates the
        // standalone TaxInvoice and transitions the prescription through
        // InProgress → Fulfilled in one transaction. This decouples
        // dispensing from the cashier's payment timing (pharmacy no
        // longer waits for the patient to pay before processing the
        // prescription).
        //
        // `Unfulfilled` (cancelled/90-min-written-off) stays hidden.
        const BLOCKED_VISIT_STATUSES = ['Cancelled', 'NoShow', 'No-Show', VISIT_STATUS.Discontinued];
        const visits = await prisma.visit.findMany({
            where: {
                AND: [
                    { status: { notIn: BLOCKED_VISIT_STATUSES } },
                    {
                        prescriptions: {
                            some: {
                                status: 'Pending',
                                // R51: removed the subStatus: InProgress gate
                                // so the pharmacist sees AwaitingPayment prescriptions too.
                                subStatus: { not: ITEM_SUB_STATUS.Unfulfilled },
                            },
                        },
                    },
                    search ? {
                        OR: [
                            { patient: { firstName: { contains: search, mode: 'insensitive' } } },
                            { patient: { lastName: { contains: search, mode: 'insensitive' } } },
                            { patient: { patientNumber: { contains: search, mode: 'insensitive' } } },
                            { visitNumber: { contains: search, mode: 'insensitive' } }
                        ]
                    } : {}
                ]
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                        allergies: true
                    }
                },
                prescriptions: {
                    where: {
                        status: 'Pending',
                        // R51: same filter on the include — show AwaitingPayment + InProgress
                        subStatus: { not: ITEM_SUB_STATUS.Unfulfilled },
                    },
                    include: {
                        doctor: {
                            select: {
                                name: true
                            }
                        },
                        drug: {
                            select: {
                                id: true, name: true, genericName: true,
                                strength: true, strengthValue: true, strengthUnit: true,
                                dosageForm: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'asc' // oldest (longest-waiting) first within each priority group
            }
        });

        // Priority sort: visits whose current stage is PendingOrders bubble to
        // the top (actively dispatched to the pharmacy queue), then everything
        // else in oldest-first order.
        const prioritized = [
            ...visits.filter(v => v.status === VISIT_STATUS.PendingOrders),
            ...visits.filter(v => v.status !== VISIT_STATUS.PendingOrders),
        ];

        return NextResponse.json(prioritized);
    } catch (error) {
        console.error('Failed to fetch prescriptions:', error);
        return NextResponse.json({ error: 'Failed to fetch prescriptions' }, { status: 500 });
    }
}
