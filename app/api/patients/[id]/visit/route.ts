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
import { VISIT_STATUS, type VisitStatus } from "@/lib/visits/status";
import { VisitType } from "@/lib/generated-prisma";

/**
 * Per the consolidated visit cycle spec (R45):
 *
 *  - Visit type drives the initial status:
 *      * OPD / EMERGENCY / SCHEDULED / FOLLOW_UP / VACCINATION / ANTENATAL / OTHER
 *          → ConsultationBilling if billable, else Triage (zero-fee auto-transition)
 *      * LAB_ONLY / RADIOLOGY_ONLY / PRESCRIPTION_ONLY
 *          → DirectServicePending (skips triage + consultation entirely)
 *
 *  - FOLLOW_UP requires a `linkedPriorVisitId`:
 *      * the linked visit must exist
 *      * it must be Completed
 *      * its type must be OPD / FOLLOW_UP / VACCINATION / ANTENATAL / SCHEDULED
 *      * it must be within the configured follow-up window (default 14 days)
 *
 *  - Zero-fee auto-transition:
 *      * when `isBillableVisitType` returns false OR the resolved fee is 0,
 *        the visit is created in Triage (skipping the ConsultationBilling invoice step)
 *
 *  - Cash-only (insurance module removed 2026-08): all patients are cash.
 *    The consultation fee invoice is always issued up front for billable
 *    visits, no deferred-to-claim flow.
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
        const { type, doctorId, chiefComplaint, linkedPriorVisitId } = body;

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

        // 2. Resolve fee + initial status (cash-only)
        const isDirect = isDirectServiceVisitType(visitType);
        const shouldCharge = await isBillableVisitType(visitType);
        const feeResolution = await getConsultationFeeForNewVisit(prisma, patientId, visitType);
        const consultationFee = feeResolution.fee;

        let initialStatus: VisitStatus;
        if (isDirect) {
            initialStatus = VISIT_STATUS.DirectServicePending;
        } else if (shouldCharge && consultationFee > 0) {
            initialStatus = VISIT_STATUS.ConsultationBilling; // cash flow — invoice issued
        } else {
            initialStatus = VISIT_STATUS.Triage; // zero-fee auto-transition
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
        // catches P2002 on BOTH the visit number AND the invoice number.
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
                            ...(linkedPriorVisitId ? { linkedPriorVisitId } : {}),
                        },
                    });

                    // Issue consultation fee invoice for billable visits (cash flow)
                    const createConsultInvoice = shouldCharge && consultationFee > 0;
                    if (createConsultInvoice) {
                        const invCountToday = await tx.invoice.count({ where: { createdAt: { gte: todayStart } } });
                        const invoiceNumber = await generateInvoiceNumber(invCountToday + 1, today);

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
                                        description: getConsultationFeeDescription(visitType),
                                        quantity: 1,
                                        unitPrice: consultationFee,
                                        totalPrice: consultationFee,
                                        itemType: "Consultation",
                                    },
                                },
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
                    const createConsultInvoiceFb = shouldCharge && consultationFee > 0;
                    if (createConsultInvoiceFb) {
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
                                        description: getConsultationFeeDescription(visitType),
                                        quantity: 1,
                                        unitPrice: consultationFee,
                                        totalPrice: consultationFee,
                                        itemType: "Consultation",
                                    },
                                },
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
                feeCharged: shouldCharge && consultationFee > 0,
                consultationFee,
                initialStatus,
                feeSource: feeResolution.source,
                isDirectService: isDirect,
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
