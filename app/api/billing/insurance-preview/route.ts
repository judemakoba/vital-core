export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateInsurancePrice } from '@/lib/pricing-engine';
import { ServiceType } from '@/lib/generated-prisma';
import { getInsuranceEligibility } from '@/lib/insurance/eligibility';

/**
 * GET /api/billing/insurance-preview?patientId=xxx&visitId=yyy
 *
 * Returns a pricing breakdown for all chargeable items in a visit,
 * applying the patient's active insurance negotiated rates + flat patient copay.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get('patientId');
    const visitId = searchParams.get('visitId');

    if (!patientId || !visitId) {
        return NextResponse.json({ error: 'patientId and visitId are required' }, { status: 400 });
    }

    try {
        // Get eligibility (which already does the proper isActive + VERIFIED + coverage check)
        const eligibility = await getInsuranceEligibility(patientId);

        const [enrollment, labOrders, prescriptions] = await Promise.all([
            // Only fetch the enrollment if patient is actually eligible (saves a query otherwise)
            eligibility.eligible
                ? prisma.patientInsurance.findUnique({
                    where: { id: eligibility.enrollment.id },
                    select: {
                        insurance: {
                            select: {
                                id: true,
                                name: true,
                                code: true,
                                copayType: true,
                                standardPatientCopay: true,
                                copayPercentage: true,
                                copayDeductible: true,
                            }
                        },
                        status: true
                    },
                })
                : Promise.resolve(null),
            prisma.labOrder.findMany({
                where: { visitId, status: { not: 'CANCELLED' } },
                select: { testName: true }
            }),
            prisma.prescription.findMany({
                where: { visitId },
                select: {
                    dispensingLogs: {
                        select: {
                            unitPrice: true,
                            quantityDispensed: true,
                            drug: { select: { id: true, name: true } }
                        }
                    }
                }
            })
        ]);

        const allDispenseRecords = prescriptions.flatMap(p => p.dispensingLogs);
        const testNames = labOrders.map(o => o.testName);

        const labCatalogPromise = testNames.length > 0
            ? prisma.labTestCatalog.findMany({
                where: { name: { in: testNames } },
                select: { id: true, name: true, price: true }
            })
            : Promise.resolve([]);

        const [labCatalog] = await Promise.all([labCatalogPromise]);
        const labCatalogMap = new Map(labCatalog.map(c => [c.name, c]));

        const insuranceId = enrollment?.insurance.id ?? null;
        const copayType = enrollment?.insurance.copayType ?? 'FLAT';
        const copayAmount = enrollment?.insurance.standardPatientCopay ?? 0;
        const copayPercentage = enrollment?.insurance.copayPercentage ?? 0;
        const copayDeductible = enrollment?.insurance.copayDeductible ?? 0;
        const lineItems: {
            label: string;
            type: string;
            qty?: number;
            basePrice: number;
            negotiatedPrice: number;
            insuranceNet: number;
            patientPayable: number;
            copayType: string;
            copayBreakdown: string;
        }[] = [];
        let totalOriginal = 0;
        let totalInsuranceNet = 0;
        let totalPatientPayable = 0;

        const applyPricing = async (
            label: string,
            type: ServiceType,
            basePrice: number,
            serviceId: string | null,
            qty?: number
        ) => {
            let negotiatedPrice = basePrice;
            let insuranceNet = 0;
            let patientPayable = basePrice;
            let breakdown = 'Patient pays full standard rate (no insurance).';

            if (insuranceId && basePrice > 0) {
                const result = await calculateInsurancePrice(insuranceId, type, serviceId, basePrice, {
                    standardPatientCopay: copayAmount,
                    copayPercentage,
                    copayDeductible,
                    copayType: copayType as any,
                });
                negotiatedPrice = result.negotiatedPrice;
                insuranceNet = result.insuranceNet;
                patientPayable = result.patientPayable;
                breakdown = result.breakdown;
            }

            lineItems.push({
                label, type,
                ...(qty !== undefined && { qty }),
                basePrice, negotiatedPrice, insuranceNet, patientPayable,
                copayType: insuranceId ? copayType : 'NONE',
                copayBreakdown: breakdown,
            });
            totalOriginal += basePrice;
            totalInsuranceNet += insuranceNet;
            totalPatientPayable += patientPayable;
        };

        // Consultation
        await applyPricing('Consultation', ServiceType.CONSULTATION, 20000, null);

        // Lab Tests
        for (const order of labOrders) {
            const cat = labCatalogMap.get(order.testName);
            await applyPricing(order.testName, ServiceType.LAB_TEST, cat?.price ?? 0, cat?.id ?? null);
        }

        // Pharmacy
        for (const rec of allDispenseRecords) {
            await applyPricing(
                rec.drug?.name ?? 'Drug',
                ServiceType.PHARMACY,
                rec.unitPrice * rec.quantityDispensed,
                rec.drug?.id ?? null,
                rec.quantityDispensed
            );
        }

        return NextResponse.json({
            hasInsurance: eligibility.eligible,
            eligibility: {
                eligible: eligibility.eligible,
                reason: eligibility.eligible ? null : eligibility.reason,
            },
            enrollment: enrollment && eligibility.eligible ? {
                enrollmentId: eligibility.enrollment.id,
                insuranceId: eligibility.enrollment.insuranceId,
                insuranceName: enrollment.insurance.name,
                insuranceCode: enrollment.insurance.code,
                verificationStatus: enrollment.status,
                copayType,
                standardPatientCopay: copayAmount,
                copayPercentage,
                copayDeductible,
            } : null,
            lineItems,
            summary: {
                totalOriginal,
                totalInsuranceNet,
                totalPatientPayable,
            }
        });
    } catch (error) {
        console.error('Insurance Preview Error:', error);
        return NextResponse.json({ error: 'Failed to calculate insurance pricing' }, { status: 500 });
    }
}
