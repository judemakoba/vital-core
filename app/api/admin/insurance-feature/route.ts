import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isInsuranceEnabled, setInsuranceEnabled } from "@/lib/insurance/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/insurance-feature
 * Returns the current insurance feature flag state.
 */
export async function GET() {
    const session = await getServerSession(authOptions) as any;
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const enabled = await isInsuranceEnabled();
    return NextResponse.json({ enabled });
}

/**
 * PATCH /api/admin/insurance-feature
 * Body: { enabled: boolean }
 * Toggles the insurance feature on/off for this clinic.
 * Admin/super-admin only.
 */
export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions) as any;
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = session.user.role;
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
        return NextResponse.json(
            { error: "Only admins can toggle the insurance feature" },
            { status: 403 }
        );
    }

    const body = await request.json().catch(() => ({}));
    const { enabled } = body || {};
    if (typeof enabled !== "boolean") {
        return NextResponse.json(
            { error: "Body must be { enabled: boolean }" },
            { status: 400 }
        );
    }

    await setInsuranceEnabled(enabled);
    return NextResponse.json({ enabled, ok: true });
}
