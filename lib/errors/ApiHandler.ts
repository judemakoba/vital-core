import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ApiError, handleApiError, isApiError } from './ApiError'

export type AuthenticatedHandler = (
  request: NextRequest,
  session: Awaited<ReturnType<typeof getServerSession>>,
  context?: Record<string, unknown>
) => Promise<NextResponse>

export type HandlerWithParams<T extends Record<string, string>> = (
  request: NextRequest,
  params: T,
  session: Awaited<ReturnType<typeof getServerSession>>
) => Promise<NextResponse>

// Wrapper for API routes requiring authentication
export function withAuth<T extends Record<string, string> = {}>(
  handler: HandlerWithParams<T>
) {
  return async (request: NextRequest, { params }: { params: T }): Promise<NextResponse> => {
    try {
      const session = await getServerSession(authOptions)
      
      if (!session) {
        return NextResponse.json(
          ApiError.unauthorized().toJSON(),
          { status: 401 }
        )
      }

      return await handler(request, params, session)
    } catch (error) {
      const apiError = handleApiError(error)
      
      if (apiError.status >= 500) {
        console.error('[API Error]', {
          path: request.url,
          method: request.method,
          error: apiError.message,
          code: apiError.code,
          details: apiError.details,
        })
      }

      return NextResponse.json(apiError.toJSON(), { status: apiError.status })
    }
  }
}

// Wrapper for public API routes (no auth required)
export function withErrorHandling(handler: (request: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(request)
    } catch (error) {
      const apiError = handleApiError(error)
      
      if (apiError.status >= 500) {
        console.error('[API Error]', {
          path: request.url,
          method: request.method,
          error: apiError.message,
          code: apiError.code,
        })
      }

      return NextResponse.json(apiError.toJSON(), { status: apiError.status })
    }
  }
}

// Role-based access control
export function requireRole(
  session: Awaited<ReturnType<typeof getServerSession>>,
  allowedRoles: string[]
): void {
  if (!session?.user?.role) {
    throw ApiError.unauthorized()
  }
  
  if (!allowedRoles.includes(session.user.role)) {
    throw ApiError.forbidden('Requires one of: ' + allowedRoles.join(', '))
  }
}

// Rate limiting helper (in-memory, for single instance)
// For production, use Redis-based rate limiting
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(
  identifier: string,
  maxRequests = 100,
  windowMs = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const record = rateLimitMap.get(identifier)
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }
  
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt }
  }
  
  record.count++
  return { allowed: true, remaining: maxRequests - record.count, resetAt: record.resetAt }
}

export function createRateLimitMiddleware(
  maxRequests: number,
  windowMs: number,
  keyGenerator: (request: NextRequest) => string = (req) => req.ip || 'anonymous'
) {
  return (request: NextRequest): NextResponse | null => {
    const key = keyGenerator(request)
    const { allowed, remaining, resetAt } = rateLimit(key, maxRequests, windowMs)
    
    if (!allowed) {
      return NextResponse.json(
        ApiError.tooManyRequests('Rate limit exceeded').toJSON(),
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil((resetAt - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(resetAt / 1000).toString(),
          }
        }
      )
    }
    
    return null
  }
}
