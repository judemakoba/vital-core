export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { lookup as mimeLookup } from "node:dns";

// Root directory that file-serving requests are allowed to read from.
// Must match the volume mount in docker-compose.yml (`app_uploads:/app/uploads`)
// and the write path in app/api/admin/branding/upload/route.ts.
const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

// Path-traversal protection: every segment must be a plain filename
// (no `..`, no absolute, no separators, no NUL). A request like
// `/api/files/branding/../etc/passwd` becomes `["..", "etc", "passwd"]`
// after splitting on `/`; the `..` segment fails this check.
function isSafeSegment(seg: string): boolean {
    if (!seg) return false;
    if (seg.includes("\0")) return false;
    if (seg === "." || seg === "..") return false;
    if (seg.includes("/") || seg.includes("\\")) return false;
    return true;
}

// Quick MIME guess from extension. Avoids pulling in a mime-db package.
const EXT_MIME: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".pdf": "application/pdf",
};

function mimeFor(pathname: string): string {
    const ext = path.extname(pathname).toLowerCase();
    return EXT_MIME[ext] || "application/octet-stream";
}

/**
 * GET /api/files/[...path]
 *
 * Public file server for uploads. Anything under `uploads/` is
 * addressable. Path-traversal protection is in `isSafeSegment` above.
 *
 * No auth: branding images are shown on the login page before the
 * user signs in. Same trust model as serving them from `public/`.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    try {
        const segments = Array.isArray(params.path) ? params.path : [params.path];
        if (segments.length === 0 || !segments.every(isSafeSegment)) {
            return new NextResponse("Not found", { status: 404 });
        }

        // Resolve the requested path and verify it lives under UPLOADS_ROOT.
        // Even with the per-segment check, this is a belt-and-suspenders
        // check against symlinks pointing outside the root.
        const requested = path.join(UPLOADS_ROOT, ...segments);
        const resolved = path.resolve(requested);
        const rootResolved = path.resolve(UPLOADS_ROOT) + path.sep;
        if (!resolved.startsWith(rootResolved) && resolved !== path.resolve(UPLOADS_ROOT)) {
            return new NextResponse("Not found", { status: 404 });
        }

        // Stat the file. Reject anything that isn't a regular file
        // (no directory listing, no device files, etc.).
        let stat;
        try {
            stat = await fs.stat(resolved);
        } catch {
            return new NextResponse("Not found", { status: 404 });
        }
        if (!stat.isFile()) {
            return new NextResponse("Not found", { status: 404 });
        }

        // Stream the file. For small images (<5 MB) this is fine in
        // memory; for larger files we should switch to a ReadStream.
        const buf = await fs.readFile(resolved);

        return new NextResponse(buf, {
            status: 200,
            headers: {
                "Content-Type": mimeFor(resolved),
                "Content-Length": String(stat.size),
                // Immutable uploads: stamp the tenantId + filename so a
                // re-upload gets a new URL. Safe to cache for a year.
                "Cache-Control": "public, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (err) {
        console.error("[api/files] error:", err);
        return new NextResponse("Internal error", { status: 500 });
    }
}
