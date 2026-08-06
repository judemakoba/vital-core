import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/patients/invoice/[id]
 * Get detailed invoice information for a patient (patient portal)
 * Query parameters: patientNumber, dateOfBirth
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    // Get the invoice and verify it belongs to the patient
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        patientId: patient.id
      },
      include: {
        items: {
          select: {
            description: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            itemType: true,
            referenceId: true
          }
        },
        payments: {
          select: {
            amount: true,
            paymentMethod: true,
            transactionId: true,
            createdAt: true,
            notes: true,
            receivedBy: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        visit: {
          select: {
            visitNumber: true,
            checkInTime: true,
            patient: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found or does not belong to this patient' },
        { status: 404 }
      );
    }

    // Format detailed invoice data
    const detailedInvoice = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      balanceDue: invoice.balanceDue,
      status: invoice.status,
      visit: invoice.visit ? {
        visitNumber: invoice.visit.visitNumber,
        date: invoice.visit.checkInTime,
        patientName: `${invoice.visit.patient?.firstName} ${invoice.visit.patient?.lastName}`
      } : null,
      items: invoice.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        type: item.itemType,
        referenceId: item.referenceId
      })),
      payments: invoice.payments.map(payment => ({
        amount: payment.amount,
        method: payment.paymentMethod,
        transactionId: payment.transactionId,
        date: payment.createdAt,
        notes: payment.notes,
        processedBy: payment.receivedBy?.name
      }))
    };

    return NextResponse.json(detailedInvoice);

  } catch (error) {
    console.error('Patient invoice detail error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve invoice details' },
      { status: 500 }
    );
  }
}