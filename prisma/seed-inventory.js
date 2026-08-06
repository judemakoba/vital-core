const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Seeding Inventory & Catalog hearth ---');

    // 1. Drugs
    const drugs = [
        { name: 'Paracetamol', genericName: 'Acetaminophen', category: 'Analgesics', dosageForm: 'Tablet', strength: '500mg', unitMeasure: 'Tabs', quantityInStock: 500, pricePerUnit: 200 },
        { name: 'Amoxicillin', genericName: 'Amoxicillin', category: 'Antibiotics', dosageForm: 'Capsule', strength: '500mg', unitMeasure: 'Caps', quantityInStock: 200, pricePerUnit: 1500 },
        { name: 'Ciprofloxacin', genericName: 'Ciprofloxacin', category: 'Antibiotics', dosageForm: 'Tablet', strength: '500mg', unitMeasure: 'Tabs', quantityInStock: 150, pricePerUnit: 2500 },
        { name: 'Artemether/Lumefantrine', genericName: 'Coartem', category: 'Antimalarials', dosageForm: 'Tablet', strength: '20/120mg', unitMeasure: 'Tabs', quantityInStock: 100, pricePerUnit: 12000 },
        { name: 'Omeprazole', genericName: 'Omeprazole', category: 'Gastrointestinal', dosageForm: 'Capsule', strength: '20mg', unitMeasure: 'Caps', quantityInStock: 300, pricePerUnit: 800 }
    ];

    for (const d of drugs) {
        await prisma.drugInventory.upsert({
            where: { name: d.name },
            update: {},
            create: d
        });
        console.log(`✅ Drug ${d.name} ensured`);
    }

    // 2. Lab Tests
    const tests = [
        { name: 'Full Blood Count', category: 'Hematology', price: 25000, referenceRange: 'N/A', unit: 'N/A' },
        { name: 'Malaria RDT', category: 'Serology', price: 15000, referenceRange: 'Negative', unit: 'N/A' },
        { name: 'Urinalysis', category: 'Biochemistry', price: 20000, referenceRange: 'N/A', unit: 'N/A' },
        { name: 'Blood Glucose', category: 'Biochemistry', price: 10000, referenceRange: '3.9-6.1', unit: 'mmol/L' },
        { name: 'Typhoid Test (Widal)', category: 'Serology', price: 20000, referenceRange: 'N/A', unit: 'N/A' }
    ];

    for (const t of tests) {
        await prisma.labTestCatalog.upsert({
            where: { name: t.name },
            update: {},
            create: t
        });
        console.log(`✅ Lab Test ${t.name} ensured`);
    }

    console.log('--- Seeding Complete hearth ---');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
