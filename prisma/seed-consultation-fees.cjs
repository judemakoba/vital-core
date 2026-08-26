// ─── Default consultation fee categories ──────────────────────────────────
// Seeds a sensible starter set of fee tiers for each existing tenant.
// Idempotent: re-runs upsert by (tenantId, name).
//
// Run inside the app container (Prisma engine binary):
//
//   docker cp prisma/seed-consultation-fees.cjs vitalcore-app:/app/prisma/
//   docker exec -e DATABASE_URL=... vitalcore-app \
//     node /app/prisma/seed-consultation-fees.cjs

const { PrismaClient } = require('../lib/generated-prisma');
const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
});

// visitType values from the VisitType enum:
//   OPD, EMERGENCY, SCHEDULED, FOLLOW_UP, LAB_REVIEW, VACCINATION,
//   ANTENATAL, LAB_ONLY, RADIOLOGY_ONLY, PRESCRIPTION_ONLY, OTHER
//
// The default tier set covers the common categories a clinic might
// raise: standard, senior specialist, pediatric, telemedicine,
// follow-up (free), emergency. Clinics can edit/delete and add
// their own once seeded.
const DEFAULT_TIERS = [
    { name: 'Standard OPD',                fee: 30000, visitTypes: 'OPD,OTHER',                 isDefault: true,  sortOrder: 1, description: 'Default general consultation' },
    { name: 'Senior Specialist',           fee: 60000, visitTypes: 'OPD',                      isDefault: false, sortOrder: 2, description: 'Senior / consultant specialist' },
    { name: 'Pediatric Consultation',      fee: 25000, visitTypes: 'OPD',                      isDefault: false, sortOrder: 3, description: 'Under 12 years' },
    { name: 'Telemedicine Consultation',   fee: 15000, visitTypes: 'OPD',                      isDefault: false, sortOrder: 4, description: 'Phone or video consultation' },
    { name: 'Emergency Consultation',      fee: 75000, visitTypes: 'EMERGENCY',                isDefault: true,  sortOrder: 5, description: 'Walk-in emergency' },
    { name: 'Scheduled Visit',             fee: 35000, visitTypes: 'SCHEDULED',                isDefault: true,  sortOrder: 6, description: 'Pre-booked appointment' },
    { name: 'Follow-up Visit',             fee: 0,     visitTypes: 'FOLLOW_UP',                isDefault: true,  sortOrder: 7, description: 'Waived within the follow-up window' },
    { name: 'Lab Review',                  fee: 0,     visitTypes: 'LAB_REVIEW',               isDefault: true,  sortOrder: 8, description: 'Doctor reviewing lab results only' },
    { name: 'Antenatal Visit',             fee: 20000, visitTypes: 'ANTENATAL',                isDefault: true,  sortOrder: 9, description: 'Routine antenatal check' },
    { name: 'Vaccination',                 fee: 10000, visitTypes: 'VACCINATION',              isDefault: true,  sortOrder: 10, description: 'Immunization visit' },
];

async function main() {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    if (tenants.length === 0) {
        console.log('No tenants found. Run seed-comprehensive.ts first.');
        return;
    }

    let total = 0;
    for (const t of tenants) {
        for (const tier of DEFAULT_TIERS) {
            // upsert by (tenantId, name)
            const existing = await prisma.consultationFeeCategory.findFirst({
                where: { tenantId: t.id, name: tier.name },
            });
            if (existing) {
                await prisma.consultationFeeCategory.update({
                    where: { id: existing.id },
                    data: {
                        fee: tier.fee,
                        visitTypes: tier.visitTypes,
                        isDefault: tier.isDefault,
                        isActive: true,
                        sortOrder: tier.sortOrder,
                        description: tier.description,
                    },
                });
            } else {
                await prisma.consultationFeeCategory.create({
                    data: {
                        tenantId: t.id,
                        name: tier.name,
                        fee: tier.fee,
                        visitTypes: tier.visitTypes,
                        isDefault: tier.isDefault,
                        isActive: true,
                        sortOrder: tier.sortOrder,
                        description: tier.description,
                    },
                });
            }
            total++;
        }
        console.log(`  ${t.name}: 10 tiers`);
    }

    console.log(`\nDone. Upserted ${total} tier rows across ${tenants.length} tenant(s).`);
}

main().catch((e) => {
    console.error('Consultation-fee seed failed:', e);
    process.exit(1);
}).finally(() => prisma.$disconnect());
