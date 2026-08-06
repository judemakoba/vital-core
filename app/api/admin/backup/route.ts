export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch all critical data for backup
        const [patients, users, appointments, visits, invoices, drugs] = await Promise.all([
            prisma.patient.findMany(),
            prisma.user.findMany({ select: { id: true, name: true, email: true, role: true } }),
            prisma.appointment.findMany(),
            prisma.visit.findMany(),
            prisma.invoice.findMany({ include: { items: true } }),
            prisma.drug.findMany({ include: { floorStocks: true } })
        ]);

        const backupData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            exportedBy: session.user.name,
            data: {
                patients,
                users,
                appointments,
                visits,
                invoices,
                drugs
            }
        };

        return NextResponse.json(backupData, {
            headers: {
                "Content-Disposition": `attachment; filename="vitalcore_backup_${new Date().toISOString().slice(0, 10)}.json"`
            }
        });
    } catch (error) {
        console.error("Backup failure:", error);
        return NextResponse.json({ error: "Failed to generate backup" }, { status: 500 });
    }
}
