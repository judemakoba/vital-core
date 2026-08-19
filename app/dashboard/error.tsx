"use client";

import { useEffect, useState } from "react";

/**
 * ─── Dashboard Error Boundary ─────────────────────────────────────────────
 * Catches any uncaught error from a /dashboard/** page or layout.
 *
 * Auto-recovery: if the error is likely transient (5xx, cold start,
 * network blip), we re-render the segment after a short delay — no
 * full page reload, no user action needed.
 *
 * After 3 failed attempts, we stop auto-retrying and show a manual
 * "Try again" button so the user isn't stuck in a tight reload loop
 * on a permanent error.
 *
 * reset() in Next.js re-renders the failed segment without a full
 * page reload, so any cached state (e.g. tab selection) is preserved.
 */

const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

export default function DashboardError({
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
                    maxWidth: 540,
                    margin: "4rem auto",
                    padding: "2rem",
                    background: "var(--bg-card, #fff)",
                    border: "1px solid var(--border-color, #e5e7eb)",
                    borderRadius: "var(--radius-lg, 12px)",
                    textAlign: "center",
                    color: "var(--text-primary, #111827)",
                }}
            >
                <h2 style={{ marginBottom: "0.5rem" }}>Something went wrong</h2>
                <p style={{ color: "var(--text-muted, #6b7280)", marginBottom: "1.5rem" }}>
                    We tried to recover automatically a few times but the error
                    keeps coming back. This looks like a real problem, not a
                    temporary hiccup.
                </p>
                {error.message && (
                    <pre
                        style={{
                            textAlign: "left",
                            padding: "0.75rem",
                            background: "rgba(0,0,0,0.04)",
                            borderRadius: "6px",
                            fontSize: "0.8rem",
                            overflow: "auto",
                            marginBottom: "1.5rem",
                            color: "var(--text-secondary, #374151)",
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
                        background: "var(--primary-color, #0ea5e9)",
                        color: "white",
                        border: "none",
                        borderRadius: "var(--radius-md, 6px)",
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
                maxWidth: 540,
                margin: "4rem auto",
                padding: "2rem",
                background: "var(--bg-card, #fff)",
                border: "1px solid var(--border-color, #e5e7eb)",
                borderRadius: "var(--radius-lg, 12px)",
                textAlign: "center",
                color: "var(--text-primary, #111827)",
            }}
        >
            <div
                aria-hidden
                style={{
                    width: 32,
                    height: 32,
                    margin: "0 auto 1rem",
                    border: "3px solid rgba(14,165,233,0.2)",
                    borderTopColor: "var(--primary-color, #0ea5e9)",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                }}
            />
            <h2 style={{ marginBottom: "0.5rem" }}>Temporary hiccup</h2>
            <p style={{ color: "var(--text-muted, #6b7280)" }}>
                Auto-recovering… (attempt {attempt + 1} of {MAX_AUTO_RETRIES})
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
