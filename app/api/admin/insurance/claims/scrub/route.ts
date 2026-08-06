import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ClaimScrubbingService } from '@/lib/finance/claim-scrubbing-service';

/**
 * POST /api/admin/insurance/claims/scrub
 * Scrub/validate a claim without creating it
 * Useful for pre-submission validation
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { insuranceId, patientId, visitId, invoiceId, totalAmount, eligibleAmount, notes } = body;

        // Validate required fields
        if (!insuranceId || !patientId || typeof totalAmount === 'undefined') {
            return NextResponse.json(
                { error: 'insuranceId, patientId, and totalAmount are required' },
                { status: 400 }
            );
        }

        // Perform claim scrubbing
        const scrubResult = await ClaimScrubbingService.scrubClaim({
            insuranceId,
            patientId,
            visitId: visitId ?? null,
            invoiceId: invoiceId ?? null,
            totalAmount: parseFloat(totalAmount),
            eligibleAmount: eligibleAmount ? parseFloat(eligibleAmount) : undefined,
            notes: notes ?? null
        });

        return NextResponse.json({
            success: true,
            data: scrubResult,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Claim scrubbing error:', error);
        return NextResponse.json(
            { error: 'Failed to scrub claim' },
            { status: 500 }
        );
    }
}