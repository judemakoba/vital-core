"use client";
/**
 * Client-side hook that loads tenant settings once and exposes formatters.
 *
 * Usage in a client component:
 *   const fmt = useFormatters();
 *   <span>{fmt.money(1234)}</span>
 *   <span>{fmt.date(new Date())}</span>
 */
import { useEffect, useState, useMemo } from "react";

type Formatters = {
    money: (n: number | null | undefined) => string;
    date: (d: Date | string | null | undefined) => string;
    time: (d: Date | string | null | undefined) => string;
    dateTime: (d: Date | string | null | undefined) => string;
    compactMoney: (n: number | null | undefined) => string;
    /** Raw tenant config for any other UI need (e.g. logo, primary color) */
    tenant: Record<string, any>;
    settings: Record<string, any>;
    loaded: boolean;
};

const EMPTY_FALLBACK: Omit<Formatters, "tenant" | "settings" | "loaded"> = {
    money: (n) => (n == null ? "—" : new Intl.NumberFormat("en-GB").format(Math.abs(n))),
    date: (d) => (d ? new Date(d).toLocaleDateString("en-GB") : "—"),
    time: (d) => (d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"),
    dateTime: (d) => (d ? new Date(d).toLocaleString() : "—"),
    compactMoney: (n) => (n == null ? "—" : String(n)),
};

export function useFormatters(): Formatters {
    const [data, setData] = useState<{ tenant: any; settings: any } | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/admin/settings?all=true", { credentials: "include" })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (!cancelled && d) setData({ tenant: d.tenant || {}, settings: d.settings || {} }); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    return useMemo(() => {
        if (!data) {
            return { ...EMPTY_FALLBACK, tenant: {}, settings: {}, loaded: false };
        }
        const { tenant, settings } = data;
        const symbol = tenant.currency || settings["money.currencySymbol"] || "UGX";
        const dp = tenant.decimalPlaces ?? settings["money.decimalPlaces"] ?? 0;
        const ts = settings["money.thousandsSeparator"] || ",";
        const position = tenant.currencyPosition || settings["money.currencyPosition"] || "prefix";

        // Locale-aware number formatter
        const numFmt = new Intl.NumberFormat("en-GB", {
            minimumFractionDigits: dp,
            maximumFractionDigits: dp,
        });

        const money = (n: number | null | undefined) => {
            if (n == null || isNaN(n)) return "—";
            const formatted = numFmt.format(Math.abs(n));
            const s = position === "suffix" ? `${formatted} ${symbol}` : `${symbol} ${formatted}`;
            return n < 0 ? `(${s})` : s;
        };

        const compactMoney = (n: number | null | undefined) => {
            if (n == null || isNaN(n)) return "—";
            const abs = Math.abs(n);
            if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
            if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
            if (abs >= 1_000) return (n / 1_000).toFixed(1) + "K";
            return String(n);
        };

        const dateFormat = tenant.dateFormat || settings["locale.dateFormat"] || "DD/MM/YYYY";
        const timeFormat = tenant.timeFormat || settings["locale.timeFormat"] || "24h";

        const date = (d: Date | string | null | undefined) => {
            if (!d) return "—";
            const dt = typeof d === "string" ? new Date(d) : d;
            const dd = String(dt.getDate()).padStart(2, "0");
            const mm = String(dt.getMonth() + 1).padStart(2, "0");
            const yyyy = String(dt.getFullYear());
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const mmm = months[dt.getMonth()];
            switch (dateFormat) {
                case "MM/DD/YYYY": return `${mm}/${dd}/${yyyy}`;
                case "YYYY-MM-DD": return `${yyyy}-${mm}-${dd}`;
                case "DD-MMM-YYYY": return `${dd}-${mmm}-${yyyy}`;
                case "DD/MM/YYYY":
                default: return `${dd}/${mm}/${yyyy}`;
            }
        };

        const time = (d: Date | string | null | undefined) => {
            if (!d) return "—";
            const dt = typeof d === "string" ? new Date(d) : d;
            if (timeFormat === "12h") {
                const h = dt.getHours() % 12 || 12;
                const ampm = dt.getHours() < 12 ? "AM" : "PM";
                return `${h}:${String(dt.getMinutes()).padStart(2, "0")} ${ampm}`;
            }
            return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
        };

        const dateTime = (d: Date | string | null | undefined) => {
            if (!d) return "—";
            return `${date(d)} ${time(d)}`;
        };

        return { money, date, time, dateTime, compactMoney, tenant, settings, loaded: true };
    }, [data]);
}
