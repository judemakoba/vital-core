const { PrismaClient } = require('../lib/generated-prisma');
const prisma = new PrismaClient();

async function main() {
  const patients = await prisma.patient.findMany({
    select: { patientNumber: true, firstName: true, lastName: true, isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log('Sample patients:', patients.length);
  patients.forEach(p => console.log(`  ${p.patientNumber}: ${p.firstName} ${p.lastName} (Active: ${p.isActive})`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
