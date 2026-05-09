"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatMonthKey } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { RecurringItem } from "@/types";

export function RecurringSpend() {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/recurring-spend");
        if (!res.ok) throw new Error("API error");
        const data = await res.json() as { items: RecurringItem[] };
        setItems(data.items);
      } catch (e) {
        setError("Failed to load recurring spend data");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-sm font-mono text-text-secondary p-4">Data unavailable</div>;
  }

  const totalAnnual = items.reduce((sum, i) => sum + i.annualCost, 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface-2 border border-border rounded-sm p-3">
          <div className="text-xs font-mono text-text-secondary uppercase tracking-wider">
            Recurring Items
          </div>
          <div className="text-xl font-mono font-bold text-accent-amber">
            {items.length}
          </div>
        </div>
        <div className="bg-surface-2 border border-border rounded-sm p-3">
          <div className="text-xs font-mono text-text-secondary uppercase tracking-wider">
            Monthly Run Rate
          </div>
          <div className="text-xl font-mono font-bold text-accent-red">
            {formatCurrency(totalAnnual / 12)}
          </div>
        </div>
        <div className="bg-surface-2 border border-border rounded-sm p-3">
          <div className="text-xs font-mono text-text-secondary uppercase tracking-wider">
            Annual Cost
          </div>
          <div className="text-xl font-mono font-bold text-accent-red">
            {formatCurrency(totalAnnual, { compact: true })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div>
        <div className="grid grid-cols-12 gap-2 py-1 border-b border-border">
          <span className="col-span-4 text-xs font-mono text-text-secondary uppercase tracking-wider">
            Merchant
          </span>
          <span className="col-span-2 text-xs font-mono text-text-secondary uppercase tracking-wider text-center">
            Freq
          </span>
          <span className="col-span-2 text-xs font-mono text-text-secondary uppercase tracking-wider text-right">
            Avg/Mo
          </span>
          <span className="col-span-2 text-xs font-mono text-text-secondary uppercase tracking-wider text-right">
            Annual
          </span>
          <span className="col-span-2 text-xs font-mono text-text-secondary uppercase tracking-wider">
            Category
          </span>
        </div>

        <div className="space-y-0.5">
          {items.map((item) => (
            <div
              key={item.merchant}
              className="grid grid-cols-12 gap-2 py-2 border-b border-border hover:bg-surface-2 transition-colors"
            >
              <div className="col-span-4 flex items-center">
                <span className="text-xs font-mono text-text-primary truncate">
                  {item.merchant}
                </span>
              </div>
              <div className="col-span-2 flex items-center justify-center">
                <Badge variant={item.frequency >= 3 ? "amber" : "outline"}>
                  {item.frequency}x
                </Badge>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-sm font-mono tabular-nums text-text-primary">
                  {formatCurrency(item.averageAmount)}
                </span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-sm font-mono tabular-nums font-semibold text-accent-red">
                  {formatCurrency(item.annualCost)}
                </span>
              </div>
              <div className="col-span-2 flex items-center">
                <span className="text-xs font-mono text-text-secondary truncate">
                  {item.category ?? "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Known fixed costs note */}
      <div className="bg-surface-2 border border-border rounded-sm p-3">
        <div className="text-xs font-mono text-text-secondary uppercase tracking-wider mb-2">
          Known Fixed Costs (Reference)
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {[
            { name: "State Farm", amount: 223 },
            { name: "NY Life", amount: 77 },
            { name: "PFCU Payment", amount: 1124.88 },
            { name: "Scott Advisory", amount: 2000 },
          ].map((item) => (
            <div key={item.name} className="flex justify-between">
              <span className="text-xs font-mono text-text-secondary">{item.name}</span>
              <span className="text-xs font-mono text-text-primary tabular-nums">
                {formatCurrency(item.amount)}/mo
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
