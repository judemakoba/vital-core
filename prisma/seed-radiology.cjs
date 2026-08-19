// ─── Vital Core HMS — Radiology catalog seed ─────────────────────────────
// Seeds the RadiologyCategory + RadiologyCatalog tables with a typical
// starter set for an outpatient radiology department. Idempotent — safe
// to re-run.
//
//   node prisma/seed-radiology.js
//   (or)  npm run db:seed:radiology
//
// Pricing is in UGX (Ugandan Shillings) — adjust per clinic.

const { PrismaClient } = require('../lib/generated-prisma');

let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && databaseUrl.includes('localhost')) {
    databaseUrl = databaseUrl.replace('localhost', '127.0.0.1');
}
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const CATEGORIES = [
    { name: 'X-Ray',          description: 'Plain radiography' },
    { name: 'CT Scan',         description: 'Computed tomography' },
    { name: 'MRI',             description: 'Magnetic resonance imaging' },
    { name: 'Ultrasound',      description: 'Sonography' },
    { name: 'Mammography',     description: 'Breast imaging' },
    { name: 'Fluoroscopy',     description: 'Real-time X-ray imaging' },
];

const EXAMS = [
    // ── X-Ray ──
    { category: 'X-Ray', name: 'Chest X-Ray (PA only)',         price: 25000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },
    { category: 'X-Ray', name: 'Chest X-Ray (PA + Lateral)',    price: 35000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },
    { category: 'X-Ray', name: 'Abdomen X-Ray (KUB)',           price: 30000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },
    { category: 'X-Ray', name: 'Skull X-Ray',                   price: 30000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },
    { category: 'X-Ray', name: 'Cervical Spine X-Ray',          price: 35000,  turnaroundTime: '30 minutes', preparationInstructions: 'Remove all jewelry and metal accessories' },
    { category: 'X-Ray', name: 'Thoracic Spine X-Ray',          price: 35000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },
    { category: 'X-Ray', name: 'Lumbosacral Spine X-Ray',       price: 35000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },
    { category: 'X-Ray', name: 'Pelvis X-Ray (AP)',             price: 35000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },
    { category: 'X-Ray', name: 'Hand X-Ray',                    price: 30000,  turnaroundTime: '30 minutes', preparationInstructions: 'Remove all jewelry' },
    { category: 'X-Ray', name: 'Wrist X-Ray',                   price: 30000,  turnaroundTime: '30 minutes', preparationInstructions: 'Remove all jewelry' },
    { category: 'X-Ray', name: 'Foot X-Ray',                    price: 30000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },
    { category: 'X-Ray', name: 'Knee X-Ray (AP + Lateral)',     price: 35000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },

    // ── CT Scan ──
    { category: 'CT Scan', name: 'CT Head (Plain)',              price: 120000, turnaroundTime: '2 hours',   preparationInstructions: 'None' },
    { category: 'CT Scan', name: 'CT Head (with Contrast)',      price: 180000, turnaroundTime: '2 hours',   preparationInstructions: 'Fasting 4 hours; recent creatinine if known' },
    { category: 'CT Scan', name: 'CT Chest (Plain)',             price: 150000, turnaroundTime: '2 hours',   preparationInstructions: 'None' },
    { category: 'CT Scan', name: 'CT Chest (with Contrast)',     price: 200000, turnaroundTime: '2 hours',   preparationInstructions: 'Fasting 4 hours; recent creatinine if known' },
    { category: 'CT Scan', name: 'CT Abdomen + Pelvis',          price: 220000, turnaroundTime: '2 hours',   preparationInstructions: 'Fasting 6 hours; oral contrast as instructed' },
    { category: 'CT Scan', name: 'CT KUB (Kidneys-Ureters-Bladder)', price: 140000, turnaroundTime: '1 hour',  preparationInstructions: 'Full bladder; fasting 4 hours' },
    { category: 'CT Scan', name: 'CT Angiography (Coronary)',    price: 350000, turnaroundTime: '4 hours',   preparationInstructions: 'Fasting 6 hours; beta-blocker prep as ordered' },

    // ── MRI ──
    { category: 'MRI', name: 'MRI Brain',                       price: 280000, turnaroundTime: '24 hours',  preparationInstructions: 'Remove all metal; check for pacemaker/implants' },
    { category: 'MRI', name: 'MRI Cervical Spine',              price: 280000, turnaroundTime: '24 hours',  preparationInstructions: 'Remove all metal' },
    { category: 'MRI', name: 'MRI Lumbar Spine',                price: 280000, turnaroundTime: '24 hours',  preparationInstructions: 'Remove all metal' },
    { category: 'MRI', name: 'MRI Knee',                        price: 280000, turnaroundTime: '24 hours',  preparationInstructions: 'Remove all metal' },
    { category: 'MRI', name: 'MRI Shoulder',                    price: 280000, turnaroundTime: '24 hours',  preparationInstructions: 'Remove all metal' },

    // ── Ultrasound ──
    { category: 'Ultrasound', name: 'Abdominal Ultrasound',      price: 50000,  turnaroundTime: '30 minutes', preparationInstructions: 'Fasting 6 hours' },
    { category: 'Ultrasound', name: 'Pelvic Ultrasound (TA)',    price: 50000,  turnaroundTime: '30 minutes', preparationInstructions: 'Full bladder' },
    { category: 'Ultrasound', name: 'Obstetric Ultrasound (Obstetrics scan)', price: 60000, turnaroundTime: '30 minutes', preparationInstructions: 'Full bladder' },
    { category: 'Ultrasound', name: 'Thyroid Ultrasound',        price: 55000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },
    { category: 'Ultrasound', name: 'Breast Ultrasound',         price: 60000,  turnaroundTime: '30 minutes', preparationInstructions: 'None' },
    { category: 'Ultrasound', name: 'Carotid Doppler',           price: 80000,  turnaroundTime: '1 hour',    preparationInstructions: 'None' },
    { category: 'Ultrasound', name: 'Echocardiogram (2D Echo)',  price: 120000, turnaroundTime: '1 hour',    preparationInstructions: 'None' },
    { category: 'Ultrasound', name: 'Renal Ultrasound',          price: 55000,  turnaroundTime: '30 minutes', preparationInstructions: 'Fasting 4 hours' },

    // ── Mammography ──
    { category: 'Mammography', name: 'Bilateral Mammogram',      price: 80000,  turnaroundTime: '1 hour',    preparationInstructions: 'No deodorant or powder on the day' },
    { category: 'Mammography', name: 'Unilateral Mammogram',     price: 50000,  turnaroundTime: '1 hour',    preparationInstructions: 'No deodorant or powder on the day' },

    // ── Fluoroscopy ──
    { category: 'Fluoroscopy', name: 'Barium Swallow (Esophagram)', price: 90000, turnaroundTime: '2 hours', preparationInstructions: 'Fasting 6 hours' },
    { category: 'Fluoroscopy', name: 'Barium Meal (Upper GI)',   price: 110000, turnaroundTime: '2 hours',   preparationInstructions: 'Fasting 8 hours' },
    { category: 'Fluoroscopy', name: 'Barium Enema (Lower GI)',  price: 130000, turnaroundTime: '2 hours',   preparationInstructions: 'Bowel prep as instructed' },
];

