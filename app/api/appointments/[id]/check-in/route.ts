export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getVisitSettings, isBillableVisitType, getConsultationFeeDescription, getConsultationFeeForNewVisit } from "@/lib/visits/consultation-fee";
import { VisitType } from "@/lib/generated-prisma";

export async function POST(request: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Allow client to override the visit type (e.g. when receptionist selects FOLLOW_UP)
        const body = await request.json().catch(() => ({}));
        const requestedType = (body?.visitType ?? 'SCHEDULED') as VisitType;

        const appointment = await prisma.appointment.findUnique({
            where: { id: params.id }
        });

        if (!appointment) {
            return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
        }

        if (appointment.status === "Completed") {
            return NextResponse.json({ error: "Already completed" }, { status: 400 });
        }

        // Check for existing active visits (any pre-terminal state — patient is still in process)
        const activeVisit = await prisma.visit.findFirst({
            where: {
                patientId: appointment.patientId,
                status: {
                    in: ["ConsultationBilling", "FinalBilling", "Waiting", "Triage", "Triaged", "Consultation", "Doctor", "Pharmacy", "Laboratory", "Radiology"]
                }
            }
        });

        if (activeVisit) {
            return NextResponse.json(
                { error: `Patient already has an active visit (${activeVisit.visitNumber}) in status: ${activeVisit.status}. Please complete it before starting a new one.` },
                { status: 400 }
            );
        }

        // 1. Update Appointment Status
        await prisma.appointment.update({
            where: { id: params.id },
            data: { status: "Checked-In" }
        });

        // 2. Generate Visit Number (using tenant-configured format).
        // Wrapped in withUniqueRetry so two concurrent check-ins don't
        // collide on the unique visitNumber constraint (P2002).
        const today = new Date();
        const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
        const { generateInvoiceNumber, withUniqueRetry } = await import("@/lib/formatters");

        // Determine if this visit type should be charged, and the fee amount
        const shouldCharge = await isBillableVisitType(requestedType);
        const visitType = requestedType;

        // Resolve the per-insurance consultation fee if the patient is enrolled.
        // Falls back to the global setting (per visit type) when no insurance override.
        const feeResolution = await getConsultationFeeForNewVisit(prisma, appointment.patientId, visitType);
        const consultationFee = feeResolution.fee;

        // Visit status: billable → ConsultationBilling (awaiting consult fee);
        //                non-billable (FOLLOW_UP, LAB_REVIEW, etc.) → Triage (skip the fee, go straight to vitals)
        const initialStatus = shouldCharge ? "ConsultationBilling" : "Triage";

        // Create visit + invoice atomically. The retry catches P2002 on
        // BOTH the visit number AND the invoice number — two concurrent
        // check-ins can collide on either field. The retry re-counts
        // from the DB each attempt so the next attempt walks forward to
        // a free number. If retries are exhausted, the fallback appends
        // a random suffix to guarantee a unique number.
        const visit = await withUniqueRetry({
            fields: ["visitNumber", "invoiceNumber"],
            computeSequence: async (attempt) => {
                const c = await prisma.visit.count({ where: { createdAt: { gte: todayStart } } });
                const { generateVisitNumber } = await import("@/lib/formatters");
                return await generateVisitNumber(c + attempt, today);
            },
            action: async (visitNumber) => {
                return await prisma.$transaction(async (tx) => {
                    const newVisit = await tx.visit.create({
                        data: {
                            visitNumber,
                            patientId: appointment.patientId,
                            assignedDoctorId: appointment.doctorId,
                            type: visitType,
                            chiefComplaint: appointment.reason,
                            priority: "Normal",
                            status: initialStatus,
                            checkInTime: new Date()
                        }
                    });

                    // Only create the consultation-fee invoice for billable visit types
                    if (shouldCharge) {
                        const invCountToday = await tx.invoice.count({ where: { createdAt: { gte: todayStart } } });
                        const invoiceNumber = await generateInvoiceNumber(invCountToday + 1, today);

                        await tx.invoice.create({
                            data: {
                                invoiceNumber,
                                patientId: appointment.patientId,
                                visitId: newVisit.id,
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
                                        itemType: "Consultation"
                                    }
                                }
                            }
                        });
                    }

                    return newVisit;
                });
            },
            // Fallback: append a random suffix to guarantee uniqueness
            // under extreme concurrency (~1.7M possibilities).
            fallbackAction: async (randomId) => {
                const c = await prisma.visit.count({ where: { createdAt: { gte: todayStart } } });
                const { generateVisitNumber } = await import("@/lib/formatters");
                const fallbackNumber = `${await generateVisitNumber(c + 1, today)}-${randomId}`;
                return await prisma.$transaction(async (tx) => {
                    const newVisit = await tx.visit.create({
                        data: {
                            visitNumber: fallbackNumber,
                            patientId: appointment.patientId,
                            assignedDoctorId: appointment.doctorId,
                            type: visitType,
                            chiefComplaint: appointment.reason,
                            priority: "Normal",
                            status: initialStatus,
                            checkInTime: new Date()
                        }
                    });
                    if (shouldCharge) {
                        const invCountToday = await tx.invoice.count({ where: { createdAt: { gte: todayStart } } });
                        const invoiceNumber = `${await generateInvoiceNumber(invCountToday + 1, today)}-${randomId}`;
                        await tx.invoice.create({
                            data: {
                                invoiceNumber,
                                patientId: appointment.patientId,
                                visitId: newVisit.id,
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
                                        itemType: "Consultation"
                                    }
                                }
                            }
                        });
                    }
                    return newVisit;
                });
            },
        });

        const message = shouldCharge
            ? `Patient checked in successfully — consultation fee UGX ${consultationFee.toLocaleString()} (${feeResolution.source === 'insurance' ? `${feeResolution.insuranceName} rate` : 'standard rate'}) awaiting payment`
            : `Patient checked in successfully. No consultation fee charged (visit type: ${visitType}); sent directly to triage.`;

        return NextResponse.json({
            visit,
            message,
            feeCharged: shouldCharge,
            initialStatus,
            consultationFee,
            feeSource: feeResolution.source
        }, { status: 201 });
    } catch (error) {
        console.error("Check-in error:", error);
        return NextResponse.json({ error: "Failed to check in patient" }, { status: 500 });
    }
}
