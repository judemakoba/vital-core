"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Users, Calendar, Pill, FlaskConical, DollarSign, UserCheck, ArrowUpRight } from "lucide-react";
import styles from "./page.module.css";
import { useFormatters } from "@/hooks/useFormatters";

interface LiveStats {
    totalPatients: number;
    patientsAttendedToday: number;
    appointmentsToday: number;
    pendingPrescriptions: number;
    pendingLabs: number;
    todaysRevenue: number;
    canSeeRevenue: boolean;
}

interface StatCard {
    name: string;
    value: string;
    icon: any;
    color: string;
    // Navigation target for this card
    href: string;
    // Optional sublabel shown under the value (e.g. "→ see patient list")
    sublabel?: string;
    // Highlight if the count is non-zero (draws the eye to actionable items)
    attention?: boolean;
}

export default function DashboardLiveStats() {
    const [stats, setStats] = useState<LiveStats | null>(null);
    const fmt = useFormatters();
    const formatCurrency = (n: number) => fmt.compactMoney(n);

    const fetchStats = async () => {
        try {
            const res = await fetch("/api/dashboard/stats", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (err) {
            console.error("Failed to fetch live stats:", err);
        }
    };

    useEffect(() => {
        fetchStats();
        // Poll every 15 seconds so "Patients Attended Today" bumps up live
        const interval = setInterval(fetchStats, 15_000);
        return () => clearInterval(interval);
    }, []);

    if (!stats) return null;

    const statCards: StatCard[] = [
        {
            name: "Total Patients",
            value: stats.totalPatients.toLocaleString(),
            icon: Users,
            color: "var(--primary-color)",
            href: "/dashboard/patients",
            sublabel: "View all patients",
        },
        {
            name: "Patients Attended Today",
            value: stats.patientsAttendedToday.toString(),
            icon: UserCheck,
            color: "var(--success-color)",
            href: "/dashboard/doctor",
            sublabel: "Today's consultations",
        },
        {
            name: "Appointments Today",
            value: stats.appointmentsToday.toString(),
            icon: Calendar,
            color: "var(--info-color)",
            href: "/dashboard/appointments",
            sublabel: "View schedule",
            // Highlight if any appointments are pending (actionable)
            attention: stats.appointmentsToday > 0,
        },
        {
            name: "Pending Prescriptions",
            value: stats.pendingPrescriptions.toString(),
            icon: Pill,
            color: "var(--warning-color)",
            href: "/dashboard/pharmacy",
            sublabel: stats.pendingPrescriptions > 0 ? "⚠ Awaiting dispense" : "All clear",
            // Highlight when there are pending scripts (action needed)
            attention: stats.pendingPrescriptions > 0,
        },
        {
            name: "Pending Lab Orders",
            value: stats.pendingLabs.toString(),
            icon: FlaskConical,
            color: "#a855f7",
            href: "/dashboard/lab",
            sublabel: stats.pendingLabs > 0 ? "⚠ Awaiting processing" : "All clear",
            attention: stats.pendingLabs > 0,
        },
        ...(stats.canSeeRevenue ? [{
            name: "Today's Revenue",
            value: formatCurrency(stats.todaysRevenue),
            icon: DollarSign,
            color: "var(--success-color)",
            href: "/dashboard/finance",
            sublabel: "View financial dashboard",
        }] : []),
    ];

    return (
        <div className={styles.statsGrid}>
            {statCards.map((stat, index) => {
                const Icon = stat.icon;
                return (
                    <Link
                        key={stat.name}
                        href={stat.href}
                        className={`glass-card card-premium ${styles.statCard} ${styles.statCardLink} animate-slide-up`}
                        style={{
                            animationDelay: `${index * 100}ms`,
                            // Subtle visual cue for cards needing attention
                            borderColor: stat.attention ? `${stat.color}66` : undefined,
                            boxShadow: stat.attention ? `0 0 0 1px ${stat.color}33, var(--shadow-sm)` : undefined,
                        }}
                    >
                        <div className={styles.statIconWrapper} style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>
                            <Icon size={24} />
                        </div>
                        <div className={styles.statInfo}>
                            <p className={styles.statName}>{stat.name}</p>
                            <p className={styles.statValue}>{stat.value}</p>
                            {stat.sublabel && (
                                <p
                                    className={styles.statSublabel}
                                    style={{ color: stat.attention ? stat.color : 'var(--text-muted)' }}
                                >
                                    {stat.sublabel}
                                </p>
                            )}
                        </div>
                        <div
                            className={styles.statArrow}
                            style={{ color: stat.color }}
                            aria-hidden="true"
                        >
                            <ArrowUpRight size={18} />
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
