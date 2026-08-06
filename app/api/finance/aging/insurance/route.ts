import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/finance/aging/insurance
 *
 * Aging buckets for AR-Insurance (account 1132):
 *   - buckets[0-30 / 31-60 / 61-90 / 90+ / 120+] based on submission date
 *   - items[] — every claim with outstanding balance (status not PAID)
 *   - totalOutstanding
 *   - byInsurer[] — totals per insurance company
 *
 * Insurance AR has a different profile from patient AR (typically pays in 30-45d).
 */
export async function GET(_req: NextRequest) {
    try {
        const now = new Date();
        const claims = await prisma.insuranceClaim.findMany({
            where: { status: { not: 'PAID' } },
            select: {
                id: true,
                claimNumber: true,
                claimDate: true,
                submissionDate: true,
                totalAmount: true,
                approvedAmount: true,
                insuranceNetAmount: true,
                status: true,
                denialReasonCode: true,
                denialCategory: true,
                appealStatus: true,
                insurance: { select: { id: true, name: true, code: true } },
                patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
            },
            orderBy: { submissionDate: 'asc' },
        });

        // Compute outstanding per claim
        const items = claims.map(c => {
            const outstanding = Math.max(
                0,
                Number(c.approvedAmount ?? c.insuranceNetAmount ?? c.totalAmount ?? 0)
            );
            const refDate = c.submissionDate ?? c.claimDate;
            const daysOld = Math.floor((now.getTime() - refDate.getTime()) / 86400000);
            let bucket: '0-30' | '31-60' | '61-90' | '90+';
            if (daysOld <= 30) bucket = '0-30';
            else if (daysOld <= 60) bucket = '31-60';
            else if (daysOld <= 90) bucket = '61-90';
            else bucket = '90+';
            return { ...c, daysOld, outstanding, bucket };
        });

        // Buckets
        const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
        for (const i of items) {
            buckets[i.bucket] += i.outstanding;
        }

        // By insurer
        const insurerMap = new Map<string, { name: string; code: string; outstanding: number; count: number }>();
        for (const i of items) {
            const cur = insurerMap.get(i.insurance.id) ?? { name: i.insurance.name, code: i.insurance.code, outstanding: 0, count: 0 };
            cur.outstanding += i.outstanding;
            cur.count += 1;
            insurerMap.set(i.insurance.id, cur);
        }
        const byInsurer = Array.from(insurerMap.entries())
            .map(([id, v]) => ({ insuranceId: id, ...v }))
            .sort((a, b) => b.outstanding - a.outstanding);

        const totalOutstanding = items.reduce((s, i) => s + i.outstanding, 0);

        return NextResponse.json({
            buckets,
            items,
            byInsurer,
            totalOutstanding,
            counts: {
                total: items.length,
                submitted: items.filter(i => i.status === 'SUBMITTED').length,
                acknowledged: items.filter(i => i.status === 'ACKNOWLEDGED').length,
                approved: items.filter(i => i.status === 'APPROVED').length,
                rejected: items.filter(i => i.status === 'REJECTED').length,
                appealed: items.filter(i => i.appealStatus === 'APPEALED').length,
            },
        });
    } catch (error) {
        console.error('Insurance AR aging error:', error);
        return NextResponse.json({ error: 'Failed to compute insurance AR aging' }, { status: 500 });
    }
}
