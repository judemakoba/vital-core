/**
 * Claim Adjudication Service
 *
 * Centralized state machine + EOB capture + GL write-offs for the insurance
 * claim lifecycle. This is the brain behind every status change on
 * InsuranceClaim — the route handler is just a thin transport.
 *
 * State machine (enforced):
 *
 *   DRAFT ──submit──▶ SUBMITTED ──ack──▶ ACKNOWLEDGED
 *                                          │
 *                              ┌───approve─┤
 *                              │           │
 *                              ▼           ▼
 *                          APPROVED     REJECTED ──appeal──▶ PENDING_REPROCESSING ──▶ DRAFT (resubmit)
 *                              │
 *                          (denial write-off)
 *                              │
 *                              ▼
 *                            PAID   (EOB posted, AR settled, variance reconciled)
 *
 * Each transition writes a ClaimAdjudicationLog row for full audit trail.
 */
import { prisma } from '@/lib/prisma';
import { DenialReasonCode, DenialCategory, ClaimStatus } from '../generated-prisma';
import { AccountingService } from './accounting-service';
import { categorizeDenial } from './denial-categorization';

const VALID_TRANSITIONS: Record<string, string[]> = {
    DRAFT:               ['SUBMITTED'],
    SUBMITTED:           ['ACKNOWLEDGED', 'REJECTED'],                // can be denied before being acknowledged
    ACKNOWLEDGED:        ['APPROVED', 'REJECTED'],                     // can be denied after acknowledgment
    APPROVED:            ['PAID'],
    REJECTED:            ['PENDING_REPROCESSING'],                     // can be appealed
    PENDING_REPROCESSING:['DRAFT'],                                    // appeal accepted, ready to resubmit
    PAID:                [],
};

export class ClaimStateError extends Error {
    constructor(from: string, to: string) {
        super(`Invalid claim status transition: ${from} → ${to}. Allowed from ${from}: ${VALID_TRANSITIONS[from]?.join(', ') || '(none)'}`);
        this.name = 'ClaimStateError';
    }
}

export class ClaimAdjudicationService {
    /**
     * Validate + execute a status transition. Records a ClaimAdjudicationLog.
     * Returns the updated claim.
     */
    static async transition(
        claimId: string,
        toStatus: string,
        actor: { id?: string; notes?: string; reasonCode?: DenialReasonCode; amount?: number },
    ) {
        const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
        if (!claim) throw new Error(`Claim ${claimId} not found`);

        const fromStatus = claim.status;
        if (!VALID_TRANSITIONS[fromStatus]?.includes(toStatus)) {
            throw new ClaimStateError(fromStatus, toStatus);
        }

        const now = new Date();
        const updateData: any = { status: toStatus };

        // Stamp the appropriate date
        switch (toStatus) {
            case 'SUBMITTED':              updateData.submissionDate = now; break;
            case 'ACKNOWLEDGED':           updateData.acknowledgmentDate = now; break;
            case 'APPROVED':               updateData.approvalDate = now; break;
            case 'PAID':                   updateData.paymentDate = now; break;
            case 'REJECTED':               updateData.denialDate = now; break;
            case 'PENDING_REPROCESSING':   updateData.appealDate = now; break;
        }

        const updated = await prisma.$transaction(async (tx) => {
            const result = await tx.insuranceClaim.update({
                where: { id: claimId },
                data: updateData,
            });

            // Write audit log
            await tx.claimAdjudicationLog.create({
                data: {
                    claimId,
                    action: actor.notes?.toUpperCase().includes('DENIAL') ? 'DENIAL' : 'STATUS_CHANGE',
                    fromStatus,
                    toStatus,
                    reasonCode: actor.reasonCode ?? null,
                    amount: actor.amount ?? null,
                    notes: actor.notes ?? null,
                    performedById: actor.id ?? null,
                },
            });

            return result;
        });

        // Side effects per status
        if (toStatus === 'PAID') {
            await this.postClaimPayment(claimId, actor);
        } else if (toStatus === 'REJECTED') {
            await this.writeOffDenial(claimId, actor);
        }

        return updated;
    }

