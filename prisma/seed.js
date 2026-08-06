const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && databaseUrl.includes('localhost')) {
    databaseUrl = databaseUrl.replace('localhost', '127.0.0.1');
}
console.log(`DEBUG: Using Database URL (Fixed): ${databaseUrl ? 'DEFINED' : 'UNDEFINED'} hearth`);

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: databaseUrl,
        },
    },
});

async function main() {
    console.log('--- Starting Seeding Process hearth ---');

    // 1. Create Roles
    const roleNames = [
        'SUPER_ADMIN',
        'ADMIN',
        'DOCTOR',
        'NURSE',
        'RECEPTIONIST',
        'PHARMACIST',
        'LAB_TECH'
    ];

    const roles = [];
    for (const name of roleNames) {
        const role = await prisma.role.upsert({
            where: { name },
            update: {},
            create: {
                name,
                description: `Default system role for ${name.toLowerCase().replace('_', ' ')}`
            }
        });
        roles.push(role);
        console.log(`✅ Role ${name} ensured`);
    }

    // 2. Create Users
    const usersToCreate = [
        {
            name: 'Super Admin User',
            email: 'superadmin@vitalcore.com',
            password: 'password123',
            role: 'SUPER_ADMIN',
            employeeId: 'EMP-001'
        },
        {
            name: 'Admin User',
            email: 'admin@vitalcore.com',
            password: 'password123',
            role: 'ADMIN',
            employeeId: 'EMP-002'
        },
        {
            name: 'Dr. John Smith',
            email: 'doctor@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-003',
            department: 'General Medicine',
            specialization: 'General Practitioner'
        },
        {
            name: 'Dr. Amina Nakamura',
            email: 'doctor2@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-008',
            department: 'Pediatrics',
            specialization: 'Pediatrician'
        },
        {
            name: 'Dr. Robert Omondi',
            email: 'doctor3@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-009',
            department: 'Internal Medicine',
            specialization: 'Internist'
        },
        {
            name: 'Dr. Grace Akello',
            email: 'doctor4@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-010',
            department: 'Obstetrics & Gynaecology',
            specialization: 'OB/GYN'
        },
        {
            name: 'Dr. James Muwanguzi',
            email: 'doctor5@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-011',
            department: 'Surgery',
            specialization: 'General Surgeon'
        },
        {
            name: 'Dr. Fatima Hassan',
            email: 'doctor6@vitalcore.com',
            password: 'password123',
            role: 'DOCTOR',
            employeeId: 'EMP-012',
            department: 'Emergency Medicine',
            specialization: 'Emergency Physician'
        },
        {
            name: 'Nurse Jane Doe',
            email: 'nurse@vitalcore.com',
            password: 'password123',
            role: 'NURSE',
            employeeId: 'EMP-004',
            department: 'Emergency'
        },
        {
            name: 'Receptionist Sarah',
            email: 'reception@vitalcore.com',
            password: 'password123',
            role: 'RECEPTIONIST',
            employeeId: 'EMP-005'
        },
        {
            name: 'Pharmacist Mike',
            email: 'pharmacy@vitalcore.com',
            password: 'password123',
            role: 'PHARMACIST',
            employeeId: 'EMP-006'
        },
        {
            name: 'Lab Tech Alice',
            email: 'lab@vitalcore.com',
            password: 'password123',
            role: 'LAB_TECH',
            employeeId: 'EMP-007'
        }
    ];

    for (const u of usersToCreate) {
        const hashedPassword = await bcrypt.hash(u.password, 10);
        const role = roles.find(r => r.name === u.role);

        await prisma.user.upsert({
            where: { email: u.email },
            update: {
                name: u.name,
                hashedPassword,
                roleId: role.id,
                employeeId: u.employeeId,
                department: u.department || null,
                isActive: true
            },
            create: {
                name: u.name,
                email: u.email,
                hashedPassword,
                roleId: role.id,
                employeeId: u.employeeId,
                department: u.department || null,
                isActive: true
            }
        });
        console.log(`👤 User ${u.email} (${u.role}) ensured`);
    }

    console.log('--- Seeding Complete hearth ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
