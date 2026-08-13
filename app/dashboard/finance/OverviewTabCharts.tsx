'use client';

import { useEffect, useState } from 'react';
import {
    DonutChart, SimpleBarChart, StackedBarChart, formatUGX, formatUGXFull,
} from './FinanceCharts';

interface Account {
    id: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    balance: number;
}

interface IncomeSummary {
    totalRevenue: number;
    totalCOGS: number;
    totalOperating: number;
    netIncome: number;
    byAccount: Account[];
}

/**
 * OverviewCharts — headline KPIs + revenue/expense visualizations for the finance Overview tab.
 * All styles use the global design tokens so dark mode + theme tweaks propagate automatically.
 */
export default function OverviewCharts() {
    const [data, setData] = useState<IncomeSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const yearStart = `${new Date().getFullYear()}-01-01`;
        // End-of-day so we don't miss entries posted later today
        // (the API filter `lte: to` parses bare dates as midnight UTC).
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        const to = endOfToday.toISOString();
        fetch(`/api/finance/reports/income-statement?from=${yearStart}&to=${encodeURIComponent(to)}`)
            .then(r => r.json())
            .then(d => {
                if (d.error) {
                    setLoading(false);
                    return;
                }
                const byAccount: Account[] = [
                    ...(d.revenue?.accounts ?? []).map((a: any) => ({
                        id: a.id,
                        accountCode: a.accountCode,
                        accountName: a.accountName,
                        accountType: 'REVENUE',
                        balance: a.balance,
                    })),
                    ...(d.cogs?.accounts ?? []).map((a: any) => ({
                        id: a.id,
                        accountCode: a.accountCode,
                        accountName: a.accountName,
                        accountType: 'COGS',
                        balance: a.balance,
                    })),
                    ...(d.operatingExpenses?.accounts ?? []).map((a: any) => ({
                        id: a.id,
                        accountCode: a.accountCode,
                        accountName: a.accountName,
                        accountType: 'EXPENSE',
                        balance: a.balance,
                    })),
                ];
                setData({
                    totalRevenue: d.revenue?.total ?? 0,
                    totalCOGS: d.cogs?.total ?? 0,
                    totalOperating: d.operatingExpenses?.total ?? 0,
                    netIncome: d.netIncome ?? 0,
                    byAccount,
                });
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 16,
            }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} />
                ))}
            </div>
        );
    }

    if (!data) return null;

    const isProfit = data.netIncome >= 0;
    const netMargin = data.totalRevenue > 0 ? ((data.netIncome / data.totalRevenue) * 100).toFixed(1) : '0.0';

    const revenueByService = groupRevenueByService(data.byAccount);
    const topAccounts = [...data.byAccount]
        .filter(a => Math.abs(a.balance) > 0)
        .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
        .slice(0, 6)
        .map(a => ({ name: `${a.accountCode} ${a.accountName}`, value: a.balance }));

    const profitBridge = [
        { label: 'Revenue', revenue: data.totalRevenue, cogs: 0, opex: 0, net: 0 },
        { label: 'After COGS', revenue: 0, cogs: data.totalCOGS, opex: 0, net: data.totalRevenue - data.totalCOGS },
        { label: 'After OpEx', revenue: 0, cogs: 0, opex: data.totalOperating, net: data.netIncome },
    ];

    return (
        <>
            {/* Headline KPI row */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 16,
            }}>
                <KpiCard
                    icon="📈"
                    label="Total Revenue (YTD)"
                    value={data.totalRevenue}
                    accent="emerald"
                    sub="All income accounts"
                />
                <KpiCard
                    icon="📉"
                    label="Total Costs"
                    value={data.totalCOGS + data.totalOperating}
                    accent="red"
                    sub={`COGS ${formatUGXFull(data.totalCOGS)} · OpEx ${formatUGXFull(data.totalOperating)}`}
                />
                <KpiCard
                    icon={isProfit ? '✅' : '⚠️'}
                    label={isProfit ? 'Net Profit' : 'Net Loss'}
                    value={data.netIncome}
                    accent={isProfit ? 'emerald' : 'red'}
                    sub={`${isProfit ? 'Net' : 'Loss'} margin ${netMargin}%`}
                />
                <KpiCard
                    icon="📊"
                    label="Active Accounts"
                    value={data.byAccount.filter(a => Math.abs(a.balance) > 0).length}
                    accent="indigo"
                    sub={`${data.byAccount.length} total in chart of accounts`}
                    isCount
                />
            </div>

            {/* Charts row: revenue donut + top accounts bar */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 16,
            }}>
                <PanelCard title="💰 Revenue by Service (YTD)">
                    {revenueByService.length === 0 ? (
                        <EmptyMessage message="No revenue recorded yet this year." />
                    ) : (
                        <DonutChart
                            data={revenueByService}
                            height={240}
                            innerRadius={55}
                            outerRadius={90}
                        />
                    )}
                </PanelCard>
                <PanelCard title="📊 Top 6 Accounts by Balance">
                    {topAccounts.length === 0 ? (
                        <EmptyMessage message="No accounts with balances yet." />
                    ) : (
                        <SimpleBarChart
                            data={topAccounts}
                            color="#6366f1"
                            height={240}
                        />
                    )}
                </PanelCard>
            </div>

            {/* Profit bridge */}
            <PanelCard title="🌉 Profit Bridge (YTD)" subtitle="How we got from gross revenue to net income">
                <StackedBarChart
                    data={profitBridge}
                    series={[
                        { key: 'revenue', name: 'Revenue', color: '#10b981' },
                        { key: 'cogs', name: 'COGS', color: '#ef4444' },
                        { key: 'opex', name: 'Operating Expenses', color: '#f59e0b' },
                    ]}
                    xKey="label"
                    height={220}
                />
            </PanelCard>
        </>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-components — all use design tokens
