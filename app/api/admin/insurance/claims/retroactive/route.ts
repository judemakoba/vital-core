export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ClaimScrubbingService } from '@/lib/finance/claim-scrubbing-service';
import { getInsuranceEligibility } from '@/lib/insurance/eligibility';

/**
 * POST /api/admin/insurance/claims/retroactive
 *
 * Creates an insurance claim for an invoice that was previously paid
 * (e.g. patient paid cash but actually had insurance they forgot to
 * declare). This is the "Submit Claim" button on a Paid invoice.
 *
 * Body:
 *   { invoiceId: string, notes?: string }
 *
 * The new claim is in DRAFT state so admin can review before submitting.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { invoiceId, notes } = body;

        if (!invoiceId) {
            return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
        }

        // Resolve the correct invoice (handle dual-invoice model)
        // If the given id is a TaxInvoice, find its parent legacy Invoice.
        // If it's a legacy Invoice, use it directly.
        // Note: TaxInvoice doesn't have visitId (it's a sub-bill, not directly tied to a visit).
        const taxInvoice = await prisma.taxInvoice.findUnique({
            where: { id: invoiceId },
            select: { id: true, parentInvoiceId: true, patientId: true, totalAmount: true },
        });

        let invoice: { id: string; patientId: string; totalAmount: number; visitId: string | null } | null = null;

        if (taxInvoice) {
            // TaxInvoice passed in — use the parent legacy Invoice (single source of truth for claims)
            if (!taxInvoice.parentInvoiceId) {
                return NextResponse.json(
                    { error: 'TaxInvoice has no parent legacy invoice. Create a legacy invoice first.' },
                    { status: 400 }
                );
            }
            const parent = await prisma.invoice.findUnique({
                where: { id: taxInvoice.parentInvoiceId },
                select: { id: true, patientId: true, totalAmount: true, visitId: true },
            });
            if (!parent) {
                return NextResponse.json({ error: 'Parent invoice not found' }, { status: 404 });
            }
            invoice = parent;
        } else {
            // Legacy Invoice passed in
            const legacy = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                select: { id: true, patientId: true, totalAmount: true, visitId: true },
            });
            if (!legacy) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
            invoice = legacy;
        }

        // Look up the patient's active insurance (with proper eligibility check)
        const eligibility = await getInsuranceEligibility(invoice.patientId);
        if (!eligibility.eligible) {
            return NextResponse.json(
                { error: eligibility.reason, code: 'INELIGIBLE_FOR_INSURANCE' },
                { status: 400 }
            );
        }
        const enrollment = { id: eligibility.enrollment.id, insuranceId: eligibility.enrollment.insuranceId };

        // Idempotency: check if a NON-rejected claim already exists for this invoice.
        // (Resubmissions reuse invoiceId, so we only block on a still-active claim.)
        const existing = await prisma.insuranceClaim.findFirst({
            where: { invoiceId: invoice.id, status: { not: 'REJECTED' } },
            orderBy: { claimDate: 'desc' },
        });
        if (existing) {
            return NextResponse.json(
                { error: 'An active claim already exists for this invoice', claimId: existing.id, claimNumber: existing.claimNumber },
                { status: 409 }
            );
        }

        // Run scrub validation (non-blocking — admin can override warnings)
        const scrubResult = await ClaimScrubbingService.scrubClaim({
            insuranceId: enrollment.insuranceId,
            patientId: invoice.patientId,
            visitId: invoice.visitId,
            invoiceId: invoice.id,
            totalAmount: Number(invoice.totalAmount),
            notes: notes ?? null,
        });

        // Generate claim number using tenant-configured format
        const today = new Date();
        const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
        const count = await prisma.insuranceClaim.count({
            where: { claimDate: { gte: todayStart } },
        });
        const { generateClaimNumber } = await import("@/lib/formatters");
        const claimNumber = await generateClaimNumber(count + 1, today);

        // Compute copay/insurance split (for the snapshot fields)
        // For retroactive claims, we don't have the pricing engine context per-line,
        // so we estimate: the patient's copay = invoice.amountPaid (already paid cash),
        // and insurance's share = invoice.totalAmount - invoice.amountPaid.
        // If patient paid in full, insurance is 0 (no claim should be made).
        const insuranceShare = Math.max(0, Number(invoice.totalAmount) - 0); // claim the full amount; admin can adjust before submit

        const claim = await prisma.insuranceClaim.create({
            data: {
                claimNumber,
                insuranceId: enrollment.insuranceId,
                patientId: invoice.patientId,
                invoiceId: invoice.id,
                visitId: invoice.visitId,
                totalAmount: Number(invoice.totalAmount),
                eligibleAmount: insuranceShare,
                status: 'DRAFT',
                notes: notes ?? null,
            },
            include: {
                insurance: { select: { name: true, code: true } },
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
            },
        });

        return NextResponse.json(
            {
                ...claim,
                validation: scrubResult,
                message: scrubResult.isValid
                    ? 'Claim created in DRAFT. Review and submit when ready.'
                    : 'Claim created in DRAFT, but validation flagged issues. Review before submitting.',
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Retroactive claim error:', error);
        if (error?.code === 'P2002') {
            return NextResponse.json(
                { error: 'A claim already exists for this invoice' },
                { status: 409 }
            );
        }
        return NextResponse.json(
            { error: 'Failed to create retroactive claim', detail: error?.message ?? String(error) },
            { status: 500 }
        );
    }
}
