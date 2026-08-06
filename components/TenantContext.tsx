"use client";
/**
 * TenantContext — client-side provider for the active tenant's settings.
 *
 * Single API call to /api/admin/settings (which already includes the Tenant row).
 * Exposes:
 *   - `tenant`        — the Tenant row (name, logo, brand colors, etc.)
 *   - `settings`      — a Record<key, typed value> of all TenantSetting rows
 *   - `refresh()`     — force a re-fetch (call after admin saves new settings)
 *   - `formatMoney(n)` — formats a number as currency using tenant settings
 *   - `formatDate(d)`  — formats a date using tenant date format
 *   - `formatTime(d)`  — formats a time using tenant time format
 *   - `formatDateTime(d)` — both
 *
 * The server already has formatters in `lib/formatters.ts` (used by API
 * routes). This context is the client-side mirror for UI rendering.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";

type Tenant = Record<string, any>;
type Settings = Record<string, any>;

type FormatContext = {
    tenant: Tenant;
    settings: Settings;
    loading: boolean;
    refresh: () => Promise<void>;
    formatMoney: (n: number | null | undefined, opts?: { currency?: string; symbol?: string; position?: "prefix" | "suffix" }) => string;
    formatDate: (d: Date | string | null | undefined) => string;
    formatTime: (d: Date | string | null | undefined) => string;
    formatDateTime: (d: Date | string | null | undefined) => string;
};

const Ctx = createContext<FormatContext | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
    const [tenant, setTenant] = useState<Tenant>({});
    const [settings, setSettings] = useState<Settings>({});
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/settings?all=true", { credentials: "include", cache: "no-store" });
            if (!res.ok) {
                setLoading(false);
                return;
            }
            const data = await res.json();
            setTenant(data.tenant || {});
            setSettings(data.settings || {});
            // Apply brand color to CSS variable
            if (typeof document !== "undefined") {
                const primary = data.tenant?.primaryColor;
                if (primary) {
                    document.documentElement.style.setProperty("--primary-color", primary);
                    document.documentElement.style.setProperty("--primary-hover", primary);
                }
                const accent = data.tenant?.accentColor;
                if (accent) {
                    document.documentElement.style.setProperty("--secondary-color", accent);
                }
                if (data.tenant?.name) {
                    document.title = `${data.tenant.name} — Dashboard`;
                }
            }
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const formatMoney = useCallback(
        (n: number | null | undefined, opts: { currency?: string; symbol?: string; position?: "prefix" | "suffix" } = {}) => {
            if (n == null || isNaN(n)) return "—";
            const symbol = opts.symbol || settings["money.currencySymbol"] || settings["money.currency"] || "UGX";
            const position = opts.position || settings["money.currencyPosition"] || "prefix";
            const decimals = Number(settings["money.decimalPlaces"] ?? 0);
            const sep = settings["money.thousandsSeparator"] || ",";
            const sign = n < 0 ? "-" : "";
            const abs = Math.abs(n);
            const formatted = new Intl.NumberFormat("en-US", {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            }).format(abs).replace(/,/g, sep);
            return sign + (position === "suffix" ? `${formatted} ${symbol}` : `${symbol} ${formatted}`);
        },
        [settings]
    );

    const formatDate = useCallback(
        (d: Date | string | null | undefined) => {
            if (!d) return "—";
            const date = typeof d === "string" ? new Date(d) : d;
            const fmt = settings["locale.dateFormat"] || "DD/MM/YYYY";
            const dd = String(date.getDate()).padStart(2, "0");
            const mm = String(date.getMonth() + 1).padStart(2, "0");
            const yyyy = String(date.getFullYear());
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const mmm = months[date.getMonth()];
            switch (fmt) {
                case "MM/DD/YYYY": return `${mm}/${dd}/${yyyy}`;
                case "YYYY-MM-DD": return `${yyyy}-${mm}-${dd}`;
                case "DD-MMM-YYYY": return `${dd}-${mmm}-${yyyy}`;
                case "DD/MM/YYYY":
                default: return `${dd}/${mm}/${yyyy}`;
            }
        },
        [settings]
    );

    const formatTime = useCallback(
        (d: Date | string | null | undefined) => {
            if (!d) return "—";
            const date = typeof d === "string" ? new Date(d) : d;
            const fmt = settings["locale.timeFormat"] || "24h";
            const hh = String(date.getHours()).padStart(2, "0");
            const mi = String(date.getMinutes()).padStart(2, "0");
            if (fmt === "12h") {
                const h = date.getHours() % 12 || 12;
                const ampm = date.getHours() < 12 ? "AM" : "PM";
                return `${h}:${mi} ${ampm}`;
            }
            return `${hh}:${mi}`;
        },
        [settings]
    );

    const formatDateTime = useCallback(
        (d: Date | string | null | undefined) => {
            if (!d) return "—";
            return `${formatDate(d)} ${formatTime(d)}`;
        },
        [formatDate, formatTime]
    );

    const value = useMemo(() => ({
        tenant, settings, loading, refresh: load,
        formatMoney, formatDate, formatTime, formatDateTime,
    }), [tenant, settings, loading, load, formatMoney, formatDate, formatTime, formatDateTime]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant(): FormatContext {
    const ctx = useContext(Ctx);
    if (!ctx) {
        return {
            tenant: {}, settings: {}, loading: true, refresh: async () => {},
            formatMoney: (n: any) => n == null ? "—" : String(n),
            formatDate: (d: any) => d ? new Date(d).toLocaleDateString() : "—",
            formatTime: (d: any) => d ? new Date(d).toLocaleTimeString() : "—",
            formatDateTime: (d: any) => d ? new Date(d).toLocaleString() : "—",
        };
    }
    return ctx;
}

export function useFormatters() {
    const { formatMoney, formatDate, formatTime, formatDateTime } = useTenant();
    return { formatMoney, formatDate, formatTime, formatDateTime };
}
