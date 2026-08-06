import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Simple in-memory rate limiter (Edge Runtime compatible)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function simpleRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const record = rateLimitMap.get(key)
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1 }
  }
  
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 }
  }
  
  record.count++
  return { allowed: true, remaining: maxRequests - record.count }
}

export default withAuth(
  function middleware(req) {
    // Rate limit auth endpoints (stricter)
    if (req.nextUrl.pathname.startsWith('/api/auth/')) {
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
      const result = simpleRateLimit('auth:' + ip, 10, 60 * 1000)
      if (!result.allowed) {
        return NextResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
          { status: 429 }
        )
      }
    }

    // Rate limit API routes
    if (req.nextUrl.pathname.startsWith('/api/')) {
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
      const result = simpleRateLimit('api:' + ip, 100, 60 * 1000)
      if (!result.allowed) {
        return NextResponse.json(
          { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
          { status: 429 }
        )
      }
    }

    // Existing auth check for API routes
    if (req.nextUrl.pathname.startsWith('/api') && !req.nextauth.token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Add security headers
    const response = NextResponse.next();
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    return response;
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/((?!auth).*)",
  ],
};
