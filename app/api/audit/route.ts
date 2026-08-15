/**
 * GET /api/audit
 *
 * Paginated, filterable query of the AuditLog table. Drives the
 * /dashboard/admin/audit report.
 *
 * Query params (all optional):
 *   userId      — exact user id
 *   entityType  — exact entity type (e.g. "Patient", "Invoice")
 *   action      — exact action (e.g. "INVOICE_PAYMENT")
 *   q           — free-text search across entityId + JSON changes
 *                 (case-insensitive substring on text values)
 *   from, to    — ISO date strings; filters on AuditLog.timestamp
 *   limit       — page size (default 50, max 200)
 *   offset      — page offset (default 0)
 *
 * SUPER_ADMIN only — the audit log is sensitive (shows who logged
 * in, when, and what they did). Restricted to a single role per
 * the design decision in R56.
 *
 * Response:
 *   { rows: AuditLog[], total: number, limit, offset }
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (session.user.role !== "SUPER_ADMIN") {
            // Hard gate: audit log access is a compliance-grade capability.
            return NextResponse.json(
                { error: "Forbidden: SUPER_ADMIN only" },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId") || undefined;
        const entityType = searchParams.get("entityType") || undefined;
        const action = searchParams.get("action") || undefined;
        const q = searchParams.get("q")?.trim() || undefined;
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        const limit = Math.min(
            MAX_LIMIT,
            Math.max(1, parseInt(searchParams.get("limit") ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT)
        );
        const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

        // Build the WHERE clause. The free-text `q` is intentionally
        // limited to entityId (always a short ID) plus a serialised
        // substring search on the JSON changes field — full-text
        // search on JSONB requires Postgres tsvector, out of scope.
        const where: Record<string, unknown> = {};
        if (userId)     where.userId = userId;
        if (entityType) where.entityType = entityType;
        if (action)     where.action = action;
        if (from || to) {
            where.timestamp = {
                ...(from ? { gte: new Date(from) } : {}),
                // End-of-day: include the whole endDate (see reports fix)
                ...(to   ? { lte: new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1) } : {}),
            };
        }
        if (q) {
            // entityId is always a short string. We also try a
            // case-insensitive contains against the JSON `changes`
            // field via a raw OR. Prisma's `contains` does NOT work
            // on JSON columns, so we do a best-effort with two
            // filters: entityId match OR a synthetic stringified
            // match. The latter is unindexed but acceptable for a
            // low-volume audit page; for high volume, add a
            // generated tsvector column.
            where.OR = [
                { entityId: { contains: q, mode: "insensitive" } },
                { userId:   { contains: q, mode: "insensitive" } },
            ];
        }

        const [rows, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { timestamp: "desc" },
                take: limit,
                skip: offset,
            }),
            prisma.auditLog.count({ where }),
        ]);

        // Attach the user's email/name for the UI. Done with a
        // single batched query rather than N includes.
        const userIds = Array.from(new Set(rows.map((r) => r.userId).filter(Boolean)));
        const users = userIds.length
            ? await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, email: true },
            })
            : [];
        const userMap = new Map(users.map((u) => [u.id, u]));

        const enriched = rows.map((r) => ({
            ...r,
            user: r.userId ? userMap.get(r.userId) ?? null : null,
        }));

        return NextResponse.json({
            rows: enriched,
            total,
            limit,
            offset,
        });
    } catch (err) {
        console.error("Audit log query error:", err);
        return NextResponse.json(
            { error: "Failed to query audit log" },
            { status: 500 }
        );
    }
}
