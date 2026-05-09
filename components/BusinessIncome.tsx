'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { createBrowserClient, CLIENT_ID } from '@/lib/supabase';
import { formatCurrency, formatPercent, formatDate, daysUntil } from '@/lib/formatters';
import type { IncomeStream, Goal } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const YEAR_TARGETS: { year: string; label: string; value: number; color: string }[] = [
  { year: 'Y1', label: '$625K', value: 625_000, color: '#ffaa00' },
  { year: 'Y2', label: '$1.2M', value: 1_200_000, color: '#888' },
  { year: 'Y3', label: '$2M', value: 2_000_000, color: '#00ff88' },
  { year: 'Y5', label: '$3M', value: 3_000_000, color: '#ff4444' },
];

// Distinct colors for each income stream area
const STREAM_COLORS = [
  '#00ff88',
  '#ffaa00',
  '#4488ff',
  '#ff88cc',
  '#aa44ff',
  '#44ffee',
  '#ffee44',
  '#ff6644',
];

const CHART_YEARS = ['Y1', 'Y2', 'Y3', 'Y4', 'Y5'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Interpolate a value at a given year index (0-4 = Y1-Y5) between
 * current_annual (Y0→Y1 boundary), projected_year3 (Y3), projected_year5 (Y5).
 * Linear segments: Y1→Y3 and Y3→Y5.
 */
function interpolateIncome(stream: IncomeStream, yearIdx: number): number {
  // yearIdx: 0=Y1, 1=Y2, 2=Y3, 3=Y4, 4=Y5
  if (yearIdx <= 2) {
    // Linear from current_annual (Y1) to projected_year3 (Y3)
    const t = yearIdx / 2;
    return stream.current_annual + t * (stream.projected_year3 - stream.current_annual);
  } else {
    // Linear from projected_year3 (Y3) to projected_year5 (Y5)
    const t = (yearIdx - 2) / 2;
    return stream.projected_year3 + t * (stream.projected_year5 - stream.projected_year3);
  }
}

/**
 * Build recharts-ready data for the stacked area chart.
 * Each data point is { year, [streamKey]: value, total }.
 */
function buildChartData(streams: IncomeStream[]) {
  return CHART_YEARS.map((yr, yIdx) => {
    const point: Record<string, string | number> = { year: yr };
    let total = 0;
    for (const s of streams) {
      const key = streamKey(s);
      const val = Math.round(interpolateIncome(s, yIdx));
      point[key] = val;
      total += val;
    }
    point.total = Math.round(total);
    return point;
  });
}

function streamKey(s: IncomeStream): string {
  return s.id;
}

function streamLabel(s: IncomeStream): string {
  return s.stream_name.toUpperCase();
}

function goalStatus(goal: Goal, now: Date): 'COMPLETE' | 'OVERDUE' | 'AT_RISK' | 'ON_TRACK' {
  const pct = goal.target_value > 0 ? goal.current_value / goal.target_value : 0;
  if (pct >= 1) return 'COMPLETE';

  const deadline = new Date(goal.target_date);
  if (deadline < now) return 'OVERDUE';

  const days = daysUntil(goal.target_date);
  const gap = goal.target_value - goal.current_value;
  const gapPct = goal.target_value > 0 ? gap / goal.target_value : 0;
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

interface StreamCardProps {
  stream: IncomeStream;
  color: string;
}

function StreamCard({ stream, color }: StreamCardProps) {
  const y3Progress = stream.projected_year3 > 0
    ? Math.min((stream.current_annual / stream.projected_year3) * 100, 100)
    : 0;

  return (
    <div className="terminal-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-[#e8e8e8] leading-tight">
          {stream.stream_name}
        </h3>
        <div
          className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
          style={{ backgroundColor: color }}
        />
      </div>

      <div>
        <p className="data-label mb-0.5">CURRENT ANNUAL</p>
        <p className="font-mono tabular-nums text-2xl font-bold" style={{ color }}>
          {formatCurrency(stream.current_annual, { compact: true })}
        </p>
      </div>

      {/* Progress toward Y3 */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="data-label">TOWARD YEAR 3</span>
          <span className="text-xs font-mono" style={{ color }}>
            {y3Progress.toFixed(0)}%
          </span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${y3Progress}%`, backgroundColor: color }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#2a2a2a]">
        <div>
          <p className="data-label mb-0.5">YEAR 3 TARGET</p>
          <p className="mono-num text-sm text-[#e8e8e8]">
            {formatCurrency(stream.projected_year3, { compact: true })}
          </p>
        </div>
        <div>
          <p className="data-label mb-0.5">YEAR 5 TARGET</p>
          <p className="mono-num text-sm text-[#e8e8e8]">
            {formatCurrency(stream.projected_year5, { compact: true })}
          </p>
        </div>
      </div>
    </div>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
  label?: string;
  streams: IncomeStream[];
}

function IncomeTooltip({ active, payload, label, streams }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] px-3 py-2 rounded-sm text-xs font-mono min-w-[160px]">
      <p className="text-[#888] mb-2 border-b border-[#2a2a2a] pb-1">{label}</p>
      {[...payload].reverse().map((p) => {
        const stream = streams.find((s) => s.id === p.dataKey);
        return (
          <div key={p.dataKey} className="flex justify-between gap-4 mb-1">
            <span style={{ color: p.color }} className="truncate max-w-[100px]">
              {stream?.stream_name ?? p.name}
            </span>
            <span className="tabular-nums text-[#e8e8e8]">
              {formatCurrency(p.value, { compact: true })}
            </span>
          </div>
        );
      })}
      <div className="flex justify-between gap-4 pt-1 border-t border-[#2a2a2a] font-semibold">
        <span className="text-[#e8e8e8]">TOTAL</span>
        <span className="text-accent-green tabular-nums">
          {formatCurrency(total, { compact: true })}
        </span>
      </div>
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
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider border rounded-sm ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BusinessIncome() {
  const [streams, setStreams] = useState<IncomeStream[]>([]);
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
          .select('*')
          .eq('client_id', CLIENT_ID),
        supabase
          .schema('north_star')
          .from('goals')
          .select('*')
          .eq('client_id', CLIENT_ID)
          .order('target_date', { ascending: true }),
      ]);

      if (streamsResult.error) throw new Error(streamsResult.error.message);
      if (goalsResult.error) throw new Error(goalsResult.error.message);

      setStreams((streamsResult.data as IncomeStream[]) ?? []);
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
  const chartData = buildChartData(streams);

  // Total current annual across all streams
  const totalCurrentAnnual = streams.reduce((s, st) => s + st.current_annual, 0);

  return (
    <div className="space-y-4">
      {/* ── Section A — Income Stream Cards ──────────────────────────────── */}
      <div className="terminal-card">
        <div className="panel-header">
          <span className="panel-title">Income Streams</span>
          <span className="mono-num text-sm text-accent-green font-semibold">
            {formatCurrency(totalCurrentAnnual, { compact: true })} / YR CURRENT
          </span>
        </div>
        {streams.length === 0 ? (
          <p className="p-4 text-xs font-mono text-[#888] text-center uppercase tracking-widest">
            No income streams found
          </p>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {streams.map((stream, idx) => (
              <StreamCard
                key={stream.id}
                stream={stream}
                color={STREAM_COLORS[idx % STREAM_COLORS.length]}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Section B — 5-Year Income Projection ─────────────────────────── */}
      {streams.length > 0 && (
        <div className="terminal-card">
          <div className="panel-header">
            <span className="panel-title">5-Year Income Projection</span>
            <div className="flex items-center gap-3">
              {YEAR_TARGETS.map((t) => (
                <span
                  key={t.year}
                  className="text-[10px] font-mono"
                  style={{ color: t.color }}
                >
                  {t.year}: {t.label}
                </span>
              ))}
            </div>
          </div>
          <div className="p-4" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <defs>
                  {streams.map((stream, idx) => {
                    const color = STREAM_COLORS[idx % STREAM_COLORS.length];
                    const key = streamKey(stream);
                    return (
                      <linearGradient
                        key={key}
                        id={`grad-${key}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#2a2a2a"
                  vertical={false}
                />
                <XAxis
                  dataKey="year"
                  tick={{ fill: '#888', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  stroke="#2a2a2a"
                />
                <YAxis
                  tick={{ fill: '#888', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
                  stroke="#2a2a2a"
                />
                <Tooltip
                  content={<IncomeTooltip streams={streams} />}
                  cursor={{ stroke: '#2a2a2a', strokeWidth: 1 }}
                />
                <Legend
                  formatter={(value: string) => {
                    const stream = streams.find((s) => s.id === value);
                    return (
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'JetBrains Mono',
                          color: '#888',
                        }}
                      >
                        {stream?.stream_name ?? value}
                      </span>
                    );
                  }}
                />

                {/* Year target reference lines */}
                {YEAR_TARGETS.map((t) => (
                  <ReferenceLine
                    key={t.year}
                    y={t.value}
                    stroke={t.color}
                    strokeDasharray="6 3"
                    strokeWidth={1}
                    label={{
                      value: `${t.year} ${t.label}`,
                      fill: t.color,
                      fontSize: 9,
                      fontFamily: 'JetBrains Mono',
                      position: 'insideTopRight',
                    }}
                  />
                ))}

                {/* Stacked areas, one per stream */}
                {streams.map((stream, idx) => {
                  const color = STREAM_COLORS[idx % STREAM_COLORS.length];
                  const key = streamKey(stream);
                  return (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={key}
                      stackId="income"
                      stroke={color}
                      strokeWidth={1.5}
                      fill={`url(#grad-${key})`}
                      dot={false}
                      activeDot={{ r: 3, fill: color }}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Section C — Goal Tracker Table ───────────────────────────────── */}
      <div className="terminal-card">
        <div className="panel-header">
          <span className="panel-title">Goal Tracker</span>
          <span className="text-xs font-mono text-[#888]">
            {goals.length} GOALS
          </span>
        </div>
        {goals.length === 0 ? (
          <p className="p-4 text-xs font-mono text-[#888] text-center uppercase tracking-widest">
            No goals found
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  {[
                    'GOAL',
                    'TARGET',
                    'CURRENT',
                    'GAP',
                    'DEADLINE',
                    'PROGRESS',
                    'STATUS',
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left uppercase tracking-wider text-[#888] font-semibold whitespace-nowrap"
                    >
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

                  const progressColor = isComplete
                    ? '#888'
                    : isOverdue
                    ? '#ff4444'
                    : status === 'AT_RISK'
                    ? '#ffaa00'
                    : '#00ff88';

                  return (
                    <tr
                      key={goal.id}
                      className={`border-b border-[#1a1a1a] transition-colors ${
                        isOverdue
                          ? 'bg-[rgba(255,68,68,0.05)] hover:bg-[rgba(255,68,68,0.08)]'
                          : 'hover:bg-[#1a1a1a]'
                      }`}
                    >
                      {/* Goal name */}
                      <td className="px-3 py-3 max-w-[200px]">
                        <div className="flex items-center gap-2">
                          {isComplete && (
                            <CheckCircle size={12} className="text-[#888] flex-shrink-0" />
                          )}
                          <span
                            className={`truncate ${
                              isOverdue ? 'text-accent-red' : 'text-[#e8e8e8]'
                            }`}
                          >
                            {goal.goal_name}
                          </span>
                        </div>
                        {goal.layer && (
                          <span className="text-[10px] text-[#888] uppercase mt-0.5 block">
                            {goal.layer}
                          </span>
                        )}
                      </td>

                      {/* Target */}
                      <td className="px-3 py-3 tabular-nums text-right whitespace-nowrap text-[#e8e8e8]">
                        {formatCurrency(goal.target_value, { compact: true })}
                      </td>

                      {/* Current */}
                      <td className="px-3 py-3 tabular-nums text-right whitespace-nowrap text-accent-green">
                        {formatCurrency(goal.current_value, { compact: true })}
                      </td>

                      {/* Gap */}
                      <td
                        className={`px-3 py-3 tabular-nums text-right whitespace-nowrap ${
                          gap === 0 ? 'text-[#888]' : 'text-[#e8e8e8]'
                        }`}
                      >
                        {gap === 0 ? '—' : formatCurrency(gap, { compact: true })}
                      </td>

                      {/* Deadline */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className={isOverdue ? 'text-accent-red' : 'text-[#e8e8e8]'}>
                          {formatDate(goal.target_date, 'medium')}
                        </div>
                        <div
                          className={`text-[10px] mt-0.5 ${
                            isOverdue
                              ? 'text-accent-red'
                              : days <= 30
                              ? 'text-accent-amber'
                              : 'text-[#888]'
                          }`}
                        >
                          {isOverdue
                            ? `${Math.abs(days)}d OVERDUE`
                            : isComplete
                            ? 'DONE'
                            : `${days}d left`}
                        </div>
                      </td>

                      {/* Progress bar */}
                      <td className="px-3 py-3 min-w-[100px]">
                        <div className="space-y-1">
                          <div className="progress-track">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${progress}%`,
                                backgroundColor: progressColor,
                              }}
                            />
                          </div>
                          <span
                            className="text-[10px] tabular-nums"
                            style={{ color: progressColor }}
                          >
                            {formatPercent(progress, { decimals: 0 })}
                          </span>
                        </div>
                      </td>

                      {/* Status badge */}
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
