'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { AlertTriangle, RefreshCw, CheckCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { createBrowserClient, CLIENT_ID } from '@/lib/supabase';
import { formatCurrency, formatPercent, formatDate, daysUntil } from '@/lib/formatters';
import type { Goal } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawIncomeEntry {
  id: string;
  client_id: string;
  month_period: string;
  source: string;
  amount: number;
  notes: string | null;
}

interface SourceStats {
  source: string;
  color: string;
  ytd: number;
  lastPeriod: string;
  lastAmount: number;
  prevAmount: number;
  monthlyData: { period: string; amount: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Annual revenue targets for all income sources combined
const YEAR_TARGETS = [
  { label: 'Y1 $625K', value: 625_000, color: '#ffaa00' },
  { label: 'Y2 $1.2M', value: 1_200_000, color: '#888' },
  { label: 'Y3 $2M', value: 2_000_000, color: '#00ff88' },
];

const SOURCE_COLORS: Record<string, string> = {
  ATS: '#00ff88',
  'Real Estate': '#ffaa00',
  W2: '#4488ff',
  Consulting: '#ff88cc',
  Portfolio: '#aa44ff',
};
const DEFAULT_COLOR = '#44ffee';

function sourceColor(source: string): string {
  return SOURCE_COLORS[source] ?? DEFAULT_COLOR;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentYearPrefix(): string {
  return String(new Date().getFullYear());
}

function aggregateSources(entries: RawIncomeEntry[]): SourceStats[] {
  const year = currentYearPrefix();
  const bySource = new Map<string, RawIncomeEntry[]>();
  for (const e of entries) {
    const arr = bySource.get(e.source) ?? [];
    arr.push(e);
    bySource.set(e.source, arr);
  }

  return Array.from(bySource.entries()).map(([source, rows]) => {
    const sorted = [...rows].sort((a, b) => b.month_period.localeCompare(a.month_period));
    const ytd = rows
      .filter((r) => r.month_period.startsWith(year))
      .reduce((s, r) => s + r.amount, 0);
    const lastAmount = sorted[0]?.amount ?? 0;
    const lastPeriod = sorted[0]?.month_period ?? '';
    const prevAmount = sorted[1]?.amount ?? 0;
    const monthlyData = [...rows]
      .sort((a, b) => a.month_period.localeCompare(b.month_period))
      .map((r) => ({ period: r.month_period, amount: r.amount }));
    return { source, color: sourceColor(source), ytd, lastPeriod, lastAmount, prevAmount, monthlyData };
  });
}

function buildChartData(entries: RawIncomeEntry[]): Record<string, string | number>[] {
  // Get all unique periods, sorted ascending
  const periods = Array.from(new Set(entries.map((e) => e.month_period))).sort();
  const sources = Array.from(new Set(entries.map((e) => e.source)));

  return periods.map((period) => {
    const row: Record<string, string | number> = { period };
    let total = 0;
    for (const src of sources) {
      const entry = entries.find((e) => e.month_period === period && e.source === src);
      const val = entry?.amount ?? 0;
      row[src] = val;
      total += val;
    }
    row.total = total;
    return row;
  });
}

function goalStatus(goal: Goal, now: Date): 'COMPLETE' | 'OVERDUE' | 'AT_RISK' | 'ON_TRACK' {
  const pct = goal.target_value > 0 ? goal.current_value / goal.target_value : 0;
  if (pct >= 1) return 'COMPLETE';
  const deadline = new Date(goal.target_date);
  if (deadline < now) return 'OVERDUE';
  const days = daysUntil(goal.target_date);
  const gapPct = goal.target_value > 0 ? (goal.target_value - goal.current_value) / goal.target_value : 0;
  if (gapPct > 0.2 && days < 90) return 'AT_RISK';
  return 'ON_TRACK';
}

function progressPct(goal: Goal): number {
  if (goal.target_value <= 0) return 0;
  return Math.min((goal.current_value / goal.target_value) * 100, 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="terminal-card p-4 space-y-3">
          {[...Array(4)].map((_, j) => (
            <div key={j} className="skeleton h-6 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="terminal-card p-6 flex flex-col items-center gap-3">
      <AlertTriangle className="text-accent-red" size={28} />
      <p className="text-sm font-mono text-accent-red">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-border rounded-sm hover:border-accent-green hover:text-accent-green transition-colors"
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}

interface StatusBadgeProps {
  status: 'COMPLETE' | 'OVERDUE' | 'AT_RISK' | 'ON_TRACK';
}
function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    COMPLETE: { label: 'COMPLETE', className: 'text-[#888] border-[#444]' },
    OVERDUE: { label: 'OVERDUE', className: 'text-accent-red border-accent-red alert-blink' },
    AT_RISK: { label: 'AT RISK', className: 'text-accent-amber border-accent-amber' },
    ON_TRACK: { label: 'ON TRACK', className: 'text-accent-green border-accent-green' },
  }[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider border rounded-sm ${config.className}`}>
      {config.label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BusinessIncome() {
  const [entries, setEntries] = useState<RawIncomeEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const [streamsResult, goalsResult] = await Promise.all([
        supabase
          .schema('north_star')
          .from('income_streams')
          .select('id, client_id, month_period, source, amount, notes')
          .eq('client_id', CLIENT_ID)
          .order('month_period', { ascending: true }),
        supabase
          .schema('north_star')
          .from('goals')
          .select('*')
          .eq('client_id', CLIENT_ID)
          .gte('target_value', 1000)
          .order('target_date', { ascending: true }),
      ]);

      if (streamsResult.error) throw new Error(streamsResult.error.message);
      if (goalsResult.error) throw new Error(goalsResult.error.message);

      setEntries((streamsResult.data as RawIncomeEntry[]) ?? []);
      setGoals((goalsResult.data as Goal[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  const now = new Date();
  const year = currentYearPrefix();
  const sources = aggregateSources(entries);
  const chartData = buildChartData(entries);
  const sourceNames = Array.from(new Set(entries.map((e) => e.source)));

  const atsStats = sources.find((s) => s.source === 'ATS');
  const ytdAllSources = sources.reduce((s, src) => s + src.ytd, 0);

  // Monthly run rate (current year months with data)
  const ytdMonthCount = (() => {
    const periods = Array.from(new Set(
      entries.filter((e) => e.month_period.startsWith(year)).map((e) => e.month_period)
    ));
    return Math.max(periods.length, 1);
  })();
  const annualRunRate = (ytdAllSources / ytdMonthCount) * 12;

  return (
    <div className="space-y-4">

      {/* ── Section A — ATS KPI Hero ──────────────────────────────────────── */}
      {atsStats && (
        <div className="terminal-card">
          <div className="panel-header">
            <span className="panel-title">ATS DISTRIBUTIONS</span>
            <span className="text-xs font-mono text-accent-green font-semibold">
              PRIMARY INCOME
            </span>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="data-label mb-1">LAST DISTRIBUTION</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-accent-green">
                {formatCurrency(atsStats.lastAmount)}
              </p>
              <p className="text-[10px] font-mono text-[#888] mt-0.5">{atsStats.lastPeriod}</p>
            </div>
            <div>
              <p className="data-label mb-1">MOM CHANGE</p>
              {(() => {
                const delta = atsStats.lastAmount - atsStats.prevAmount;
                const pct = atsStats.prevAmount > 0 ? (delta / atsStats.prevAmount) * 100 : 0;
                const up = delta >= 0;
                return (
                  <div className="flex items-baseline gap-1">
                    {up ? (
                      <TrendingUp size={14} className="text-accent-green" />
                    ) : (
                      <TrendingDown size={14} className="text-accent-red" />
                    )}
                    <p
                      className="font-mono tabular-nums text-xl font-bold"
                      style={{ color: up ? 'var(--accent-green)' : 'var(--accent-red)' }}
                    >
                      {up ? '+' : ''}{formatCurrency(delta)}
                    </p>
                    <span className="text-xs font-mono text-[#888]">
                      ({pct.toFixed(0)}%)
                    </span>
                  </div>
                );
              })()}
            </div>
            <div>
              <p className="data-label mb-1">YTD {year}</p>
              <p className="font-mono tabular-nums text-xl font-bold text-[#e8e8e8]">
                {formatCurrency(atsStats.ytd, { compact: true })}
              </p>
              <p className="text-[10px] font-mono text-[#888] mt-0.5">
                {ytdMonthCount} mo recorded
              </p>
            </div>
            <div>
              <p className="data-label mb-1">ANN. RUN RATE</p>
              <p className="font-mono tabular-nums text-xl font-bold text-accent-amber">
                {formatCurrency((atsStats.ytd / ytdMonthCount) * 12, { compact: true })}
              </p>
              <p className="text-[10px] font-mono text-[#888] mt-0.5">distributions only</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Section B — Income by Source Cards ───────────────────────────── */}
      <div className="terminal-card">
        <div className="panel-header">
          <span className="panel-title">Income Streams</span>
          <span className="mono-num text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>
            {formatCurrency(annualRunRate, { compact: true })} / YR PACE
          </span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sources.map((src) => {
            const delta = src.lastAmount - src.prevAmount;
            const up = delta >= 0;
            return (
              <div key={src.source} className="terminal-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-[#e8e8e8]">
                    {src.source}
                  </h3>
                  <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: src.color }} />
                </div>
                <div>
                  <p className="data-label mb-0.5">LAST MONTH</p>
                  <p className="font-mono tabular-nums text-2xl font-bold" style={{ color: src.color }}>
                    {formatCurrency(src.lastAmount)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#2a2a2a]">
                  <div>
                    <p className="data-label mb-0.5">YTD {year}</p>
                    <p className="mono-num text-sm text-[#e8e8e8]">
                      {formatCurrency(src.ytd, { compact: true })}
                    </p>
                  </div>
                  <div>
                    <p className="data-label mb-0.5">MOM</p>
                    <p className="mono-num text-sm" style={{ color: up ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {up ? '+' : ''}{formatCurrency(delta)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section C — Monthly Income Chart ──────────────────────────────── */}
      {entries.length > 0 && (
        <div className="terminal-card">
          <div className="panel-header">
            <span className="panel-title">Monthly Income — Actuals</span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-[#888]">SOLID = ACTUAL</span>
              <span className="text-[10px] font-mono text-[#888]">DASHED = TARGET</span>
            </div>
          </div>
          <div className="p-4" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fill: '#888', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  stroke="#2a2a2a"
                  tickFormatter={(v: string) => v.slice(2)}
                />
                <YAxis
                  tick={{ fill: '#888', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
                  stroke="#2a2a2a"
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', fontFamily: 'monospace', fontSize: 11 }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  labelFormatter={(l: string) => l}
                />
                {/* Monthly equivalent target reference lines */}
                {YEAR_TARGETS.map((t) => (
                  <ReferenceLine
                    key={t.label}
                    y={Math.round(t.value / 12)}
                    stroke={t.color}
                    strokeDasharray="6 3"
                    strokeWidth={1}
                    label={{
                      value: `${t.label} /mo`,
                      fill: t.color,
                      fontSize: 9,
                      fontFamily: 'JetBrains Mono',
                      position: 'insideTopRight',
                    }}
                  />
                ))}
                {sourceNames.map((src) => (
                  <Bar key={src} dataKey={src} stackId="income" fill={sourceColor(src)} maxBarSize={48} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Section D — Financial Goal Tracker ───────────────────────────── */}
      <div className="terminal-card">
        <div className="panel-header">
          <span className="panel-title">Financial Goals</span>
          <span className="text-xs font-mono text-[#888]">
            {goals.length} GOALS
          </span>
        </div>
        {goals.length === 0 ? (
          <p className="p-4 text-xs font-mono text-[#888] text-center uppercase tracking-widest">
            No financial goals found
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  {['GOAL', 'TARGET', 'CURRENT', 'GAP', 'DEADLINE', 'PROGRESS', 'STATUS'].map((col) => (
                    <th key={col} className="px-3 py-2 text-left uppercase tracking-wider text-[#888] font-semibold whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {goals.map((goal) => {
                  const status = goalStatus(goal, now);
                  const progress = progressPct(goal);
                  const gap = Math.max(goal.target_value - goal.current_value, 0);
                  const days = daysUntil(goal.target_date);
                  const isOverdue = status === 'OVERDUE';
                  const isComplete = status === 'COMPLETE';
                  const progressColor = isComplete ? '#888' : isOverdue ? '#ff4444' : status === 'AT_RISK' ? '#ffaa00' : '#00ff88';

                  return (
                    <tr
                      key={goal.id}
                      className={`border-b border-[#1a1a1a] transition-colors ${isOverdue ? 'bg-[rgba(255,68,68,0.05)] hover:bg-[rgba(255,68,68,0.08)]' : 'hover:bg-[#1a1a1a]'}`}
                    >
                      <td className="px-3 py-3 max-w-[200px]">
                        <div className="flex items-center gap-2">
                          {isComplete && <CheckCircle size={12} className="text-[#888] flex-shrink-0" />}
                          <span className={`truncate ${isOverdue ? 'text-accent-red' : 'text-[#e8e8e8]'}`}>
                            {goal.goal_name}
                          </span>
                        </div>
                        {goal.layer && (
                          <span className="text-[10px] text-[#888] uppercase mt-0.5 block">{goal.layer}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-right whitespace-nowrap text-[#e8e8e8]">
                        {formatCurrency(goal.target_value, { compact: true })}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-right whitespace-nowrap text-accent-green">
                        {formatCurrency(goal.current_value, { compact: true })}
                      </td>
                      <td className={`px-3 py-3 tabular-nums text-right whitespace-nowrap ${gap === 0 ? 'text-[#888]' : 'text-[#e8e8e8]'}`}>
                        {gap === 0 ? '—' : formatCurrency(gap, { compact: true })}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className={isOverdue ? 'text-accent-red' : 'text-[#e8e8e8]'}>
                          {formatDate(goal.target_date, 'medium')}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isOverdue ? 'text-accent-red' : days <= 30 ? 'text-accent-amber' : 'text-[#888]'}`}>
                          {isOverdue ? `${Math.abs(days)}d OVERDUE` : isComplete ? 'DONE' : `${days}d left`}
                        </div>
                      </td>
                      <td className="px-3 py-3 min-w-[100px]">
                        <div className="space-y-1">
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${progress}%`, backgroundColor: progressColor }} />
                          </div>
                          <span className="text-[10px] tabular-nums" style={{ color: progressColor }}>
                            {formatPercent(progress, { decimals: 0 })}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusBadge status={status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
