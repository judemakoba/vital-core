import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccountingService } from '@/lib/finance/accounting-service';

/**
 * POST /api/patients/payments
 * Process a payment for a patient (patient portal)
 * Body: { patientNumber, dateOfBirth, invoiceId, amount, paymentMethod, transactionId, notes }
 */
export async function POST(
  request: Request,
) {
  try {
    const body = await request.json();
    const {
      patientNumber,
      dateOfBirth,
      invoiceId,
      amount,
      paymentMethod,
      transactionId,
      notes
    } = body;

    // Validate required fields
    if (!patientNumber || !dateOfBirth || !invoiceId || !amount || !paymentMethod) {
      return new NextResponse(
        JSON.stringify({ error: 'Patient number, date of birth, invoice ID, amount, and payment method are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate date format
    const dateOfBirthDate = new Date(dateOfBirth);
    if (isNaN(dateOfBirthDate.getTime())) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid date of birth format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate amount
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid payment amount' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Find patient by number and date of birth
    const patient = await prisma.patient.findFirst({
      where: {
        patientNumber,
        dateOfBirth: dateOfBirthDate
      }
    });

    if (!patient) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid patient information' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the invoice and verify it belongs to the patient
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        patientId: patient.id
      }
    });

    if (!invoice) {
      return new NextResponse(
        JSON.stringify({ error: 'Invoice not found or does not belong to this patient' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate payment amount doesn't exceed balance due
    if (paymentAmount > invoice.balanceDue) {
      return new NextResponse(
        JSON.stringify({ error: 'Payment amount cannot exceed balance due' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Calculate new amounts
    const newAmountPaid = invoice.amountPaid + paymentAmount;
    const newBalanceDue = invoice.totalAmount - newAmountPaid;

    // Determine new status
    let newStatus = invoice.status;
    if (newBalanceDue <= 0) {
      newStatus = 'Paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'Partial';
    }

    // Create payment and update invoice in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create payment record
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: paymentAmount,
          paymentMethod,
          transactionId: transactionId || null,
          notes,
          receivedById: null // In patient portal, we don't have a staff user - could be system or leave null
        }
      });

      // Update invoice
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: newBalanceDue,
          status: newStatus
        }
      });

      return { payment, updatedInvoice };
    });

    // TODO: Post payment to ledger (would need a system user or handle null receivedById)
    // For now, we'll skip ledger posting in patient portal payments
    // In a real implementation, you might want to:
    // 1. Have a "portal user" or system user for posting
    // 2. Or handle this differently in the accounting service

    return new NextResponse(
      JSON.stringify({
        success: true,
        message: 'Payment processed successfully',
        payment: result.payment,
        invoice: result.updatedInvoice
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Patient payment processing error:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to process payment' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}