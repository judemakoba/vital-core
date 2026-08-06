export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { VISIT_STATUS } from "@/lib/visits/status";
import { verifyInsuranceWithProvider } from "@/lib/insurance/third-party";
import { getConsultationFeeDescription } from "@/lib/visits/consultation-fee";
import { isInsuranceEnabled } from "@/lib/insurance/settings";
import { generateInvoiceNumber } from "@/lib/formatters";

/**
 * R47 — Per-visit insurance verification.
 *
 * The cashier (or any authorized user) presses "Validate Insurance" on
 * the visit page. This route:
 *
 *   1. Pulls the visit + the patient's most recent active enrollment.
 *   2. Calls `verifyInsuranceWithProvider` (the third-party mock — in
 *      production this would be the real insurer API).
 *   3. Records the result in `InsuranceVerification` (full audit log).
 *   4. Updates the visit status:
 *        APPROVED  → visit → Triage (deferred billing, consultation
 *                              fee is added to the FINAL- invoice at
 *                              first order placement, then submitted
 *                              as a claim)
 *        DENIED    → visit → ConsultationBilling (cash flow, a
 *                              consultation fee invoice is issued at
 *                              this point)
 *        ERROR     → visit stays at PendingInsuranceValidation
 *                              (cashier can retry)
 *      For visits in any other status (already past Triage, or
 *      Completed, or Discontinued, or a direct-service visit that
 *      doesn't need a consultation), validation is logged but the
 *      visit status is NOT changed.
 *   5. For DENIED visits on a billable type, a consultation fee
 *      invoice is issued (the standard cash flow).
 *
 * Body params:
 *   { force?: 'AUTO' | 'APPROVE' | 'DENY' | 'ERROR' }
 *
 *   `force` is for testing — defaults to AUTO which uses the mock's
 *   deterministic logic. ADMIN/SUPER_ADMIN can pass any force value
 *   to demo the UI without changing the underlying data.
 */
