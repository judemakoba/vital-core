export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultTenantId } from "@/lib/settings/store";

// Where uploads land. Files served by Next from /public/*.
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "branding");
const PUBLIC_PREFIX = "/uploads/branding";

// Allowed file types — keep tight to limit attack surface.
const ALLOWED_MIME = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/svg+xml",
    "image/webp",
    "image/x-icon",
    "image/vnd.microsoft.icon",
]);
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// MIME → extension fallback for when the OS doesn't infer it.
const MIME_TO_EXT: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
};

function safeExt(name: string, mime: string): string {
    const fromName = path.extname(name).toLowerCase();
    if (ALLOWED_EXT.has(fromName)) return fromName;
    return MIME_TO_EXT[mime] || ".png";
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const user = (session as any)?.user;
        if (!session || (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const form = await request.formData();
        const file = form.get("file");
        const field = String(form.get("field") || "logoUrl");
        if (!(file instanceof File)) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }
        if (!["logoUrl", "faviconUrl"].includes(field)) {
            return NextResponse.json({ error: `Invalid field: ${field}` }, { status: 400 });
        }
        if (file.size === 0) {
            return NextResponse.json({ error: "Empty file" }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 400 });
        }
        if (!ALLOWED_MIME.has(file.type)) {
            return NextResponse.json({ error: `Unsupported MIME type: ${file.type}` }, { status: 400 });
        }

        const ext = safeExt(file.name, file.type);
        const tenantId = await getDefaultTenantId();

        // Use a stable prefix so the same tenant's files can be identified and
        // a re-upload replaces the old one cleanly.
        const stamp = Date.now();
        const filename = `${tenantId.slice(-6)}_${field}_${stamp}${ext}`;
        const filepath = path.join(UPLOAD_DIR, filename);

        // Ensure dir exists (defensive — script creates it on first run too)
        await fs.mkdir(UPLOAD_DIR, { recursive: true });

        // Write to disk
        const buf = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(filepath, buf);

        const url = `${PUBLIC_PREFIX}/${filename}`;

        // Persist to Tenant row
        const update = field === "logoUrl"
            ? { logoUrl: url }
            : { faviconUrl: url };

        // If we're replacing an existing uploaded file, attempt to delete the
        // old one (best-effort — don't fail the upload if the unlink errors).
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { logoUrl: true, faviconUrl: true } });
        await prisma.tenant.update({ where: { id: tenantId }, data: update });

        const oldUrl = field === "logoUrl" ? tenant?.logoUrl : tenant?.faviconUrl;
        if (oldUrl && oldUrl.startsWith(PUBLIC_PREFIX) && oldUrl !== url) {
            try {
                const oldPath = path.join(process.cwd(), "public", oldUrl.replace(/^\//, ""));
                await fs.unlink(oldPath);
            } catch { /* ignore — file might already be gone */ }
        }

        return NextResponse.json({ url, size: file.size, type: file.type });
    } catch (error: any) {
        console.error("Branding upload failed:", error);
        return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
    }
}
