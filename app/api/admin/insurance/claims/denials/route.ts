/**
 * Legacy /api/admin/insurance/claims/denials endpoint.
 * Now redirects to /api/admin/insurance/claims/denials/analytics.
 * Kept for backward compatibility with any old UI references.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // The new analytics endpoint supersedes this one.
    // Forward with the same query params so old callers still work.
    const url = new URL(req.url);
    const target = new URL('/api/admin/insurance/claims/denials/analytics', url.origin);
    url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
    return NextResponse.redirect(target, 307);
}

export async function POST() {
    return NextResponse.json(
        { error: 'This endpoint has been retired. Use /api/admin/insurance/claims/[id] PATCH with action=reject' },
        { status: 410 }
    );
}
