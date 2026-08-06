export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ClaimAdjudicationService } from '@/lib/finance/claim-adjudication-service';
// Note: @/lib/messaging imports @react-pdf/renderer which may not be installed.
// We use a masked dynamic import with webpackIgnore so webpack's static
// analysis skips the import entirely (otherwise a missing PDF lib fails the
// whole route at build time, and the dynamic import becomes a "critical
// dependency" warning).
async function sendClaimEmailLazy(opts: any) {
    try {
        // Mask the module specifier so webpack doesn't statically resolve it.
        // `webpackIgnore: true` tells Next.js/webpack to leave it to runtime.
        const spec = ['@', '/lib/messaging'].join('');
        const mod = await import(/* webpackIgnore: true */ spec);
        return await mod.sendInsuranceClaimEmail(opts);
    } catch (err) {
        console.warn('sendInsuranceClaimEmail unavailable (PDF lib missing?):', err);
        return { ok: false, error: 'messaging-disabled' };
    }
}

/**
 * GET /api/admin/insurance/claims/[id]
 * Get a single claim with full detail (incl. adjudication log + resubmissions)
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const claim = await prisma.insuranceClaim.findUnique({
            where: { id: params.id },
            include: {
                insurance: { select: { id: true, name: true, code: true, phone: true, email: true } },
                patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
                invoice: { include: { items: true } },
                originalClaim: { select: { id: true, claimNumber: true, status: true, denialReasonCode: true } },
                resubmissions: {
                    select: { id: true, claimNumber: true, status: true, claimDate: true, denialReasonCode: true },
                    orderBy: { claimDate: 'asc' },
                },
                adjudicationLogs: {
                    include: {
                        performedBy: { select: { id: true, name: true } },
                    },
                    orderBy: { performedAt: 'desc' },
                },
            },
        });
        if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
        return NextResponse.json(claim);
    } catch (error) {
        console.error('GET claim error:', error);
        return NextResponse.json({ error: 'Failed to fetch claim' }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/insurance/claims/[id]
 *
 * Body shape (intentionally rich — clients send what they need, server picks the right action):
 *   { action: 'transition',   toStatus: 'SUBMITTED' }
 *   { action: 'adjudicate',   allowedAmount, approvedAmount, patientResponsibility?, rarcCodes?, notes? }
 *   { action: 'appeal',       appealReason: '...' }
 *   { action: 'appealDecision', won: true, notes? }
 *   { action: 'resubmit',     notes? }
 *   { action: 'updateNotes',  notes: '...' }   // free-form notes patch
 *
 * All transitions flow through ClaimAdjudicationService for consistency
 * (state machine + audit log + GL side effects).
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const body = await req.json();
        const session = await getServerSession(authOptions);
        const actor = { id: session?.user?.id, notes: body.notes };

        // Verify claim exists
        const existing = await prisma.insuranceClaim.findUnique({ where: { id: params.id } });
        if (!existing) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

        let updated;
        switch (body.action) {
            case 'transition': {
                if (!body.toStatus) {
                    return NextResponse.json({ error: 'toStatus is required for transition' }, { status: 400 });
                }
                updated = await ClaimAdjudicationService.transition(
                    params.id,
                    body.toStatus,
                    { ...actor, reasonCode: body.reasonCode, amount: body.amount }
                );

                // Side-effect: SUBMITTED triggers email to insurer
                if (body.toStatus === 'SUBMITTED') {
                    await sendClaimEmail(updated.id, actor.id);
                }
                break;
            }

            case 'adjudicate': {
                if (body.allowedAmount == null || body.approvedAmount == null) {
                    return NextResponse.json(
                        { error: 'allowedAmount and approvedAmount are required' },
                        { status: 400 }
                    );
                }
                // If still SUBMITTED, auto-acknowledge first (preserves audit trail)
                const claimNow = await prisma.insuranceClaim.findUnique({ where: { id: params.id } });
                if (claimNow?.status === 'SUBMITTED') {
                    await ClaimAdjudicationService.transition(
                        params.id,
                        'ACKNOWLEDGED',
                        { id: actor.id, notes: 'Auto-acknowledged on adjudication' }
                    );
                }
                // Capture the EOB (in SUBMITTED/ACKNOWLEDGED)
                await ClaimAdjudicationService.adjudicate(
                    params.id,
                    {
                        allowedAmount: parseFloat(body.allowedAmount),
                        approvedAmount: parseFloat(body.approvedAmount),
                        patientResponsibility: body.patientResponsibility != null ? parseFloat(body.patientResponsibility) : undefined,
                        rarcCodes: body.rarcCodes,
                        notes: body.notes,
                    },
                    { id: actor.id }
                );
                // Then transition to APPROVED
                updated = await ClaimAdjudicationService.transition(
                    params.id,
                    'APPROVED',
                    { id: actor.id, notes: `Adjudicated: allowed=${body.allowedAmount}, approved=${body.approvedAmount}` }
                );
                break;
            }

            case 'reject': {
                if (!body.reasonCode) {
                    return NextResponse.json({ error: 'reasonCode is required for reject' }, { status: 400 });
                }
                // Mark denied + write-off
                await ClaimAdjudicationService.reject(
                    params.id,
                    {
                        reasonCode: body.reasonCode,
                        reason: body.reason,
                        rarcCode: body.rarcCode,
                        writeOffAsBadDebt: body.writeOffAsBadDebt !== false,
                    },
                    { id: actor.id }
                );
                updated = await ClaimAdjudicationService.transition(
                    params.id,
                    'REJECTED',
                    { id: actor.id, reasonCode: body.reasonCode, notes: body.reason }
                );
                break;
            }

            case 'appeal': {
                if (!body.appealReason) {
                    return NextResponse.json({ error: 'appealReason is required' }, { status: 400 });
                }
                updated = await ClaimAdjudicationService.appeal(
                    params.id,
                    body.appealReason,
                    { id: actor.id }
                );
                break;
            }

            case 'appealDecision': {
                if (typeof body.won !== 'boolean') {
                    return NextResponse.json({ error: 'won (boolean) is required' }, { status: 400 });
                }
                updated = await ClaimAdjudicationService.appealDecision(
                    params.id,
                    body.won,
                    { id: actor.id, notes: body.notes }
                );
                break;
            }

            case 'resubmit': {
                updated = await ClaimAdjudicationService.resubmit(
                    params.id,
                    { id: actor.id, notes: body.notes }
                );
                break;
            }

            case 'updateNotes': {
                updated = await prisma.insuranceClaim.update({
                    where: { id: params.id },
                    data: { notes: body.notes ?? null },
                });
                break;
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action '${body.action}'. Use: transition, adjudicate, reject, appeal, appealDecision, resubmit, updateNotes` },
                    { status: 400 }
                );
        }

        // Return the full claim with relations
        const full = await prisma.insuranceClaim.findUnique({
            where: { id: params.id },
            include: {
                insurance: { select: { id: true, name: true, code: true } },
                patient: { select: { id: true, firstName: true, lastName: true, patientNumber: true } },
                invoice: { include: { items: true } },
                adjudicationLogs: {
                    orderBy: { performedAt: 'desc' },
                    take: 10,
                },
            },
        });

        return NextResponse.json({ claim: updated, full });
    } catch (error: any) {
        console.error('Claims PATCH error:', error);
        if (error.name === 'ClaimStateError') {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ error: error.message || 'Failed to update claim' }, { status: 500 });
    }
}

/**
 * Helper: send claim email to insurer on submission
 */
async function sendClaimEmail(claimId: string, actorId?: string) {
    try {
        const claim = await prisma.insuranceClaim.findUnique({
            where: { id: claimId },
            include: {
                insurance: true,
                patient: true,
                invoice: { include: { items: true } },
            },
        });
        if (!claim) return;

        const authorizations = await prisma.insuranceAuthorization.findMany({
            where: { patientInsurance: { patientId: claim.patientId }, status: 'APPROVED' },
            orderBy: { requestDate: 'desc' },
            take: 5,
        });

        const emailResult = await sendClaimEmailLazy({
            claimId: claim.id,
            to: claim.insurance.email || 'claims@insurance.com',
            insuranceName: claim.insurance.name,
            claimData: { ...claim, authorizations },
        });
        if (emailResult?.error) {
            console.error('Claim email send failed:', emailResult.error);
        }
    } catch (err) {
        console.error('sendClaimEmail failed:', err);
    }
}
