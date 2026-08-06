import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const visitId = params.id;
        console.log(`[API] Fetching visit details for ID: ${visitId}`);

        const visit = await prisma.visit.findUnique({
            where: { id: params.id },
            include: {
                patient: {
                    include: {
                        // R47: include insurance enrollments so the visit
                        // page can render the validation card and the
                        // "insurance on file" badge without a second
                        // round-trip.
                        insuranceEnrollments: {
                            where: { isActive: true },
                            orderBy: { createdAt: 'desc' },
                            include: {
                                insurance: { select: { id: true, name: true, code: true, consultationFee: true, isActive: true } },
                            },
                        },
                    },
                },
                doctor: {
                    select: {
                        name: true,
                        id: true,
                        department: true
                    }
                },
                diagnoses: true,
                // Consolidated spec (R45): include subStatus on every order
                // so the visit detail page can render the per-item lifecycle
                // badges. Also include discontinuation fields + who did it.
                prescriptions: {
                    include: {
                        drug: { select: { name: true, genericName: true, strength: true } }
                    }
                },
                labOrders: true,
                radiologyOrders: true,
                discontinuationBy: { select: { name: true } },
                linkedPriorVisit: { select: { id: true, visitNumber: true, type: true } },
                followUpVisits: { select: { id: true, visitNumber: true, type: true } },
                // R47: include insurance verification history
                insuranceVerifications: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        verifiedBy: { select: { name: true } },
                        insurance: { select: { name: true, code: true } },
                    },
                },
                invoices: {
                    include: {
                        items: true,
                        payments: {
                            include: {
                                receivedBy: { select: { name: true } }
                            }
                        }
                    }
                }
            }
        });

        if (!visit) {
            console.log(`[API] Visit NOT FOUND in DB for ID: ${visitId}`);
            return NextResponse.json({ error: "Visit not found" }, { status: 404 });
        }

        return NextResponse.json(visit);
    } catch (error) {
        console.error("Visit fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch visit details" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const visitId = params.id;

        // Pre-fetch IDs needed to cascade deletes (child FK resolution)
        const visit = await prisma.visit.findUnique({
            where: { id: visitId },
            select: {
                id: true,
                invoices: { select: { id: true } },
                prescriptions: { select: { id: true } }
            }
        });

        if (!visit) {
            return NextResponse.json({ error: "Visit not found" }, { status: 404 });
        }

        const invoiceIds = visit.invoices.map(i => i.id);
        const prescriptionIds = visit.prescriptions.map(p => p.id);

        // Single atomic transaction — all-or-nothing, correct dependency order
        await prisma.$transaction([
            // Invoice children
            prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
            prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
            prisma.insuranceClaim.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
            // Invoices
            prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } }),
            // Visit-level insurance claims
            prisma.insuranceClaim.deleteMany({ where: { visitId } }),
            // Prescription children
            prisma.dispensingLog.deleteMany({ where: { prescriptionId: { in: prescriptionIds } } }),
            // Visit children
            prisma.prescription.deleteMany({ where: { visitId } }),
            prisma.labOrder.deleteMany({ where: { visitId } }),
            prisma.diagnosis.deleteMany({ where: { visitId } }),
            // Visit itself
            prisma.visit.delete({ where: { id: visitId } }),
        ]);

        return NextResponse.json({ message: "Visit successfully deleted" });
    } catch (error) {
        console.error("Visit deletion error:", error);
        return NextResponse.json({ error: "Failed to delete visit" }, { status: 500 });
    }
}

