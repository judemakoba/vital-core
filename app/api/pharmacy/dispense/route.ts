import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AccountingService } from '@/lib/finance/accounting-service';
// R50 (Option D): we now use transitionOrderSubStatus + ITEM_SUB_STATUS
// in addition to markOrderFulfilled. The InProgress waypoint is
// required by the state machine (AwaitingPayment → Fulfilled is
// not a legal jump), and the dispense IS the implicit payment
// commit in Option D.
import { markOrderFulfilled, transitionOrderSubStatus } from '@/lib/visits/substatus';
import { ITEM_SUB_STATUS } from '@/lib/visits/status';
// R50 (Option D): pharmacy creates the FINAL- invoice line item
// at dispense time using the actual batch + actual quantity + actual
// price. Need the invoice helper.
import { findOrCreateFinalBillInvoice } from '@/lib/finance/invoice-helper';

/** Check if a value has a fractional component */
function isFractional(n: number): boolean {
  return !Number.isInteger(n);
}

/**
 * Core dose-calculation engine.
 *
 * Formula: ceil(doseAmount / drugStrengthValue × frequencyPerDay × durationDays)
 *
 * Rationale: the doctor prescribes a dose (e.g. 1000 mg TDS × 7 days).
 * The pharmacy must figure out how many physical units (e.g. 250 mg tablets)
 * to hand over. doseAmount is the mg being prescribed per dose event;
 * drugStrengthValue is the mg per physical tablet/unit in stock.
 *
 * Edge cases:
 * - doseAmount or drugStrengthValue is 0/null → fallback to prescription.quantity
 * - Fractional result (e.g. 1.5 tablets) → always ceil (round up) to avoid under-dispensing
 *
 * Returns source = 'calculated' when dose math is used, 'fallback' when falling back
 * to prescription.quantity (no structured dose data).
 */
