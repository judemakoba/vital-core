export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/patients/billing
 * Get billing information for a patient (patient portal)
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
        { error: 'Patient number and date of the birth are required' },
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

    // Find patient by pass
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

    // Get outstanding invoices (unpaid or partial)
    const invoices = await prisma.invoice.findMany({
      where: {
        patientId: patient.id,
        status: {
          in: ['Unpaid', 'Partial']
        }
      },
      include: {
        items: {
          select: {
            description: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            itemType: true
          }
        },
        payments: {
          select: {
            amount: true,
            paymentMethod: true,
            createdAt: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        visit: {
          select: {
            visitNumber: true,
            checkInTime: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format invoice data
    const invoiceSummary = invoices.map(invoice => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      balanceDue: invoice.balanceDue,
      status: invoice.status,
      visitNumber: invoice.visit?.visitNumber,
      visitDate: invoice.visit?.checkInTime,
      items: invoice.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        type: item.itemType
      })),
      recentPayments: invoice.payments.map(payment => ({
        amount: payment.amount,
        method: payment.paymentMethod,
        date: payment.createdAt
      }))
    }));

    // Calculate totals
    const totalOutstanding = invoices.reduce((sum, invoice) => sum + invoice.balanceDue, 0);
    const totalCharges = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const totalPaid = invoices.reduce((sum, invoice) => sum + invoice.amountPaid, 0);

    return NextResponse.json({
      patient: {
        id: patient.id,
        patientNumber: patient.patientNumber,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth
      },
      invoices: invoiceSummary,
      summary: {
        totalOutstanding,
        totalCharges,
        totalPaid,
        invoiceCount: invoices.length
      }
    });

  } catch (error) {
    console.error('Patient billing error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve billing information' },
      { status: 500 }
    );
  }
}