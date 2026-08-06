import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
    getConsultationFeeDescription,
    getConsultationFeeForNewVisit,
    isBillableVisitType,
    isDirectServiceVisitType,
} from "@/lib/visits/consultation-fee";
import { isInsuranceEnabled } from "@/lib/insurance/settings";
import {
    VISIT_STATUS,
    initialStatusForVisitType,
    type VisitStatus,
} from "@/lib/visits/status";
import { VisitType } from "@/lib/generated-prisma";

/**
 * Per the consolidated visit cycle spec (R45):
 *
 *  - Visit type drives the initial status (see `initialStatusForVisitType`):
 *      * OPD / EMERGENCY / SCHEDULED / FOLLOW_UP / VACCINATION / ANTENATAL / OTHER
 *          → ConsultationBilling (or Triage if zero-fee auto-transition applies)
 *      * LAB_ONLY / RADIOLOGY_ONLY / PRESCRIPTION_ONLY
 *          → DirectServicePending (skips triage + consultation entirely)
 *
 *  - FOLLOW_UP requires a `linkedPriorVisitId`:
 *      * the linked visit must exist
 *      * it must be Completed
 *      * its type must be OPD / FOLLOW_UP / VACCINATION / ANTENATAL
 *      * it must be within the configured follow-up window (default 14 days)
 *
 *  - Zero-fee auto-transition:
 *      * when `isBillableVisitType` returns false AND the resolved fee is 0,
 *        the visit is created in Triage (skipping the ConsultationBilling invoice step)
 *      * when `isBillableVisitType` returns false AND the fee is > 0 (e.g. patient-
 *        specific override), the visit stays in ConsultationBilling
 */
