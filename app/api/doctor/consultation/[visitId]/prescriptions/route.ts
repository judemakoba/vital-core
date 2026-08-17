export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
// R50 (Option D): removed the pre-billing IIFE. The pharmacy route
// now creates the FINAL- invoice line item at dispense time, using
// the actual batch + actual quantity + actual price. Consultation-fee
// deferral was an insurance concept — removed with the insurance
// module in 2026-08.

/** Try to find a Drug formulary entry by name or generic name (case-insensitive) */
async function findFormularyDrug(medicationName: string) {
  return prisma.drug.findFirst({
    where: {
      isActive: true,
      OR: [
        { name:        { equals: medicationName, mode: 'insensitive' } },
        { genericName: { equals: medicationName, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'asc' },  // prefer older/established formulary entries
  });
}

/**
 * Look up the cash price for a drug.
 * Fallback chain (mirrors the dispense route):
 *   1. DrugPrice with priceType='REGULAR' (most recent by effectiveFrom)
 *   2. DrugPrice with priceType in (MEMBER, STAFF, COMPLIMENTARY)
 *   3. Most recent DrugBatch.sellingPrice (set at goods receipt)
 *   4. 0 (no price configured — UI will show this for ops to fix)
 */
async function getDrugPrice(drugId: string): Promise<number> {
  // 1. REGULAR price
  const regular = await prisma.drugPrice.findFirst({
    where: { drugId, priceType: 'REGULAR', isActive: true },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (regular?.price && regular.price > 0) return regular.price;

  // 2. MEMBER / STAFF / COMPLIMENTARY
  const fallbackPrice = await prisma.drugPrice.findFirst({
    where: {
      drugId,
      priceType: { in: ['MEMBER', 'STAFF', 'COMPLIMENTARY'] },
      isActive: true,
    },
  });
  if (fallbackPrice?.price && fallbackPrice.price > 0) return fallbackPrice.price;

  // 3. Most recent batch's sellingPrice
  const recentBatch = await prisma.drugBatch.findFirst({
    where: { drugId, sellingPrice: { gt: 0 } },
    orderBy: { receivedDate: 'desc' },
  });
  if (recentBatch?.sellingPrice && recentBatch.sellingPrice > 0) return recentBatch.sellingPrice;

  return 0;
}

/**
 * Auto-calculate quantity.
 * Requires: doseAmount, frequencyPerDay, durationDays, drug.strengthValue > 0
 * Returns null if any input is missing / zero.
 */
function calcQuantity(doseAmount: number, frequencyPerDay: number, durationDays: number, drugStrengthValue: number): number | null {
  if (!doseAmount || !frequencyPerDay || !durationDays || !drugStrengthValue) return null;
  const units = (doseAmount / drugStrengthValue) * frequencyPerDay * durationDays;
  return Math.ceil(units);  // always round up — better to dispense slightly more than less
}

export async function POST(
    request: Request,
    { params }: { params: { visitId: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        const allowedRoles = ["DOCTOR", "ADMIN", "SUPER_ADMIN"];
        if (!session || !allowedRoles.includes(user?.role)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const {
            medicationName,
            dosage,
            frequency,
            durationDays: durationDaysRaw,
            quantity: manualQuantityRaw,
            instructions,
            patientId,
            // New structured fields
            doseAmount,
            doseUnit,
            frequencyPerDay,
            isManualQuantity = false,
        } = body;

        const durationDays = parseInt(durationDaysRaw);
        const manualQuantity = parseInt(manualQuantityRaw);

        if (!medicationName || !dosage || !frequency || !durationDays || !patientId) {
            return NextResponse.json({ error: "Missing required prescription fields" }, { status: 400 });
        }

        if (!Number.isFinite(manualQuantity) || manualQuantity <= 0) {
            return NextResponse.json({ error: "Invalid quantity — must be a positive number" }, { status: 400 });
        }

        const prescription = await prisma.$transaction(async (tx) => {
            // Prevent duplicate prescription for the same visit (case-insensitive)
            const existingRx = await tx.prescription.findFirst({
                where: {
                    visitId: params.visitId,
                    medicationName: { equals: medicationName, mode: 'insensitive' }
                }
            });

            if (existingRx) {
                throw { kind: "duplicate", message: `"${medicationName}" has already been prescribed for this visit.` };
            }

            // Try to resolve the drug from the formulary
            const formularyDrug = await findFormularyDrug(medicationName);

            // Determine quantity: auto-calculate if possible, otherwise use manual entry
            let finalQuantity = manualQuantity;
            let finalDoseAmount: number | undefined;
            let finalDoseUnit: string | undefined;
            let finalFreqPerDay: number | undefined;
            let finalIsManual = isManualQuantity;

            if (formularyDrug && doseAmount != null && frequencyPerDay != null) {
              const autoQty = calcQuantity(doseAmount, frequencyPerDay, durationDays, formularyDrug.strengthValue);
              if (autoQty !== null) {
                finalQuantity = autoQty;
                finalDoseAmount = doseAmount;
                finalDoseUnit   = doseUnit;
                finalFreqPerDay = frequencyPerDay;
                finalIsManual   = false;
              }
            }

            const created = await tx.prescription.create({
                data: {
                    visitId:         params.visitId,
                    patientId,
                    doctorId:        user?.id,
                    medicationName,
                    dosage,
                    frequency,
                    durationDays,
                    quantity:        finalQuantity,
                    instructions,
                    drugId:          formularyDrug?.id,
                    // New structured dose fields
                    doseAmount:      finalDoseAmount,
                    doseUnit:        finalDoseUnit,
                    frequencyPerDay: finalFreqPerDay,
                    isManualQuantity: finalIsManual,
                    status:          "Pending"
                },
            });

            // Visit-status rule (R45, R55b): while the doctor is still
            // actively consulting (InConsultation / Consultation / Triaged /
            // Laboratory / Radiology / Pharmacy), adding an order does NOT
            // move the visit forward. The visit only transitions to
            // PendingOrders (or FinalBilling if no orders) when the doctor
            // explicitly clicks "Finish Consultation" in the PUT route.
            //
            // WHY: if we move the visit to PendingOrders here, and the
            // downstream service (pharmacy / lab / radiology) fulfills the
            // order fast, `maybeAdvanceVisitAfterItemStatusChange` will
            // promote the visit to FinalBilling and it DISAPPEARS from the
            // doctor's waiting room even though the doctor is still on the
            // consultation page typing notes / adding more orders.
            //
            // (If the visit is already past InConsultation — e.g. the doctor
            // already clicked "Finish Consultation" once and the visit is in
            // PendingOrders — the visit stays in PendingOrders. The decide-
            // NextStatusAfterConsultation result is therefore a no-op for
            // any non-terminal post-consultation state.)

            return { prescription: created, formularyDrug };
        });

        // R50 (Option D): No pre-billing at order placement.
        //
        // The OLD flow used a fire-and-forget IIFE to add a "Drug" line
        // item to the FINAL- invoice right now, using the catalog price
        // (DrugPrice.REGULAR). The cashier could then collect payment
        // before the pharmacist had even looked at the prescription.
        //
        // Problem: the catalog price was an estimate, not the actual
        // dispense price. The pharmacist might pick a different batch
        // (different DrugBatch.sellingPrice) or the auto-denomination-
        // scoring might dispense a different quantity than the doctor
        // ordered. The system then had two parallel records (legacy
        // Invoice + TaxInvoice) that could disagree on price/quantity.
        //
        // NEW flow (R50):
        //   1. Doctor places the order. NO invoice line item is created.
        //      The prescription row has `pharmacyInvoiceId = null` and
        //      `subStatus = AwaitingPayment` (the default).
        //   2. Visit moves to PendingOrders (existing behavior).
        //   3. Pharmacist dispenses. The dispense route creates the
        //      Drug line item on the FINAL- invoice using the ACTUAL
        //      batch + ACTUAL quantity + ACTUAL price. Single source
        //      of truth — no reconciliation needed.
        //   4. Pharmacist also creates the URA-compliant TaxInvoice
        //      (existing behavior, untouched).
        //   5. Prescription.pharmacyInvoiceId is set to the FINAL- invoice
        //      so the payment route's transitionInvoiceItemsToInProgress
        //      can find it when the patient pays.
        //   6. The visit advances to FinalBilling once all orders are
        //      Fulfilled. The cashier then collects the (now known) bill.
        //
        // The trade-off: the cashier can't pre-collect the drug portion
        // of the bill. The patient pays one consolidated bill at the
        // end of the visit, not partial bills per service.

        return NextResponse.json(prescription, { status: 201 });

    } catch (error: any) {
        if (error?.kind === "duplicate") {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error("Failed to add prescription:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
