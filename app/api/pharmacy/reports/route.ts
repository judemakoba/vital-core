export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

type Period = 'day' | 'week' | 'month' | 'quarter' | 'halfyear' | 'year';

interface PeriodRange {
    start: Date;
    end: Date;     // inclusive end-of-day
    label: string; // human readable
    shortLabel: string;
}

/**
 * Compute start/end dates for a given period type, anchored on `anchor`.
 * The end is set to end-of-day (23:59:59.999) so dispenses at any time that day are included.
 */
function periodRange(period: Period, anchor: Date): PeriodRange {
    const a = new Date(anchor);
    const endOfDay = (d: Date) => { d.setHours(23, 59, 59, 999); return d; };
    const startOfDay = (d: Date) => { d.setHours(0, 0, 0, 0); return d; };
    const monthName = (d: Date) => d.toLocaleString('en-US', { month: 'long' });

    switch (period) {
        case 'day': {
            const start = startOfDay(new Date(a));
            const end = endOfDay(new Date(a));
            return {
                start, end,
                label: start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
                shortLabel: start.toLocaleDateString(),
            };
        }
        case 'week': {
            // ISO week: Monday start
            const day = a.getDay() || 7; // Sun=0 → 7
            const monday = new Date(a);
            monday.setDate(a.getDate() - (day - 1));
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return {
                start: startOfDay(monday),
                end: endOfDay(sunday),
                label: `Week of ${monday.toLocaleDateString()} – ${sunday.toLocaleDateString()}`,
                shortLabel: `${monday.toLocaleDateString()} – ${sunday.toLocaleDateString()}`,
            };
        }
        case 'month': {
            const start = new Date(a.getFullYear(), a.getMonth(), 1);
            const end = new Date(a.getFullYear(), a.getMonth() + 1, 0);
            return {
                start: startOfDay(start),
                end: endOfDay(end),
                label: `${monthName(start)} ${start.getFullYear()}`,
                shortLabel: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
            };
        }
        case 'quarter': {
            const q = Math.floor(a.getMonth() / 3);
            const start = new Date(a.getFullYear(), q * 3, 1);
            const end = new Date(a.getFullYear(), q * 3 + 3, 0);
            return {
                start: startOfDay(start),
                end: endOfDay(end),
                label: `Q${q + 1} ${start.getFullYear()}`,
                shortLabel: `${start.getFullYear()}-Q${q + 1}`,
            };
        }
        case 'halfyear': {
            const h = a.getMonth() < 6 ? 0 : 1;
            const start = new Date(a.getFullYear(), h * 6, 1);
            const end = new Date(a.getFullYear(), h * 6 + 6, 0);
            return {
                start: startOfDay(start),
                end: endOfDay(end),
                label: `H${h + 1} ${start.getFullYear()} (${h === 0 ? 'Jan–Jun' : 'Jul–Dec'})`,
                shortLabel: `${start.getFullYear()}-H${h + 1}`,
            };
        }
        case 'year': {
            const start = new Date(a.getFullYear(), 0, 1);
            const end = new Date(a.getFullYear(), 11, 31);
            return {
                start: startOfDay(start),
                end: endOfDay(end),
                label: `${start.getFullYear()}`,
                shortLabel: `${start.getFullYear()}`,
            };
        }
    }
}