export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized - session invalid" }, { status: 401 });
        }

        const patientId = params.id;
        const body = await request.json();
        const {
            type,
            doctorId,
            chiefComplaint,
            linkedPriorVisitId, // optional; required when type=FOLLOW_UP
            // R48: optional verification result from the create-visit
            // form. If the patient has insurance on file and the cashier
            // ran the third-party check before submitting, the result is
            // passed here so the visit is created with the right initial
            // status. If absent, the visit is created at
            // PendingInsuranceValidation (cashier can verify later).
            verification, // { status, verificationNumber?, provider?, reason?, ... }
        } = body;

        if (!type || !doctorId) {
            return NextResponse.json(
                { error: "Missing required fields: type and doctorId are required" },
                { status: 400 }
            );
        }

        // Verify patient exists
        const patient = await prisma.patient.findUnique({ where: { id: patientId } });
        if (!patient) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        // 0. Check for existing active visits (any pre-terminal state — patient is still in process)
        const activeVisit = await prisma.visit.findFirst({
            where: {
                patientId,
                status: {
                    in: [
                        VISIT_STATUS.Waiting,
                        VISIT_STATUS.ConsultationBilling,
                        VISIT_STATUS.Triage,
                        VISIT_STATUS.Triaged,
                        VISIT_STATUS.InConsultation,
                        VISIT_STATUS.Consultation,
                        VISIT_STATUS.PendingOrders,
                        VISIT_STATUS.DirectServicePending,
                        VISIT_STATUS.FinalBilling,
                        VISIT_STATUS.Laboratory,
                        VISIT_STATUS.Radiology,
                        VISIT_STATUS.Pharmacy,
                    ],
                },
            },
        });

        if (activeVisit) {
            return NextResponse.json(
                { error: `Patient already has an active visit (${activeVisit.visitNumber}) in status: ${activeVisit.status}. Please complete it before starting a new one.` },
                { status: 400 }
            );
        }

        const visitType = type as VisitType;

        // 1. FOLLOW_UP validation — must link to a prior Completed visit
        //    of an allowed type, within the configured follow-up window.
        if (visitType === 'FOLLOW_UP') {
            if (!linkedPriorVisitId) {
                return NextResponse.json(
                    { error: "FOLLOW_UP visits require a `linkedPriorVisitId` — the prior visit this one is following up on." },
                    { status: 400 }
                );
            }
            const prior = await prisma.visit.findUnique({
                where: { id: linkedPriorVisitId },
                select: { id: true, visitNumber: true, type: true, status: true, checkInTime: true, patientId: true },
            });
            if (!prior) {
                return NextResponse.json({ error: `Linked prior visit ${linkedPriorVisitId} not found.` }, { status: 400 });
            }
            if (prior.patientId !== patientId) {
                return NextResponse.json(
                    { error: `Linked prior visit ${prior.visitNumber} belongs to a different patient.` },
                    { status: 400 }
                );
            }
            if (prior.status !== VISIT_STATUS.Completed) {
                return NextResponse.json(
                    { error: `Linked prior visit ${prior.visitNumber} is in status "${prior.status}" — follow-up requires a Completed visit.` },
                    { status: 400 }
                );
            }
            const allowedPriorTypes: string[] = ['OPD', 'FOLLOW_UP', 'VACCINATION', 'ANTENATAL', 'SCHEDULED'];
            if (!allowedPriorTypes.includes(String(prior.type).toUpperCase())) {
                return NextResponse.json(
                    { error: `Linked prior visit ${prior.visitNumber} has type "${prior.type}" — follow-up requires a prior OPD / FOLLOW_UP / VACCINATION / ANTENATAL / SCHEDULED visit.` },
                    { status: 400 }
                );
            }
            const { followUpWindowDays } = await import("@/lib/visits/consultation-fee").then(m => m.getVisitSettings());
            const refDate = prior.checkInTime || new Date(0);
            const daysAgo = Math.floor((Date.now() - new Date(refDate).getTime()) / 86400000);
            if (followUpWindowDays > 0 && daysAgo > followUpWindowDays) {
                return NextResponse.json(
                    { error: `Linked prior visit ${prior.visitNumber} was ${daysAgo} days ago — outside the ${followUpWindowDays}-day follow-up window. Either choose a more recent visit or use a different visit type.` },
                    { status: 400 }
                );
            }
        }

        // 2. Resolve fee + initial status
        //
        // R47 spec: insurance validation is no longer auto-validated on
        // the patient profile or at visit creation. The visit just checks
        // whether the patient has an active enrollment on FILE. The
        // actual third-party validation happens later when the cashier
        // clicks "Validate Insurance" on the visit page (see
        // POST /api/visits/[id]/verify-insurance).
        //
        // Initial status flow:
        //   - Patient has an active enrollment AND visit is billable
        //     AND not direct-service → PendingInsuranceValidation
        //     (no consultation fee invoice issued, waiting for cashier
        //      to trigger the third-party check)
        //   - Patient has NO active enrollment → ConsultationBilling
        //     (cash flow, consultation fee invoice issued up front)
        //   - Direct-service visit (LAB_ONLY / RADIOLOGY_ONLY / PRESCRIPTION_ONLY)
        //     → DirectServicePending (no triage, no consultation)
        //   - Non-billable visit type (FOLLOW_UP, VACCINATION, ANTENATAL,
        //     LAB_REVIEW) → Triage (zero-fee auto-transition; insurance
        //     irrelevant for these)
        const isDirect = isDirectServiceVisitType(visitType);
        const shouldCharge = await isBillableVisitType(visitType);

        // R49: when the insurance feature is disabled for this
        // clinic, we skip the enrollment lookup entirely. The
        // patient is treated as cash, the visit goes straight to
        // ConsultationBilling, no consult fee is deferred, and no
        // InsuranceVerification row is recorded.
        const insuranceFeatureOn = await isInsuranceEnabled();

        // Find the patient's most recent active enrollment (no
        // 4-condition eligibility check — we just want to know "is
        // there an insurance record on file?"). The cashier will run
        // the actual third-party validation later.
        const enrollmentOnFile = insuranceFeatureOn && shouldCharge && !isDirect
            ? await prisma.patientInsurance.findFirst({
                where: { patientId, isActive: true },
                orderBy: { createdAt: 'desc' },
                include: { insurance: { select: { id: true, name: true, code: true, consultationFee: true } } },
            })
            : null;

        // Resolve the consultation fee (we need it for the UI display
        // and for the FINAL- invoice line item if validation succeeds)
        const feeResolution = await getConsultationFeeForNewVisit(prisma, patientId, visitType);
        const consultationFee = feeResolution.fee;

        // Decide initial status
        let initialStatus: VisitStatus;
        if (isDirect) {
            initialStatus = VISIT_STATUS.DirectServicePending;
        } else if (insuranceFeatureOn && enrollmentOnFile && shouldCharge) {
            // Insurance on file + billable visit. R48: the cashier can
            // pass a verification result from the create-visit form. If
            // provided, the visit is created with the appropriate status
            // based on the result. If absent, default to
            // PendingInsuranceValidation (cashier can verify later via
            // the visit page).
            if (verification && (verification.status === 'APPROVED' || verification.status === 'DENIED')) {
                initialStatus = verification.status === 'APPROVED'
                    ? VISIT_STATUS.Triage
                    : VISIT_STATUS.ConsultationBilling;
            } else {
                initialStatus = VISIT_STATUS.PendingInsuranceValidation;
            }
        } else if (!shouldCharge && consultationFee <= 0) {
            initialStatus = VISIT_STATUS.Triage; // zero-fee auto-transition
        } else {
            initialStatus = VISIT_STATUS.ConsultationBilling; // cash flow
        }

        // 3. Generate Visit Number using tenant-configured format.
        // Wrapped in withUniqueRetry so two concurrent creations that
        // both read the same count don't collide on the unique
        // visitNumber constraint (P2002). The retry re-reads the count
        // each attempt and falls back to a random suffix on exhaustion.
        const today = new Date();
        const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
        const { generateVisitNumber, generateInvoiceNumber, withUniqueRetry } = await import("@/lib/formatters");

        // 4. Create the Visit (+ Invoice if billable) atomically. The retry
        // catches P2002 on BOTH the visit number AND the invoice number (two
        // concurrent creations can collide on either field). The retry
        // re-counts from the DB each attempt, so the next attempt sees
        // the just-committed row and walks forward to a free number.
        // If retries are exhausted (extreme concurrency), the fallback
        // appends a random suffix to guarantee a unique number.
        const result = await withUniqueRetry({
            fields: ["visitNumber", "invoiceNumber"],
            computeSequence: async (attempt) => {
                const c = await prisma.visit.count({ where: { createdAt: { gte: todayStart } } });
                return await generateVisitNumber(c + attempt, today);
            },
            action: async (visitNumber) => {
                return await prisma.$transaction(async (tx) => {
                    const visit = await tx.visit.create({
                        data: {
                            visitNumber,
                            patientId,
                            type: visitType,
                            chiefComplaint,
                            assignedDoctorId: doctorId,
                            status: initialStatus,
                            priority: "Normal",
                            // Link to prior visit when this is a FOLLOW_UP
                            ...(linkedPriorVisitId ? { linkedPriorVisitId } : {}),
                        },
                    });

                    // R48: when the cashier validates insurance on the
                    // create-visit form, the verification result is
                    // included in the request body. We use that result to
                    // (a) create the consultation fee invoice if denied
                    // (cash fallback), and (b) record the
                    // InsuranceVerification row for audit.
                    //
                    // Three branches:
                    //   - CASH (no insurance on file): consult invoice
                    //     issued at visit creation (existing flow)
                    //   - INSURANCE on file + verification=DENIED:
                    //     consult invoice issued at this point at the
                    //     negotiated rate (cash fallback)
                    //   - INSURANCE on file + verification=APPROVED:
                    //     NO consult invoice — fee is deferred to the
                    //     FINAL- invoice at first order placement
                    //   - INSURANCE on file + no verification provided
                    //     (default): visit → PendingInsuranceValidation,
                    //     no consult invoice, cashier can verify later
                    const isCashFlow = !enrollmentOnFile;
                    const isDenied = enrollmentOnFile && verification?.status === 'DENIED';

                    const createConsultInvoice = shouldCharge
                        && consultationFee > 0
                        && (isCashFlow || isDenied);
                    if (createConsultInvoice) {
                        const invCountToday = await tx.invoice.count({ where: { createdAt: { gte: todayStart } } });
                        const invoiceNumber = await generateInvoiceNumber(invCountToday + 1, today);
                        const lineDesc = getConsultationFeeDescription(visitType)
                            + (feeResolution.source === 'insurance' ? ` (${feeResolution.insuranceName} rate)` : '');

                        await tx.invoice.create({
                            data: {
                                invoiceNumber,
                                patientId,
                                visitId: visit.id,
                                totalAmount: consultationFee,
                                balanceDue: consultationFee,
                                status: "Unpaid",
                                issuedById: session.user.id,
                                items: {
                                    create: {
                                        description: lineDesc,
                                        quantity: 1,
                                        unitPrice: consultationFee,
                                        totalPrice: consultationFee,
                                        itemType: "Consultation",
                                    },
                                },
                            },
                        });
                    }

                    // Record the InsuranceVerification row when the
                    // cashier provided a result. The verify-insurance
                    // route may have already recorded this row if the
                    // cashier ran the check separately — but since this
                    // create-visit flow runs the third-party check
                    // BEFORE creating the visit, this is the first
                    // record. (No duplicate because verify-insurance is
                    // not called for the same visit beforehand.)
                    if (verification && enrollmentOnFile) {
                        await tx.insuranceVerification.create({
                            data: {
                                visitId: visit.id,
                                patientId,
                                insuranceId: enrollmentOnFile.insurance.id,
                                memberNumber: enrollmentOnFile.memberNumber ?? null,
                                policyNumber: enrollmentOnFile.policyNumber ?? null,
                                provider: verification.provider || enrollmentOnFile.insurance.name,
                                status: verification.status,
                                verificationNumber: verification.status === 'APPROVED' ? verification.verificationNumber : null,
                                coverageLimit: verification.coverageLimit ?? null,
                                deductibleRemaining: verification.deductibleRemaining ?? null,
                                coverageValidFrom: verification.coverageValidFrom ? new Date(verification.coverageValidFrom) : null,
                                coverageValidTo: verification.coverageValidTo ? new Date(verification.coverageValidTo) : null,
                                reason: verification.status === 'DENIED' ? verification.reason : (verification.status === 'ERROR' ? verification.reason : null),
                                requestPayload: { enrollmentId: enrollmentOnFile.id, source: 'create-visit-form' },
                                responsePayload: verification,
                                verifiedById: session.user.id,
                            },
                        });
                    }

                    return visit;
                });
            },
            // Fallback: append a random suffix to the predicted visit
            // number. Guarantees uniqueness under extreme concurrency.
            // The 4-char base36 suffix has ~1.7M possibilities.
            fallbackAction: async (randomId) => {
                const c = await prisma.visit.count({ where: { createdAt: { gte: todayStart } } });
                const fallbackNumber = `${await generateVisitNumber(c + 1, today)}-${randomId}`;
                return await prisma.$transaction(async (tx) => {
                    const visit = await tx.visit.create({
                        data: {
                            visitNumber: fallbackNumber,
                            patientId,
                            type: visitType,
                            chiefComplaint,
                            assignedDoctorId: doctorId,
                            status: initialStatus,
                            priority: "Normal",
                            ...(linkedPriorVisitId ? { linkedPriorVisitId } : {}),
                        },
                    });
                    const isCashFlowFb = !enrollmentOnFile;
                    const isDeniedFb = enrollmentOnFile && verification?.status === 'DENIED';
                    const createConsultInvoiceFallback = shouldCharge
                        && consultationFee > 0
                        && (isCashFlowFb || isDeniedFb);
                    if (createConsultInvoiceFallback) {
                        const invCountToday = await tx.invoice.count({ where: { createdAt: { gte: todayStart } } });
                        const invoiceNumber = `${await generateInvoiceNumber(invCountToday + 1, today)}-${randomId}`;
                        await tx.invoice.create({
                            data: {
                                invoiceNumber,
                                patientId,
                                visitId: visit.id,
                                totalAmount: consultationFee,
                                balanceDue: consultationFee,
                                status: "Unpaid",
                                issuedById: session.user.id,
                                items: {
                                    create: {
                                        description: getConsultationFeeDescription(visitType)
                                            + (feeResolution.source === 'insurance' ? ` (${feeResolution.insuranceName} rate)` : ''),
                                        quantity: 1,
                                        unitPrice: consultationFee,
                                        totalPrice: consultationFee,
                                        itemType: "Consultation",
                                    },
                                },
                            },
                        });
                    }
                    if (verification && enrollmentOnFile) {
                        await tx.insuranceVerification.create({
                            data: {
                                visitId: visit.id,
                                patientId,
                                insuranceId: enrollmentOnFile.insurance.id,
                                memberNumber: enrollmentOnFile.memberNumber ?? null,
                                policyNumber: enrollmentOnFile.policyNumber ?? null,
                                provider: verification.provider || enrollmentOnFile.insurance.name,
                                status: verification.status,
                                verificationNumber: verification.status === 'APPROVED' ? verification.verificationNumber : null,
                                coverageLimit: verification.coverageLimit ?? null,
                                deductibleRemaining: verification.deductibleRemaining ?? null,
                                coverageValidFrom: verification.coverageValidFrom ? new Date(verification.coverageValidFrom) : null,
                                coverageValidTo: verification.coverageValidTo ? new Date(verification.coverageValidTo) : null,
                                reason: verification.status === 'DENIED' ? verification.reason : (verification.status === 'ERROR' ? verification.reason : null),
                                requestPayload: { enrollmentId: enrollmentOnFile.id, source: 'create-visit-form' },
                                responsePayload: verification,
                                verifiedById: session.user.id,
                            },
                        });
                    }
                    return visit;
                });
            },
        });

        return NextResponse.json(
            {
                ...result,
                // R48: a consult invoice is issued at visit creation
                // when (a) the patient is cash OR (b) the cashier ran
                // the third-party check on the create-visit form and
                // the result was DENIED. For APPROVED, no consult
                // invoice — fee is deferred to the FINAL- invoice at
                // first order placement. If the patient has insurance
                // on file and no verification was provided, the visit
                // is parked at PendingInsuranceValidation and the
                // cashier verifies on the visit page (cashier can
                // also skip — see verify-insurance route).
                feeCharged: shouldCharge
                    && consultationFee > 0
                    && (!enrollmentOnFile || verification?.status === 'DENIED'),
                consultationFee,
                initialStatus,
                feeSource: feeResolution.source,
                isDirectService: isDirect,
                insuranceOnFile: !!enrollmentOnFile,
                insuranceName: enrollmentOnFile ? enrollmentOnFile.insurance.name : null,
                insuranceMemberNumber: enrollmentOnFile?.memberNumber ?? null,
                insurancePolicyNumber: enrollmentOnFile?.policyNumber ?? null,
                // R48: which branch drove the visit status. Lets the
                // success alert distinguish the cases.
                insuranceDeferConsult: enrollmentOnFile && verification?.status === 'APPROVED',
                insuranceDenied: enrollmentOnFile && verification?.status === 'DENIED',
                // R49: surface the feature flag so the UI knows whether
                // to show insurance-related controls. The insurance is
                // OFF → enrollmentOnFile will always be false, so the
                // UI shouldn't render the validation panel.
                insuranceFeatureOn,
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error("Visit creation error:", error);
        return NextResponse.json({
            error: "Failed to start visit",
            details: error.message || "Unknown error",
        }, { status: 500 });
    }
}
