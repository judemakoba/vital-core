export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgingBuckets, bucketLabel } from "@/lib/formatters";

/**
 * GET /api/finance/aging
 * Patient AR aging using tenant-configured bucket boundaries.
 * Buckets come from `billing.agingBuckets` (default "0,30,60,90" → 0-30 / 31-60 / 61-90 / 90+).
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const buckets = await getAgingBuckets();

        const [legacyInv, taxInv] = await Promise.all([
            prisma.invoice.findMany({
                where: { status: { in: ["Unpaid", "Partial"] } },
                select: {
                    id: true, invoiceNumber: true, createdAt: true, balanceDue: true,
                    patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                },
            }),
            prisma.taxInvoice.findMany({
                where: { paymentStatus: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
                select: {
                    id: true, invoiceNumber: true, invoiceDate: true, balanceDue: true,
                    patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                    customerName: true,
                },
            }),
        ]);

        // Initialize bucket totals
        const bucketTotals: Record<string, number> = {};
        const bucketLabels = computeBucketLabels(buckets);
        for (const lbl of bucketLabels) bucketTotals[lbl] = 0;

        const items: any[] = [];

        for (const inv of legacyInv) {
            const days = daysOld(inv.createdAt);
            const lbl = bucketLabel(days, buckets);
            bucketTotals[lbl] = (bucketTotals[lbl] || 0) + inv.balanceDue;
            items.push({
                id: inv.id, type: "legacy", number: inv.invoiceNumber,
                days, bucket: lbl, balance: inv.balanceDue,
                patient: inv.patient,
            });
        }

        for (const inv of taxInv) {
            const days = daysOld(inv.invoiceDate);
            const lbl = bucketLabel(days, buckets);
            bucketTotals[lbl] = (bucketTotals[lbl] || 0) + inv.balanceDue;
            items.push({
                id: inv.id, type: "tax", number: inv.invoiceNumber,
                days, bucket: lbl, balance: inv.balanceDue,
                patient: inv.patient,
                customerName: inv.customerName,
            });
        }

        const totalOutstanding = items.reduce((sum, i) => sum + i.balance, 0);
        const counts = {
            total: items.length,
            legacy: items.filter((i) => i.type === "legacy").length,
            tax: items.filter((i) => i.type === "tax").length,
        };

        return NextResponse.json({
            buckets: bucketTotals,
            labels: bucketLabels,
            boundaries: buckets,
            totalOutstanding,
            counts,
            items: items.sort((a, b) => b.days - a.days),
        });
    } catch (error) {
        console.error("Aging report error:", error);
        return NextResponse.json({ error: "Failed to load aging report" }, { status: 500 });
    }
}

function daysOld(date: Date | string): number {
    const d = typeof date === "string" ? new Date(date) : date;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function computeBucketLabels(buckets: number[]): string[] {
    if (buckets.length === 0) return ["0+", "30+", "60+", "90+"];
    const labels: string[] = [];
    for (let i = 0; i < buckets.length; i++) {
        if (i === 0) {
            labels.push(`0-${buckets[0]}`);
        } else {
            labels.push(`${buckets[i - 1] + 1}-${buckets[i]}`);
        }
    }
    // The final "catch-all" bucket
    const last = buckets[buckets.length - 1];
    labels.push(`${last}+`);
    return labels;
}
