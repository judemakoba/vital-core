import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // Adjust this import path if needed based on the actual auth structure
import bcrypt from "bcrypt";
import { recordAudit, AUDIT_ACTION, ENTITY } from "@/lib/audit";

// Optional: Extract checkAdmin into a utility if it's used across many admin routes
async function checkAdmin() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return false;
    
    // Check if the user is SUPER_ADMIN or ADMIN (modify based on actual role names)
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { role: true }
    });
    return user?.role?.name === 'SUPER_ADMIN' || user?.role?.name === 'ADMIN';
}

export async function GET(req: Request) {
    // try {
    //     if (!(await checkAdmin())) {
    //         return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    //     }

        const users = await prisma.user.findMany({
            include: {
                role: true
            },
            orderBy: {
                name: 'asc'
            }
        });

        // Strip passwords before sending
        const safeUsers = users.map(({ hashedPassword, ...user }) => user);
        
        return NextResponse.json(safeUsers, { status: 200 });
    // } catch (error: any) {
    //     console.error("Fetch Users Error:", error);
    //     return NextResponse.json({ error: "Failed to fetch users", details: error.message }, { status: 500 });
    // }
}

export async function POST(req: Request) {
    try {
        // if (!(await checkAdmin())) {
        //     return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        // }
        const session = await getServerSession(authOptions);

        const body = await req.json();
        const { name, email, employeeId, phone, department, specialization, roleId, password } = body;

        // Basic validation
        if (!name || !email || !roleId) {
            return NextResponse.json({ error: "Name, email, and role are required" }, { status: 400 });
        }

        // Check duplicates
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) return NextResponse.json({ error: "Email already in use" }, { status: 400 });
        
        if (employeeId) {
            const existingEmployee = await prisma.user.findUnique({ where: { employeeId } });
            if (existingEmployee) return NextResponse.json({ error: "Employee ID already in use" }, { status: 400 });
        }

        // Validate password against the tenant-configured policy before hashing
        const { validatePassword } = await import("@/lib/security/tenant-helpers");
        const rawPassword = password || "VitalCore@123";
        try {
            await validatePassword(rawPassword);
        } catch (e: any) {
            return NextResponse.json({ error: e.message || "Password too weak" }, { status: 400 });
        }
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                employeeId,
                phone,
                department,
                specialization,
                roleId,
                hashedPassword,
                isActive: true
            },
            include: { role: true }
        });

        const { hashedPassword: _, ...safeUser } = newUser;

        // Audit — fire-and-forget. Log the user creation. Note: the
        // session.user.id is the admin who created this account.
        void recordAudit({
            userId: session?.user?.id ?? newUser.id,
            action: AUDIT_ACTION.USER_CREATE,
            entityType: ENTITY.USER,
            entityId: newUser.id,
            changes: {
                after: {
                    email: newUser.email,
                    name: newUser.name,
                    roleId: newUser.roleId,
                    employeeId: newUser.employeeId,
                    isActive: newUser.isActive,
                },
            },
        });

        return NextResponse.json(safeUser, { status: 201 });

    } catch (error: any) {
        console.error("Create User Error:", error);
        return NextResponse.json({ error: "Failed to create user", details: error.message }, { status: 500 });
    }
}
