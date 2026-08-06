import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ClaimScrubbingService } from '@/lib/finance/claim-scrubbing-service';

/**
 * GET /api/admin/insurance/claims
 * List all insurance claims with optional filters
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const insuranceId = searchParams.get('insuranceId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    try {
        const where: any = {};
        if (isValidString(insuranceId)) where.insuranceId = insuranceId;
        if (isValidString(status) && status !== 'ALL') where.status = status;

        const [claims, total] = await Promise.all([
            prisma.insuranceClaim.findMany({
                where,
                include: {
                    insurance: { select: { id: true, name: true, code: true } },
                    patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
                    invoice: { select: { invoiceNumber: true, totalAmount: true } },
                },
                orderBy: { claimDate: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.insuranceClaim.count({ where })
        ]);

        return NextResponse.json({ claims, total, page, limit });
    } catch (error) {
        console.error('Claims GET error:', error);
        return NextResponse.json({ error: 'Failed to fetch claims' }, { status: 500 });
    }
}

/**
 * POST /api/admin/insurance/claims
 * Create a new insurance claim with automatic scrubbing/validation
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { insuranceId, patientId, visitId, invoiceId, totalAmount, eligibleAmount, notes } = body;

        if (!isValidString(insuranceId) || !isValidString(patientId) || !isValidNumber(totalAmount)) {
            return NextResponse.json({ error: 'insuranceId, patientId, and totalAmount are required' }, { status: 400 });
        }

        // First, scrub the claim for potential issues
        const scrubResult = await ClaimScrubbingService.scrubClaim({
            insuranceId,
            patientId,
            visitId: isValidString(visitId) ? visitId : null,
            invoiceId: isValidString(invoiceId) ? invoiceId : null,
            totalAmount: parseFloat(totalAmount),
            eligibleAmount: isValidNumber(eligibleAmount) ? parseFloat(eligibleAmount) : undefined,
            notes: isValidString(notes) ? notes : null
        });

        // If there are critical errors, don't allow submission
        if (!scrubResult.isValid) {
            return NextResponse.json({
                error: 'Claim validation failed',
                validationResult: scrubResult
            }, { status: 400 });
        }

        // Generate claim number using tenant-configured format
        const today = new Date();
        const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
        const count = await prisma.insuranceClaim.count({
            where: { createdAt: { gte: todayStart } }
        });
        const { generateClaimNumber } = await import("@/lib/formatters");
        const claimNumber = await generateClaimNumber(count + 1, today);

        const claim = await prisma.insuranceClaim.create({
            data: {
                claimNumber,
                insuranceId,
                patientId,
                visitId: isValidString(visitId) ? visitId : null,
                invoiceId: isValidString(invoiceId) ? invoiceId : null,
                totalAmount: parseFloat(totalAmount),
                eligibleAmount: isValidNumber(eligibleAmount) ? parseFloat(eligibleAmount) : parseFloat(totalAmount),
                status: 'DRAFT',
                notes: isValidString(notes) ? notes : null
            },
            include: {
                insurance: { select: { name: true, code: true } },
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
            }
        });

        // Include validation result in response for transparency
        const response = NextResponse.json(claim, { status: 201 });
        return response;
    } catch (error: any) {
        console.error('Claims POST error:', error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'A claim already exists for this visit or invoice.' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to create claim' }, { status: 500 });
    }
}

/**
 * Helper function to check if a value is a non-empty string
 */
function isValidString(value: any): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Helper function to check if a value is a valid number
 */
function isValidNumber(value: any): value is number {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
}