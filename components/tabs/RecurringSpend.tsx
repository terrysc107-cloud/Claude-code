'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import type { RecurringItem, RecurringSpendResponse } from '@/types';

// Merchants that warrant amber flagging
const FLAGGED_KEYWORDS = ['state farm', 'ny life', 'pgw', 'pfcu', 'scott advisory'];

function isFlagged(merchant: string): boolean {
  const lower = merchant.toLowerCase();
  return FLAGGED_KEYWORDS.some((kw) => lower.includes(kw));
}

function frequencyLabel(months: number): string {
  if (months >= 10) return 'MONTHLY';
  if (months >= 5) return 'BIMONTHLY';
  if (months >= 3) return 'QUARTERLY';
  return 'RECURRING';
}

/**
 * Flag merchants as potential duplicates: same category, 2+ entries,
 * amounts within 20% of each other.
 */
function detectDuplicates(items: RecurringItem[]): Set<string> {
  const duplicates = new Set<string>();
  const byCat = new Map<string, RecurringItem[]>();

  items.forEach((item) => {
    const cat = item.category ?? 'Uncategorized';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(item);
  });

  byCat.forEach((group) => {
    if (group.length < 2) return;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i].averageAmount;
        const b = group[j].averageAmount;
        if (a === 0 || b === 0) continue;
        const ratio = Math.min(a, b) / Math.max(a, b);
        if (ratio >= 0.8) {
          duplicates.add(group[i].merchant);
          duplicates.add(group[j].merchant);
        }
      }
    }
  });

  return duplicates;
}

export function RecurringSpend() {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/recurring-spend');
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json() as RecurringSpendResponse;
        // Sort by annual cost DESC
        setItems([...json.items].sort((a, b) => b.annualCost - a.annualCost));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load recurring spend');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalAnnual = items.reduce((s, item) => s + item.annualCost, 0);
  const totalMonthly = totalAnnual / 12;
  const duplicates = detectDuplicates(items);

  return (
    <div className="space-y-4">
      {/* Panel */}
      <div className="terminal-card">
        <div className="panel-header">
          <span className="panel-title">Recurring Spend Detector</span>
          {!loading && !error && items.length > 0 && (
            <div className="flex items-center gap-4 font-mono text-xs">
              <span className="text-text-secondary tabular-nums">
                {formatCurrency(totalMonthly)}<span className="text-text-secondary/50">/mo</span>
              </span>
              <span className="status-amber font-semibold tabular-nums">
                {formatCurrency(totalAnnual)}<span className="text-text-secondary/50">/yr</span>
              </span>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="p-4 space-y-2">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="skeleton h-9 rounded-sm" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="p-4">
            <p className="font-mono text-xs status-red">ERROR: {error}</p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Merchant</th>
                  <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Frequency</th>
                  <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Avg/Month</th>
                  <th className="text-right px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Annual Cost</th>
                  <th className="text-left px-4 py-2 text-text-secondary font-normal tracking-wider uppercase">Category</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-text-secondary">
                      No recurring patterns detected — need 2+ months of transaction data
                    </td>
                  </tr>
                ) : (
                  <>
                    {items.map((item) => {
                      const flagged = isFlagged(item.merchant);
                      const isDuplicate = duplicates.has(item.merchant);
                      return (
                        <tr
                          key={item.merchant}
                          className="border-b border-border/30 hover:bg-surface-2/60 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {flagged && (
                                <AlertTriangle
                                  size={10}
                                  className="status-amber shrink-0"
                                />
                              )}
                              <span
                                className={
                                  flagged
                                    ? 'status-amber font-semibold'
                                    : 'text-text-primary'
                                }
                              >
                                {item.merchant}
                              </span>
                              {isDuplicate && (
                                <span className="text-[9px] font-semibold px-1 py-0.5 rounded-sm border border-accent-amber/50 status-amber tracking-widest whitespace-nowrap">
                                  POTENTIAL DUPLICATE
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-text-secondary">
                              {frequencyLabel(item.frequency)}
                            </span>
                            <span className="ml-1.5 text-text-secondary/50">
                              ({item.frequency}mo)
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-text-primary">
                            {formatCurrency(item.averageAmount)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums status-red font-semibold">
                            {formatCurrency(item.annualCost)}
                          </td>
                          <td className="px-4 py-2.5 text-text-secondary">
                            {item.category ?? '—'}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Summary footer */}
                    <tr className="border-t-2 border-border bg-surface-2/50">
                      <td className="px-4 py-2.5 font-bold text-text-primary" colSpan={2}>
                        TOTAL RECURRING — {items.length} subscriptions
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-primary font-semibold">
                        {formatCurrency(totalMonthly)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums status-amber font-bold">
                        {formatCurrency(totalAnnual)}
                      </td>
                      <td className="px-4 py-2.5" />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      {!loading && !error && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 px-1">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-text-secondary">
            <AlertTriangle size={9} className="status-amber" />
            <span>Amber = known high-cost items (State Farm, NY Life, PGW, PFCU, Scott Advisory)</span>
          </div>
          {duplicates.size > 0 && (
            <div className="font-mono text-[10px] text-text-secondary">
              <span className="text-[9px] font-semibold px-1 py-0.5 rounded-sm border border-accent-amber/50 status-amber tracking-widest mr-1">
                POTENTIAL DUPLICATE
              </span>
              = same category, similar amounts
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RecurringSpend;
