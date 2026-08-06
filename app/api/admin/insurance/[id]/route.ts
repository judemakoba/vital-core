import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CopayType } from '@/lib/generated-prisma';
import { seedInsurancePriceList } from '@/lib/insurance/seed-price-list';

const VALID_COPAY_TYPES: CopayType[] = ['FLAT', 'PERCENTAGE', 'COPAY_PLUS_PERCENT', 'NO_COPAY', 'FULL'];

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const company = await prisma.insuranceCompany.findUnique({
            where: { id: params.id },
            include: {
                _count: {
                    select: {
                        claims: true,
                        priceList: true,
                    },
                },
            },
        });

        if (!company) {
            return NextResponse.json({ error: 'Company not found' }, { status: 404 });
        }

        return NextResponse.json(company);
    } catch (error) {
        console.error('API Error [Insurance Detail]:', error);
        return NextResponse.json({ error: 'Failed to fetch insurance details' }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/insurance/[id]
 * Update a partner. All fields optional.
 * If `reInitializePriceList: true` is passed, the price list will be re-seeded
 * from the clinic's master catalogs (skips already-seeded items to preserve
 * manual adjustments).
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const body = await req.json();
        const {
            name,
            code,
            contactPerson,
            phone,
            email,
            address,
            paymentTerms,
            copayType,
            standardPatientCopay,
            copayPercentage,
            copayDeductible,
            consultationFee,
            isActive,
            reInitializePriceList,
        } = body;

        const existing = await prisma.insuranceCompany.findUnique({
            where: { id: params.id },
            select: { id: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Company not found' }, { status: 404 });
        }

        if (copayType && !VALID_COPAY_TYPES.includes(copayType)) {
            return NextResponse.json(
                { error: `Invalid copayType. Must be one of: ${VALID_COPAY_TYPES.join(', ')}` },
                { status: 400 }
            );
        }

        const data: Record<string, unknown> = {};
        if (name !== undefined) data.name = name;
        if (code !== undefined) data.code = code.toUpperCase();
        if (contactPerson !== undefined) data.contactPerson = contactPerson || null;
        if (phone !== undefined) data.phone = phone || null;
        if (email !== undefined) data.email = email || null;
        if (address !== undefined) data.address = address || null;
        if (paymentTerms !== undefined) data.paymentTerms = paymentTerms || 'Net 30';
        if (copayType !== undefined) data.copayType = copayType as CopayType;
        if (standardPatientCopay !== undefined) data.standardPatientCopay = parseFloat(standardPatientCopay) || 0;
        if (copayPercentage !== undefined) data.copayPercentage = parseFloat(copayPercentage) || 0;
        if (copayDeductible !== undefined) data.copayDeductible = parseFloat(copayDeductible) || 0;
        if (consultationFee !== undefined) {
            // Allow clearing by sending null/empty
            data.consultationFee = (consultationFee === null || consultationFee === '')
                ? null
                : parseFloat(consultationFee);
        }
        if (isActive !== undefined) data.isActive = !!isActive;

        const updated = await prisma.insuranceCompany.update({
            where: { id: params.id },
            data,
        });

        let seedSummary: {
            created: number;
            total: number;
            breakdown: { billable: number; drug: number; lab: number; radiology: number };
        } | null = null;

        if (reInitializePriceList) {
            try {
                const result = await seedInsurancePriceList(params.id);
                seedSummary = {
                    created: result.created,
                    total: result.total,
                    breakdown: result.breakdown,
                };
            } catch (seedErr) {
                console.error('Re-init seed-price-list failed for', params.id, seedErr);
            }
        }

        return NextResponse.json({ ...updated, _priceListSeed: seedSummary });
    } catch (error: any) {
        console.error('API Error [Insurance Update]:', error);
        if (error.code === 'P2002') {
            return NextResponse.json(
                { error: 'An insurer with this code already exists' },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: 'Failed to update insurance company' }, { status: 500 });
    }
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Soft check — refuse if claims exist
        const claimCount = await prisma.insuranceClaim.count({
            where: { insuranceId: params.id },
        });
        if (claimCount > 0) {
            return NextResponse.json(
                {
                    error: `Cannot delete: ${claimCount} claim(s) reference this partner. Deactivate instead.`,
                },
                { status: 409 }
            );
        }

        // Clean up price list and enrollments first (no FK cascade in schema)
        await prisma.$transaction([
            prisma.insurancePriceListItem.deleteMany({ where: { insuranceId: params.id } }),
            prisma.patientInsurance.deleteMany({ where: { insuranceId: params.id } }),
            prisma.insuranceCompany.delete({ where: { id: params.id } }),
        ]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('API Error [Insurance Delete]:', error);
        return NextResponse.json({ error: 'Failed to delete insurance company' }, { status: 500 });
    }
}
