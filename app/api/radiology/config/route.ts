import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isNextcloudConfigured } from '@/lib/nextcloud';

export const dynamic = 'force-dynamic';

/**
 * GET /api/radiology/config
 * Reports whether Nextcloud is configured. Used by the UI to enable/disable
 * the upload button and show a helpful warning.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        return NextResponse.json({
            configured: isNextcloudConfigured(),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