    /**
     * Adjudication — insurer responds. Records the EOB amounts (allowed, approved,
     * variance) and sets the per-line split. If approved amount differs from
     * eligible amount, capture the variance for analytics.
     */
    static async adjudicate(
        claimId: string,
        eob: {
            allowedAmount: number;        // Allowed per EOB
            approvedAmount: number;       // Insurer will pay this
            patientResponsibility?: number; // Patient owes this (copay + deductible)
            rarcCodes?: string;
            notes?: string;
        },
        actor: { id?: string },
    ) {
        const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
        if (!claim) throw new Error(`Claim ${claimId} not found`);
        if (!['SUBMITTED', 'ACKNOWLEDGED'].includes(claim.status)) {
            throw new Error(`Cannot adjudicate claim in status ${claim.status}`);
        }

        // The contractual adjustment is the difference between what we billed
        // and what the insurer allowed. This is the agreed-upon write-off.
        const contractualAdj = Math.max(0, Number(claim.totalAmount) - Number(eob.allowedAmount));
        // The variance (underpayment) is the difference between approved and
        // what we expected. Negative = insurer paid less than we thought.
        const variance = Number(eob.approvedAmount) - Number(claim.insuranceNetAmount ?? 0);

        return await prisma.$transaction(async (tx) => {
            const result = await tx.insuranceClaim.update({
                where: { id: claimId },
                data: {
                    allowedAmount: eob.allowedAmount,
                    approvedAmount: eob.approvedAmount,
                    contractualAdjAmount: contractualAdj,
                    paymentVariance: variance,
                    patientCopayAmount: eob.patientResponsibility ?? claim.patientCopayAmount,
                    insuranceNetAmount: eob.approvedAmount,
                },
            });

            await tx.claimAdjudicationLog.create({
                data: {
                    claimId,
                    action: 'NOTE',
                    fromStatus: claim.status,
                    toStatus: claim.status,
                    amount: eob.approvedAmount,
                    notes: `EOB received. Allowed: ${eob.allowedAmount}, Approved: ${eob.approvedAmount}, Contractual Adj: ${contractualAdj}, Variance: ${variance}.${eob.rarcCodes ? ` RARC: ${eob.rarcCodes}` : ''} ${eob.notes ?? ''}`.trim(),
                    performedById: actor.id ?? null,
                },
            });

            return result;
        });
    }

    /**
     * Mark a claim as REJECTED + write off the AR to bad debt.
     * Captures denial reason code + categorizes for analytics.
     */
    static async reject(
        claimId: string,
        denial: {
            reasonCode: DenialReasonCode;
            reason?: string;
            rarcCode?: string;
            writeOffAsBadDebt?: boolean; // default true
        },
        actor: { id?: string },
    ) {
        const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
        if (!claim) throw new Error(`Claim ${claimId} not found`);
        if (!['SUBMITTED', 'ACKNOWLEDGED'].includes(claim.status)) {
            throw new Error(`Cannot reject claim in status ${claim.status}`);
        }

        // Auto-categorize from the reason code
        const category = categorizeDenial(denial.reasonCode);

        // Default write-off is the full insurance net amount
        const writeOffAmount = denial.writeOffAsBadDebt === false
            ? 0
            : Number(claim.insuranceNetAmount ?? claim.eligibleAmount ?? 0);

        return await prisma.$transaction(async (tx) => {
            const result = await tx.insuranceClaim.update({
                where: { id: claimId },
                data: {
                    // Don't set status here — let the state machine handle it via the
                    // subsequent transition() call.
                    denialReasonCode: denial.reasonCode,
                    denialCategory: category,
                    denialRarcCode: denial.rarcCode ?? null,
                    denialReason: denial.reason ?? null,
                    denialDate: new Date(),
                    denialWriteOffAmount: writeOffAmount,
                },
            });

            await tx.claimAdjudicationLog.create({
                data: {
                    claimId,
                    action: 'DENIAL',
                    fromStatus: claim.status,
                    toStatus: 'REJECTED',
                    reasonCode: denial.reasonCode,
                    amount: writeOffAmount,
                    notes: `[${category}] ${denial.reasonCode}${denial.rarcCode ? ` (RARC: ${denial.rarcCode})` : ''}: ${denial.reason ?? ''}`.trim(),
                    performedById: actor.id ?? null,
                },
            });

            return result;
        });
    }

    /**
     * Mark a rejected claim as appeal in progress.
     */
    static async appeal(claimId: string, appealReason: string, actor: { id?: string }) {
        const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
        if (!claim) throw new Error(`Claim ${claimId} not found`);
        if (claim.status !== 'REJECTED') {
            throw new Error(`Can only appeal REJECTED claims, current status: ${claim.status}`);
        }
        return await prisma.$transaction(async (tx) => {
            const result = await tx.insuranceClaim.update({
                where: { id: claimId },
                data: {
                    status: 'PENDING_REPROCESSING',
                    appealStatus: 'APPEALED',
                    appealReason,
                },
            });
            await tx.claimAdjudicationLog.create({
                data: {
                    claimId,
                    action: 'APPEAL',
                    fromStatus: 'REJECTED',
                    toStatus: 'PENDING_REPROCESSING',
                    notes: appealReason,
                    performedById: actor.id ?? null,
                },
            });
            return result;
        });
    }

