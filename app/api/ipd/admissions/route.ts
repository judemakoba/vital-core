import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * R62: the doctor flow now goes through IpdRequest. This endpoint
 * is reserved for admin / reception who create direct admissions
 * (referrals, planned admissions, or admin-overriding the request
 * workflow for emergencies).
 *
 * Doctors must use POST /api/ipd-requests instead. The role check
 * below returns 403 to a doctor who tries to bypass the workflow.
 */
const DIRECT_ADMIT_ROLES = ["ADMIN", "RECEPTIONIST", "SUPER_ADMIN"];

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status'); // e.g., 'ADMITTED', 'DISCHARGED'

        const admissions = await prisma.admission.findMany({
            where: status ? { status } : undefined,
            include: {
                patient: true,
                ward: { select: { name: true } },
                bed: { select: { bedNumber: true } },
                admittingDoctor: { select: { name: true } }
            },
            orderBy: { admissionDate: 'desc' }
        });

        return NextResponse.json(admissions);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch admissions" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // R62: doctors must use the IpdRequest workflow.
        if (!DIRECT_ADMIT_ROLES.includes(user.role)) {
            return NextResponse.json(
                {
                    error:
                        `Doctors cannot directly create admissions. Submit an IPD request via POST /api/ipd-requests, and admin/reception will fulfil it. (your role: ${user.role})`,
                },
                { status: 403 }
            );
        }

        const { patientId, visitId, wardId, bedId, type, initialDeposit } = await request.json();

        if (!patientId || !type) {
             return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Generate Admission Number
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const count = await prisma.admission.count({
             where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } }
        });
        const sequence = (count + 1).toString().padStart(3, '0');
        const admissionNumber = `IPD-${dateStr}-${sequence}`;

        const result = await prisma.$transaction(async (tx) => {
            // Create Admission
            const admission = await tx.admission.create({
                data: {
                    admissionNumber,
                    patientId,
                    visitId: visitId || undefined,
                    wardId,
                    bedId,
                    type,
                    status: "ADMITTED",
                    admittingDoctorId: session.user.id
                }
            });

            // Update Bed status if a bed was assigned
            if (bedId) {
                await tx.bed.update({
                    where: { id: bedId },
                    data: { status: "OCCUPIED" }
                });
            }

            // Create initial deposit if provided
            if (initialDeposit && parseFloat(initialDeposit) > 0) {
                 const depCount = await tx.inpatientDeposit.count({
                     where: { createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } }
                 });
                 const depSeq = (depCount + 1).toString().padStart(4, '0');
                 
                 await tx.inpatientDeposit.create({
                     data: {
                         depositNumber: `DEP-${dateStr}-${depSeq}`,
                         admissionId: admission.id,
                         depositDate: new Date(),
                         amount: parseFloat(initialDeposit),
                         paymentMethod: "CASH", // Defaulting for simple flow
                         remainingBalance: parseFloat(initialDeposit),
                         receivedById: session.user.id,
                         notes: "Initial Admission Deposit"
                     }
                 });
            }

            return admission;
        });

        return NextResponse.json(result, { status: 201 });

    } catch (error) {
        console.error("Failed to create admission:", error);
        return NextResponse.json({ error: "Failed to create admission" }, { status: 500 });
    }
}
