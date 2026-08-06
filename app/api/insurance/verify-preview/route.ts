import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyInsuranceWithProvider } from "@/lib/insurance/third-party";

/**
 * R48: Insurance verification preview endpoint.
 *
 * The third-party check is run on the create-visit form BEFORE the
 * visit exists. The result is captured in form state and passed to the
 * visit creation API on submit. We do NOT write the
 * InsuranceVerification row here — that's the visit creation API's
 * responsibility (single source of truth, no duplicate rows).
 *
 * The `force` param is NOT exposed here (cashier standard flow only).
 * The third-party mock's AUTO mode is used, which performs a real
 * eligibility check against the enrollment data.
 *
 * Body: { patientId, enrollmentId }
 * Returns: { result: ThirdPartyVerificationResult }
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const { patientId, enrollmentId } = body || {};

        if (!patientId || !enrollmentId) {
            return NextResponse.json(
                { error: "Both `patientId` and `enrollmentId` are required." },
                { status: 400 }
            );
        }

        // Look up the enrollment with insurance details
        const enrollment = await prisma.patientInsurance.findUnique({
            where: { id: enrollmentId },
            include: {
                insurance: { select: { id: true, name: true, isActive: true } },
            },
        });
        if (!enrollment || enrollment.patientId !== patientId) {
            return NextResponse.json(
                { error: `Enrollment ${enrollmentId} not found for patient ${patientId}.` },
                { status: 404 }
            );
        }

        // Run the third-party check (mock for now). Use a placeholder
        // visitId — the mock doesn't need it to be real, only the
        // enrollment does. We pass the enrollment id so the mock
        // synthesizes a sensible verification number.
        const placeholderVisitId = `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const result = await verifyInsuranceWithProvider({
            visitId: placeholderVisitId,
            patientId,
            insuranceId: enrollment.insurance.id,
            enrollmentId: enrollment.id,
            memberNumber: enrollment.memberNumber,
            policyNumber: enrollment.policyNumber,
            force: 'AUTO', // always AUTO here — no admin override on the create-visit form
        });

        return NextResponse.json({ result });
    } catch (error: any) {
        console.error("Verify-preview error:", error);
        return NextResponse.json(
            { error: "Failed to validate insurance", details: error.message || "Unknown error" },
            { status: 500 }
        );
    }
}
