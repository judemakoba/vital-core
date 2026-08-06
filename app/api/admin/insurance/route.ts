import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CopayType } from '@/lib/generated-prisma';
import { seedInsurancePriceList } from '@/lib/insurance/seed-price-list';

const VALID_COPAY_TYPES: CopayType[] = ['FLAT', 'PERCENTAGE', 'COPAY_PLUS_PERCENT', 'NO_COPAY', 'FULL'];

export async function GET(_req: NextRequest) {
    try {
        const companies = await prisma.insuranceCompany.findMany({
            include: {
                _count: {
                    select: {
                        claims: true,
                        enrollments: true,
                        priceList: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json(companies);
    } catch (error) {
        console.error('API Error [Insurance List]:', error);
        return NextResponse.json({ error: 'Failed to fetch insurance companies' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
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
            // New flexible copay config
            copayType = 'FLAT',
            standardPatientCopay = 0,
            copayPercentage = 0,
            copayDeductible = 0,
            // Per-insurance consultation fee override (null/undefined = use global default)
            consultationFee,
            isActive = true,
            // Set to false to skip the auto-initialize (e.g. when importing partners
            // from another system that already has negotiated rates).
            autoInitializePriceList = true,
        } = body;

        if (!name || !code) {
            return NextResponse.json({ error: 'name and code are required' }, { status: 400 });
        }

        if (!VALID_COPAY_TYPES.includes(copayType)) {
            return NextResponse.json(
                { error: `Invalid copayType. Must be one of: ${VALID_COPAY_TYPES.join(', ')}` },
                { status: 400 }
            );
        }

        // Cross-field validation
        const pct = parseFloat(copayPercentage);
        if (copayType === 'PERCENTAGE' || copayType === 'COPAY_PLUS_PERCENT') {
            if (isNaN(pct) || pct < 0 || pct > 100) {
                return NextResponse.json(
                    { error: 'copayPercentage must be between 0 and 100 for PERCENTAGE or COPAY_PLUS_PERCENT types' },
                    { status: 400 }
                );
            }
        }
        if (copayType === 'FLAT' || copayType === 'COPAY_PLUS_PERCENT') {
            const amount = parseFloat(standardPatientCopay);
            if (isNaN(amount) || amount < 0) {
                return NextResponse.json(
                    { error: 'standardPatientCopay must be a non-negative number for FLAT or COPAY_PLUS_PERCENT types' },
                    { status: 400 }
                );
            }
        }

        const company = await prisma.insuranceCompany.create({
            data: {
                name,
                code: code.toUpperCase(),
                contactPerson: contactPerson || null,
                phone: phone || null,
                email: email || null,
                address: address || null,
                paymentTerms: paymentTerms || 'Net 30',
                copayType: copayType as CopayType,
                standardPatientCopay: parseFloat(standardPatientCopay) || 0,
                copayPercentage: pct || 0,
                copayDeductible: parseFloat(copayDeductible) || 0,
                // consultationFee: null means "use global default"; otherwise this
                // insurance's negotiated per-visit fee overrides the system default.
                consultationFee: (consultationFee !== undefined && consultationFee !== null && consultationFee !== '')
                    ? parseFloat(consultationFee)
                    : null,
                isActive: !!isActive,
            },
        });

        // Auto-initialize the price list from the clinic's master catalogs
        // so the partner is immediately usable. Each item defaults to the
        // clinic's general price — admin adjusts individual lines afterwards.
        let seedSummary: {
            created: number;
            total: number;
            breakdown: { billable: number; drug: number; lab: number; radiology: number };
        } | null = null;

        if (autoInitializePriceList) {
            try {
                const result = await seedInsurancePriceList(company.id);
                seedSummary = {
                    created: result.created,
                    total: result.total,
                    breakdown: result.breakdown,
                };
            } catch (seedErr) {
                // Don't fail the company creation if seeding fails — admin can
                // re-run initialization from the price-list page. Log loudly.
                console.error('Auto seed-price-list failed for', company.id, seedErr);
            }
        }

        return NextResponse.json(
            {
                ...company,
                _priceListSeed: seedSummary,
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('API Error [Insurance Create]:', error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'An insurer with this code already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to create insurance company' }, { status: 500 });
    }
}
