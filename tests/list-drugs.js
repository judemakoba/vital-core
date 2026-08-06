const { PrismaClient } = require('../lib/generated-prisma');
const prisma = new PrismaClient();

async function main() {
  try {
    const drugs = await prisma.drug.findMany({
      take: 50,
      select: { name: true, genericName: true, drugCode: true }
    });
    console.log(JSON.stringify(drugs, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
