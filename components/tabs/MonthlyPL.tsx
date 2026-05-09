"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  fetchTransactions,
  buildMonthlyPL,
  groupByMonth,
} from "@/lib/transactions";
import {
  formatCurrency,
  formatPercent,
  getLastNMonths,
  formatMonthKey,
} from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { MonthlyPLData, Transaction } from "@/types";

export function MonthlyPL() {
  const [months, setMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [plData, setPlData] = useState<MonthlyPLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const last6 = getLastNMonths(6);
    setMonths(last6);
    setSelectedMonth(last6[0]);
  }, []);

  useEffect(() => {
    if (!selectedMonth) return;

    const supabase = createBrowserClient();
    setLoading(true);

    async function load() {
      try {
        const [year, month] = selectedMonth.split("-");
        const startDate = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${year}-${month}-${lastDay}`;

        // Prior month
        const priorDate = new Date(parseInt(year), parseInt(month) - 2, 1);
        const priorYear = priorDate.getFullYear();
        const priorMonth = String(priorDate.getMonth() + 1).padStart(2, "0");
        const priorLastDay = new Date(priorYear, priorDate.getMonth() + 1, 0).getDate();

        const [current, prior] = await Promise.all([
          fetchTransactions(supabase, startDate, endDate),
          fetchTransactions(
            supabase,
            `${priorYear}-${priorMonth}-01`,
            `${priorYear}-${priorMonth}-${priorLastDay}`
          ),
        ]);

        setPlData(buildMonthlyPL(current, prior));
      } catch (e) {
        setError("Failed to load transaction data");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [selectedMonth]);

  if (error) {
    return (
      <div className="p-4 text-sm font-mono text-text-secondary">
        Data unavailable: {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="flex gap-2 flex-wrap">
        {months.map((m) => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            className={`text-xs font-mono px-3 py-1 rounded-sm border transition-all ${
              selectedMonth === m
                ? "border-accent-green text-accent-green bg-accent-green/10"
                : "border-border text-text-secondary hover:border-accent-green/50"
            }`}
          >
            {formatMonthKey(m)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : plData ? (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Income",
                value: formatCurrency(plData.income),
                color: "text-accent-green",
              },
              {
                label: "Spending",
                value: formatCurrency(plData.spending),
                color: "text-accent-red",
              },
              {
                label: "Net",
                value: formatCurrency(plData.net),
                color: plData.net >= 0 ? "text-accent-green" : "text-accent-red",
              },
              {
                label: "Savings Rate",
                value: formatPercent(plData.savingsRate),
                color: plData.savingsRate >= 20 ? "text-accent-green" : "text-accent-amber",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-surface-2 border border-border rounded-sm p-3"
              >
                <div className="text-xs font-mono text-text-secondary uppercase tracking-wider">
                  {stat.label}
                </div>
                <div className={`text-lg font-mono font-bold tabular-nums ${stat.color}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Income breakdown */}
          <div>
            <div className="text-xs font-mono text-text-secondary uppercase tracking-widest mb-2">
              Income by Category
            </div>
            <div className="space-y-1">
              {plData.incomeByCategory.map((cat) => (
                <div
                  key={cat.category}
                  className="flex justify-between items-center py-1 border-b border-border"
                >
                  <span className="text-xs font-mono text-text-primary">
                    {cat.category}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-text-secondary">
                      {formatPercent(cat.percentage)}
                    </span>
                    <span className="text-sm font-mono font-semibold text-accent-green tabular-nums">
                      {formatCurrency(cat.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Spending breakdown */}
          <div>
            <div className="text-xs font-mono text-text-secondary uppercase tracking-widest mb-2">
              Spending by Category
            </div>
            <div className="space-y-1">
              {plData.spendingByCategory.map((cat) => (
                <div
                  key={cat.category}
                  className="flex justify-between items-center py-1 border-b border-border"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-text-primary">
                      {cat.category}
                    </span>
                    {cat.percentage > 15 && (
                      <Badge variant="amber">OVERSIZED</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-text-secondary">
                      {formatPercent(cat.percentage)}
                    </span>
                    {cat.momChange !== null && (
                      <span
                        className={`text-xs font-mono ${
                          cat.momChange > 10
                            ? "text-accent-red"
                            : cat.momChange < -10
                            ? "text-accent-green"
                            : "text-text-secondary"
                        }`}
                      >
                        {cat.momChange > 0 ? "+" : ""}
                        {cat.momChange.toFixed(0)}% MoM
                      </span>
                    )}
                    <span className="text-sm font-mono font-semibold text-text-primary tabular-nums">
                      {formatCurrency(cat.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top merchants */}
          <div>
            <div className="text-xs font-mono text-text-secondary uppercase tracking-widest mb-2">
              Top Merchants
            </div>
            <div className="space-y-1">
              {plData.topMerchants.map((m, i) => (
                <div
                  key={m.merchant}
                  className="flex justify-between items-center py-1 border-b border-border"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-text-secondary w-4">
                      {i + 1}
                    </span>
                    <span className="text-xs font-mono text-text-primary">
                      {m.merchant}
                    </span>
                  </div>
                  <span className="text-sm font-mono font-semibold text-text-primary tabular-nums">
                    {formatCurrency(m.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
