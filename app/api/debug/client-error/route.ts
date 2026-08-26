import { NextResponse } from "next/server";

/**
 * Client-error beacon. The dashboard error boundary POSTs here when it
 * catches an unhandled error, so the message shows up in
 * `docker logs vitalcore-app` instead of being trapped in the browser
 * console where the developer never sees it.
 *
 * This is dev-only debugging infra. In production you'd want this
 * gated behind an env flag and/or pointed at Sentry. For now it's
 * open and best-effort.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { message, stack, digest, url, source } = body ?? {};
        // Use console.error so it shows up in `docker logs`.
        // eslint-disable-next-line no-console
        console.error("[client-error-beacon]", {
            url,
            source,
            message,
            digest,
            stack: typeof stack === "string" ? stack.split("\n").slice(0, 8).join("\n") : null,
        });
        return NextResponse.json({ ok: true });
    } catch (e) {
        // Never let the beacon itself crash the app.
        return NextResponse.json({ ok: false }, { status: 200 });
    }
}
