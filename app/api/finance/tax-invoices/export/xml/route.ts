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
        const invoiceId = searchParams.get('id');

        const whereClause = invoiceId ? { id: invoiceId } : {};

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

        if (invoices.length === 0) {
            return new NextResponse("No invoices found to export", { status: 404 });
        }

        // Basic XML Structure mimicking URA E-Invoicing requirements
        // In a real production system, this would exactly match the EFRIS XSD schema
        let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<Invoices>\n`;

        for (const inv of invoices) {
            const clientName = inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : (inv.customerName || "Walk-in");
            let linesXml = "";

            inv.lines.forEach((l: any) => {
                linesXml += `
            <InvoiceLine>
                <LineNumber>${l.lineNumber}</LineNumber>
                <ItemName><![CDATA[${l.itemName}]]></ItemName>
                <Quantity>${l.quantity}</Quantity>
                <UnitPrice>${l.unitPrice}</UnitPrice>
                <DiscountAmount>${l.discountAmount}</DiscountAmount>
                <TaxAmount>${l.taxAmount}</TaxAmount>
                <LineTotal>${l.lineTotal}</LineTotal>
            </InvoiceLine>`;
            });

            xmlContent += `
    <Invoice>
        <InvoiceNumber>${inv.invoiceNumber}</InvoiceNumber>
        <InvoiceDate>${inv.invoiceDate.toISOString()}</InvoiceDate>
        <InvoiceType>${inv.invoiceType}</InvoiceType>
        <BuyerDetails>
            <BuyerName><![CDATA[${clientName}]]></BuyerName>
            <BuyerTIN>${inv.customerTin || ""}</BuyerTIN>
        </BuyerDetails>
        <Summary>
            <GrossAmount>${inv.subtotal}</GrossAmount>
            <DiscountTotal>${inv.discountTotal}</DiscountTotal>
            <TaxTotal>${inv.taxTotal}</TaxTotal>
            <NetAmount>${inv.totalAmount}</NetAmount>
        </Summary>
        <Lines>${linesXml}
        </Lines>
    </Invoice>`;
        }

        xmlContent += `\n</Invoices>`;

        return new NextResponse(xmlContent, {
            headers: {
                "Content-Type": "application/xml",
                "Content-Disposition": `attachment; filename="ura_invoices_${new Date().toISOString().split('T')[0]}.xml"`
            }
        });

    } catch (error) {
        console.error("Failed to export XML:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
