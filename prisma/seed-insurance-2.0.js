const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../lib/generated-prisma'));

const prisma = new PrismaClient();

async function main() {
    console.log('--- Seeding Insurance 2.0 Reference Data (Final Fix) hearth ---');

    try {
        // Clean up
        if (prisma.packagePriceOverride) await prisma.packagePriceOverride.deleteMany({});
        if (prisma.insurancePriceListItem) await prisma.insurancePriceListItem.deleteMany({});
        if (prisma.patientInsurance) await prisma.patientInsurance.deleteMany({});
        if (prisma.insurancePackage) await prisma.insurancePackage.deleteMany({});
        if (prisma.insurancePlan) await prisma.insurancePlan.deleteMany({});
        if (prisma.insuranceCompany) await prisma.insuranceCompany.deleteMany({});

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
        console.log('✅ Insurance Company: Jubilee ensured');

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
        console.log('✅ Insurance Company: AAR ensured');

        // 2. Packages
        const corpGold = await prisma.insurancePackage.create({
            data: {
                insuranceId: jubilee.id,
                name: 'Corporate Gold',
                code: 'JUB-CORP-GOLD',
                coverageType: 'CORPORATE',
                annualLimit: 5000000,
                perVisitLimit: 200000,
                copayPercentage: 10.0
            }
        });
        console.log('📦 Package: Jubilee Corporate Gold ensured');

        const aarStandard = await prisma.insurancePackage.create({
            data: {
                insuranceId: aar.id,
                name: 'Standard Plus',
                code: 'AAR-STD-PLUS',
                coverageType: 'FAMILY',
                annualLimit: 3000000,
                copayFlat: 5000.0
            }
        });
        console.log('📦 Package: AAR Standard Plus ensured');

        // 3. Price List Rules (Jubilee)
        await prisma.insurancePriceListItem.create({
            data: {
                insuranceId: jubilee.id,
                serviceType: 'CONSULTATION',
                priceType: 'FIXED',
                priceValue: 15000,
                priority: 1
            }
        });

        await prisma.insurancePriceListItem.create({
            data: {
                insuranceId: jubilee.id,
                serviceType: 'LAB_TEST',
                priceType: 'PERCENTAGE_DISCOUNT',
                priceValue: 15.0,
                appliesToAll: true,
                priority: 0
            }
        });

        const fbcTest = await prisma.labTestCatalog.findFirst({
            where: { name: { contains: 'Full Blood Count' } }
        });

        if (fbcTest) {
            await prisma.insurancePriceListItem.create({
                data: {
                    insuranceId: jubilee.id,
                    serviceType: 'LAB_TEST',
                    serviceId: fbcTest.id,
                    priceType: 'FIXED',
                    priceValue: 15000,
                    priority: 2
                }
            });
        }

        // 4. Price List Rules (AAR)
        await prisma.insurancePriceListItem.create({
            data: {
                insuranceId: aar.id,
                serviceType: 'LAB_TEST',
                priceType: 'PERCENTAGE_DISCOUNT',
                priceValue: 10.0,
                appliesToAll: true,
                priority: 0
            }
        });

        console.log('--- Insurance 2.0 Seeding Complete hearth ---');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
