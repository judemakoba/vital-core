"use client";

import { useEffect, useState } from "react";

/**
 * ─── Root Error Boundary ─────────────────────────────────────────────────
 * Same auto-retry behaviour as app/dashboard/error.tsx but lives one level
 * up so it catches errors from the login / unauthenticated routes too
 * (e.g. /login, /register, /api/auth/* pages).
 *
 * If this fires, the user is probably on the login screen or the root
 * index — keep the UI simple: spinner + "recovering" message, then
 * a manual retry button if 3 attempts fail.
 */

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (attempt >= MAX_AUTO_RETRIES) return;

        const timer = setTimeout(() => {
            setAttempt((a) => a + 1);
            reset();
        }, RETRY_DELAY_MS);

        return () => clearTimeout(timer);
    }, [attempt, reset]);

    if (attempt >= MAX_AUTO_RETRIES) {
        return (
            <div
                style={{
                    maxWidth: 480,
                    margin: "4rem auto",
                    padding: "2rem",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    textAlign: "center",
                    color: "#111827",
                }}
            >
                <h2 style={{ marginBottom: "0.5rem" }}>Something went wrong</h2>
                <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
                    Auto-recovery didn&rsquo;t work. This looks like a real
                    problem, not a temporary hiccup.
                </p>
                {error.message && (
                    <pre
                        style={{
                            textAlign: "left",
                            padding: "0.75rem",
                            background: "rgba(0,0,0,0.05)",
                            borderRadius: "6px",
                            fontSize: "0.8rem",
                            overflow: "auto",
                            marginBottom: "1.5rem",
                        }}
                    >
                        {error.message}
                    </pre>
                )}
                <button
                    type="button"
                    onClick={() => {
                        setAttempt(0);
                        reset();
                    }}
                    style={{
                        padding: "0.6rem 1.5rem",
                        background: "#0ea5e9",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: 600,
                        cursor: "pointer",
                    }}
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div
            style={{
                maxWidth: 480,
                margin: "4rem auto",
                padding: "2rem",
                fontFamily: "system-ui, -apple-system, sans-serif",
                textAlign: "center",
                color: "#111827",
            }}
        >
            <div
                aria-hidden
                style={{
                    width: 32,
                    height: 32,
                    margin: "0 auto 1rem",
                    border: "3px solid rgba(14,165,233,0.2)",
                    borderTopColor: "#0ea5e9",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                }}
            />
            <h2 style={{ marginBottom: "0.5rem" }}>Temporary hiccup</h2>
            <p style={{ color: "#6b7280" }}>
                Auto-recovering… (attempt {attempt + 1} of {MAX_AUTO_RETRIES})
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
