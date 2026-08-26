export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit, AUDIT_ACTION, ENTITY } from "@/lib/audit";

/**
 * PATCH /api/admin/users/[id]
 *
 * Update an existing user's profile. Whitelists editable fields so
 * callers can't reach in and overwrite internal columns (hashedPassword,
 * emailVerified, tenantId, etc.).
 *
 * Editable:
 *   name, email, employeeId, phone, department, specialization, roleId
 *
 * Not editable here (separate flows):
 *   - hashedPassword  -> dedicated "change password" flow
 *   - isActive        -> vestigial since hard-delete replaced soft-delete
 *   - emailVerified   -> managed by auth callbacks
 *   - tenantId        -> set at creation, not user-editable
 *
 * Guards:
 *   - Caller must be SUPER_ADMIN or ADMIN.
 *   - Cannot change own roleId away from SUPER_ADMIN if you'd be the
 *     last SUPER_ADMIN (would lock the tenant out of admin).
 *   - Cannot demote another SUPER_ADMIN to a non-SUPER_ADMIN role if
 *     they would become the last SUPER_ADMIN after.
 *   - Email/employeeId must remain unique if changed.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const callerRole = (session.user as any).role;
        if (callerRole !== "SUPER_ADMIN" && callerRole !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const targetId = params.id;
        const body = await req.json().catch(() => ({}));

        const target = await prisma.user.findUnique({
            where: { id: targetId },
            include: { role: true },
        });
        if (!target) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Whitelist of editable fields. Anything else in `body` is
        // ignored silently — better than throwing for forward-compat.
        const allowed: (keyof typeof body)[] = [
            "name", "email", "employeeId", "phone",
            "department", "specialization", "roleId",
        ];
        const data: Record<string, unknown> = {};
        for (const k of allowed) {
            if (k in body) {
                // Normalize empty strings to null for optional fields
                const v = body[k];
                data[k] = typeof v === "string" && v.trim() === "" ? null : v;
            }
        }

        // Light validation
        if ("email" in data && data.email !== null) {
            if (typeof data.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
                return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
            }
        }
        if ("name" in data && (data.name === null || (typeof data.name === "string" && data.name.trim() === ""))) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        // Uniqueness checks (only if the value is changing)
        if (typeof data.email === "string" && data.email !== target.email) {
            const dup = await prisma.user.findUnique({ where: { email: data.email } });
            if (dup) return NextResponse.json({ error: "Email already in use" }, { status: 400 });
        }
        if (typeof data.employeeId === "string" && data.employeeId !== target.employeeId) {
            const dup = await prisma.user.findUnique({ where: { employeeId: data.employeeId } });
            if (dup) return NextResponse.json({ error: "Employee ID already in use" }, { status: 400 });
        }

        // Role-change guard: if the roleId is changing, resolve both
        // sides and check the last-SUPER_ADMIN rule.
        if ("roleId" in data && data.roleId !== target.roleId) {
            const newRole = await prisma.role.findUnique({ where: { id: data.roleId as string } });
            if (!newRole) {
                return NextResponse.json({ error: "Role not found" }, { status: 400 });
            }

            const isCurrentlySuperAdmin = target.role?.name === "SUPER_ADMIN";
            const willBeSuperAdmin = newRole.name === "SUPER_ADMIN";

            // If the change would demote a SUPER_ADMIN, ensure others remain.
            if (isCurrentlySuperAdmin && !willBeSuperAdmin) {
                const remaining = await prisma.user.count({
                    where: {
                        id: { not: targetId },
                        role: { name: "SUPER_ADMIN" },
                    },
                });
                if (remaining === 0) {
                    return NextResponse.json(
                        { error: "Cannot demote the last SUPER_ADMIN." },
                        { status: 400 }
                    );
                }
            }

            // If the change is a self-demotion (caller editing own row),
            // apply the same last-admin guard.
            if (targetId === session.user.id && isCurrentlySuperAdmin && !willBeSuperAdmin) {
                return NextResponse.json(
                    { error: "You cannot demote yourself from SUPER_ADMIN." },
                    { status: 400 }
                );
            }
        }

        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
        }

        const before = {
            name: target.name, email: target.email, employeeId: target.employeeId,
            phone: target.phone, department: target.department, specialization: target.specialization,
            roleId: target.roleId,
        };

        const updated = await prisma.user.update({
            where: { id: targetId },
            data,
            include: { role: true },
        });

        // Audit: ROLE_CHANGE if roleId changed, USER_UPDATE otherwise.
        const roleChanged = "roleId" in data && data.roleId !== target.roleId;
        const { hashedPassword: _, ...safe } = updated;
        void recordAudit({
            userId: session.user.id,
            action: roleChanged ? AUDIT_ACTION.ROLE_CHANGE : AUDIT_ACTION.USER_UPDATE,
            entityType: ENTITY.USER,
            entityId: targetId,
            changes: {
                before: roleChanged ? { roleId: before.roleId } : before,
                after: roleChanged ? { roleId: updated.roleId } : data,
                targetEmail: target.email,
            },
        });

        return NextResponse.json(safe);
    } catch (error: any) {
        console.error("Update user error:", error);
        return NextResponse.json(
            { error: "Failed to update user", details: error.message },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/admin/users/[id]
 *
 * Tombstone delete: hard-delete the User row, but preserve the full
 * identity (name, email, employeeId, role, …) in an audit-log row
 * and NULL out every FK that points to the user. Net effect:
 *
 *   - The User row is gone.
 *   - All historical records (visits, prescriptions, lab orders,
 *     payments, admissions, dispensing logs, journal entries, …)
 *     stay in their tables, with the user FK cleared.
 *   - The audit log carries a USER_DELETE entry with the snapshot
 *     so the system retains a forensic "who was this person and
 *     when were they removed" answer.
 *
 * Why not a soft delete (isActive=false)?
 *   For staff who leave, a soft-deleted row still holds PII (name,
 *   email, phone) and keeps the FK live in operational tables. A
 *   tombstone delete scrubs the PII from the operational surface
 *   while keeping an audit record of who did what, attributed by
 *   name in the audit log.
 *
 * Why raw SQL for the FK nulls?
 *   The User model has 30+ relations. Many FK fields are typed
 *   `String` (required) in the Prisma schema, which means Prisma's
 *   typed updateMany cannot set them to null. We use $executeRaw
 *   inside the same transaction so the whole thing is atomic.
 *   A follow-up migration that flips all User FKs to `String?`
 *   with onDelete: SetNull would let us drop the raw SQL.
 *
 * Guards (same as the previous soft-delete):
 *   - Caller must be SUPER_ADMIN or ADMIN.
 *   - Caller cannot delete their own account.
 *   - Cannot delete the last active SUPER_ADMIN.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const callerRole = (session.user as any).role;
        if (callerRole !== "SUPER_ADMIN" && callerRole !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const targetId = params.id;

        // Self-protection.
        if (targetId === session.user.id) {
            return NextResponse.json(
                { error: "You cannot delete your own account." },
                { status: 400 }
            );
        }

        const target = await prisma.user.findUnique({
            where: { id: targetId },
            include: { role: true, tenant: { select: { id: true, name: true } } },
        });
        if (!target) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Last-SUPER_ADMIN guard: if the target is a SUPER_ADMIN, make
        // sure at least one other SUPER_ADMIN (active or not — the
        // tombstone will still be the original record) would remain.
        // We count ALL remaining SUPER_ADMINs, not just active, so
        // a tenant can't be locked out by deleting a SUPER_ADMIN
        // when no other SUPER_ADMINs exist.
        if (target.role?.name === "SUPER_ADMIN") {
            const remaining = await prisma.user.count({
                where: {
                    id: { not: targetId },
                    role: { name: "SUPER_ADMIN" },
                },
            });
            if (remaining === 0) {
                return NextResponse.json(
                    { error: "Cannot delete the last SUPER_ADMIN." },
                    { status: 400 }
                );
            }
        }

        // Capture the full snapshot for the tombstone. This is the
        // "print" of the user that survives in the audit log after
        // the row is gone.
        const tombstone = {
            id:         target.id,
            name:       target.name,
            email:      target.email,
            employeeId: target.employeeId,
            phone:      target.phone,
            department: target.department,
            specialization: target.specialization,
            roleId:     target.roleId,
            roleName:   target.role?.name,
            tenantId:   target.tenantId,
            tenantName: target.tenant?.name,
            isActive:   target.isActive,
            createdAt:  target.createdAt,
            updatedAt:  target.updatedAt,
        };

        // Every relation on the User model with its FK column on the
        // inverse side. Adding a new User relation? Add it here too.
        // Optional relations: nulling is belt-and-suspenders. Prisma's
        // default ON DELETE is NO ACTION, so without the explicit NULL
        // the FK constraint will reject the user delete. Once the
        // schema is migrated to onDelete: SetNull for these, the
        // explicit nulls become no-ops.
        const userRelations: { table: string; column: string }[] = [
            // NextAuth — these must be DELETED, not nulled. They have
            // their own FK behaviour and we don't want to keep auth
            // rows for a deleted user.
            // (handled separately below)
            // Operational / clinical
            { table: "Admission",            column: "admittingDoctorId" },
            { table: "Admission",            column: "cancelledById" },
            { table: "IpdRequest",           column: "requestedById" },
            { table: "IpdRequest",           column: "reviewedById" },
            { table: "Appointment",          column: "doctorId" },
            { table: "Prescription",         column: "doctorId" },
            { table: "LabOrder",             column: "doctorId" },
            { table: "RadiologyOrder",       column: "doctorId" },
            { table: "DispensingLog",        column: "dispensedById" },
            // Billing / finance
            { table: "Invoice",              column: "issuedById" },
            { table: "Payment",              column: "receivedById" },
            { table: "Expense",              column: "recordedById" },
            { table: "Budget",               column: "createdById" },
            { table: "JournalEntry",         column: "createdById" },
            { table: "JournalEntry",         column: "approvedById" },
            { table: "TaxInvoice",           column: "createdById" },
            { table: "FiscalYear",           column: "closedById" },
            { table: "AccountingPeriod",     column: "closedById" },
            // Inventory / pharmacy
            { table: "PurchaseOrder",        column: "requestedById" },
            { table: "PurchaseOrder",        column: "approvedById" },
            { table: "GoodsReceipt",         column: "receivedById" },
            { table: "StockAdjustment",      column: "requestedById" },
            { table: "StockAdjustment",      column: "approvedById" },
            { table: "StockMovement",        column: "performedById" },
            { table: "StockTake",            column: "countedById" },
            { table: "StockTake",            column: "verifiedById" },
            { table: "DrugPriceAudit",       column: "changedById" },
            { table: "DrugImage",            column: "uploadedById" },
            // Inpatient / admissions
            { table: "InpatientCharge",      column: "createdById" },
            { table: "InpatientCharge",      column: "nurseId" },
            { table: "InpatientDeposit",     column: "receivedById" },
            { table: "DailyChargeSummary",   column: "finalizedById" },
            { table: "DepositApplication",   column: "appliedById" },
            { table: "FloorStockUsage",      column: "usedById" },
            // Visits
            { table: "Visit",                column: "assignedDoctorId" },
            { table: "Visit",                column: "accountsClearedById" },
            { table: "Visit",                column: "discontinuationById" },
            // Lab / radiology templates
            { table: "LabResultTemplate",    column: "createdById" },
            { table: "LabResultTemplate",    column: "updatedById" },
            { table: "RadiologyResultTemplate", column: "createdById" },
            { table: "RadiologyResultTemplate", column: "updatedById" },
        ];

        // Run the cascade + delete in a single transaction so a
        // failure mid-way rolls everything back and the user stays
        // intact. Audit log writes happen OUTSIDE the transaction
        // (fire-and-forget after the delete commits) so a failed
        // audit doesn't roll back a real delete.
        await prisma.$transaction(async (tx) => {
            // 1) Null every User FK in one batch. We don't need to
            //    wait for each statement — Postgres runs them in
            //    sequence inside the transaction. Using $executeRaw
            //    bypasses Prisma's type system, which is what we
            //    need for the `String` (required) columns.
            for (const rel of userRelations) {
                // Table and column names are static, so direct
                // interpolation is safe — no user input. We use
                // double quotes so the PascalCase identifiers match
                // the Prisma-generated Postgres schema.
                await tx.$executeRawUnsafe(
                    `UPDATE "${rel.table}" SET "${rel.column}" = NULL WHERE "${rel.column}" = $1`,
                    targetId
                );
            }

            // 2) Drop NextAuth Account + Session rows for this user.
            //    These have hard FKs (required userId) and must be
            //    deleted, not nulled. Prisma's typed deleteMany works
            //    here because Account.userId is a regular String FK.
            await tx.account.deleteMany({ where: { userId: targetId } });
            await tx.session.deleteMany({ where: { userId: targetId } });

            // 3) Finally, delete the user. By this point every FK
            //    that referenced them is null, and the auth rows are
            //    gone, so the delete should succeed cleanly.
            await tx.user.delete({ where: { id: targetId } });
        });

        // Audit the tombstone AFTER the delete commits. The entityId
        // is the deleted user's id, which is the join key for any
        // later "what happened to user X" query. The snapshot lives
        // in `changes` so the name/email/role stay discoverable.
        void recordAudit({
            userId: session.user.id,
            action: AUDIT_ACTION.USER_DELETE,
            entityType: ENTITY.USER,
            entityId: targetId,
            changes: {
                reason: "user_hard_deleted",
                tombstone,
            },
        });

        return NextResponse.json({
            success: true,
            id: targetId,
            tombstonedAs: { name: target.name, email: target.email, role: target.role?.name },
        });
    } catch (error: any) {
        console.error("Delete user error:", error);
        return NextResponse.json(
            { error: "Failed to delete user", details: error.message },
            { status: 500 }
        );
    }
}
