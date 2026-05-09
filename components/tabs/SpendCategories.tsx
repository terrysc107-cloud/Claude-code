'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { createBrowserClient } from '@/lib/supabase';
import { fetchTransactions, groupByCategory, getTopMerchants } from '@/lib/transactions';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import type { CategorySummary, MerchantSummary } from '@/types';

interface SpendCategoriesProps {
  selectedMonth: string;
}

// Distinct terminal-friendly palette — greens, ambers, blues, teals, purples
const CHART_COLORS = [
  '#00ff88', // accent green
  '#ffaa00', // accent amber
  '#4488ff', // blue
  '#44ffdd', // teal
  '#aa66ff', // purple
  '#00cc6a', // darker green
  '#ff8800', // orange
  '#88ccff', // light blue
  '#ff44aa', // pink
  '#66ff44', // yellow-green
];

const TOOLTIP_STYLE = {
  background: '#111111',
  border: '1px solid #2a2a2a',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  color: '#e8e8e8',
  borderRadius: '2px',
};

function monthDateRange(monthKey: string): { start: string; end: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
  };
}

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function SpendCategories({ selectedMonth }: SpendCategoriesProps) {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [priorCategories, setPriorCategories] = useState<CategorySummary[]>([]);
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (month: string) => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const priorMonth = shiftMonth(month, -1);
      const { start, end } = monthDateRange(month);
      const { start: priorStart, end: priorEnd } = monthDateRange(priorMonth);

      const [txs, priorTxs] = await Promise.all([
        fetchTransactions(supabase, start, end),
        fetchTransactions(supabase, priorStart, priorEnd),
      ]);

      const spending = txs.filter((tx) => tx.amount > 0);
      const priorSpending = priorTxs.filter((tx) => tx.amount > 0);
      const totalSpending = spending.reduce((s, tx) => s + tx.amount, 0);
      const priorTotal = priorSpending.reduce((s, tx) => s + tx.amount, 0);

      setCategories(groupByCategory(spending, totalSpending));
      setPriorCategories(groupByCategory(priorSpending, priorTotal));
      setMerchants(getTopMerchants(spending, 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMonth) load(selectedMonth);
  }, [selectedMonth, load]);

  // Build MoM map from prior
  const priorMap = new Map(priorCategories.map((c) => [c.category, c.total]));

  const getMoM = (cat: CategorySummary): number | null => {
    const prior = priorMap.get(cat.category);
    if (prior === undefined || prior === 0) return null;
    return ((cat.total - prior) / prior) * 100;
  };

  const totalSpending = categories.reduce((s, c) => s + c.total, 0);
  const pieData = categories.slice(0, 10).map((c) => ({
    name: c.category,
    value: c.total,
  }));

  return (
    <div className="space-y-4">
      {loading && (
        <div className="space-y-3">
          <div className="skeleton h-64 rounded-sm" />
          <div className="skeleton h-48 rounded-sm" />
          <div className="skeleton h-48 rounded-sm" />
        </div>
      )}

      {!loading && error && (
        <div className="terminal-card p-4">
          <p className="font-mono text-xs status-red">ERROR: {error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Pie chart */}
          <div className="terminal-card">
            <div className="panel-header">
              <span className="panel-title">Spending by Category</span>
              <span className="font-mono text-xs text-text-secondary tabular-nums">
                {formatCurrency(totalSpending)} total
              </span>
            </div>
            <div className="p-4">
              {categories.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-text-secondary font-mono text-xs">
                  No spending data for this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="45%"
                      outerRadius={100}
                      innerRadius={55}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={1}
                      stroke="#0a0a0a"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name,
                      ]}
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: 10,
                        fontFamily: 'JetBrains Mono, monospace',
                        color: '#888888',
                        paddingTop: '8px',
                      }}
                      iconSize={8}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Category table */}
          <div className="terminal-card">
            <div className="panel-header">
              <span className="panel-title">Category Breakdown</span>
            </div>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Category</th>
                  <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Total</th>
                  <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">% Spend</th>
                  <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">MoM</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-text-secondary">
                      No spending data
                    </td>
                  </tr>
                ) : (
                  categories.map((cat, i) => {
                    const mom = getMoM(cat);
                    const oversized = cat.percentage > 15;
                    return (
                      <tr
                        key={cat.category}
                        className="border-b border-border/30 hover:bg-surface-2/60 transition-colors"
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="inline-block w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                            />
                            <span className="text-text-primary">{cat.category}</span>
                            {oversized && (
                              <span className="text-[9px] font-semibold px-1 py-0.5 rounded-sm border border-accent-amber/50 status-amber tracking-widest whitespace-nowrap">
                                OVERSIZED
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right status-red tabular-nums">
                          {formatCurrency(cat.total)}
                        </td>
                        <td className="px-4 py-2 text-right text-text-secondary tabular-nums">
                          {formatPercent(cat.percentage)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {mom === null ? (
                            <span className="text-text-secondary">—</span>
                          ) : (
                            <span className={mom > 0 ? 'status-red' : 'status-green'}>
                              {mom > 0 ? '+' : ''}{formatPercent(mom)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Top 10 Merchants */}
          <div className="terminal-card">
            <div className="panel-header">
              <span className="panel-title">Top 10 Merchants</span>
            </div>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase w-8">#</th>
                  <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Merchant</th>
                  <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Total Spend</th>
                  <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Category</th>
                </tr>
              </thead>
              <tbody>
                {merchants.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-text-secondary">
                      No merchant data
                    </td>
                  </tr>
                ) : (
                  merchants.map((m, i) => (
                    <tr
                      key={m.merchant}
                      className="border-b border-border/30 hover:bg-surface-2/60 transition-colors"
                    >
                      <td className="px-4 py-2 text-text-secondary tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2 text-text-primary">{m.merchant}</td>
                      <td className="px-4 py-2 text-right status-red tabular-nums">
                        {formatCurrency(m.total)}
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{m.category ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
