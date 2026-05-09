'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import { fetchTransactions, buildMonthlyPL } from '@/lib/transactions';
import { formatCurrency, formatPercent, formatMonthKey } from '@/lib/formatters';
import type { MonthlyPLData } from '@/types';

interface MonthlyPLProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}

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

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function MomIndicator({ change }: { change: number | null }) {
  if (change === null) return <Minus size={10} className="text-text-secondary inline" />;
  if (change > 0)
    return (
      <span className="inline-flex items-center gap-0.5 status-red">
        <TrendingUp size={10} />
        {formatPercent(Math.abs(change))}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 status-green">
      <TrendingDown size={10} />
      {formatPercent(Math.abs(change))}
    </span>
  );
}

export default function MonthlyPL({ selectedMonth, onMonthChange }: MonthlyPLProps) {
  const [data, setData] = useState<MonthlyPLData | null>(null);
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

      const [current, prior] = await Promise.all([
        fetchTransactions(supabase, start, end),
        fetchTransactions(supabase, priorStart, priorEnd),
      ]);

      setData(buildMonthlyPL(current, prior));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMonth) load(selectedMonth);
  }, [selectedMonth, load]);

  const atCeiling = selectedMonth >= currentMonthKey();

  return (
    <div className="space-y-4">
      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onMonthChange(shiftMonth(selectedMonth, -1))}
          className="p-1 rounded-sm hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="font-mono text-sm font-semibold tracking-widest text-text-primary uppercase min-w-[80px] text-center">
          {selectedMonth ? formatMonthKey(selectedMonth) : '—'}
        </span>
        <button
          onClick={() => !atCeiling && onMonthChange(shiftMonth(selectedMonth, 1))}
          disabled={atCeiling}
          className="p-1 rounded-sm hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-sm" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="skeleton h-64 rounded-sm" />
            <div className="skeleton h-64 rounded-sm" />
          </div>
          <div className="skeleton h-48 rounded-sm" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="terminal-card p-4">
          <p className="font-mono text-xs status-red">ERROR: {error}</p>
        </div>
      )}

      {/* Data */}
      {!loading && !error && data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="terminal-card p-4">
              <p className="data-label mb-1">Income</p>
              <p className="data-value text-xl font-bold status-green tabular-nums">
                {formatCurrency(data.income)}
              </p>
            </div>
            <div className="terminal-card p-4">
              <p className="data-label mb-1">Spending</p>
              <p className="data-value text-xl font-bold status-red tabular-nums">
                {formatCurrency(data.spending)}
              </p>
            </div>
            <div className="terminal-card p-4">
              <p className="data-label mb-1">Net</p>
              <p className={`data-value text-xl font-bold tabular-nums ${data.net >= 0 ? 'status-green' : 'status-red'}`}>
                {formatCurrency(data.net)}
              </p>
            </div>
            <div className="terminal-card p-4">
              <p className="data-label mb-1">Savings Rate</p>
              <p
                className={`data-value text-xl font-bold tabular-nums ${
                  data.savingsRate >= 20
                    ? 'status-green'
                    : data.savingsRate >= 10
                    ? 'status-amber'
                    : 'status-red'
                }`}
              >
                {formatPercent(data.savingsRate)}
              </p>
            </div>
          </div>

          {/* Category tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Income by Category */}
            <div className="terminal-card">
              <div className="panel-header">
                <span className="panel-title">Income by Category</span>
                <span className="font-mono text-xs text-text-secondary tabular-nums">
                  {formatCurrency(data.income)} total
                </span>
              </div>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Category</th>
                    <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Amount</th>
                    <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">% Income</th>
                  </tr>
                </thead>
                <tbody>
                  {data.incomeByCategory.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-center text-text-secondary">
                        No income recorded
                      </td>
                    </tr>
                  ) : (
                    data.incomeByCategory.map((cat) => (
                      <tr
                        key={cat.category}
                        className="border-b border-border/30 hover:bg-surface-2/60 transition-colors"
                      >
                        <td className="px-4 py-2 text-text-primary">{cat.category}</td>
                        <td className="px-4 py-2 text-right status-green tabular-nums">
                          {formatCurrency(cat.total)}
                        </td>
                        <td className="px-4 py-2 text-right text-text-secondary tabular-nums">
                          {formatPercent(cat.percentage)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Spending by Category */}
            <div className="terminal-card">
              <div className="panel-header">
                <span className="panel-title">Spending by Category</span>
                <span className="font-mono text-xs text-text-secondary tabular-nums">
                  {formatCurrency(data.spending)} total
                </span>
              </div>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Category</th>
                    <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Amount</th>
                    <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">% Spend</th>
                    <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">MoM</th>
                  </tr>
                </thead>
                <tbody>
                  {data.spendingByCategory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-text-secondary">
                        No spending recorded
                      </td>
                    </tr>
                  ) : (
                    data.spendingByCategory.map((cat) => (
                      <tr
                        key={cat.category}
                        className="border-b border-border/30 hover:bg-surface-2/60 transition-colors"
                      >
                        <td className="px-4 py-2 text-text-primary">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{cat.category}</span>
                            {cat.percentage > 15 && (
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
                          <MomIndicator change={cat.momChange} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
                  <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Amount</th>
                  <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Category</th>
                </tr>
              </thead>
              <tbody>
                {data.topMerchants.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-text-secondary">
                      No merchant data
                    </td>
                  </tr>
                ) : (
                  data.topMerchants.map((m, i) => (
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
