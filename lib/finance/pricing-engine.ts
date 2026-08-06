import { prisma } from '../prisma';
import { ServiceType } from '../generated-prisma';

export class PricingEngine {
    /**
     * Looks up the pre-negotiated rate and applies the insurer's flat patient copay.
     */
    static async calculateItemPrice(
        patientId: string,
        serviceId: string | null,
        serviceType: ServiceType | null,
        standardRate: number
    ): Promise<{
        finalPrice: number;
        appliedRule: { id: string; negotiatedPrice: number } | null;
        insuranceId: string | null;
        patientCopay: number;
    }> {
        try {
            const enrollment = await prisma.patientInsurance.findFirst({
                where: {
                    patientId,
                    isActive: true,
                    status: 'VERIFIED',
                    coverageStart: { lte: new Date() },
                    OR: [
                        { coverageEnd: null },
                        { coverageEnd: { gte: new Date() } }
                    ]
                },
                select: {
                    insuranceId: true,
                    insurance: { select: { standardPatientCopay: true } }
                }
            });

            if (!enrollment) {
                return { finalPrice: standardRate, appliedRule: null, insuranceId: null, patientCopay: 0 };
            }

            const rule = await prisma.insurancePriceListItem.findFirst({
                where: {
                    insuranceId: enrollment.insuranceId,
                    OR: [
                        { serviceId: serviceId ?? undefined },
                        { serviceType: serviceType ?? undefined, serviceId: null }
                    ]
                }
            });

            if (!rule) {
                return {
                    finalPrice: standardRate,
                    appliedRule: null,
                    insuranceId: enrollment.insuranceId,
                    patientCopay: 0,
                };
            }

            const copay = enrollment.insurance.standardPatientCopay;
            return {
                finalPrice: Math.max(0, rule.negotiatedPrice - copay),
                appliedRule: { id: rule.id, negotiatedPrice: rule.negotiatedPrice },
                insuranceId: enrollment.insuranceId,
                patientCopay: copay,
            };
        } catch (error) {
            console.error('PricingEngine Error:', error);
            return { finalPrice: standardRate, appliedRule: null, insuranceId: null, patientCopay: 0 };
        }
    }
}
