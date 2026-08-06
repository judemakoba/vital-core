import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; error?: string }> = {}

  // Database check
  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart }
  } catch (error) {
    checks.database = { 
      status: 'error', 
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }

  // Prisma connection check
  try {
    const prismaStart = Date.now()
    await prisma.user.count()
    checks.prisma = { status: 'ok', latencyMs: Date.now() - prismaStart }
  } catch (error) {
    checks.prisma = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }

  const allHealthy = Object.values(checks).every(c => c.status === 'ok')
  const totalLatency = Date.now() - start

  logger.info({ checks, totalLatency }, 'Health check')

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      latencyMs: totalLatency,
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  )
}
