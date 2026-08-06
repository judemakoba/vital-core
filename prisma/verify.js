const { PrismaClient } = require('../lib/generated-prisma');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Verifying Seed ---');
  
  const patients = await prisma.patient.findMany({
    select: {
      id: true,
      patientNumber: true,
      firstName: true,
      lastName: true,
      phone: true,
      hasInsurance: true,
      insurance: { select: { name: true } },
      insurancePlan: { select: { name: true } },
    }
  });
  
  console.log('Total patients:', patients.length);
  patients.forEach(p => {
    console.log(`  ${p.patientNumber}: ${p.firstName} ${p.lastName} (${p.phone}) - Insurance: ${p.hasInsurance ? p.insurance?.name || 'N/A' : 'None'}`);
  });
  
  // Also check users
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: { select: { name: true } } }
  });
  console.log('\nTotal users:', users.length);
  users.forEach(u => console.log(`  ${u.email} - ${u.name} (${u.role?.name})`));
  
  // Check insurance companies
  const ins = await prisma.insuranceCompany.findMany({
    select: { id: true, name: true, code: true }
  });
  console.log('\nInsurance companies:', ins.length);
  ins.forEach(i => console.log(`  ${i.code}: ${i.name}`));
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
