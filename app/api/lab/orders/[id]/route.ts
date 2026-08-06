import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { markOrderFulfilled, markOrderUnfulfilled } from "@/lib/visits/substatus";

function safeParseRows(s: string): any[] | null {
    try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const labOrder = await prisma.labOrder.findUnique({
            where: { id: params.id },
            include: {
                patient: true,
                doctor: {
                    select: { name: true }
                },
                visit: {
                    select: { visitNumber: true }
                }
            }
        });

        if (!labOrder) {
            return NextResponse.json({ error: "Lab order not found" }, { status: 404 });
        }

        // Try to fetch the corresponding test template and reference range from the catalog
        const catalogTest = await prisma.labTestCatalog.findFirst({
            where: { name: labOrder.testName },
            include: {
                resultTemplate: { select: { id: true, resultMode: true, resultSchema: true, templateName: true } },
            },
        });

        // Add the template and reference range to the response object if they exist
        const responseData = {
            ...labOrder,
            template: catalogTest?.template || null,
            referenceRange: catalogTest?.referenceRange || null,
            unit: catalogTest?.unit || null,
            resultRowsParsed: labOrder.resultRows ? safeParseRows(labOrder.resultRows) : null,
            resultMode: catalogTest?.resultTemplate?.resultMode || null,
            resultSchema: catalogTest?.resultTemplate?.resultSchema || null,
            testCatalogId: catalogTest?.id || null,
        };

        return NextResponse.json(responseData);
    } catch (error) {
        console.error("Failed to fetch lab order:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== "LAB_TECH" && session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { status, result, resultFlags, resultRows } = body;

        // For completion, either result (single/qualitative) or resultRows (table) must be set
        if (status === "Completed") {
            const hasSingle = result && result.trim() !== '';
            const rowsArr = Array.isArray(resultRows) ? resultRows : (typeof resultRows === 'string' ? safeParseRows(resultRows) : null);
            const hasRows = rowsArr && rowsArr.length > 0 && rowsArr.some((r: any) => r.result != null && String(r.result).trim() !== '');
            if (!hasSingle && !hasRows) {
                return NextResponse.json(
                    { error: "Test results must be provided to complete the order." },
                    { status: 400 }
                );
            }
        }

        // Get the order first to know the visitId
        const existingOrder = await prisma.labOrder.findUnique({
            where: { id: params.id },
            select: { visitId: true }
        });

        const updateData: any = {
            status,
            result: result || undefined,
            resultFlags: resultFlags || undefined,
        };
        if (resultRows !== undefined) {
            // Accept as array or already-stringified JSON
            updateData.resultRows = typeof resultRows === 'string'
                ? resultRows
                : JSON.stringify(resultRows);
        }

        const updatedOrder = await prisma.labOrder.update({
            where: { id: params.id },
            data: updateData,
        });

        // Consolidated visit cycle spec (R45):
        //   - When the lab tech completes the order, the order's subStatus
        //     transitions InProgress → Fulfilled.
        //   - If that was the last non-terminal order on the visit, the
        //     parent visit moves from PendingOrders → FinalBilling.
        //   - The FinalBilling → Completed transition is driven separately
        //     by the areAllVisitInvoicesPaid check (already in the payment
        //     route).
        //
        // We do this in a transaction so the order update + sub-status
        // transition + visit re-evaluation either all happen or none.
        if (existingOrder && status === "Completed") {
            const transitionResult = await prisma.$transaction(async (tx) => {
                return await markOrderFulfilled(tx, "LAB", params.id);
            });
            if (transitionResult.visitAdvanced) {
                console.log(
                    `[Lab] LabOrder ${params.id} fulfilled — visit ${existingOrder.visitId} ` +
                    `advanced to ${transitionResult.newVisitStatus}`
                );
            }
        }

        return NextResponse.json(updatedOrder);
    } catch (error) {
        console.error("Failed to update lab order:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;

        if (!session || (user?.role !== "DOCTOR" && user?.role !== "SUPER_ADMIN" && user?.role !== "ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const labOrder = await prisma.labOrder.findUnique({
            where: { id: params.id },
            include: { visit: true }
        });

        if (!labOrder) {
            return NextResponse.json({ error: "Lab order not found" }, { status: 404 });
        }

        if (labOrder.status === "Completed") {
            return NextResponse.json({ error: "Cannot cancel a completed lab order" }, { status: 400 });
        }

        // Consolidated visit cycle spec (R45): cancelled orders transition
        // to Unfulfilled (terminal, hidden, audit-logged) instead of being
        // hard-deleted. This preserves the audit trail of what was ordered
        // and why it wasn't fulfilled.
        const cancelResult = await prisma.$transaction(async (tx) => {
            // Remove the invoice line item (the patient doesn't owe for it)
            const invoiceItem = await tx.invoiceItem.findFirst({
                where: { itemType: "Lab", referenceId: params.id },
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

            // Mark Unfulfilled (audited) instead of hard delete
            return await markOrderUnfulfilled(tx, "LAB", params.id, "Doctor/Admin cancelled", {
                scheduledAt: labOrder.createdAt,
                invoiceId,
            });
        });
        if (cancelResult.visitAdvanced) {
            console.log(
                `[Lab] LabOrder ${params.id} cancelled (Unfulfilled) — visit ${labOrder.visitId} ` +
                `advanced to ${cancelResult.newVisitStatus}`
            );
        }

        return NextResponse.json({ success: true, cancelled: true });
    } catch (error) {
        console.error("Failed to cancel lab order:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
