import { PrismaClient } from '../lib/generated-prisma';
const prisma = new PrismaClient();

async function main() {
    console.log("Starting Bed Status Synchronization...");

    // 1. Reset all beds to AVAILABLE
    console.log("Resetting all beds to AVAILABLE...");
    await prisma.bed.updateMany({
        data: { status: "AVAILABLE" }
    });

    // 2. Find all active admissions
    const activeAdmissions = await prisma.admission.findMany({
        where: { status: "ADMITTED" },
        select: { bedId: true }
    });

    console.log(`Found ${activeAdmissions.length} active admissions.`);

    // 3. Mark beds with active admissions as OCCUPIED
    const occupiedBedIds = activeAdmissions
        .map(a => a.bedId)
        .filter(id => id !== null) as string[];

    if (occupiedBedIds.length > 0) {
        await prisma.bed.updateMany({
            where: { id: { in: occupiedBedIds } },
            data: { status: "OCCUPIED" }
        });
        console.log(`Updated ${occupiedBedIds.length} beds to OCCUPIED.`);
    }

    console.log("Bed Status Synchronization Completed.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
