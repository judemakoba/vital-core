import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isInsuranceEnabled } from "@/lib/insurance/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/insurance/enabled
 * Returns whether the insurance feature is enabled for this clinic.
 * Used by client components to conditionally render insurance-
 * related UI (patient creation, edit, profile, visit creation
 * form, etc.). Authenticated users only.
 */
export async function GET() {
    const session = await getServerSession(authOptions) as any;
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const enabled = await isInsuranceEnabled();
    return NextResponse.json({ enabled });
}
