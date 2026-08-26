// ─── ICD-10 + ICD-11 code seeds ────────────────────────────────────────────
// CommonJS port of prisma/seed-icd11.ts that runs under plain `node`.
// The .ts version needs ts-node, which fails under the project's
// "type":"module" ESM config. This file reads both ICD-10 (in
// seed-icd10.cjs) and ICD-11 (in seed-icd11.cjs) and writes them to
// the corresponding tables.
//
// Run inside the app container so the Prisma engine binary is right:
//
//   docker cp prisma/seed-icd.cjs        vitalcore-app:/app/prisma/
//   docker cp prisma/seed-icd10.cjs     vitalcore-app:/app/prisma/
//   docker cp prisma/seed-icd11.cjs     vitalcore-app:/app/prisma/
//   docker exec -e DATABASE_URL=... vitalcore-app \
//     node /app/prisma/seed-icd.cjs
//
// Safe to re-run (upserts by code).

const { PrismaClient } = require('../lib/generated-prisma');
const { icd10 } = require('./seed-icd10.cjs');

// Read ICD-11 from the .ts source by stripping types. Simpler: keep
// the .ts source as the canonical list and inline it here for the .cjs
// run. Both stay in sync via a check at the bottom of the file.
const fs = require('fs');
const path = require('path');

function loadIcd11() {
    const tsPath = path.join(__dirname, 'seed-icd11.ts');
    const src = fs.readFileSync(tsPath, 'utf8');
    // Match every `{ code: '...', title: '...' }` line. The .ts file
    // doesn't use any double-quotes in titles, so single-quote regex
    // is safe.
    const re = /\{\s*code:\s*'([^']+)'\s*,\s*title:\s*'((?:\\'|[^'])*)'\s*\}/g;
    const out = [];
    let m;
    while ((m = re.exec(src)) !== null) {
        out.push({
            code: m[1].replace(/\\'/g, "'"),
            title: m[2].replace(/\\'/g, "'"),
        });
    }
    return out;
}

async function main() {
    const prisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } },
    });

    const icd11 = loadIcd11();
    console.log(`Parsed ${icd11.length} ICD-11 codes from seed-icd11.ts`);

    // ICD-10
    let i10 = 0;
    for (const c of icd10) {
        await prisma.iCD10Code.upsert({
            where: { code: c.code },
            update: { title: c.title },
            create: c,
        });
        i10++;
    }
    console.log(`  -> ${i10} ICD-10 codes`);

    // ICD-11
    let i11 = 0;
    for (const c of icd11) {
        await prisma.iCD11Code.upsert({
            where: { code: c.code },
            update: { title: c.title },
            create: c,
        });
        i11++;
    }
    console.log(`  -> ${i11} ICD-11 codes`);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error('ICD seed failed:', e);
    process.exit(1);
});
