export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/patients/payments/history
 * Get payment history for a patient (patient portal)
 * Query parameters: patientNumber, dateOfBirth
 */
export async function GET(
  request: NextRequest,
) {
  try {
    const { searchParams } = new URL(request.url);
    const patientNumber = searchParams.get('patientNumber');
    const dateOfBirthStr = searchParams.get('dateOfBirth');

    if (!patientNumber || !dateOfBirthStr) {
      return NextResponse.json(
        { error: 'Patient number and date of birth are required' },
        { status: 400 }
      );
    }

    // Validate date format
    const dateOfBirth = new Date(dateOfBirthStr);
    if (isNaN(dateOfBirth.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date of birth format' },
        { status: 400 }
      );
    }

    // Find patient by number and date of birth
    const patient = await prisma.patient.findFirst({
      where: {
        patientNumber,
        dateOfBirth
      }
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Invalid patient information' },
        { status: 401 }
      );
    }

    // Get payment history for this patient's invoices
    const payments = await prisma.payment.findMany({
      where: {
        invoice: {
          patientId: patient.id
        }
      },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            status: true
          }
        },
        receivedBy: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format payment history
    const paymentHistory = payments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      transactionId: payment.transactionId,
      invoiceNumber: payment.invoice?.invoiceNumber,
      invoiceTotal: payment.invoice?.totalAmount,
      invoiceStatus: payment.invoice?.status,
      processedBy: payment.receivedBy?.name,
      processedDate: payment.createdAt,
      notes: payment.notes
    }));

    // Calculate totals
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

    return NextResponse.json({
      patient: {
        id: patient.id,
        patientNumber: patient.patientNumber,
        firstName: patient.firstName,
        lastName: patient.lastName
      },
      paymentHistory,
      summary: {
        totalPaid,
        count: payments.length
      }
    });

  } catch (error) {
    console.error('Patient payment history error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve payment history' },
      { status: 500 }
    );
  }
}