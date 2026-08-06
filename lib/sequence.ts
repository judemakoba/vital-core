import { prisma } from '@/lib/prisma'

// Counter model for atomic sequence generation
export async function getNextSequence(
  prefix: string,
  date: Date = new Date()
): Promise<string> {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '')
  const counterName = \`\${prefix}-\${dateStr}\`

  const counter = await prisma.counter.upsert({
    where: { name: counterName },
    update: { value: { increment: 1 } },
    create: { name: counterName, value: 1 },
  })

  const sequence = counter.value.toString().padStart(4, '0')
  return \`\${prefix}-\${dateStr}-\${sequence}\`
}

// Add Counter model to schema if needed
/*
model Counter {
  id        String   @id @default(cuid())
  name      String   @unique
  value     Int      @default(0)
  updatedAt DateTime @updatedAt
}
*/
