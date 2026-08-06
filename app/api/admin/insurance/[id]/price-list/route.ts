import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const priceList = await prisma.insurancePriceListItem.findMany({
            where: { insuranceId: params.id },
            orderBy: [{ serviceType: 'asc' }, { createdAt: 'asc' }],
        });

        // Resolve item details based on serviceType to avoid N+1
        const serviceIds = priceList
            .map((p) => p.serviceId)
            .filter(Boolean) as string[];

        const [billableItems, drugs, labTests, radiologyItems] = await Promise.all([
            prisma.billableItem.findMany({
                where: { id: { in: serviceIds } },
                select: { id: true, itemName: true, category: true, standardRate: true },
            }),
            prisma.drug.findMany({
                where: { id: { in: serviceIds } },
                select: { id: true, name: true, genericName: true, strength: true, dosageForm: true, drugCode: true },
            }),
            prisma.labTestCatalog.findMany({
                where: { id: { in: serviceIds } },
                select: { id: true, name: true, category: true, referenceRange: true, unit: true, price: true },
            }),
            prisma.radiologyCatalog.findMany({
                where: { id: { in: serviceIds } },
                select: { id: true, name: true, price: true, category: { select: { name: true } } },
            }),
        ]);

        const billableMap = new Map(billableItems.map((b) => [b.id, b]));
        const drugMap = new Map(drugs.map((d) => [d.id, d]));
        const labMap = new Map(labTests.map((l) => [l.id, l]));
        const radMap = new Map(radiologyItems.map((r) => [r.id, r]));

        const enriched = priceList.map((item) => {
            let itemDetail: Record<string, unknown> = {};

            if (!item.serviceId) {
                itemDetail = { label: 'All items', description: null };
            } else if (item.serviceType === 'PHARMACY') {
                const drug = drugMap.get(item.serviceId);
                itemDetail = drug
                    ? {
                          label: drug.name,
                          description: `${drug.genericName} · ${drug.strength} · ${drug.dosageForm}`,
                          code: drug.drugCode,
                      }
                    : { label: item.serviceId, description: null };
            } else if (item.serviceType === 'LAB_TEST') {
                const lab = labMap.get(item.serviceId);
                itemDetail = lab
                    ? {
                          label: lab.name,
                          description: lab.referenceRange ? `Ref: ${lab.referenceRange} ${lab.unit ?? ''}` : null,
                          code: lab.category?.name ?? null,
                          baseRate: lab.price,
                      }
                    : { label: item.serviceId, description: null };
            } else if (item.serviceType === 'RADIOLOGY') {
                const rad = radMap.get(item.serviceId);
                itemDetail = rad
                    ? {
                          label: rad.name,
                          description: rad.category?.name ?? null,
                          code: null,
                          baseRate: rad.price,
                      }
                    : { label: item.serviceId, description: null };
            } else {
                const billable = billableMap.get(item.serviceId);
                itemDetail = billable
                    ? {
                          label: billable.itemName,
                          description: billable.category,
                          code: null,
                          baseRate: billable.standardRate,
                      }
                    : { label: item.serviceId, description: null };
            }

            return { ...item, itemDetail };
        });

        return NextResponse.json(enriched);
    } catch (error) {
        console.error('API Error [Insurance Price List]:', error);
        return NextResponse.json({ error: 'Failed to fetch price list' }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const body = await req.json();
        const { serviceType, serviceId, negotiatedPrice } = body;

        const newItem = await prisma.insurancePriceListItem.create({
            data: {
                insuranceId: params.id,
                serviceType,
                serviceId: serviceId || null,
                negotiatedPrice: parseFloat(negotiatedPrice),
            },
        });

        return NextResponse.json(newItem, { status: 201 });
    } catch (error) {
        console.error('API Error [Insurance Price List Create]:', error);
        if (error.code === 'P2002') {
            return NextResponse.json(
                { error: 'A rule for this item already exists for this insurer.' },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: 'Failed to create price list item' }, { status: 500 });
    }
}
