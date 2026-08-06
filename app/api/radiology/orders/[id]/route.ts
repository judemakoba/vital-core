import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { markOrderFulfilled, markOrderUnfulfilled } from "@/lib/visits/substatus";

// GET /api/radiology/orders/[id] - Fetch single radiology order
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const order = await prisma.radiologyOrder.findUnique({
            where: { id: params.id },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                        dateOfBirth: true,
                        gender: true,
                        phone: true
                    }
                },
                doctor: { select: { name: true } },
                visit: { select: { visitNumber: true, priority: true } },
            },
        });

        if (!order) {
            return NextResponse.json({ error: "Radiology order not found" }, { status: 404 });
        }

        // Fetch exam reference data from catalog (including template)
        const catalogExam = await prisma.radiologyCatalog.findFirst({
            where: { name: order.examName },
            include: {
                resultTemplate: {
                    select: { id: true, templateName: true, isActive: true },
                },
            },
        });

        return NextResponse.json({
            ...order,
            preparationInstructions: catalogExam?.preparationInstructions || null,
            turnaroundTime: catalogExam?.turnaroundTime || null,
            hasTemplate: !!catalogExam?.resultTemplate,
            templateId: catalogExam?.resultTemplate?.id || null,
        });
    } catch (error) {
        console.error("Failed to fetch radiology order:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// PUT /api/radiology/orders/[id] - Update status / enter results (RADIOLOGIST role)
export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = (await getServerSession(authOptions)) as any;
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const allowedRoles = ["RADIOLOGIST", "LAB_TECH", "ADMIN", "SUPER_ADMIN"];
        if (!allowedRoles.includes(session.user?.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const {
            status,
            result,
            reportUrl,
            technique,
            findings,
            impression,
            recommendations,
            radiologistNotes,
            modality,
            contrastUsed,
        } = body;

        // Require either result or findings when completing (back-compat: result is still accepted)
        const hasResult = (findings && findings.trim().length > 0) || (result && result.trim().length > 0);
        if (status === "Completed" && !hasResult) {
            return NextResponse.json(
                { error: "Findings (or legacy result) must be provided to complete the exam." },
                { status: 400 }
            );
        }

        const existing = await prisma.radiologyOrder.findUnique({
            where: { id: params.id },
            select: { visitId: true, status: true }
        });

        if (!existing) {
            return NextResponse.json({ error: "Radiology order not found" }, { status: 404 });
        }

        const data: any = {
            status,
            reportUrl: reportUrl ?? undefined,
            completedAt: status === "Completed" ? new Date() : undefined,
        };
        if (result !== undefined) data.result = result;
        if (technique !== undefined) data.technique = technique;
        if (findings !== undefined) data.findings = findings;
        if (impression !== undefined) data.impression = impression;
        if (recommendations !== undefined) data.recommendations = recommendations;
        if (radiologistNotes !== undefined) data.radiologistNotes = radiologistNotes;
        if (modality !== undefined) data.modality = modality;
        if (contrastUsed !== undefined) data.contrastUsed = !!contrastUsed;

        const updated = await prisma.radiologyOrder.update({
            where: { id: params.id },
            data,
        });

        // Consolidated visit cycle spec (R45):
        //   - When the radiologist completes the order, the order's subStatus
        //     transitions InProgress → Fulfilled.
        //   - If that was the last non-terminal order on the visit, the parent
        //     visit moves from PendingOrders → FinalBilling via
        //     `decideNextStatusForPendingVisit`.
        //   - The FinalBilling → Completed transition is driven separately by
        //     the areAllVisitInvoicesPaid check in the payment route.
        if (existing.status !== "Completed" && status === "Completed") {
            const transitionResult = await prisma.$transaction(async (tx) => {
                return await markOrderFulfilled(tx, "RADIOLOGY", params.id);
            });
            if (transitionResult.visitAdvanced) {
                console.log(
                    `[Radiology] RadiologyOrder ${params.id} fulfilled — visit ${existing.visitId} ` +
                    `advanced to ${transitionResult.newVisitStatus}`
                );
            }
        }

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to update radiology order:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// DELETE /api/radiology/orders/[id] - Cancel an order (Doctor or Admin)
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = (await getServerSession(authOptions)) as any;
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const allowedRoles = ["DOCTOR", "ADMIN", "SUPER_ADMIN"];
        if (!allowedRoles.includes(session.user?.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const order = await prisma.radiologyOrder.findUnique({
            where: { id: params.id },
            include: { visit: true }
        });

        if (!order) {
            return NextResponse.json({ error: "Radiology order not found" }, { status: 404 });
        }

        if (order.status === "Completed") {
            return NextResponse.json(
                { error: "Cannot cancel a completed radiology exam." },
                { status: 400 }
            );
        }

        // Consolidated visit cycle spec (R45): cancelled orders transition to
        // Unfulfilled (terminal, hidden, audit-logged) instead of being
        // hard-deleted. Preserves the audit trail of what was ordered and why.
        const cancelResult = await prisma.$transaction(async (tx) => {
            const invoiceItem = await tx.invoiceItem.findFirst({
                where: { itemType: "Radiology", referenceId: params.id },
            });
            let invoiceId: string | null = null;
            if (invoiceItem) {
                const amount = invoiceItem.totalPrice;
                invoiceId = invoiceItem.invoiceId;
                await tx.invoiceItem.delete({ where: { id: invoiceItem.id } });
                await tx.invoice.update({
                    where: { id: invoiceId },
                    data: {
                        totalAmount: { decrement: amount },
                        balanceDue: { decrement: amount },
                    },
                });
            }
            return await markOrderUnfulfilled(tx, "RADIOLOGY", params.id, "Doctor/Admin cancelled", {
                scheduledAt: order.createdAt,
                invoiceId,
            });
        });
        if (cancelResult.visitAdvanced) {
            console.log(
                `[Radiology] RadiologyOrder ${params.id} cancelled (Unfulfilled) — visit ${order.visitId} ` +
                `advanced to ${cancelResult.newVisitStatus}`
            );
        }

        return NextResponse.json({ success: true, cancelled: true });
    } catch (error) {
        console.error("Failed to cancel radiology order:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
