"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { createBrowserClient } from "@/lib/supabase";
import { fetchTransactions, groupByCategory, getTopMerchants } from "@/lib/transactions";
import { formatCurrency, formatPercent, getLastNMonths } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { CategorySummary, MerchantSummary } from "@/types";

const COLORS = [
  "#00ff88", "#00cc6a", "#ffaa00", "#ff8800", "#ff4444",
  "#aa44ff", "#4488ff", "#44ffff", "#88ff44", "#ff44aa",
];

export function SpendCategories() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();

    async function load() {
      try {
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
          .toISOString()
          .slice(0, 10);

        const txs = await fetchTransactions(supabase, monthStart, monthEnd);
        const spending = txs.filter((tx) => tx.amount > 0);
        const totalSpending = spending.reduce((sum, tx) => sum + tx.amount, 0);

        setCategories(groupByCategory(spending, totalSpending));
        setMerchants(getTopMerchants(spending, 10));
      } catch (e) {
        setError("Failed to load spend data");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="text-sm font-mono text-text-secondary p-4">Data unavailable</div>;
  }

  const totalSpending = categories.reduce((sum, c) => sum + c.total, 0);

  return (
    <div className="space-y-6">
      {/* Donut chart */}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categories.slice(0, 8)}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="total"
              nameKey="category"
            >
              {categories.slice(0, 8).map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#111",
                border: "1px solid #2a2a2a",
                fontFamily: "JetBrains Mono",
                fontSize: 11,
                color: "#e8e8e8",
              }}
              formatter={(v: number, name: string) => [
                formatCurrency(v),
                name,
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "#888" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Category table */}
      <div>
        <div className="text-xs font-mono text-text-secondary uppercase tracking-widest mb-2">
          Category Breakdown — Total: {formatCurrency(totalSpending)}
        </div>
        <div className="space-y-1">
          {categories.map((cat, i) => (
            <div
              key={cat.category}
              className="flex justify-between items-center py-1 border-b border-border"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-xs font-mono text-text-primary">
                  {cat.category}
                </span>
                {cat.percentage > 15 && (
                  <Badge variant="amber">OVERSIZED</Badge>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono text-text-secondary">
                  {formatPercent(cat.percentage)}
                </span>
                <span className="text-sm font-mono font-semibold text-text-primary tabular-nums w-24 text-right">
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
          Top 10 Merchants
        </div>
        <div className="space-y-1">
          {merchants.map((m, i) => (
            <div
              key={m.merchant}
              className="flex justify-between items-center py-1 border-b border-border"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-text-secondary w-4">{i + 1}</span>
                <span className="text-xs font-mono text-text-primary">{m.merchant}</span>
              </div>
              <span className="text-sm font-mono font-semibold tabular-nums text-text-primary">
                {formatCurrency(m.total)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
