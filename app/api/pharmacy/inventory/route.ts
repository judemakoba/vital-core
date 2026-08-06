export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";

        // Pull tenant-configured stock thresholds (with 60s in-process cache)
        const { resolveReorderLevel } = await import("@/lib/pharmacy/helpers");

        const drugs = await prisma.drug.findMany({
            where: search ? {
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { genericName: { contains: search, mode: "insensitive" } },
                ]
            } : {},
            include: {
                floorStocks: true,
                category: true
            },
            orderBy: { name: "asc" }
        });

        // Map to inventory format expected by the frontend
        const inventory = await Promise.all(drugs.map(async d => {
            const quantityInStock = d.floorStocks.reduce((sum, fs) => sum + fs.quantityOnHand, 0);
            const reorderLevel = await resolveReorderLevel(d.floorStocks[0]?.reorderLevel);
            return {
                id: d.id,
                name: d.name,
                genericName: d.genericName,
                category: d.category?.name || "Unknown",
                dosageForm: d.dosageForm,
                strength: d.strength,
                unitMeasure: d.packageUnit,
                quantityInStock,
                reorderLevel,
                pricePerUnit: 0, // Fallback as price is in DrugPrice
            };
        }));

        return NextResponse.json(inventory);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    // Creating drugs correctly requires detailed categorisation, schedule classification, etc. 
    // It's currently unimplemented since DrugInventory was a dummy model.
    return NextResponse.json({ error: "Not Implemented. Creating drugs requires full categorization." }, { status: 501 });
}
