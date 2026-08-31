import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/finance/accounts/[id]
// Update a chart-of-accounts entry. Currently supports openingBalance and isActive,
// which are the two editable fields exposed in the UI modal. Other fields are
// intentionally not editable here — adding/changing account codes or types should
// be done through a deliberate data migration, not a stray UI click.
//
// Idempotency: a PATCH with no changes is a no-op (returns the unchanged record).
export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const body = await request.json();
        const { openingBalance, isActive } = body;

        // Build the update payload from only the fields the caller sent.
        // This lets the UI PATCH just one field at a time without overwriting the other.
        const data: any = {};
        if (openingBalance !== undefined) {
            if (typeof openingBalance !== "number" || !Number.isFinite(openingBalance)) {
                return NextResponse.json({ error: "openingBalance must be a finite number" }, { status: 400 });
            }
            data.openingBalance = openingBalance;
        }
        if (isActive !== undefined) {
            if (typeof isActive !== "boolean") {
                return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
            }
            data.isActive = isActive;
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
        }

        const account = await prisma.chartOfAccount.update({
            where: { id: params.id },
            data,
        });

        return NextResponse.json(account);
    } catch (error: any) {
        console.error("Update account error:", error);
        if (error?.code === "P2025") {
            return NextResponse.json({ error: "Account not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
    }
}
