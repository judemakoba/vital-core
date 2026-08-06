import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;

        if (!session || (user?.role !== "SUPER_ADMIN" && user?.role !== "ADMIN" && user?.role !== "ACCOUNTANT")) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';
        const status = searchParams.get('status') || '';

        const whereClause: any = {};
        if (status) whereClause.paymentStatus = status;
        if (search) {
            whereClause.OR = [
                { invoiceNumber: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { patient: { firstName: { contains: search, mode: 'insensitive' } } },
                { patient: { lastName: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const invoices = await prisma.taxInvoice.findMany({
            where: whereClause,
            include: {
                patient: true,
                insurance: true,
                lines: true,
                createdBy: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Generate CSV
        const headers = [
            "Invoice Number",
            "Date",
            "Type",
            "Client Name",
            "TIN",
            "Subtotal",
            "Tax Total",
            "Total Amount",
            "Amount Paid",
            "Balance Due",
            "Status",
            "Created By"
        ].join(",");

        const rows = invoices.map(inv => {
            const clientName = inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : (inv.customerName || "Walk-in");
            return [
                inv.invoiceNumber,
                inv.invoiceDate.toISOString().split('T')[0],
                inv.invoiceType,
                `"${clientName}"`,
                inv.customerTin || "",
                inv.subtotal,
                inv.taxTotal,
                inv.totalAmount,
                inv.amountPaid,
                inv.balanceDue,
                inv.paymentStatus,
                `"${inv.createdBy?.name || ""}"`
            ].join(",");
        });

        const csvContent = [headers, ...rows].join("\n");

        return new NextResponse(csvContent, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="tax_invoices_${new Date().toISOString().split('T')[0]}.csv"`
            }
        });
    } catch (error) {
        console.error("Failed to export invoices:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