async function main() {
    console.log('--- Vital Core radiology catalog seed ---');
    console.log('');

    // 1. Upsert categories, build a name→id map
    console.log(`[1/2] Upserting ${CATEGORIES.length} categories...`);
    const catMap = {};
    for (const cat of CATEGORIES) {
        const row = await prisma.radiologyCategory.upsert({
            where: { name: cat.name },
            update: { description: cat.description, isActive: true },
            create: { name: cat.name, description: cat.description, isActive: true },
        });
        catMap[cat.name] = row.id;
        console.log(`  ✓ ${cat.name}`);
    }

    // 2. Upsert exams
    console.log('');
    console.log(`[2/2] Upserting ${EXAMS.length} exams...`);
    for (const exam of EXAMS) {
        const categoryId = catMap[exam.category];
        if (!categoryId) {
            console.warn(`  ⚠ Skipping ${exam.name} — unknown category ${exam.category}`);
            continue;
        }
        await prisma.radiologyCatalog.upsert({
            where: { name: exam.name },
            update: {
                categoryId,
                price: exam.price,
                turnaroundTime: exam.turnaroundTime,
                preparationInstructions: exam.preparationInstructions,
                isActive: true,
            },
            create: {
                name: exam.name,
                categoryId,
                price: exam.price,
                turnaroundTime: exam.turnaroundTime,
                preparationInstructions: exam.preparationInstructions,
                isActive: true,
            },
        });
        console.log(`  ✓ ${exam.name}  (${exam.category})`);
    }

    console.log('');
    console.log(`--- Done. ${CATEGORIES.length} categories, ${EXAMS.length} exams. ---`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
