import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const data = await prisma.$queryRaw`
    SELECT p."medicationName", d.name as "MasterName", COUNT(*) as count 
    FROM "Prescription" p 
    LEFT JOIN "Drug" d ON LOWER(p."medicationName") = LOWER(d.name) 
    GROUP BY p."medicationName", d.name
  `
  console.log(JSON.stringify(data, null, 2))
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
