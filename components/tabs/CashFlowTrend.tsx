'use client';

import { useState, useEffect } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { createBrowserClient } from '@/lib/supabase';
import { fetchLastNMonthsTransactions, buildCashFlowTrend } from '@/lib/transactions';
import { formatCurrency, formatPercent, formatMonthKey } from '@/lib/formatters';
import type { CashFlowMonth } from '@/types';

const TOOLTIP_STYLE = {
  background: '#111111',
  border: '1px solid #2a2a2a',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  color: '#e8e8e8',
  borderRadius: '2px',
};

const TICK_STYLE = {
  fontSize: 10,
  fontFamily: 'JetBrains Mono, monospace',
  fill: '#888888',
};

export function CashFlowTrend() {
  const [data, setData] = useState<CashFlowMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createBrowserClient();
        const txs = await fetchLastNMonthsTransactions(supabase, 6);
        const trend = buildCashFlowTrend(txs);
        setData(trend);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load cash flow data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Chart-ready data with short month labels
  const chartData = data.map((d) => ({
    ...d,
    label: formatMonthKey(d.month),
  }));

  // Which months are below 20% savings threshold
  const lowSavingsMonths = new Set(
    data.filter((d) => d.savingsRate < 20).map((d) => d.month)
  );

  const savingsRateColor = (rate: number) =>
    rate >= 20 ? 'status-green' : rate >= 10 ? 'status-amber' : 'status-red';

  return (
    <div className="space-y-4">
      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          <div className="skeleton h-72 rounded-sm" />
          <div className="skeleton h-40 rounded-sm" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="terminal-card p-4">
          <p className="font-mono text-xs status-red">ERROR: {error}</p>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="terminal-card p-8 text-center">
          <p className="font-mono text-xs text-text-secondary">No cash flow data available</p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          {/* Chart */}
          <div className="terminal-card">
            <div className="panel-header">
              <span className="panel-title">6-Month Cash Flow</span>
              <span className="font-mono text-xs text-text-secondary">
                Income / Spending / Net — Savings Rate %
              </span>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart
                  data={chartData}
                  margin={{ top: 12, right: 48, left: 8, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                    stroke="#2a2a2a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={TICK_STYLE}
                    axisLine={false}
                    tickLine={false}
                  />
                  {/* Left axis: dollars */}
                  <YAxis
                    yAxisId="dollars"
                    tick={TICK_STYLE}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                    width={52}
                  />
                  {/* Right axis: savings rate % */}
                  <YAxis
                    yAxisId="percent"
                    orientation="right"
                    tick={TICK_STYLE}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    width={40}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => {
                      if (name === 'Savings %') return [`${value.toFixed(1)}%`, name];
                      return [formatCurrency(value), name];
                    }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                      color: '#888888',
                      paddingTop: '8px',
                    }}
                    iconSize={8}
                  />

                  {/* 20% savings rate target line */}
                  <ReferenceLine
                    yAxisId="percent"
                    y={20}
                    stroke="#ffaa00"
                    strokeDasharray="4 3"
                    strokeOpacity={0.7}
                    label={{
                      value: '20% target',
                      position: 'right',
                      fontSize: 9,
                      fontFamily: 'JetBrains Mono, monospace',
                      fill: '#ffaa00',
                    }}
                  />

                  {/* LOW SAVINGS annotations for months below threshold */}
                  {data
                    .filter((d) => d.savingsRate < 20)
                    .map((d) => (
                      <ReferenceLine
                        key={d.month}
                        yAxisId="dollars"
                        x={formatMonthKey(d.month)}
                        stroke="#ff4444"
                        strokeDasharray="3 3"
                        strokeOpacity={0.4}
                        label={{
                          value: 'LOW SAVINGS',
                          position: 'top',
                          fontSize: 8,
                          fontFamily: 'JetBrains Mono, monospace',
                          fill: '#ff4444',
                        }}
                      />
                    ))}

                  {/* Bars */}
                  <Bar
                    yAxisId="dollars"
                    dataKey="income"
                    name="Income"
                    fill="#00ff88"
                    opacity={0.75}
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    yAxisId="dollars"
                    dataKey="spending"
                    name="Spending"
                    fill="#ff4444"
                    opacity={0.75}
                    radius={[2, 2, 0, 0]}
                  />

                  {/* Net line */}
                  <Line
                    yAxisId="dollars"
                    type="monotone"
                    dataKey="net"
                    name="Net"
                    stroke="#4488ff"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#4488ff', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />

                  {/* Savings rate line (right axis) */}
                  <Line
                    yAxisId="percent"
                    type="monotone"
                    dataKey="savingsRate"
                    name="Savings %"
                    stroke="#ffaa00"
                    strokeWidth={2}
                    strokeDasharray="0"
                    dot={{ r: 3, fill: '#ffaa00', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Summary table */}
          <div className="terminal-card">
            <div className="panel-header">
              <span className="panel-title">Monthly Summary</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Month</th>
                    <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Income</th>
                    <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Spending</th>
                    <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Net</th>
                    <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Savings Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data].reverse().map((d) => {
                    const lowSavings = lowSavingsMonths.has(d.month);
                    return (
                      <tr
                        key={d.month}
                        className="border-b border-border/30 hover:bg-surface-2/60 transition-colors"
                      >
                        <td className="px-4 py-2 text-text-primary">
                          {formatMonthKey(d.month)}
                        </td>
                        <td className="px-4 py-2 text-right status-green tabular-nums">
                          {formatCurrency(d.income)}
                        </td>
                        <td className="px-4 py-2 text-right status-red tabular-nums">
                          {formatCurrency(d.spending)}
                        </td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums font-semibold ${
                            d.net >= 0 ? 'status-green' : 'status-red'
                          }`}
                        >
                          {d.net >= 0 ? '+' : ''}{formatCurrency(d.net)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <div className="inline-flex items-center gap-2 justify-end">
                            <span className={savingsRateColor(d.savingsRate)}>
                              {formatPercent(d.savingsRate)}
                            </span>
                            {lowSavings && (
                              <span className="text-[9px] font-semibold px-1 py-0.5 rounded-sm border border-accent-red/50 status-red tracking-widest">
                                LOW
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CashFlowTrend;
