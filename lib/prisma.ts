import { PrismaClient } from './generated-prisma/index.js'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['error', 'warn']
      : ['error'],
    datasources: {
      db: { url: process.env.DATABASE_URL },
    },
  });
}

// Singleton — survives Next.js hot-module-replacement
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = createPrismaClient();
}
export const prisma = globalForPrisma.prisma!;

// Graceful disconnect on server shutdown
if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