function calcDispenseQuantity(params: {
  doseAmount: number | null;
  frequencyPerDay: number | null;
  durationDays: number;
  drugStrengthValue: number;
  prescriptionQuantity: number;
}): {
  unitsPerDose: number;       // mg prescribed ÷ mg per tablet  (e.g. 2.0)
  totalUnits: number;        // ceil(unitsPerDose × freq × days)  (e.g. 42)
  source: 'calculated' | 'fallback';
  quantityMismatch: boolean;  // true when calculated ≠ prescription.quantity
  mismatchPct: number;        // |calculated - quantity| / quantity × 100, or 0
} {
  const { doseAmount, frequencyPerDay, durationDays, drugStrengthValue, prescriptionQuantity } = params;

  if (
    doseAmount != null &&
    frequencyPerDay != null &&
    drugStrengthValue > 0 &&
    durationDays > 0
  ) {
    const unitsPerDose = doseAmount / drugStrengthValue;
    // Always round UP — better to dispense slightly more than under-dispense
    const totalUnits = Math.ceil(unitsPerDose * frequencyPerDay * durationDays);

    const mismatchPct =
      prescriptionQuantity > 0
        ? Math.abs(totalUnits - prescriptionQuantity) / prescriptionQuantity
        : 0;

    return {
      unitsPerDose,
      totalUnits,
      source: 'calculated',
      quantityMismatch: mismatchPct > 0.01,  // > 1% difference counts as mismatch
      mismatchPct,
    };
  }

  // No structured dose data — fall back to whatever quantity the doctor entered
  return {
    unitsPerDose: prescriptionQuantity,
    totalUnits: prescriptionQuantity,
    source: 'fallback',
    quantityMismatch: false,
    mismatchPct: 0,
  };
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions) as any;
        if (!session || (session.user.role !== 'PHARMACIST' && session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { prescriptionId, manualDrugId, manualBatchId, manualQuantity } = body;

        if (!prescriptionId) {
            return NextResponse.json({ error: 'Prescription ID is required' }, { status: 400 });
        }

        if (manualQuantity != null && (typeof manualQuantity !== 'number' || manualQuantity <= 0)) {
            return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Fetch Prescription
            const prescription = await tx.prescription.findUnique({
                where: { id: prescriptionId },
                include: {
                    visit: { include: { patient: true } },
                    doctor: true
                }
            });

            if (!prescription) throw new Error('Prescription not found');
            if (prescription.status === 'Dispensed') throw new Error('Prescription already dispensed');

            // 2. Resolve Drug — scan ALL denominations in stock and pick the best one
            // Auto-dispense path: find best denomination from all matching drugs with stock
            // Auto-dispense path: find best denomination from all matching drugs with stock
            // Auto-dispense path: find best denomination from all matching drugs with stock
            let drug: Awaited<ReturnType<typeof tx.drug.findUnique>> | null = null;
            let selectedDenom: { strengthValue: number; strengthUnit: string | null } | null = null;

            if (manualDrugId) {
                // Explicit drug selection — use as-is
                drug = await tx.drug.findUnique({ where: { id: manualDrugId } });
                if (!drug) throw new Error('Selected drug not found in master data.');
                selectedDenom = { strengthValue: drug.strengthValue, strengthUnit: drug.strengthUnit };
            } else {
                // Auto: scan every drug variant matching the prescribed name for available stock
                const allMatchingDrugs = await tx.drug.findMany({
                    where: {
                        OR: [
                            { name:        { equals: prescription.medicationName, mode: 'insensitive' } },
                            { genericName: { equals: prescription.medicationName, mode: 'insensitive' } }
                        ]
                    }
                });

                if (allMatchingDrugs.length === 0) {
                    throw new Error(`Drug "${prescription.medicationName}" not found in master data. Please select a substitute manually.`);
                }

                const doseAmount = prescription.doseAmount;

                // Score each drug variant by how well its denomination fits the prescribed dose
                // Priority: 1) has stock  2) clean division (integer units per dose)  3) fewest tablets total
                const candidates = await Promise.all(
                    allMatchingDrugs.map(async (d) => {
                        if (!d.strengthValue || d.strengthValue <= 0) return null;
                        const batches = await tx.drugBatch.findMany({
                            where: { drugId: d.id, quantityRemaining: { gt: 0 }, expiryDate: { gt: new Date() } },
                            orderBy: { expiryDate: 'asc' }
                        });
                        if (batches.length === 0) return null;
                        const totalStock = batches.reduce((s, b) => s + b.quantityRemaining, 0);

                        let score = 0;
                        let isClean = false;
                        let tabletsPerDose = 0;
                        let remainder = 0;

                        if (doseAmount != null && doseAmount > 0) {
                            const exact = doseAmount % d.strengthValue;
                            isClean = exact < 0.0001; // floating-point safe
                            tabletsPerDose = doseAmount / d.strengthValue;
                            remainder = isClean ? 0 : exact;
                            // Score: clean (+100), then higher strength = fewer tablets = better (bonus = tablets saved)
                            score = isClean
                                ? 100 + d.strengthValue  // clean: prefer strongest → fewest tablets
                                : 50 - remainder;        // fractional: prefer smaller remainder
                        } else {
                            // No dose data — rank by available stock
                            score = totalStock;
                        }

                        return { drug: d, batches, totalStock, score, isClean, tabletsPerDose };
                    })
                );

                const best = candidates
                    .filter((c): c is NonNullable<typeof c> => c !== null)
                    .sort((a, b) => {
                        if (a.isClean !== b.isClean) return a.isClean ? -1 : 1;  // clean first
                        if (b.score !== a.score) return b.score - a.score;        // higher score first
                        return b.totalStock - a.totalStock;                       // more stock as tiebreaker
                    })[0];

                if (!best) {
                    const named = allMatchingDrugs.map(d => `${d.name} (${d.strength})`).join(', ');
                    throw new Error(
                        `No stock available for "${prescription.medicationName}" (available: ${named}). ` +
                        `Please select a substitute drug with available stock.`
                    );
                }

                drug = best.drug;
                selectedDenom = { strengthValue: drug.strengthValue, strengthUnit: drug.strengthUnit };

                if (prescription.doseAmount != null && !best.isClean) {
                    console.warn(
                        `[Dispense] Fractional dose for Rx ${prescriptionId}: ` +
                        `prescribed ${prescription.doseAmount}${drug.strengthUnit ?? 'mg'} per dose, ` +
                        `dispensing ${drug.name} (${drug.strength}) → ${best.tabletsPerDose.toFixed(2)} tablets/dose.`
                    );
                }
            }

            // 3. Dose-based quantity calculation
            //    Use the selected denomination's strength (best available from stock, or explicit choice).
            //    If manualQuantity is provided by the pharmacist, use that instead.
            let doseCalc = calcDispenseQuantity({
                doseAmount:           prescription.doseAmount,
                frequencyPerDay:      prescription.frequencyPerDay,
                durationDays:         prescription.durationDays,
                drugStrengthValue:    selectedDenom.strengthValue,
                prescriptionQuantity: prescription.quantity,
            });

            if (manualQuantity != null && manualQuantity > 0) {
                doseCalc = {
                    unitsPerDose:       manualQuantity / (prescription.frequencyPerDay ?? 1) / (prescription.durationDays ?? 1),
                    totalUnits:          manualQuantity,
                    source:             'manual' as const,
                    quantityMismatch:    false,
                    mismatchPct:         0,
                };
            }

            // 4. Resolve target batches (FEFO)
            let targetBatches: Awaited<ReturnType<typeof tx.drugBatch.findMany>> = [];

            if (manualBatchId) {
                const batch = await tx.drugBatch.findUnique({ where: { id: manualBatchId } });
                if (!batch) throw new Error('Selected batch not found');
                if (batch.drugId !== drug!.id) throw new Error('Selected batch does not belong to the selected drug');
                if (batch.quantityRemaining < doseCalc.totalUnits) {
                    throw new Error(
                        `Insufficient stock: batch ${batch.batchNumber} has ${batch.quantityRemaining} units, ` +
                        `but ${doseCalc.totalUnits} units are required for this prescription.`
                    );
                }
                targetBatches = [batch];
            } else {
                targetBatches = await tx.drugBatch.findMany({
                    where: {
                        drugId:        drug!.id,
                        quantityRemaining: { gt: 0 },
                        expiryDate:    { gt: new Date() }
                    },
                    orderBy: { expiryDate: 'asc' }  // FEFO
                });

                const totalAvailable = targetBatches.reduce((s, b) => s + b.quantityRemaining, 0);
                if (totalAvailable < doseCalc.totalUnits) {
                    throw new Error(
                        `Insufficient total stock for ${drug!.name}: ` +
                        `${totalAvailable} units available, ${doseCalc.totalUnits} required.`
                    );
                }
            }

            // 5. Fractional-unit guard
            //    If the dose produces a fractional number of units, all selected batches must be splittable.
            if (selectedDenom.strengthValue > 0 && prescription.doseAmount != null) {
                const unitsPerDose = prescription.doseAmount / selectedDenom.strengthValue;
                const hasFractional = isFractional(unitsPerDose);

                if (hasFractional) {
                    const nonSplittableBatch = targetBatches.find(b => !b.isSplittable);
                    if (nonSplittableBatch) {
                        throw new Error(
                            `Fractional dosing error: Dr. prescribed ${prescription.doseAmount}${selectedDenom.strengthUnit ?? 'mg'} ` +
                            `(${unitsPerDose.toFixed(2)} × ${selectedDenom.strengthValue}${selectedDenom.strengthUnit ?? 'mg'} tablets per dose), ` +
                            `but batch ${nonSplittableBatch.batchNumber} is marked non-splittable. ` +
                            `Select a scored/splittable batch or ask the doctor to revise the dose.`
                        );
                    }
                }
            }

            // 5b. Quantity mismatch warning (calculated vs. what doctor wrote)
            //    The pharmacist should be aware if the API is dispensing a different quantity than prescribed.
            if (doseCalc.quantityMismatch && doseCalc.source === 'calculated') {
                const pct = (doseCalc.mismatchPct * 100).toFixed(0);
                console.warn(
                    `[Dispense] Quantity mismatch for Rx ${prescriptionId}: ` +
                    `prescribed ${prescription.quantity} units, ` +
                    `calculated ${doseCalc.totalUnits} units ` +
                    `(${pct}% ${doseCalc.totalUnits > prescription.quantity ? 'more' : 'less'}). ` +
                    `doseAmount=${prescription.doseAmount}, drug=${drug!.name} ` +
                    `(${drug!.strengthValue}${drug!.strengthUnit ?? 'mg'}).`
                );
            }

            const patient = prescription.visit.patient;

            // 6. Pricing
            //    Cash-only: look up the drug's REGULAR price, then fall back
            //    to MEMBER/STAFF/COMPLIMENTARY, then to the most recent batch's
            //    selling price.
            let unitPrice = 0;
            let priceType: 'CASH' | 'MEMBER' | 'STAFF' | 'COMPLIMENTARY' = 'CASH';

            // First try the DrugPrice (price list) for the standard REGULAR price
            const cashPrice = await tx.drugPrice.findFirst({
                where: { drugId: drug!.id, priceType: 'REGULAR', isActive: true }
            });
            if (cashPrice?.price && cashPrice.price > 0) {
                unitPrice = cashPrice.price;
            } else {
                // Fallback 1: try MEMBER / STAFF / COMPLIMENTARY price types
                const fallbackPrice = await tx.drugPrice.findFirst({
                    where: {
                        drugId: drug!.id,
                        priceType: { in: ['MEMBER', 'STAFF', 'COMPLIMENTARY'] },
                        isActive: true
                    }
                });
                if (fallbackPrice?.price && fallbackPrice.price > 0) {
                    unitPrice = fallbackPrice.price;
                } else {
                    // Fallback 2: use the most recent batch's sellingPrice (set at goods receipt)
                    const recentBatch = await tx.drugBatch.findFirst({
                        where: { drugId: drug!.id, sellingPrice: { gt: 0 } },
                        orderBy: { receivedDate: 'desc' }
                    });
                    unitPrice = recentBatch?.sellingPrice ?? 0;
                }
            }

            // 7. Dispense from batches (FEFO — splits across batches if needed)
            //    NOTE: dispensing is based on doseCalc.totalUnits, NOT prescription.quantity.
            let remainingToDispense = doseCalc.totalUnits;
            const logs = [];

            for (const batch of targetBatches) {
                if (remainingToDispense <= 0) break;

                const take = Math.min(batch.quantityRemaining, remainingToDispense);

                const allDrugBatches = await tx.drugBatch.findMany({ where: { drugId: drug!.id } });
                const currentTotalStock = allDrugBatches.reduce((s, b) => s + b.quantityRemaining, 0);

                // Deduct from batch
                await tx.drugBatch.update({
                    where: { id: batch.id },
                    data: { quantityRemaining: { decrement: take } }
                });

                // Dispensing log
                const log = await tx.dispensingLog.create({
                    data: {
                        dispenseNumber:     `D-${Date.now().toString().slice(-8)}`,
                        patientId:          patient.id,
                        visitId:            prescription.visitId,
                        prescriptionId:     prescription.id,
                        drugId:             drug!.id,
                        drugBatchId:        batch.id,
                        quantityDispensed:  take,
                        unitPrice:          unitPrice,
                        totalAmount:        unitPrice * take,
                        priceType:          priceType,
                        patientPayAmount:   unitPrice * take,
                        paymentStatus:      'PENDING',
                        dispensedById:      session.user.id,
                        dosageInstructions: prescription.instructions,
                        duration:            `${prescription.durationDays} days`,
                        frequency:           prescription.frequency
                    }
                });

                // Audit trail
                const movementCount = await tx.stockMovement.count();
                await tx.stockMovement.create({
                    data: {
                        movementNumber: `SM-${new Date().getFullYear()}-${String(movementCount + 1).padStart(6, '0')}`,
                        drugId:         drug!.id,
                        drugBatchId:    batch.id,
                        movementType:   'DISPENSE',
                        quantity:       -take,
                        referenceId:    log.id,
                        referenceType:  'DISPENSING',
                        stockBefore:    currentTotalStock,
                        stockAfter:     currentTotalStock - take,
                        performedById:  session.user.id,
                        notes:          `Dispensed for Visit ${prescription.visit.visitNumber}`
                    }
                });

                logs.push(log);
                remainingToDispense -= take;
            }

            // 8. Tax Invoice
            let taxInvoice = await tx.taxInvoice.findFirst({
                where: { patientId: patient.id, paymentStatus: 'PENDING' },
                orderBy: { createdAt: 'desc' }
            });

            if (!taxInvoice) {
                const count = await tx.taxInvoice.count();
                // Find the visit's legacy Invoice (if any) so the TaxInvoice can be linked
                // as a sub-bill. This prevents double-counting in finance summary.
                const visitLegacyInvoice = await tx.invoice.findFirst({
                    where: { visitId: prescription.visitId },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true },
                });
                taxInvoice = await tx.taxInvoice.create({
                    data: {
                        invoiceNumber: `INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`,
                        invoiceType:   'TAX_INVOICE',
                        patientId:     patient.id,
                        customerName:  `${patient.firstName} ${patient.lastName}`,
                        invoiceDate:   new Date(),
                        dueDate:       new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        postingDate:   new Date(),
                        subtotal: 0, discountTotal: 0, taxTotal: 0, totalAmount: 0, balanceDue: 0,
                        createdById: session.user.id,
                        parentInvoiceId: visitLegacyInvoice?.id ?? null,
                    }
                });
            }

            // Use doseCalc.totalUnits for the line item (not prescription.quantity)
            const lineSubtotal = unitPrice * doseCalc.totalUnits;
            await tx.invoiceLine.create({
                data: {
                    invoiceId:       taxInvoice.id,
                    lineNumber:      (await tx.invoiceLine.count({ where: { invoiceId: taxInvoice.id } })) + 1,
                    itemType:        'PRODUCT',
                    itemId:          drug!.id,
                    itemCode:        drug!.drugCode,
                    itemName:         drug!.name,
                    description:      `${drug!.genericName} (${drug!.strength})`,
                    quantity:         doseCalc.totalUnits,
                    unitPrice:        unitPrice,
                    lineTotal:        lineSubtotal,
                }
            });

            const allLines = await tx.invoiceLine.findMany({ where: { invoiceId: taxInvoice.id } });
            const newTotal = allLines.reduce((s, l) => s + l.lineTotal, 0);
            await tx.taxInvoice.update({
                where: { id: taxInvoice.id },
                data: { subtotal: newTotal, totalAmount: newTotal, balanceDue: newTotal - taxInvoice.amountPaid }
            });

            // 8b. R50 (Option D): create the visit's consolidated FINAL-
            //     invoice line item HERE, at dispense time. The old flow
            //     had the prescription route pre-create this line at
            //     order placement using the catalog estimate; we now
            //     use the ACTUAL dispense data:
            //       - drug = the auto-selected (or manually-chosen) variant
            //       - quantity = doseCalc.totalUnits (the actually-dispensed units,
            //         not the doctor's `prescription.quantity`)
            //       - unit price = the dispense-time fallback chain
            //         (DrugPrice.REGULAR → MEMBER/STAFF → DrugBatch.sellingPrice)
            //
            //     This is the single source of truth — no more dual
            //     records (legacy Invoice + TaxInvoice) that can
            //     disagree on price or quantity.
            //
            //     The prescription's `pharmacyInvoiceId` FK is set
            //     HERE so the payment route's
            //     transitionInvoiceItemsToInProgress can find this
            //     order when the patient pays.
            //
            //     Backward-compat: if this prescription already has a
            //     pharmacyInvoiceId (set by the OLD pre-bill flow before
            //     R50), skip creating a new line item to avoid
            //     double-billing. The legacy line was already paid
            //     (or will be) on the cashier's old invoice.
            if (!prescription.pharmacyInvoiceId) {
                const finalBill = await findOrCreateFinalBillInvoice({
                    visitId:    prescription.visitId,
                    patientId:  prescription.patientId,
                    issuedById: session.user.id,
                });

                await tx.invoiceItem.create({
                    data: {
                        invoiceId:   finalBill.id,
                        description: `Dispensed: ${drug!.name} (${drug!.genericName} ${drug!.strength})`,
                        quantity:    doseCalc.totalUnits,
                        unitPrice:   unitPrice,
                        totalPrice:  unitPrice * doseCalc.totalUnits,
                        itemType:    'Pharmacy',
                        referenceId: logs[0]?.id,
                    },
                });

                // Recompute the FINAL- invoice totals from its line items so
                // the legacy Invoice (used by the cashier dashboard) stays
                // consistent with the TaxInvoice created in step 8a.
                const allFinalItems = await tx.invoiceItem.findMany({
                    where: { invoiceId: finalBill.id },
                    select: { totalPrice: true },
                });
                const finalTotal = allFinalItems.reduce(
                    (s, it) => s + (Number(it.totalPrice) || 0),
                    0,
                );
                await tx.invoice.update({
                    where: { id: finalBill.id },
                    data: {
                        totalAmount: finalTotal,
                        balanceDue:  finalTotal - finalBill.amountPaid,
                    },
                });

                // R50: also set the prescription's pharmacyInvoiceId FK so
                // the payment route can transition AwaitingPayment →
                // InProgress when the patient pays. This MUST happen
                // BEFORE markOrderFulfilled, because the visit transition
                // check (areAllVisitInvoicesPaid) needs to see the invoice.
                await tx.prescription.update({
                    where: { id: prescription.id },
                    data: { pharmacyInvoiceId: finalBill.id },
                });
            }

            // R50 (Option D): The prescription started at AwaitingPayment
            // because the doctor didn't pre-bill. Now that we've created
            // the invoice line and set the pharmacyInvoiceId FK, the
            // prescription is effectively "in progress" — billing is
            // committed, the pharmacist is dispensing. Transition through
            // InProgress on the way to Fulfilled (the state machine
            // doesn't allow AwaitingPayment → Fulfilled directly, but
            // that's a deliberate guard against skipping the payment
            // step in the OLD flow). In Option D, the dispense IS the
            // commit point, so we treat it as "payment implicit".
            await transitionOrderSubStatus(
                tx as any,
                "PRESCRIPTION",
                prescription.id,
                ITEM_SUB_STATUS.InProgress,
            );

            // 9. Finalize prescription
            await tx.prescription.update({
                where: { id: prescription.id },
                data: { status: 'Dispensed' }
            });


            // 10. Consolidated visit cycle spec (R45):
            //     - SubStatus InProgress → Fulfilled on dispense.
            //     - If that was the last non-terminal order on the visit, the
            //       parent visit moves from PendingOrders → FinalBilling.
            //     - The FinalBilling → Completed transition is driven by the
            //       payment route's areAllVisitInvoicesPaid check.
            const rxTransition = await markOrderFulfilled(tx, "PRESCRIPTION", prescription.id);
            if (rxTransition.visitAdvanced) {
                console.log(
                    `[Pharmacy] Prescription ${prescription.id} dispensed — visit ${prescription.visitId} ` +
                    `advanced to ${rxTransition.newVisitStatus}`
                );
            }

            return {
                logs,
                invoiceId: taxInvoice.id,
                doseCalc,
                drug,
            };
        });

        // 10. Post to ledger (fire-and-forget)
        for (const log of (result as any).logs) {
            try {
                await AccountingService.postDispenseToLedger(log.id, session.user.id);
            } catch (err) {
                console.error(`Ledger posting failed for log ${log.id}:`, err);
            }
        }

        const { doseCalc, drug, logs } = result as any;

        // Return enriched response so the UI can display the dose math
        return NextResponse.json({
            message: 'Medication dispensed successfully',
            invoiceId: result.invoiceId,
            doseCalc: {
                unitsPerDose:     doseCalc.unitsPerDose,
                totalUnits:       doseCalc.totalUnits,
                source:           doseCalc.source,
                quantityMismatch: doseCalc.quantityMismatch,
            },
            drug: {
                name:          drug.name,
                strength:      drug.strength,
                strengthValue: drug.strengthValue,
                strengthUnit:  drug.strengthUnit,
                unitsPerDose:  doseCalc.unitsPerDose,
            },
            logs: logs.map((l: any) => ({ id: l.id, quantityDispensed: l.quantityDispensed }))
        });

    } catch (error: any) {
        console.error('Dispensing error:', error);
        return NextResponse.json({ error: error.message || 'Dispensing failed' }, { status: 500 });
    }
}
