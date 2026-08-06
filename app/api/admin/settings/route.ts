export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllSettings, setSettings, getSetting } from "@/lib/settings/store";
import { SETTINGS_REGISTRY } from "@/lib/settings/registry";

/**
 * GET /api/admin/settings
 * Returns all settings (with sensitive values masked), registry metadata,
 * and the tenant row.
 *
 * Query: ?all=true includes sensitive values (for admin UI re-edit).
 */
export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const includeSensitive = searchParams.get("all") === "true" || searchParams.get("raw") === "true";
        const { tenant, settings, byCategory } = await getAllSettings({ includeSensitive });
        return NextResponse.json({ tenant, settings, byCategory, registry: SETTINGS_REGISTRY });
    } catch (error) {
        console.error("Settings GET error:", error);
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

/**
 * POST /api/admin/settings
 * Body: { settings: { "key": "value", ... } }
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== "ADMIN" && (session.user as any).role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const writes: { key: string; value: string }[] = [];

        // Accept both {settings: {...}} and {key: value} flat shape for back-compat
        const map: Record<string, any> = body.settings ?? body;
        for (const [k, v] of Object.entries(map)) {
            if (v == null) continue;
            writes.push({ key: k, value: String(v) });
        }

        const result = await setSettings(writes);
        if (result.errors.length > 0) {
            return NextResponse.json({ error: result.errors.join("; ") }, { status: 400 });
        }
        return NextResponse.json({ success: true, updated: result.updated });
    } catch (error) {
        console.error("Settings POST error:", error);
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}
