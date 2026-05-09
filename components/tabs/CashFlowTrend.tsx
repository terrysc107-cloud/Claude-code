"use client";

import { useEffect, useState } from "react";
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
} from "recharts";
import { createBrowserClient } from "@/lib/supabase";
import {
  fetchLastNMonthsTransactions,
  buildCashFlowTrend,
} from "@/lib/transactions";
import { formatCurrency, formatPercent, formatMonthKey } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { CashFlowMonth } from "@/types";

export function CashFlowTrend() {
  const [data, setData] = useState<CashFlowMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();

    async function load() {
      try {
        const txs = await fetchLastNMonthsTransactions(supabase, 6);
        const trend = buildCashFlowTrend(txs);
        setData(trend);
      } catch (e) {
        setError("Failed to load cash flow data");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (error || data.length === 0) {
    return (
      <div className="text-sm font-mono text-text-secondary p-4">
        {error ?? "No cash flow data available"}
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    month: formatMonthKey(d.month),
  }));

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#888" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="dollars"
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#888" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
              width={50}
            />
            <YAxis
              yAxisId="percent"
              orientation="right"
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fill: "#888" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "#111",
                border: "1px solid #2a2a2a",
                fontFamily: "JetBrains Mono",
                fontSize: 11,
                color: "#e8e8e8",
              }}
              formatter={(v: number, name: string) => {
                if (name === "Savings Rate") return [formatPercent(v), name];
                return [formatCurrency(v), name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "#888" }}
            />
            {/* 20% savings rate threshold */}
            <ReferenceLine
              yAxisId="percent"
              y={20}
              stroke="#ffaa00"
              strokeDasharray="4 2"
              label={{
                value: "20% target",
                fontSize: 9,
                fontFamily: "JetBrains Mono",
                fill: "#ffaa00",
              }}
            />
            <Bar yAxisId="dollars" dataKey="income" name="Income" fill="#00ff88" opacity={0.7} />
            <Bar yAxisId="dollars" dataKey="spending" name="Spending" fill="#ff4444" opacity={0.7} />
            <Bar yAxisId="dollars" dataKey="net" name="Net" fill="#4488ff" opacity={0.7} />
            <Line
              yAxisId="percent"
              type="monotone"
              dataKey="savingsRate"
              name="Savings Rate"
              stroke="#ffaa00"
              strokeWidth={2}
              dot={{ r: 3, fill: "#ffaa00" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Month summary table */}
      <div>
        <div className="text-xs font-mono text-text-secondary uppercase tracking-widest mb-2">
          6-Month Summary
        </div>
        <div className="space-y-1">
          {data
            .slice()
            .reverse()
            .map((d) => (
              <div
                key={d.month}
                className="flex justify-between items-center py-1.5 border-b border-border"
              >
                <span className="text-xs font-mono text-text-secondary w-16">
                  {formatMonthKey(d.month)}
                </span>
                <span className="text-xs font-mono text-accent-green tabular-nums w-24">
                  +{formatCurrency(d.income)}
                </span>
                <span className="text-xs font-mono text-accent-red tabular-nums w-24">
                  -{formatCurrency(d.spending)}
                </span>
                <span
                  className={`text-xs font-mono tabular-nums w-24 ${
                    d.net >= 0 ? "text-accent-green" : "text-accent-red"
                  }`}
                >
                  {d.net >= 0 ? "+" : ""}
                  {formatCurrency(d.net)}
                </span>
                <span
                  className={`text-xs font-mono tabular-nums w-16 text-right ${
                    d.savingsRate >= 20 ? "text-accent-green" : "text-accent-amber"
                  }`}
                >
                  {formatPercent(d.savingsRate)}
                  {d.savingsRate < 20 && (
                    <span className="text-accent-red ml-1">!</span>
                  )}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
