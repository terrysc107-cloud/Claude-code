"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { createBrowserClient } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import type { NetWorthSnapshot, NetWorthChartPoint } from "@/types";

const TARGETS = [
  { label: "Y1 Target", value: 2_500_000 },
  { label: "Y3 Target", value: 5_000_000 },
  { label: "Y5 Target", value: 10_000_000 },
];

const CLIENT_ID = "a1000000-0000-0000-0000-000000000001";

interface AssetRow {
  name: string;
  value: number;
  type: "real_estate" | "investment" | "cash" | "other";
}

export function NetWorthCenter() {
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();

    async function load() {
      try {
        const { data, error: err } = await supabase
          .schema("north_star")
          .from("net_worth_snapshots")
          .select("*")
          .eq("client_id", CLIENT_ID)
          .order("snapshot_date", { ascending: true })
          .limit(24);

        if (err) throw err;
        setSnapshots((data as NetWorthSnapshot[]) ?? []);
      } catch (e) {
        setError("Failed to load net worth data");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const latest = snapshots[snapshots.length - 1];
  const y1Target = 2_500_000;
  const y1Progress = latest ? (latest.net_worth / y1Target) * 100 : 0;

  const chartData: NetWorthChartPoint[] = snapshots.map((s) => ({
    date: formatDate(s.snapshot_date, "month-year"),
    netWorth: s.net_worth,
    grossAssets: s.gross_assets,
    totalDebt: s.total_debt,
  }));

  if (loading) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Net Worth</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !latest) {
    return (
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Net Worth</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary font-mono text-sm">
            {error ?? "No data available"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Net Worth Center</CardTitle>
        <div className="text-xs font-mono text-text-secondary">
          as of {formatDate(latest.snapshot_date)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Chart + Gauge */}
          <div className="space-y-4">
            {/* Hero number */}
            <div>
              <div className="text-3xl font-mono font-bold tabular-nums text-accent-green">
                {formatCurrency(latest.net_worth)}
              </div>
              <div className="text-xs font-mono text-text-secondary mt-1">
                Gross Assets: {formatCurrency(latest.gross_assets)} &nbsp;|&nbsp;
                Total Debt: {formatCurrency(latest.total_debt)}
              </div>
            </div>

            {/* Y1 Progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono text-text-secondary">
                <span>Y1 Target: {formatCurrency(y1Target, { compact: true })}</span>
                <span className="text-accent-green">{y1Progress.toFixed(1)}%</span>
              </div>
              <Progress value={y1Progress} max={100} color={y1Progress >= 100 ? "green" : y1Progress >= 70 ? "amber" : "red"} />
            </div>

            {/* Target milestones */}
            <div className="grid grid-cols-3 gap-2">
              {TARGETS.map((t) => {
                const pct = latest ? (latest.net_worth / t.value) * 100 : 0;
                return (
                  <div key={t.label} className="bg-surface-2 rounded-sm p-2 border border-border">
                    <div className="text-xs font-mono text-text-secondary">{t.label}</div>
                    <div className="text-xs font-mono font-semibold text-accent-amber">
                      {formatCurrency(t.value, { compact: true })}
                    </div>
                    <div className="text-xs font-mono text-text-secondary mt-1">
                      {pct.toFixed(0)}% there
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Line chart */}
            {chartData.length > 1 && (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fontFamily: "JetBrains Mono", fill: "#888" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fontFamily: "JetBrains Mono", fill: "#888" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111",
                        border: "1px solid #2a2a2a",
                        fontFamily: "JetBrains Mono",
                        fontSize: 11,
                        color: "#e8e8e8",
                      }}
                      formatter={(v: number) => [formatCurrency(v), ""]}
                    />
                    <Line
                      type="monotone"
                      dataKey="netWorth"
                      name="Net Worth"
                      stroke="#00ff88"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Right: Stacked bar + asset table */}
          <div className="space-y-4">
            {/* Stacked bar: assets vs debt */}
            {chartData.length > 1 && (
              <div className="h-40">
                <div className="text-xs font-mono text-text-secondary mb-1">Assets vs Debt Trend</div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.slice(-6)}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fontFamily: "JetBrains Mono", fill: "#888" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fontFamily: "JetBrains Mono", fill: "#888" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111",
                        border: "1px solid #2a2a2a",
                        fontFamily: "JetBrains Mono",
                        fontSize: 11,
                        color: "#e8e8e8",
                      }}
                      formatter={(v: number) => [formatCurrency(v), ""]}
                    />
                    <Bar dataKey="grossAssets" name="Gross Assets" fill="#00ff88" opacity={0.7} />
                    <Bar dataKey="totalDebt" name="Total Debt" fill="#ff4444" opacity={0.7} />
                    <Legend
                      wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "#888" }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Asset breakdown */}
            <div className="space-y-2">
              <div className="text-xs font-mono text-text-secondary uppercase tracking-widest">
                Position Summary
              </div>
              <div className="space-y-1">
                {[
                  {
                    label: "Gross Assets",
                    value: latest.gross_assets,
                    color: "text-accent-green",
                  },
                  {
                    label: "Total Debt",
                    value: latest.total_debt,
                    color: "text-accent-red",
                  },
                  {
                    label: "Net Worth",
                    value: latest.net_worth,
                    color: "text-accent-amber",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between items-center py-1 border-b border-border"
                  >
                    <span className="text-xs font-mono text-text-secondary">
                      {row.label}
                    </span>
                    <span className={`text-sm font-mono font-semibold tabular-nums ${row.color}`}>
                      {formatCurrency(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
