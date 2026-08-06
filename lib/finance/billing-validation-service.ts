import { prisma } from '../prisma';
import {
  Patient,
  Visit,
  Invoice,
  InvoiceItem,
  ServiceType
} from '../generated-prisma';

/**
 * Service for validating invoices and performing charge capture auditing
 * Helps ensure billing accuracy and prevents revenue leakage
 */
export class BillingValidationService {
  /**
   * Validate invoice data before creation
   * @param invoiceData The invoice data to validate
   * @returns Object with validation results and any issues found
   */
  static async validateInvoice(
    invoiceData: {
      patientId: string;
      visitId?: string | null;
      items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        itemType?: string;
        referenceId?: string;
      }>;
      dueDate?: string | null;
    }
  ): Promise<{
    isValid: boolean;
    issues: Array<{
      severity: 'error' | 'warning' | 'info';
      field: string;
      message: string;
      suggestion?: string;
    }>;
  }> {
    const issues: Array<{
      severity: 'error' | 'warning' | 'info';
      field: string;
      message: string;
      suggestion?: string;
    }> = [];

    // 1. Validate patient exists and is active
    try {
      const patient = await prisma.patient.findUnique({
        where: { id: invoiceData.patientId },
        select: { id: true, isActive: true }
      });

      if (!patient) {
        issues.push({
          severity: 'error',
          field: 'patientId',
          message: 'Patient not found',
          suggestion: 'Verify the patient ID is correct and the patient exists in the system'
        });
      } else if (!patient.isActive) {
        issues.push({
          severity: 'error',
          field: 'patientId',
          message: 'Patient is not active',
          suggestion: 'Activate the patient record before creating invoices'
        });
      }
    } catch (error) {
      console.error('Error validating patient:', error);
      issues.push({
        severity: 'info',
        field: 'patientId',
        message: 'Unable to verify patient status'
      });
    }

    // 2. Validate visit if provided
    if (invoiceData.visitId) {
      try {
        const visit = await prisma.visit.findUnique({
          where: { id: invoiceData.visitId },
          select: { id: true, patientId: true, status: true }
        });

        if (!visit) {
          issues.push({
            severity: 'error',
            field: 'visitId',
            message: 'Visit not found',
            suggestion: 'Verify the visit ID is correct'
          });
        } else if (visit.patientId !== invoiceData.patientId) {
          issues.push({
            severity: 'error',
            field: 'visitId',
            message: 'Visit does not belong to the specified patient',
            suggestion: 'Verify the visit ID matches the patient'
          });
        } else if (visit.status === 'Cancelled') {
          issues.push({
            severity: 'warning',
            field: 'visitId',
            message: 'Visit is cancelled',
            suggestion: 'Verify if services were actually rendered before billing'
          });
        }
      } catch (error) {
        console.error('Error validating visit:', error);
        issues.push({
          severity: 'info',
          field: 'visitId',
          message: 'Unable to verify visit status'
        });
      }
    }

    // 3. Validate items array
    if (!invoiceData.items || invoiceData.items.length === 0) {
      issues.push({
        severity: 'error',
        field: 'items',
        message: 'Invoice must have at least one item',
        suggestion: 'Add at least one service or product to the invoice'
      });
    } else {
      // Validate each item
      invoiceData.items.forEach((item, index) => {
        const itemPrefix = `items[${index}]`;

        if (!item.description || item.description.trim() === '') {
          issues.push({
            severity: 'error',
            field: `${itemPrefix}.description`,
            message: 'Item description is required',
            suggestion: 'Provide a description for the service or product'
          });
        }

        if (item.quantity <= 0) {
          issues.push({
            severity: 'error',
            field: `${itemPrefix}.quantity`,
            message: 'Item quantity must be greater than zero',
            suggestion: 'Provide a valid quantity for the service or product'
          });
        }

        if (item.unitPrice < 0) {
          issues.push({
            severity: 'error',
            field: `${itemPrefix}.unitPrice`,
            message: 'Item unit price cannot be negative',
            suggestion: 'Provide a valid non-negative price for the service or product'
          });
        }

        // Warn about unusually high prices (potential data entry error)
        if (item.unitPrice > 10000) { // Arbitrary high threshold
          issues.push({
            severity: 'warning',
            field: `${itemPrefix}.unitPrice`,
            message: 'Item unit price is unusually high',
            suggestion: 'Verify the unit price is correct'
          });
        }
      });
    }

    // 4. Validate due date if provided
    if (invoiceData.dueDate) {
      try {
        const dueDate = new Date(invoiceData.dueDate);
        if (isNaN(dueDate.getTime())) {
          issues.push({
            severity: 'error',
            field: 'dueDate',
            message: 'Invalid due date format',
            suggestion: 'Provide a valid date in ISO format (YYYY-MM-DD)'
          });
        } else if (dueDate < new Date()) {
          issues.push({
            severity: 'warning',
            field: 'dueDate',
            message: 'Due date is in the past',
            suggestion: 'Consider using a future date for the due date'
          });
        }
      } catch (error) {
        console.error('Error validating due date:', error);
        issues.push({
          severity: 'info',
          field: 'dueDate',
          message: 'Unable to validate due date'
        });
      }
    }

    const isValid = !issues.some(issue => issue.severity === 'error');
    return { isValid, issues };
  }

  /**
   * Perform charge capture audit - check if all services from a visit are billed
   * @param invoiceId The ID of the invoice to audit
   * @returns Audit results with recommendations
   */
  static async auditChargeCapture(
    invoiceId: string
  ): Promise<{
    auditPassed: boolean;
    missedServices: Array<{
      type: string;
      description: string;
      quantity: number;
      suggestedCharge: number;
    }>;
    recommendations: string[];
  }> {
    const missedServices: Array<{
      type: string;
      description: string;
      quantity: number;
      suggestedCharge: number;
    }> = [];
    const recommendations: string[] = [];

    try {
      // Get the invoice with related data
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          patient: true,
          visit: {
            include: {
              prescriptions: true,
              labOrders: true,
              dispensingLogs: true
            }
          }
        }
      });

      if (!invoice || !invoice.visitId) {
        return {
          auditPassed: true, // Can't audit if no visit
          missedServices: [],
          recommendations: ['Unable to perform charge audit - no associated visit']
        };
      }

      const visit = invoice.visit;

      // Check for unbilled prescriptions
      const billedPrescriptionIds = new Set(
        invoice.items
          .filter(item => item.description.toLowerCase().includes('prescription'))
          .map(item => item.referenceId)
          .filter((id): id is string => id !== null && id !== undefined)
      );

      const unbilledPrescriptions = visit.prescriptions.filter(
        prescription => !billedPrescriptionIds.has(prescription.id)
      );

      unbilledPrescriptions.forEach(prescription => {
        // Estimate charge based on quantity and typical pricing
        // In a real system, you'd look up the actual drug price
        const estimatedCharge = prescription.quantity * 10; // Placeholder

        missedServices.push({
          type: 'PRESCRIPTION',
          description: `${prescription.medicationName} - ${prescription.dosage} x ${prescription.durationDays} days`,
          quantity: prescription.quantity,
          suggestedCharge: estimatedCharge
        });
      });

      // Check for unbilled lab orders
      const billedLabIds = new Set(
        invoice.items
          .filter(item => item.description.toLowerCase().includes('lab') ||
                         item.description.toLowerCase().includes('test'))
          .map(item => item.referenceId)
          .filter((id): id is string => id !== null && id !== undefined)
      );

      const unbilledLabs = visit.labOrders.filter(
        lab => !billedLabIds.has(lab.id)
      );

      unbilledLabs.forEach(lab => {
        // Estimate charge - in reality, you'd look up the test price
        const estimatedCharge = 50; // Placeholder

        missedServices.push({
          type: 'LAB_ORDER',
          description: lab.testName,
          quantity: 1,
          suggestedCharge: estimatedCharge
        });
      });

      // Check for unbilled dispensing logs (medications given during visit)
      const billedDispenseIds = new Set(
        invoice.items
          .filter(item => item.description.toLowerCase().includes('dispensed') ||
                         item.description.toLowerCase().includes('medication'))
          .map(item => item.referenceId)
          .filter((id): id is string => id !== null && id !== undefined)
      );

      const unbilledDispensing = visit.dispensingLogs.filter(
        dispense => !billedDispenseIds.has(dispense.id)
      );

      unbilledDispensing.forEach(dispense => {
        // Estimate charge based on quantity and drug cost
        // In reality, you'd look up the actual drug cost from the dispense record
        const estimatedCharge = dispense.quantityDispensed * 15; // Placeholder

        missedServices.push({
          type: 'DISPENSING',
          description: `${dispense.drug?.name || 'Medication'} - ${dispense.quantityDispensed} units`,
          quantity: dispense.quantityDispensed,
          suggestedCharge: estimatedCharge
        });
      });

      // Generate recommendations based on findings
      if (unbilledPrescriptions.length > 0) {
        recommendations.push(
          `Consider adding ${unbilledPrescriptions.length} prescription(s) to the invoice`
        );
      }

      if (unbilledLabs.length > 0) {
        recommendations.push(
          `Consider adding ${unbilledLabs.length} lab test(s) to the invoice`
        );
      }

      if (unbilledDispensing.length > 0) {
        recommendations.push(
          `Consider adding ${unbilledDispensing.length} medication dispensing(s) to the invoice`
        );
      }

      const auditPassed = missedServices.length === 0;
      return { auditPassed, missedServices, recommendations };
    } catch (error) {
      console.error('Error in charge audit:', error);
      return {
        auditPassed: false,
        missedServices: [],
        recommendations: ['Unable to complete charge audit due to system error']
      };
    }
  }

  /**
   * Validate that an invoice meets basic business rules
   * @param invoiceId The ID of the invoice to validate
   * @returns Validation results
   */
  static async validateCreatedInvoice(invoiceId: string): Promise<{
    isValid: boolean;
    issues: Array<{
      severity: 'error' | 'warning' | 'info';
      field: string;
      message: string;
    }>;
  }> {
    const issues: Array<{
      severity: 'error' | 'warning' | 'info';
      field: string;
      message: string;
    }> = [];

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          patient: true,
          items: true,
          visit: true
        }
      });

      if (!invoice) {
        issues.push({
          severity: 'error',
          field: 'invoiceId',
          message: 'Invoice not found'
        });
        return { isValid: false, issues };
      }

      // Check if total amount matches sum of items
      const itemTotal = invoice.items.reduce((sum, item) =>
        sum + (item.unitPrice * item.quantity), 0);

      if (Math.abs(itemTotal - invoice.totalAmount) > 0.01) {
        issues.push({
          severity: 'error',
          field: 'totalAmount',
          message: `Invoice total (${invoice.totalAmount}) does not match sum of items (${itemTotal})`
        });
      }

      // Check if balance due is correct
      const expectedBalance = invoice.totalAmount - invoice.amountPaid;
      if (Math.abs(expectedBalance - invoice.balanceDue) > 0.01) {
        issues.push({
          severity: 'error',
          field: 'balanceDue',
          message: `Balance due (${invoice.balanceDue}) does not match expected value (${expectedBalance})`
        });
      }

      // Check status consistency
      if (invoice.status === 'Paid' && invoice.balanceDue > 0) {
        issues.push({
          severity: 'warning',
          field: 'status',
          message: 'Invoice marked as Paid but has positive balance due'
        });
      }

      if (invoice.status === 'Unpaid' && invoice.balanceDue === 0) {
        issues.push({
          severity: 'warning',
          field: 'status',
          message: 'Invoice marked as Unpaid but has zero balance due'
        });
      }

      const isValid = !issues.some(issue => issue.severity === 'error');
      return { isValid, issues };
    } catch (error) {
      console.error('Error validating invoice:', error);
      return {
        isValid: false,
        issues: [{
          severity: 'error',
          field: 'system',
          message: 'Unable to validate invoice due to system error'
        }]
      };
    }
  }
}