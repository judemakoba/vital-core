// ─── Vital Core HMS — minimal seed (roles + test users) ────────────────────
//
// Run via `npx prisma db seed` (uses the prisma.seed config in package.json).
// Safe to re-run: all operations are upserts.
//
// .cjs extension on purpose: the project is `"type": "module"`, so a .js file
// in this directory would be parsed as ESM and `require()` would fail. The
// .cjs extension opts the file out of ESM and lets it use the standard
// CommonJS + @prisma/client imports.
//
// What this seeds:
//   1. System roles (SUPER_ADMIN / ADMIN / DOCTOR / NURSE / RECEPTIONIST /
//      PHARMACIST / LAB_TECH / ACCOUNTANT / CASHIER)
//   2. Twelve test users (one per role + a few extra doctors) with the
//      default password "password123" — admin MUST rotate this on first login.
//
// What this does NOT seed (run the dedicated scripts if you need them):
//   - Chart of accounts / finance accounts  → `npm run db:seed:finance`
//   - Drug master / formulary                 → `npm run db:seed:pharmacy`
//   - ICD-11 codes                            → `npm run db:seed:icd`
//   - Lab test catalog                        → `npm run db:seed:lab`
//   - IPD wards / billable items              → `npm run db:seed:ipd`
//   - Inventory                               → `npm run db:seed:inventory`
//
// The app is fully usable without any of these — they're reference data
// you can add incrementally. The base seed is the minimum needed for
// someone to log in and explore.

const { PrismaClient } = require('../lib/generated-prisma');
const bcrypt = require('bcrypt');

let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && databaseUrl.includes('localhost')) {
    // Localhost can fail to resolve inside Docker depending on DNS
    // config; 127.0.0.1 always works.
    databaseUrl = databaseUrl.replace('localhost', '127.0.0.1');
}
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function main() {
    console.log('--- Vital Core minimal seed (roles + test users) ---');

    // 1. Roles
    const roleNames = [
        'SUPER_ADMIN',
        'ADMIN',
        'DOCTOR',
        'NURSE',
        'RECEPTIONIST',
        'PHARMACIST',
        'LAB_TECH',
        'ACCOUNTANT',
        'CASHIER',
    ];
    const roles = [];
    for (const name of roleNames) {
        const role = await prisma.role.upsert({
            where: { name },
            update: {},
            create: {
                name,
                description: `Default system role for ${name.toLowerCase().replace('_', ' ')}`,
            },
        });
        roles.push(role);
    }
    console.log(`  ✓ ${roleNames.length} roles ensured`);

    // 2. Test users (default password: password123 — rotate on first login)
    const usersToCreate = [
        { name: 'Super Admin User',  email: 'superadmin@vitalcore.com', role: 'SUPER_ADMIN',  employeeId: 'EMP-001' },
        { name: 'Admin User',         email: 'admin@vitalcore.com',       role: 'ADMIN',       employeeId: 'EMP-002' },
        { name: 'Dr. John Smith',     email: 'doctor@vitalcore.com',      role: 'DOCTOR',      employeeId: 'EMP-003', department: 'General Medicine',    specialization: 'General Practitioner' },
        { name: 'Dr. Amina Nakamura', email: 'doctor2@vitalcore.com',     role: 'DOCTOR',      employeeId: 'EMP-008', department: 'Pediatrics',          specialization: 'Pediatrician' },
        { name: 'Dr. Robert Omondi',  email: 'doctor3@vitalcore.com',     role: 'DOCTOR',      employeeId: 'EMP-009', department: 'Internal Medicine',   specialization: 'Internist' },
        { name: 'Dr. Grace Akello',   email: 'doctor4@vitalcore.com',     role: 'DOCTOR',      employeeId: 'EMP-010', department: 'Obstetrics & Gynaecology', specialization: 'OB/GYN' },
        { name: 'Dr. James Muwanguzi', email: 'doctor5@vitalcore.com',    role: 'DOCTOR',      employeeId: 'EMP-011', department: 'Surgery',             specialization: 'General Surgeon' },
        { name: 'Dr. Fatima Hassan',  email: 'doctor6@vitalcore.com',     role: 'DOCTOR',      employeeId: 'EMP-012', department: 'Emergency Medicine',  specialization: 'Emergency Physician' },
        { name: 'Nurse Jane Doe',     email: 'nurse@vitalcore.com',       role: 'NURSE',       employeeId: 'EMP-004', department: 'Emergency' },
        { name: 'Receptionist Sarah', email: 'reception@vitalcore.com',   role: 'RECEPTIONIST', employeeId: 'EMP-005' },
        { name: 'Pharmacist Mike',    email: 'pharmacy@vitalcore.com',    role: 'PHARMACIST',  employeeId: 'EMP-006' },
        { name: 'Lab Tech Alice',     email: 'lab@vitalcore.com',         role: 'LAB_TECH',    employeeId: 'EMP-007' },
    ];

    for (const u of usersToCreate) {
        const hashedPassword = await bcrypt.hash(u.password || 'password123', 10);
        const role = roles.find(r => r.name === u.role);
        if (!role) continue; // safety: skip if role wasn't created (shouldn't happen)
        await prisma.user.upsert({
            where: { email: u.email },
            update: {
                name: u.name,
                hashedPassword,
                roleId: role.id,
                employeeId: u.employeeId,
                department: u.department || null,
                isActive: true,
            },
            create: {
                name: u.name,
                email: u.email,
                hashedPassword,
                roleId: role.id,
                employeeId: u.employeeId,
                department: u.department || null,
                isActive: true,
            },
        });
    }
    console.log(`  ✓ ${usersToCreate.length} test users ensured (default password: password123)`);

    console.log('--- Done. App is now ready to log in. ---');
    console.log('  → admin@vitalcore.com / password123   (ADMIN)');
    console.log('  → doctor@vitalcore.com / password123  (DOCTOR)');
    console.log('  → ROTATE THE ADMIN PASSWORD ON FIRST LOGIN');
}

main()
    .catch((e) => {
        console.error('Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
