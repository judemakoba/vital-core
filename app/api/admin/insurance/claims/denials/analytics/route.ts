export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/finance/denial-categorization';
import { DenialCategory } from '@/lib/generated-prisma';

/**
 * GET /api/admin/insurance/claims/denials/analytics
 *
 * Denial analytics dashboard data:
 *   - totalClaims, deniedClaims, denialRate
 *   - topReasons[] (by code, with count + totalAmount)
 *   - byCategory[] (TECHNICAL / AUTHORIZATION / etc.)
 *   - byInsurer[] (denial rate per insurance company)
 *   - appealStats (won/lost/pending counts + win rate)
 *   - monthlyTrend[] (last 6 months denial counts)
 *   - writeOffTotal, writeOffByCategory
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const insuranceId = searchParams.get('insuranceId');
        const fromStr = searchParams.get('from');
        const toStr = searchParams.get('to');

        const where: any = {};
        if (insuranceId) where.insuranceId = insuranceId;
        if (fromStr || toStr) {
            where.claimDate = {};
            if (fromStr) where.claimDate.gte = new Date(fromStr);
            if (toStr) where.claimDate.lte = new Date(toStr);
        }

        // Pull all relevant claims in one shot
        const [allClaims, deniedClaims] = await Promise.all([
            prisma.insuranceClaim.findMany({
                where,
                select: {
                    id: true,
                    claimNumber: true,
                    status: true,
                    totalAmount: true,
                    denialReasonCode: true,
                    denialCategory: true,
                    denialWriteOffAmount: true,
                    appealStatus: true,
                    insuranceId: true,
                    insurance: { select: { id: true, name: true, code: true } },
                    claimDate: true,
                },
            }),
            prisma.insuranceClaim.findMany({
                where: { ...where, status: 'REJECTED' },
                select: {
                    id: true,
                    claimNumber: true,
                    totalAmount: true,
                    denialReasonCode: true,
                    denialCategory: true,
                    denialWriteOffAmount: true,
                    appealStatus: true,
                    insurance: { select: { id: true, name: true, code: true } },
                    claimDate: true,
                },
            }),
        ]);

        const totalClaims = allClaims.length;
        const deniedCount = deniedClaims.length;
        const denialRate = totalClaims > 0 ? (deniedCount / totalClaims) * 100 : 0;

        // Top reasons — group by code
        const reasonMap = new Map<string, { count: number; amount: number }>();
        for (const c of deniedClaims) {
            const code = c.denialReasonCode ?? 'OTHER';
            const cur = reasonMap.get(code) ?? { count: 0, amount: 0 };
            cur.count += 1;
            cur.amount += Number(c.totalAmount ?? 0);
            reasonMap.set(code, cur);
        }
        const topReasons = Array.from(reasonMap.entries())
            .map(([code, v]) => ({ code, count: v.count, totalAmount: v.amount }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // By category
        const categoryMap = new Map<string, { count: number; amount: number; writeOff: number }>();
        for (const c of deniedClaims) {
            const cat = c.denialCategory ?? 'OTHER';
            const cur = categoryMap.get(cat) ?? { count: 0, amount: 0, writeOff: 0 };
            cur.count += 1;
            cur.amount += Number(c.totalAmount ?? 0);
            cur.writeOff += Number(c.denialWriteOffAmount ?? 0);
            categoryMap.set(cat, cur);
        }
        const byCategory = Array.from(categoryMap.entries())
            .map(([key, v]) => ({
                category: key as DenialCategory,
                label: CATEGORY_LABELS[key as DenialCategory] ?? key,
                color: CATEGORY_COLORS[key as DenialCategory] ?? '#64748b',
                count: v.count,
                totalAmount: v.amount,
                writeOffAmount: v.writeOff,
            }))
            .sort((a, b) => b.count - a.count);

        // By insurer
        const insurerMap = new Map<string, { name: string; code: string; total: number; denied: number; writeOff: number }>();
        for (const c of allClaims) {
            const cur = insurerMap.get(c.insuranceId) ?? { name: c.insurance.name, code: c.insurance.code, total: 0, denied: 0, writeOff: 0 };
            cur.total += 1;
            insurerMap.set(c.insuranceId, cur);
        }
        for (const c of deniedClaims) {
            const cur = insurerMap.get(c.insuranceId);
            if (cur) {
                cur.denied += 1;
                cur.writeOff += Number(c.denialWriteOffAmount ?? 0);
            }
        }
        const byInsurer = Array.from(insurerMap.entries())
            .map(([id, v]) => ({
                insuranceId: id,
                name: v.name,
                code: v.code,
                totalClaims: v.total,
                deniedClaims: v.denied,
                denialRate: v.total > 0 ? (v.denied / v.total) * 100 : 0,
                writeOffAmount: v.writeOff,
            }))
            .sort((a, b) => b.denialRate - a.denialRate);

        // Appeal stats
        const appealed = deniedClaims.filter(c => c.appealStatus && c.appealStatus !== 'NOT_APPEALED');
        const won = deniedClaims.filter(c => c.appealStatus === 'WON').length;
        const lost = deniedClaims.filter(c => c.appealStatus === 'LOST').length;
        const pending = deniedClaims.filter(c => c.appealStatus === 'APPEALED').length;
        const appealStats = {
            totalAppealed: appealed.length,
            won,
            lost,
            pending,
            winRate: (won + lost) > 0 ? (won / (won + lost)) * 100 : 0,
        };

        // Monthly trend — last 6 months
        const now = new Date();
        const monthlyTrend: { month: string; total: number; denied: number }[] = [];
        for (let i = 5; i >= 0; i--) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            const total = allClaims.filter(c => c.claimDate >= start && c.claimDate < end).length;
            const denied = deniedClaims.filter(c => c.claimDate >= start && c.claimDate < end).length;
            const label = start.toLocaleString('en-US', { month: 'short', year: '2-digit' });
            monthlyTrend.push({ month: label, total, denied });
        }

        // Write-off total
        const writeOffTotal = deniedClaims.reduce((s, c) => s + Number(c.denialWriteOffAmount ?? 0), 0);
        const writeOffByCategory = byCategory
            .filter(c => c.writeOffAmount > 0)
            .map(c => ({ category: c.category, label: c.label, color: c.color, writeOffAmount: c.writeOffAmount }));

        return NextResponse.json({
            summary: {
                totalClaims,
                deniedClaims: deniedCount,
                denialRate: Math.round(denialRate * 10) / 10,
                writeOffTotal,
            },
            topReasons,
            byCategory,
            byInsurer,
            appealStats,
            monthlyTrend,
            writeOffByCategory,
        });
    } catch (error) {
        console.error('Denial analytics error:', error);
        return NextResponse.json({ error: 'Failed to compute denial analytics' }, { status: 500 });
    }
}