// ──────────────────────────────────────────────────────────────────────────
function PanelCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: 16,
            boxShadow: 'var(--shadow-sm)',
        }}>
            <h4 style={{
                margin: '0 0 4px',
                fontSize: 14,
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontFamily: 'Outfit, sans-serif',
            }}>{title}</h4>
            {subtitle && (
                <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 12 }}>{subtitle}</p>
            )}
            {children}
        </div>
    );
}

function EmptyMessage({ message }: { message: string }) {
    return (
        <div style={{
            color: 'var(--text-muted)',
            fontSize: 13,
            padding: '40px 0',
            textAlign: 'center',
        }}>{message}</div>
    );
}

function Skeleton() {
    return (
        <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: 16,
            color: 'var(--text-muted)',
            fontSize: 13,
            height: 96,
            display: 'flex',
            alignItems: 'center',
            boxShadow: 'var(--shadow-sm)',
        }}>
            Loading…
        </div>
    );
}

function KpiCard({ icon, label, value, accent, sub, isCount }: {
    icon: string;
    label: string;
    value: number;
    accent: 'emerald' | 'red' | 'indigo' | 'amber';
    sub: string;
    isCount?: boolean;
}) {
    const accentColors: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
        emerald: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', text: 'var(--success-color)', iconBg: 'rgba(16,185,129,0.1)' },
        red:     { bg: 'rgba(244,63,94,0.08)',  border: 'rgba(244,63,94,0.3)',  text: 'var(--danger-color)',  iconBg: 'rgba(244,63,94,0.1)' },
        indigo:  { bg: 'var(--primary-light)',   border: 'rgba(99,102,241,0.3)', text: 'var(--primary-color)', iconBg: 'var(--primary-light)' },
        amber:   { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', text: 'var(--warning-color)', iconBg: 'rgba(245,158,11,0.1)' },
    };
    const c = accentColors[accent] ?? accentColors.indigo;
    return (
        <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: 'var(--shadow-sm)',
            borderLeft: `3px solid ${c.border}`,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                    width: 38, height: 38, borderRadius: 'var(--radius-md)', fontSize: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: c.iconBg, border: `1px solid ${c.border}`,
                }}>{icon}</div>
                <div style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    fontWeight: 600,
                }}>{label}</div>
            </div>
            <div style={{
                color: c.text,
                fontSize: 22,
                fontWeight: 700,
                fontFamily: 'Outfit, sans-serif',
            }}>
                {isCount ? value : formatUGXFull(value)}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{sub}</div>
        </div>
    );
}

// Group leaf revenue accounts by their top-level "service" code prefix
function groupRevenueByService(accounts: Account[]): { name: string; value: number }[] {
    const buckets: Record<string, number> = {};
    for (const acc of accounts) {
        if (acc.accountType !== 'REVENUE') continue;
        if (Math.abs(acc.balance) < 1) continue;
        const prefix = acc.accountCode.slice(0, 3);
        let serviceLabel: string;
        if (prefix === '412') serviceLabel = 'Laboratory';
        else if (prefix === '413') serviceLabel = 'Pharmacy';
        else if (prefix === '414') serviceLabel = 'Procedures';
        else if (prefix === '415') serviceLabel = 'Radiology';
        else if (prefix === '416') serviceLabel = 'Ancillary';
        else if (prefix.startsWith('41')) serviceLabel = 'Consultation';
        else if (prefix.startsWith('49')) serviceLabel = 'Other Income';
        else serviceLabel = `Other (${acc.accountCode})`;
        buckets[serviceLabel] = (buckets[serviceLabel] ?? 0) + acc.balance;
    }
    return Object.entries(buckets)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
}