    /**
     * Mark an appeal as won/lost.
     */
    static async appealDecision(claimId: string, won: boolean, actor: { id?: string; notes?: string }) {
        const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
        if (!claim) throw new Error(`Claim ${claimId} not found`);
        if (claim.status !== 'PENDING_REPROCESSING') {
            throw new Error(`No active appeal, current status: ${claim.status}`);
        }
        return await prisma.$transaction(async (tx) => {
            const result = await tx.insuranceClaim.update({
                where: { id: claimId },
                data: {
                    appealStatus: won ? 'WON' : 'LOST',
                    appealDecisionDate: new Date(),
                },
            });
            await tx.claimAdjudicationLog.create({
                data: {
                    claimId,
                    action: 'APPEAL',
                    fromStatus: 'PENDING_REPROCESSING',
                    toStatus: claim.status,
                    notes: `Appeal ${won ? 'WON' : 'LOST'}. ${actor.notes ?? ''}`.trim(),
                    performedById: actor.id ?? null,
                },
            });
            return result;
        });
    }

    /**
     * Resubmit a claim — creates a new claim linked to the original.
     * Use after appeal is WON or after fixing a denial cause.
     */
    static async resubmit(
        originalClaimId: string,
        actor: { id?: string; notes?: string },
    ) {
        const original = await prisma.insuranceClaim.findUnique({
            where: { id: originalClaimId },
            include: { resubmissions: true },
        });
        if (!original) throw new Error(`Original claim ${originalClaimId} not found`);

        if (!['REJECTED', 'PENDING_REPROCESSING'].includes(original.status)) {
            throw new Error(`Can only resubmit REJECTED or PENDING_REPROCESSING claims, current: ${original.status}`);
        }

        return await prisma.$transaction(async (tx) => {
            // Increment the original's resubmissionCount
            await tx.insuranceClaim.update({
                where: { id: originalClaimId },
                data: { resubmissionCount: { increment: 1 } },
            });

            // Generate a new claim number
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const todayCount = await tx.insuranceClaim.count({
                where: { claimDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
            });
            const claimNumber = `CLM-${dateStr}-${(todayCount + 1).toString().padStart(4, '0')}`;

            const resub = await tx.insuranceClaim.create({
                data: {
                    claimNumber,
                    insuranceId: original.insuranceId,
                    patientId: original.patientId,
                    invoiceId: original.invoiceId,
                    visitId: original.visitId,
                    claimDate: new Date(),
                    totalAmount: original.totalAmount,
                    eligibleAmount: original.eligibleAmount,
                    allowedAmount: null,
                    approvedAmount: null,
                    patientCopayAmount: original.patientCopayAmount,
                    insuranceNetAmount: original.insuranceNetAmount,
                    status: 'SUBMITTED',
                    submissionDate: new Date(),
                    isResubmission: true,
                    originalClaimId: original.id,
                    notes: actor.notes ?? `Resubmission of ${original.claimNumber}. Reason for original denial: ${original.denialReasonCode ?? 'not specified'}.`,
                },
            });

            await tx.claimAdjudicationLog.create({
                data: {
                    claimId: resub.id,
                    action: 'SUBMISSION',
                    fromStatus: 'DRAFT',
                    toStatus: 'SUBMITTED',
                    notes: `Resubmission of ${original.claimNumber} (denied: ${original.denialReasonCode ?? 'N/A'}). ${actor.notes ?? ''}`.trim(),
                    performedById: actor.id ?? null,
                },
            });

            return resub;
        });
    }

    /**
     * Side-effect of PAID transition: post the AR settlement to the GL.
     * Dr Cash + Dr Contractual Adj (if underpaid) / Cr AR-Insurance
     */
    private static async postClaimPayment(claimId: string, actor: { id?: string }) {
        const claim = await prisma.insuranceClaim.findUnique({
            where: { id: claimId },
            include: { invoice: true },
        });
        if (!claim) return;
        if (claim.postedToLedger) return; // idempotency

        // Delegate to the existing accounting service for the core posting
        // (it handles bank + AR-Insurance correctly)
        const userId = actor.id ?? (await prisma.user.findFirst({ where: { role: { name: { equals: 'admin' } } } }))?.id;
        if (!userId) return;

        try {
            await AccountingService.postClaimPaymentToLedger(claimId, userId);

            // If there's a contractual adjustment on the EOB (underpayment),
            // post a separate Dr 4220 / Cr 1132 entry so the variance is visible
            if (claim.contractualAdjAmount && claim.contractualAdjAmount > 0) {
                await this.postContractualAdjustment(claimId, userId);
            }

            await prisma.insuranceClaim.update({
                where: { id: claimId },
                data: { postedToLedger: true },
            });
        } catch (err) {
            console.error(`Failed to post claim ${claimId} payment to ledger:`, err);
        }
    }

    /**
     * Post the underpayment variance as a contractual adjustment.
     * Dr 4220 Contractual Allowances / Cr 1132 AR-Insurance
     */
    private static async postContractualAdjustment(claimId: string, userId: string) {
        const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
        if (!claim || !claim.contractualAdjAmount) return;

        const contractualAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: '4220' } });
        const arAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: '1132' } });
        if (!contractualAccount || !arAccount) {
            console.warn('Contractual allowance (4220) or AR-Insurance (1132) account not configured — skipping variance posting');
            return;
        }

        const amount = Math.abs(claim.contractualAdjAmount);
        if (amount === 0) return;

        await prisma.$transaction(async (tx) => {
            const journalNumber = `JNL-CLM-ADJ-${claim.claimNumber}`;
            const existing = await tx.journalEntry.findUnique({ where: { entryNumber: journalNumber } });
            if (existing) return; // idempotency

            const journal = await tx.journalEntry.create({
                data: {
                    entryNumber: journalNumber,
                    entryDate: new Date(),
                    postingDate: new Date(),
                    description: `Contractual allowance for Claim ${claim.claimNumber} (underpayment)`,
                    reference: claim.id,
                    referenceType: 'PAYMENT',
                    totalDebit: amount,
                    totalCredit: amount,
                    status: 'POSTED',
                    createdById: userId,
                    lines: {
                        create: [
                            {
                                accountId: contractualAccount.id,
                                debitAmount: amount,
                                creditAmount: 0,
                                description: `Contractual allowance — ${claim.claimNumber}`,
                            },
                            {
                                accountId: arAccount.id,
                                debitAmount: 0,
                                creditAmount: amount,
                                description: `Reduce AR-Insurance — underpayment on ${claim.claimNumber}`,
                            },
                        ],
                    },
                },
            });

            await tx.insuranceClaim.update({
                where: { id: claimId },
                data: { paymentVariance: claim.paymentVariance ?? (claim.approvedAmount && claim.insuranceNetAmount ? claim.approvedAmount - claim.insuranceNetAmount : null) },
            });

            return journal;
        });
    }

    /**
     * Side-effect of REJECTED transition: write off the AR-Insurance to bad debt.
     * Dr 5430 Bad Debt Expense / Cr 1132 AR-Insurance
     */
    private static async writeOffDenial(claimId: string, actor: { id?: string }) {
        const claim = await prisma.insuranceClaim.findUnique({ where: { id: claimId } });
        if (!claim) return;
        if (claim.writeOffPostedToLedger) return;
        if (!claim.denialWriteOffAmount || claim.denialWriteOffAmount === 0) return;

        const badDebtAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: '5430' } });
        const arAccount = await prisma.chartOfAccount.findUnique({ where: { accountCode: '1132' } });
        if (!badDebtAccount || !arAccount) {
            console.warn('Bad Debt Expense (5430) or AR-Insurance (1132) account not configured — skipping denial write-off');
            return;
        }

        const userId = actor.id ?? (await prisma.user.findFirst({ where: { role: { name: { equals: 'admin' } } } }))?.id;
        if (!userId) return;

        const amount = claim.denialWriteOffAmount;
        const journalNumber = `JNL-CLM-WO-${claim.claimNumber}`;

        try {
            await prisma.$transaction(async (tx) => {
                const existing = await tx.journalEntry.findUnique({ where: { entryNumber: journalNumber } });
                if (existing) return;

                const journal = await tx.journalEntry.create({
                    data: {
                        entryNumber: journalNumber,
                        entryDate: new Date(),
                        postingDate: new Date(),
                        description: `Bad debt write-off — denied claim ${claim.claimNumber} (${claim.denialReasonCode})`,
                        reference: claim.id,
                        referenceType: 'PAYMENT',
                        totalDebit: amount,
                        totalCredit: amount,
                        status: 'POSTED',
                        createdById: userId,
                        lines: {
                            create: [
                                {
                                    accountId: badDebtAccount.id,
                                    debitAmount: amount,
                                    creditAmount: 0,
                                    description: `Bad debt — denied claim ${claim.claimNumber} (${claim.denialReasonCode ?? 'no reason'})`,
                                },
                                {
                                    accountId: arAccount.id,
                                    debitAmount: 0,
                                    creditAmount: amount,
                                    description: `Write off AR-Insurance — claim ${claim.claimNumber}`,
                                },
                            ],
                        },
                    },
                });

                await tx.insuranceClaim.update({
                    where: { id: claimId },
                    data: {
                        writeOffPostedToLedger: true,
                        denialWriteOffJournalId: journal.id,
                    },
                });
            });
        } catch (err) {
            console.error(`Failed to write off denial for claim ${claimId}:`, err);
        }
    }
}