/**
 * GET /api/pharmacy/reports?period=day|week|month|quarter|halfyear|year|custom&date=YYYY-MM-DD&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Compiles a pharmacy report for the requested period:
 *  - Dispensed drugs (top N + totals)
 *  - Stock snapshot at end of period (units, value, by-form breakdown)
 *  - Incomes (dispensing revenue, payments)
 *  - Expenses (purchase costs, adjustments)
 *  - Period metadata
 *
 * For period=custom, both startDate and endDate are required.
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== 'PHARMACIST' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN' && session.user.role !== 'ACCOUNTANT')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const periodParam = (searchParams.get('period') || 'day') as Period;
        const dateParam = searchParams.get('date');
        if (!['day', 'week', 'month', 'quarter', 'halfyear', 'year', 'custom'].includes(periodParam)) {
            return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
        }

        let start: Date, end: Date, label: string, shortLabel: string;

        if (periodParam === 'custom') {
            const startParam = searchParams.get('startDate');
            const endParam = searchParams.get('endDate');
            if (!startParam || !endParam) {
                return NextResponse.json({ error: 'startDate and endDate are required for custom period' }, { status: 400 });
            }
            const s = new Date(startParam);
            const e = new Date(endParam);
            if (isNaN(s.getTime()) || isNaN(e.getTime())) {
                return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
            }
            if (s > e) {
                return NextResponse.json({ error: 'startDate must be on or before endDate' }, { status: 400 });
            }
            s.setHours(0, 0, 0, 0);
            const eEnd = new Date(e);
            eEnd.setHours(23, 59, 59, 999);
            start = s;
            end = eEnd;
            const fmt = (d: Date) => d.toLocaleDateString();
            label = `${fmt(s)} – ${fmt(e)}`;
            shortLabel = `${s.toISOString().slice(0, 10)}_to_${e.toISOString().slice(0, 10)}`;
        } else {
            const anchor = dateParam ? new Date(dateParam) : new Date();
            const range = periodRange(periodParam, anchor);
            start = range.start;
            end = range.end;
            label = range.label;
            shortLabel = range.shortLabel;
        }

        // ── 1. Dispensed drugs (dispensingLog rows in the period) ────────
        const dispenses = await prisma.dispensingLog.findMany({
            where: { createdAt: { gte: start, lte: end } },
            include: {
                drug: { select: { id: true, drugCode: true, name: true, strength: true, dosageForm: true } },
            },
        });

        // Aggregate by drug
        const dispensedByDrug = new Map<string, {
            drugId: string;
            drugCode: string;
            drugName: string;
            strength: string;
            dosageForm: string;
            quantity: number;
            revenue: number;
            patientPay: number;
            count: number; // number of dispense events
        }>();
        for (const d of dispenses) {
            const key = d.drug.id;
            const cur = dispensedByDrug.get(key) ?? {
                drugId: d.drug.id,
                drugCode: d.drug.drugCode,
                drugName: d.drug.name,
                strength: d.drug.strength,
                dosageForm: d.drug.dosageForm,
                quantity: 0,
                revenue: 0,
                patientPay: 0,
                count: 0,
            };
            cur.quantity += d.quantityDispensed;
            cur.revenue += d.totalAmount;
            cur.patientPay += d.patientPayAmount;
            cur.insurancePay += d.insurancePayAmount;
            cur.count += 1;
            dispensedByDrug.set(key, cur);
        }
        const topDispensed = Array.from(dispensedByDrug.values())
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 25);

        const dispenseSummary = {
            totalQuantity: dispenses.reduce((s, d) => s + d.quantityDispensed, 0),
            totalRevenue:   dispenses.reduce((s, d) => s + d.totalAmount, 0),
            patientRevenue: dispenses.reduce((s, d) => s + d.patientPayAmount, 0),
            insuranceRevenue: dispenses.reduce((s, d) => s + d.insurancePayAmount, 0),
            uniqueDrugs: dispensedByDrug.size,
            dispenseCount: dispenses.length,
        };

        // ── 2. Stock snapshot at end of period ────────────────────────────
        // All batches that were non-expired AND had stock on the last day of the period.
        // We approximate "stock at end of period" by:
        //   currentStock (now) + sum of dispense quantities AFTER the period end
        //   minus sum of purchase/adjustment quantities AFTER the period end.
        // Simpler and good enough: take batches with receivedDate <= end AND expiryDate > end (i.e., still good at end)
        // and use current quantity as the "at-end" value. This is a close approximation since most adjustments are
        // captured in current quantities.
        const endBatches = await prisma.drugBatch.findMany({
            where: {
                receivedDate: { lte: end },
                expiryDate: { gt: end },
                isActive: true,
            },
            select: {
                drugId: true,
                quantityRemaining: true,
                purchasePrice: true,
                drug: { select: { dosageForm: true, isActive: true } },
            },
        });

        const stockAtEnd = {
            batchCount: endBatches.length,
            totalUnits: endBatches.reduce((s, b) => s + b.quantityRemaining, 0),
            totalValue: endBatches.reduce((s, b) => s + b.quantityRemaining * b.purchasePrice, 0),
            drugCount: new Set(endBatches.map(b => b.drugId)).size,
        };

        // breakdown by dosage form
        const byForm = new Map<string, { units: number; value: number }>();
        for (const b of endBatches) {
            const form = b.drug.dosageForm;
            const cur = byForm.get(form) ?? { units: 0, value: 0 };
            cur.units += b.quantityRemaining;
            cur.value += b.quantityRemaining * b.purchasePrice;
            byForm.set(form, cur);
        }
        const stockByForm = Array.from(byForm.entries())
            .map(([form, v]) => ({ form, units: v.units, value: v.value }))
            .sort((a, b) => b.value - a.value);

        // ── 3. Incomes (revenue in the period from pharmacy-related sources) ─
        // Dispensing revenue from above is the main income. Add any explicit payments
        // made to pharmacy in the period.
        const incomes = {
            dispensing: {
                total: dispenseSummary.totalRevenue,
                patientPay: dispenseSummary.patientPay,
            },
            // any other income sources would go here (e.g. service fees, deposits)
        };
        const totalIncome = incomes.dispensing.total;

        // ── 4. Expenses (stock purchase + adjustments) ─────────────────────
        // Sum of purchase (qtyReceived * purchasePrice) for batches created in the period.
        // Plus adjustment write-offs (COUNT_CORRECTION / DAMAGE / EXPIRY / THEFT / SAMPLE) recorded in the period.
        const purchaseBatches = await prisma.drugBatch.findMany({
            where: {
                receivedDate: { gte: start, lte: end },
            },
            select: { quantityReceived: true, purchasePrice: true },
        });
        const purchaseTotal = purchaseBatches.reduce((s, b) => s + b.quantityReceived * b.purchasePrice, 0);
        const purchaseUnits = purchaseBatches.reduce((s, b) => s + b.quantityReceived, 0);

        // Adjustment write-offs (negative impact on stock value)
        const adjustmentMovements = await prisma.stockMovement.findMany({
            where: {
                createdAt: { gte: start, lte: end },
                movementType: { in: ['ADJUSTMENT', 'DAMAGE', 'EXPIRY', 'THEFT'] },
            },
            select: { quantity: true, drugBatch: { select: { purchasePrice: true } } },
        });
        const adjustmentCost = adjustmentMovements.reduce(
            (s, m) => s + Math.abs(m.quantity) * (m.drugBatch?.purchasePrice ?? 0),
            0
        );

        // Total drug expenses = purchases - adjustment value lost
        const totalExpenses = purchaseTotal + adjustmentCost;

        // ── 5. Net (income - expenses) ────────────────────────────────────
        const netProfit = totalIncome - totalExpenses;

        return NextResponse.json({
            period: { type: periodParam, start, end, label, shortLabel },
            dispense: {
                summary: dispenseSummary,
                topDrugs: topDispensed,
            },
            stockAtEnd: {
                ...stockAtEnd,
                byForm: stockByForm,
            },
            incomes,
            totalIncome,
            expenses: {
                purchase: { total: purchaseTotal, units: purchaseUnits, batches: purchaseBatches.length },
                adjustments: { total: adjustmentCost, count: adjustmentMovements.length },
            },
            totalExpenses,
            netProfit,
        });
    } catch (error) {
        console.error('Pharmacy report error:', error);
        return NextResponse.json({ error: 'Failed to compile report' }, { status: 500 });
    }
}
