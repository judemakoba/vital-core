// Backfill REGULAR prices for the 4 original seed-pharmacy drugs
// (Amoxicillin, Panadol, Coartem, Insulin) that didn't have DrugPrice
// rows. The 451-drug seed-drugs.cjs already creates REGULAR prices; this
// covers the gap.
//
// Run: docker exec -e DATABASE_URL=... vitalcore-app node /app/prisma/seed-original-drug-prices.cjs

const { PrismaClient } = require('../lib/generated-prisma');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

// Mirrors seed-pharmacy.cjs batches sellingPrice
const drugPrices = [
    { code: 'AMOX-500-01', price: 500 },
    { code: 'PARA-500-01', price: 250 },
    { code: 'ART-120-01',  price: 1600 },
    { code: 'INS-100-01',  price: 15000 },
];

async function main() {
    for (const { code, price } of drugPrices) {
        const drug = await prisma.drug.findUnique({ where: { drugCode: code } });
        if (!drug) {
            console.log(`  skip ${code} (drug not found)`);
            continue;
        }
        const existing = await prisma.drugPrice.findFirst({
            where: { drugId: drug.id, priceType: 'REGULAR', isActive: true, effectiveTo: null },
        });
        if (existing) {
            console.log(`  ${code}: REGULAR price already exists (${existing.price} UGX)`);
            continue;
        }
        await prisma.drugPrice.create({
            data: {
                drugId: drug.id,
                priceType: 'REGULAR',
                price,
                isActive: true,
                effectiveFrom: new Date(),
            },
        });
        console.log(`  ${code}: created REGULAR price ${price} UGX`);
    }
}

main()
    .catch(e => { console.error('seed-original-drug-prices failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
