import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/insurance/claims/[id]/resubmissions
 * Returns the full chain of resubmissions for a claim (original + all
 * subsequent resubmissions, with their adjudication logs).
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Walk the chain in both directions: anything that points to this claim
        // as original, plus this claim's own original.
        const claim = await prisma.insuranceClaim.findUnique({
            where: { id: params.id },
            select: { id: true, claimNumber: true, originalClaimId: true, resubmissionCount: true },
        });
        if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

        // Find the root
        let rootId = claim.id;
        let cursor: string | null = claim.originalClaimId;
        while (cursor) {
            const parent = await prisma.insuranceClaim.findUnique({
                where: { id: cursor },
                select: { id: true, originalClaimId: true },
            });
            if (!parent) break;
            rootId = parent.id;
            cursor = parent.originalClaimId;
        }

        // Now collect the whole chain from root downward
        const chain: any[] = [];
        let current: string | null = rootId;
        const seen = new Set<string>();
        while (current && !seen.has(current)) {
            seen.add(current);
            const c = await prisma.insuranceClaim.findUnique({
                where: { id: current },
                include: {
                    insurance: { select: { id: true, name: true, code: true } },
                    patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
                    adjudicationLogs: {
                        orderBy: { performedAt: 'desc' },
                        take: 5,
                        include: {
                            performedBy: { select: { id: true, name: true } },
                        },
                    },
                },
            });
            if (!c) break;
            chain.push(c);

            // Find the next one that has this as original
            const next = await prisma.insuranceClaim.findFirst({
                where: { originalClaimId: current },
                select: { id: true },
            });
            current = next?.id ?? null;
        }

        return NextResponse.json({ chain, rootId, totalResubmissions: chain.length - 1 });
    } catch (error) {
        console.error('Resubmissions chain error:', error);
        return NextResponse.json({ error: 'Failed to load resubmission chain' }, { status: 500 });
    }
}
