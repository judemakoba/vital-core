'use client';

import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line, AreaChart, Area,
} from 'recharts';

// Chart palette — vibrant colors that work on both light and dark surfaces
export const CHART_COLORS = [
    '#6366f1', // indigo (primary)
    '#10b981', // emerald (success)
    '#f59e0b', // amber (warning)
    '#ef4444', // red (danger)
    '#3b82f6', // blue (info)
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
    '#f97316', // orange
];

const formatUGX = (n: number) => {
    if (n == null) return '';
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return n.toFixed(0);
};

const formatUGXFull = (n: number) => `UGX ${(n ?? 0).toLocaleString('en-UG', { minimumFractionDigits: 0 })}`;

// ──────────────────────────────────────────────────────────────────────────
// Tooltip & chart styling — all values come from CSS custom properties so
// the charts automatically adopt light/dark theme and any future rebrand.
// ──────────────────────────────────────────────────────────────────────────
const axisStyle = { fontSize: 11, fill: 'var(--text-muted)' };
const gridStroke = 'var(--border-color)';
const legendStyle = { fontSize: 12, paddingTop: 4, color: 'var(--text-secondary)' };
const tooltipStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 12px',
    fontSize: 12,
    boxShadow: 'var(--shadow-md)',
    color: 'var(--text-primary)',
};
const tooltipLabelStyle = { color: 'var(--text-muted)', marginBottom: 4 };

// ──────────────────────────────────────────────────────────────────────────
// Donut/Pie Chart
// ──────────────────────────────────────────────────────────────────────────
export interface DonutDatum {
    name: string;
    value: number;
    [key: string]: any;
}

interface DonutProps {
    data: DonutDatum[];
    height?: number;
    innerRadius?: number;
    outerRadius?: number;
    valueFormatter?: (n: number) => string;
    showLegend?: boolean;
}

export function DonutChart({
    data,
    height = 240,
    innerRadius = 50,
    outerRadius = 90,
    valueFormatter = formatUGX,
    showLegend = true,
}: DonutProps) {
    const filtered = data.filter(d => d.value > 0);
    if (filtered.length === 0) {
        return <EmptyChart height={height} message="No data yet" />;
    }
    return (
        <ResponsiveContainer width="100%" height={height}>
            <PieChart>
                <Pie
                    data={filtered}
                    cx="50%"
                    cy="50%"
                    innerRadius={innerRadius}
                    outerRadius={outerRadius}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    stroke="var(--bg-card)"
                    strokeWidth={2}
                >
                    {filtered.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    formatter={(value: number, name: string) => [valueFormatter(value), name]}
                />
                {showLegend && <Legend wrapperStyle={legendStyle} iconType="circle" />}
            </PieChart>
        </ResponsiveContainer>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Simple Bar Chart
// ──────────────────────────────────────────────────────────────────────────
interface BarRow {
    name: string;
    value: number;
    [key: string]: any;
}

interface BarProps {
    data: BarRow[];
    height?: number;
    color?: string;
    valueFormatter?: (n: number) => string;
    layout?: 'horizontal' | 'vertical';
}

export function SimpleBarChart({
    data,
    height = 260,
    color = '#6366f1',
    valueFormatter = formatUGX,
    layout = 'horizontal',
}: BarProps) {
    if (!data || data.length === 0) {
        return <EmptyChart height={height} message="No data yet" />;
    }
    const isVertical = layout === 'vertical';
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart
                data={data}
                layout={isVertical ? 'vertical' : 'horizontal'}
                margin={{ top: 8, right: 16, left: isVertical ? 100 : 0, bottom: 0 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.5} />
                {isVertical ? (
                    <>
                        <XAxis
                            type="number"
                            tickFormatter={valueFormatter}
                            tick={axisStyle}
                        />
                        <YAxis
                            type="category"
                            dataKey="name"
                            tick={axisStyle}
                            width={100}
                        />
                    </>
                ) : (
                    <>
                        <XAxis dataKey="name" tick={axisStyle} interval={0} angle={-15} textAnchor="end" height={60} />
                        <YAxis tickFormatter={valueFormatter} tick={axisStyle} width={60} />
                    </>
                )}
                <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    formatter={(v: number) => valueFormatter(v)}
                />
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Stacked Bar Chart
// ──────────────────────────────────────────────────────────────────────────
interface StackedBarProps {
    data: any[];
    series: { key: string; name: string; color: string }[];
    height?: number;
    xKey?: string;
    valueFormatter?: (n: number) => string;
}

export function StackedBarChart({
    data,
    series,
    height = 280,
    xKey = 'label',
    valueFormatter = formatUGX,
}: StackedBarProps) {
    if (!data || data.length === 0) {
        return <EmptyChart height={height} message="No data yet" />;
    }
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.5} />
                <XAxis dataKey={xKey} tick={axisStyle} />
                <YAxis tickFormatter={valueFormatter} tick={axisStyle} width={60} />
                <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    formatter={(v: number) => valueFormatter(v)}
                />
                <Legend wrapperStyle={legendStyle} iconType="circle" />
                {series.map(s => (
                    <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId="stack" radius={[4, 4, 0, 0]} />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Trend Line/Area Chart
// ──────────────────────────────────────────────────────────────────────────
interface LineProps {
    data: any[];
    series: { key: string; name: string; color: string; area?: boolean }[];
    height?: number;
    xKey?: string;
    valueFormatter?: (n: number) => string;
}

export function TrendLineChart({
    data,
    series,
    height = 260,
    xKey = 'label',
    valueFormatter = formatUGX,
}: LineProps) {
    if (!data || data.length === 0) {
        return <EmptyChart height={height} message="No data yet" />;
    }
    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                    {series.map(s => (
                        <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={s.color} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                        </linearGradient>
                    ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} opacity={0.5} />
                <XAxis dataKey={xKey} tick={axisStyle} />
                <YAxis tickFormatter={valueFormatter} tick={axisStyle} width={60} />
                <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    formatter={(v: number) => valueFormatter(v)}
                />
                <Legend wrapperStyle={legendStyle} iconType="circle" />
                {series.map(s => (
                    <Area
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.name}
                        stroke={s.color}
                        fill={`url(#grad-${s.key})`}
                        strokeWidth={2}
                    />
                ))}
            </AreaChart>
        </ResponsiveContainer>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Empty placeholder
// ──────────────────────────────────────────────────────────────────────────
function EmptyChart({ height, message }: { height: number; message: string }) {
    return (
        <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-md)',
            padding: 24,
            border: '1px solid var(--border-color)',
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
        }}>
            {message}
        </div>
    );
}

export { formatUGX, formatUGXFull };
