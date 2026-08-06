// @ts-nocheck
import { PrismaClient, ServiceType } from '../lib/generated-prisma';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Seeding Insurance Reference Data ---');

    // Clean up old data
    await prisma.insurancePriceListItem.deleteMany({});
    await prisma.patientInsurance.deleteMany({});
    await prisma.insuranceCompany.deleteMany({});

    // 1. Companies
    const jubilee = await prisma.insuranceCompany.create({
        data: {
            name: 'Jubilee Insurance',
            code: 'JUB',
            contactPerson: 'Agnes Namatovu',
            phone: '+256 701 000111',
            email: 'claims@jubileeuganda.com',
            address: 'Jubilee Insurance Center, Kampala',
            paymentTerms: 'Net 30'
        }
    });
    console.log('✅ Jubilee Insurance created');

    const aar = await prisma.insuranceCompany.create({
        data: {
            name: 'AAR Insurance',
            code: 'AAR',
            contactPerson: 'Peter Okello',
            phone: '+256 702 111222',
            email: 'info@aar-insurance.ug',
            address: 'AAR Health Services, Plot 16A Elizabeth Avenue, Kampala',
            paymentTerms: 'Net 45'
        }
    });
    console.log('✅ AAR Insurance created');

    // 2. Price List Rules — pre-negotiated rates per item
    const cbcTest = await prisma.labTestCatalog.findUnique({ where: { name: 'Full Blood Count (FBC/CBC)' } });

    await prisma.insurancePriceListItem.createMany({
        data: [
            // Jubilee
            { insuranceId: jubilee.id, serviceType: ServiceType.CONSULTATION, negotiatedPrice: 15000 },
            { insuranceId: jubilee.id, serviceType: ServiceType.LAB_TEST, serviceId: cbcTest?.id ?? undefined, negotiatedPrice: 15000 },
            // AAR
            { insuranceId: aar.id, serviceType: ServiceType.CONSULTATION, negotiatedPrice: 12000 },
        ]
    });
    console.log('✅ Price list rules seeded');

    console.log('--- Insurance Seeding Complete ---');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
