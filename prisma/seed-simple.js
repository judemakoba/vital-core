const { PrismaClient } = require('../lib/generated-prisma');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Seed ---');

  // 1. Roles
  const roleNames = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_TECH'];
  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `Default system role: ${name}` },
    });
  }
  console.log('Roles created');

  // 2. Admin User
  const existingAdmin = await prisma.user.findFirst({ 
    where: { 
      OR: [
        { email: 'admin@vitalcore.local' },
        { employeeId: 'EMP-001' }
      ]
    } 
  });
  
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@123', 12);
    const adminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
    
    await prisma.user.create({
      data: {
        email: 'admin@vitalcore.local',
        name: 'System Administrator',
        hashedPassword,
        roleId: adminRole.id,
        employeeId: 'EMP-001',
        isActive: true,
      },
    });
    console.log('Admin user created');
  } else {
    console.log('Admin user already exists:', existingAdmin.email);
  }

  // 3. Insurance Companies - find by name to avoid unique constraint conflicts
  let jubilee = await prisma.insuranceCompany.findFirst({ where: { name: 'Jubilee Insurance' } });
  if (!jubilee) {
    jubilee = await prisma.insuranceCompany.create({
      data: {
        name: 'Jubilee Insurance',
        code: 'JUB',
        contactPerson: 'Agnes Namatovu',
        phone: '+256 701 000111',
        email: 'claims@jubileeuganda.com',
        address: 'Jubilee Insurance Centre, Plot 14 Parliament Avenue',
        isActive: true,
      },
    });
  }

  let uwaf = await prisma.insuranceCompany.findFirst({ where: { name: 'UAP Old Mutual' } });
  if (!uwaf) {
    uwaf = await prisma.insuranceCompany.create({
      data: {
        name: 'UAP Old Mutual',
        code: 'UWAF',
        contactPerson: 'Robert Byaruhanga',
        phone: '+256 414 332200',
        email: 'claims@uapoldmutual.com',
        address: 'UAP Old Mutual Tower, Plot 3 Kimathi Avenue',
        isActive: true,
      },
    });
  }
  console.log('Insurance companies ready');

  // 4. Insurance Plans
  const jubileePlan = await prisma.insurancePlan.upsert({
    where: { id: 'jubilee-standard' },
    update: {},
    create: {
      id: 'jubilee-standard',
      companyId: jubilee.id,
      name: 'Jubilee Standard',
      discountPercentage: 10,
      coverageDetails: 'Standard outpatient and inpatient coverage',
    },
  });

  const uwafPlan = await prisma.insurancePlan.upsert({
    where: { id: 'uwaf-standard' },
    update: {},
    create: {
      id: 'uwaf-standard',
      companyId: uwaf.id,
      name: 'UAP Standard',
      discountPercentage: 15,
      coverageDetails: 'Comprehensive coverage with wellness benefits',
    },
  });
  console.log('Insurance plans ready');

  // 5. Patients
  const patientsData = [
    {
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1985-05-15'),
      gender: 'MALE',
      phone: '0772111222',
      email: 'john.doe@example.com',
      address: 'Plot 12, Kololo',
      city: 'Kampala',
      hasInsurance: true,
      insuranceId: jubilee.id,
      insurancePlanId: jubileePlan.id,
      insuranceNo: 'JUB-2024-001',
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '0772333444',
      emergencyContactRel: 'Spouse',
      bloodGroup: 'O+',
    },
    {
      firstName: 'Jane',
      lastName: 'Smith',
      dateOfBirth: new Date('1992-08-22'),
      gender: 'FEMALE',
      phone: '0781333444',
      email: 'jane.smith@example.com',
      address: 'Bugolobi Flats',
      city: 'Kampala',
      hasInsurance: true,
      insuranceId: uwaf.id,
      insurancePlanId: uwafPlan.id,
      insuranceNo: 'UWAF-2024-002',
      emergencyContactName: 'John Smith',
      emergencyContactPhone: '0781555666',
      emergencyContactRel: 'Spouse',
      bloodGroup: 'A+',
    },
    {
      firstName: 'Samuel',
      lastName: 'Muwanguzi',
      dateOfBirth: new Date('1978-03-10'),
      gender: 'MALE',
      phone: '0702555666',
      email: 'samuel.muwanguzi@example.com',
      address: 'Ntinda',
      city: 'Kampala',
      hasInsurance: false,
      emergencyContactName: 'Mary Muwanguzi',
      emergencyContactPhone: '0702777888',
      emergencyContactRel: 'Spouse',
      bloodGroup: 'B+',
    },
    {
      firstName: 'Amina',
      lastName: 'Nakato',
      dateOfBirth: new Date('2000-11-05'),
      gender: 'FEMALE',
      phone: '0754777888',
      email: 'amina.nakato@example.com',
      address: 'Kisaasi',
      city: 'Kampala',
      hasInsurance: true,
      insuranceId: jubilee.id,
      insurancePlanId: jubileePlan.id,
      insuranceNo: 'JUB-2024-003',
      emergencyContactName: 'Fatuma Nakato',
      emergencyContactPhone: '0754999000',
      emergencyContactRel: 'Mother',
      bloodGroup: 'AB+',
    },
  ];

  for (const p of patientsData) {
    // Check if patient already exists by phone
    const existing = await prisma.patient.findFirst({ where: { phone: p.phone } });
    if (!existing) {
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const count = await prisma.patient.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } },
      });
      const sequence = (count + 1).toString().padStart(4, '0');
      const patientNumber = 'PAT-' + dateStr + '-' + sequence;

      await prisma.patient.create({
        data: {
          ...p,
          patientNumber,
        },
      });
    }
  }
  console.log('Patients created');

  console.log('--- Seed Complete ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
