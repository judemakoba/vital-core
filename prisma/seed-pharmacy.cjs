// ─── Vital Core HMS — Pharmacy module seed ─────────────────────────────────
// .cjs (not .ts, not .js) because the project is "type": "module" — plain
// .js files are parsed as ESM and `require()` would fail. .cjs opts out.
//
// No ts-node is available in the standalone runner, and this script has no
// TypeScript type annotations anyway — it's just runtime JS using the
// Prisma enums (which work identically as property accesses in both CJS
// and ESM).

const { PrismaClient, DosageForm, StorageCondition, DrugSchedule } = require('../lib/generated-prisma');

let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && databaseUrl.includes('localhost')) {
    databaseUrl = databaseUrl.replace('localhost', '127.0.0.1');
}
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function main() {
    console.log('--- Starting Pharmacy Module Seeding ---');

    // 1. Create Drug Categories
    console.log('Seeding Drug Categories...');
    const antibioticsCat = await prisma.drugCategory.upsert({
        where: { code: 'CAT-ANTIBIOTICS' },
        update: {},
        create: {
            name: 'Antibiotics',
            code: 'CAT-ANTIBIOTICS',
            description: 'Medications that destroy or slow down the growth of bacteria',
        },
    });

    const analgesicsCat = await prisma.drugCategory.upsert({
        where: { code: 'CAT-ANALGESICS' },
        update: {},
        create: {
            name: 'Analgesics',
            code: 'CAT-ANALGESICS',
            description: 'Painkillers',
        },
    });

    const antimalarialsCat = await prisma.drugCategory.upsert({
        where: { code: 'CAT-ANTIMALARIALS' },
        update: {},
        create: {
            name: 'Antimalarials',
            code: 'CAT-ANTIMALARIALS',
            description: 'Medications for the treatment and prevention of malaria infection',
        },
    });

    const hormonesCat = await prisma.drugCategory.upsert({
        where: { code: 'CAT-HORMONES' },
        update: {},
        create: {
            name: 'Hormones & Chronic Care',
            code: 'CAT-HORMONES',
            description: 'Medications for diabetes, thyroid, and other endocrine disorders',
        },
    });

    // 2. Create Suppliers
    console.log('Seeding Suppliers...');
    const medipharm = await prisma.supplier.upsert({
        where: { supplierCode: 'SUP-MEDIPHARM' },
        update: {},
        create: {
            supplierCode: 'SUP-MEDIPHARM',
            name: 'MediPharm Uganda Ltd',
            contactPerson: 'John Mukasa',
            phone: '0772-987654',
            email: 'sales@medipharm.co.ug',
            paymentTerms: 'Net 30 days',
            leadTimeDays: 3,
        },
    });

    const abacus = await prisma.supplier.upsert({
        where: { supplierCode: 'SUP-ABACUS' },
        update: {},
        create: {
            supplierCode: 'SUP-ABACUS',
            name: 'Abacus Pharma',
            contactPerson: 'Sarah Nakato',
            phone: '0702-123456',
            email: 'orders@abacuspharma.com',
            paymentTerms: 'Cash on Delivery',
            leadTimeDays: 1,
        },
    });

    // 3. Create Drugs
    console.log('Seeding Drugs...');

    // Amoxicillin
    const amoxicillin = await prisma.drug.upsert({
        where: { drugCode: 'AMOX-500-01' },
        update: {},
        create: {
            drugCode: 'AMOX-500-01',
            name: 'Amoxicillin 500mg',
            genericName: 'Amoxicillin Trihydrate',
            categoryId: antibioticsCat.id,
            schedule: DrugSchedule.PRESCRIPTION,
            dosageForm: DosageForm.TABLET,
            strength: '500mg',
            strengthValue: 500,
            strengthUnit: 'mg',
            packageSize: 10,
            packageUnit: 'Tablet',
            storage: StorageCondition.ROOM_TEMP,
            shelfLifeMonths: 24,
            manufacturer: 'Rene Industries',
            countryOfOrigin: 'Uganda',
            indications: 'Bacterial infections including respiratory, urinary tract, and skin',
        },
    });

    // Paracetamol
    const paracetamol = await prisma.drug.upsert({
        where: { drugCode: 'PARA-500-01' },
        update: {},
        create: {
            drugCode: 'PARA-500-01',
            name: 'Panadol 500mg',
            genericName: 'Paracetamol',
            categoryId: analgesicsCat.id,
            schedule: DrugSchedule.OTC,
            dosageForm: DosageForm.TABLET,
            strength: '500mg',
            strengthValue: 500,
            strengthUnit: 'mg',
            packageSize: 10,
            packageUnit: 'Tablet',
            storage: StorageCondition.ROOM_TEMP,
            shelfLifeMonths: 36,
            manufacturer: 'GSK',
            countryOfOrigin: 'Kenya',
        },
    });

    // Artemether/Lumefantrine
    const artemether = await prisma.drug.upsert({
        where: { drugCode: 'ART-120-01' },
        update: {},
        create: {
            drugCode: 'ART-120-01',
            name: 'Coartem 20/120mg',
            genericName: 'Artemether/Lumefantrine',
            categoryId: antimalarialsCat.id,
            schedule: DrugSchedule.PRESCRIPTION,
            dosageForm: DosageForm.TABLET,
            strength: '20/120mg',
            packageSize: 24,
            packageUnit: 'Tablet',
            storage: StorageCondition.ROOM_TEMP,
            shelfLifeMonths: 24,
            manufacturer: 'Novartis',
            countryOfOrigin: 'Switzerland',
        },
    });

    // Insulin
    const insulin = await prisma.drug.upsert({
        where: { drugCode: 'INS-100-01' },
        update: {},
        create: {
            drugCode: 'INS-100-01',
            name: 'Actrapid HM 100IU/ml',
            genericName: 'Human Insulin',
            categoryId: hormonesCat.id,
            schedule: DrugSchedule.PRESCRIPTION,
            dosageForm: DosageForm.INJECTION,
            strength: '100IU/ml',
            packageSize: 1,
            packageUnit: 'Vial',
            storage: StorageCondition.REFRIGERATED,
            shelfLifeMonths: 24,
            manufacturer: 'Novo Nordisk',
            countryOfOrigin: 'Denmark',
        },
    });

    // 4. Create Initial Batches & Stock
    console.log('Seeding Initial Drug Batches...');

    await prisma.drugBatch.create({
        data: {
            drugId: amoxicillin.id,
            batchNumber: 'B2401-01',
            supplierId: medipharm.id,
            expiryDate: new Date('2025-12-31'),
            quantityReceived: 1000,
            quantityRemaining: 450,
            purchasePrice: 300,
            sellingPrice: 500,
            storageLocation: 'Shelf A-12',
        }
    });

    await prisma.drugBatch.create({
        data: {
            drugId: paracetamol.id,
            batchNumber: 'B2404-02',
            supplierId: abacus.id,
            expiryDate: new Date('2026-12-31'),
            quantityReceived: 2000,
            quantityRemaining: 890,
            purchasePrice: 150,
            sellingPrice: 250,
            storageLocation: 'Shelf A-14',
        }
    });

    await prisma.drugBatch.create({
        data: {
            drugId: artemether.id,
            batchNumber: 'B2404-03',
            supplierId: medipharm.id,
            expiryDate: new Date('2026-12-31'),
            quantityReceived: 500,
            quantityRemaining: 215,
            purchasePrice: 800,
            sellingPrice: 1600,
            storageLocation: 'Shelf B-03',
        }
    });

    await prisma.drugBatch.create({
        data: {
            drugId: insulin.id,
            batchNumber: 'B2404-05',
            supplierId: medipharm.id,
            expiryDate: new Date('2025-05-31'),
            quantityReceived: 50,
            quantityRemaining: 12,
            purchasePrice: 12000,
            sellingPrice: 15000,
            storageLocation: 'Fridge 2',
        }
    });

    console.log('--- Pharmacy Seeding Completed Successfully ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