export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const force: 'AUTO' | 'APPROVE' | 'DENY' | 'ERROR' = body?.force ?? 'AUTO';

        const visit = await prisma.visit.findUnique({
            where: { id: params.id },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                    },
                },
            },
        });
        if (!visit) {
            return NextResponse.json({ error: `Visit ${params.id} not found.` }, { status: 404 });
        }

        if (visit.status === VISIT_STATUS.Completed || visit.status === VISIT_STATUS.Discontinued) {
            return NextResponse.json(
                { error: `Visit is in terminal status "${visit.status}" — cannot verify insurance.` },
                { status: 400 }
            );
        }

        // R49c: when the insurance feature is disabled for this clinic,
        // refuse the verify call. The visit should be in
        // ConsultationBilling (cash flow) — if it's still at
        // PendingInsuranceValidation, that means it was created when
        // insurance was ON and the toggle was flipped after the fact.
        // The cashier should manually move the visit forward instead of
        // running a third-party check the clinic has opted out of.
        if (!await isInsuranceEnabled()) {
            return NextResponse.json(
                { error: "Insurance feature is disabled for this clinic. Verify-insurance is not available." },
                { status: 400 }
            );
        }

        // Pull the most recent active enrollment (any state — the
        // third-party will validate, not us).
        const enrollment = await prisma.patientInsurance.findFirst({
            where: { patientId: visit.patientId, isActive: true },
            orderBy: { createdAt: 'desc' },
            include: {
                insurance: {
                    select: { id: true, name: true, code: true, isActive: true, consultationFee: true },
                },
            },
        });

        // Call the third-party verifier
        const result = await verifyInsuranceWithProvider({
            visitId: visit.id,
            patientId: visit.patientId,
            insuranceId: enrollment?.insurance.id ?? null,
            enrollmentId: enrollment?.id ?? null,
            memberNumber: enrollment?.memberNumber ?? null,
            policyNumber: enrollment?.policyNumber ?? null,
            force,
        });

        // Record the verification in the audit log.
        // NOTE: `insuranceId` FK points to InsuranceCompany, not PatientInsurance.
        // The PatientInsurance row holds the enrollment details; the
        // InsuranceCompany row is the provider. We pass the company id.
        const insuranceCompanyId = enrollment?.insurance.id ?? null;
        const verification = await prisma.insuranceVerification.create({
            data: {
                visitId: visit.id,
                patientId: visit.patientId,
                insuranceId: insuranceCompanyId,
                memberNumber: enrollment?.memberNumber ?? null,
                policyNumber: enrollment?.policyNumber ?? null,
                provider: result.provider,
                status: result.status,
                verificationNumber: result.status === 'APPROVED' ? result.verificationNumber : null,
                coverageLimit: result.status === 'APPROVED' ? result.coverageLimit : null,
                deductibleRemaining: result.status === 'APPROVED' ? result.deductibleRemaining : null,
                coverageValidFrom: result.status === 'APPROVED' ? result.coverageValidFrom : null,
                coverageValidTo: result.status === 'APPROVED' ? result.coverageValidTo : null,
                reason: result.status === 'DENIED' ? result.reason : (result.status === 'ERROR' ? result.error : null),
                requestPayload: { force, enrollmentId: enrollment?.id ?? null, memberNumber: enrollment?.memberNumber ?? null },
                responsePayload: result.status === 'ERROR' ? { error: result.error } : result,
                verifiedById: session.user.id,
            },
        });

        // Update the visit status based on the result.
        // Only change status if the visit is in PendingInsuranceValidation
        // (the only state that needs the verification result to advance).
        // For visits that are already past Triage, we still log the
        // verification but don't change status.
        let statusChanged = false;
        let consultationInvoiceCreated = false;
        let consultationInvoiceId: string | null = null;

        if (visit.status === VISIT_STATUS.PendingInsuranceValidation) {
            if (result.status === 'APPROVED') {
                await prisma.visit.update({
                    where: { id: visit.id },
                    data: { status: VISIT_STATUS.Triage },
                });
                statusChanged = true;
            } else if (result.status === 'DENIED') {
                // Fall back to cash flow — create the consultation fee invoice
                // (only for billable, non-direct-service visit types)
                const isBillable =
                    !['FOLLOW_UP', 'LAB_REVIEW', 'VACCINATION', 'ANTENATAL', 'LAB_ONLY', 'RADIOLOGY_ONLY', 'PRESCRIPTION_ONLY']
                        .includes(String(visit.type).toUpperCase());
                if (isBillable) {
                    // Resolve the consultation fee (global or per-insurance)
                    const { getConsultationFeeForNewVisit } = await import('@/lib/visits/consultation-fee');
                    const feeResolution = await getConsultationFeeForNewVisit(
                        prisma,
                        visit.patientId,
                        visit.type,
                    );
                    const fee = feeResolution.fee;
                    if (fee > 0) {
                        const today = new Date();
                        const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
                        const invCountToday = await prisma.invoice.count({
                            where: { createdAt: { gte: todayStart } },
                        });
                        const invoiceNumber = await generateInvoiceNumber(invCountToday + 1, today);
                        const consultLineDesc = getConsultationFeeDescription(visit.type)
                            + (feeResolution.source === 'insurance' ? ` (${feeResolution.insuranceName} rate)` : '');
                        const created = await prisma.invoice.create({
                            data: {
                                invoiceNumber,
                                patientId: visit.patientId,
                                visitId: visit.id,
                                totalAmount: fee,
                                balanceDue: fee,
                                amountPaid: 0,
                                status: 'Unpaid',
                                issuedById: session.user.id,
                                items: {
                                    create: {
                                        description: consultLineDesc,
                                        quantity: 1,
                                        unitPrice: fee,
                                        totalPrice: fee,
                                        itemType: 'Consultation',
                                    },
                                },
                            },
                        });
                        consultationInvoiceCreated = true;
                        consultationInvoiceId = created.id;
                    }
                }
                await prisma.visit.update({
                    where: { id: visit.id },
                    data: { status: VISIT_STATUS.ConsultationBilling },
                });
                statusChanged = true;
            }
            // ERROR → leave at PendingInsuranceValidation, cashier can retry
        }

        return NextResponse.json({
            ok: true,
            visitId: visit.id,
            visitStatus: visit.status,
            newVisitStatus: statusChanged
                ? (result.status === 'APPROVED' ? VISIT_STATUS.Triage
                    : result.status === 'DENIED' ? VISIT_STATUS.ConsultationBilling
                    : VISIT_STATUS.PendingInsuranceValidation)
                : visit.status,
            verification: {
                id: verification.id,
                status: verification.status,
                verificationNumber: verification.verificationNumber,
                reason: verification.reason,
                provider: verification.provider,
                createdAt: verification.createdAt,
            },
            statusChanged,
            consultationInvoiceCreated,
            consultationInvoiceId,
        });
    } catch (error: any) {
        console.error("Verify-insurance error:", error);
        return NextResponse.json(
            { error: "Failed to verify insurance", details: error.message || "Unknown error" },
            { status: 500 }
        );
    }
}
