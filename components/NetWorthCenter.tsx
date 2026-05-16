"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { createBrowserClient, CLIENT_ID } from "@/lib/supabase";
import { formatCurrency, formatPercent, formatDate } from "@/lib/formatters";
import type {
  NetWorthSnapshot,
  Property,
  NetWorthChartPoint,
} from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvestmentAccountRow {
  id: string;
  account_name: string;
  account_type: string;
  current_balance: number;
  monthly_contribution: number;
  strategy: string | null;
  last_updated: string | null;
}

interface NetWorthCenterState {
  snapshots: NetWorthSnapshot[];
  properties: Property[];
  investments: InvestmentAccountRow[];
  error: string | null;
}

const TARGET_LINES = [
  { value: 2_500_000, label: "Y1 $2.5M" },
  { value: 5_000_000, label: "Y3 $5M" },
  { value: 10_000_000, label: "Y5 $10M" },
];

// ─── Skeleton helpers ─────────────────────────────────────────────────────────

function SkeletonBlock({
  w = "100%",
  h = 16,
}: {
  w?: string | number;
  h?: number;
}) {
  return (
    <div
      className="skeleton rounded-sm"
      style={{ width: w, height: h }}
      aria-hidden="true"
    />
  );
}

function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <SkeletonBlock h={12} />
        </td>
      ))}
    </tr>
  );
}

// ─── Custom Tooltips ──────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="terminal-card p-3"
      style={{ minWidth: 180, fontSize: 11, fontFamily: "monospace" }}
    >
      <p style={{ color: "var(--text-secondary)", marginBottom: 6 }}>{label}</p>
      {payload.map((entry) => (
        <div
          key={entry.name}
          className="flex justify-between gap-4"
          style={{ color: entry.color }}
        >
          <span className="uppercase tracking-wider" style={{ opacity: 0.8 }}>
            {entry.name}
          </span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(entry.value, { compact: true })}
          </span>
        </div>
      ))}
    </div>
  );
}

function BarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; fill: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="terminal-card p-3"
      style={{ minWidth: 180, fontSize: 11, fontFamily: "monospace" }}
    >
      <p style={{ color: "var(--text-secondary)", marginBottom: 6 }}>{label}</p>
      {payload.map((entry) => (
        <div
          key={entry.name}
          className="flex justify-between gap-4"
          style={{ color: entry.fill }}
        >
          <span className="uppercase tracking-wider" style={{ opacity: 0.8 }}>
            {entry.name}
          </span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(entry.value, { compact: true })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NetWorthCenter() {
  const [state, setState] = useState<NetWorthCenterState>({
    snapshots: [],
    properties: [],
    investments: [],
    error: null,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const supabase = createBrowserClient();

    try {
      const [snapshotsResult, propertiesResult, investmentsResult] =
        await Promise.all([
          supabase
            .schema("north_star")
            .from("net_worth_snapshots")
            .select(
              "id, snapshot_date, gross_assets, total_debt, net_worth, client_id"
            )
            .eq("client_id", CLIENT_ID)
            .order("snapshot_date", { ascending: true }),

          supabase
            .schema("north_star")
            .from("properties")
            .select(
              "id, address, current_value, debt_balance, monthly_rent, vacancy_status, client_id"
            )
            .eq("client_id", CLIENT_ID)
            .order("current_value", { ascending: false }),

          supabase
            .schema("north_star")
            .from("investment_accounts")
            .select("id, account_name, account_type, current_balance, monthly_contribution, strategy, last_updated")
            .eq("client_id", CLIENT_ID)
            .order("current_balance", { ascending: false }),
        ]);

      if (snapshotsResult.error) throw snapshotsResult.error;
      if (propertiesResult.error) throw propertiesResult.error;

      setState({
        snapshots: snapshotsResult.data ?? [],
        properties: propertiesResult.data ?? [],
        investments: (investmentsResult.data as InvestmentAccountRow[]) ?? [],
        error: null,
      });
    } catch (err) {
      console.error("[NetWorthCenter] fetch error:", err);
      setState((prev) => ({
        ...prev,
        error: "Data unavailable — check connection or RLS policies.",
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { snapshots, properties, investments, error } = state;

  // ── Derived chart data ────────────────────────────────────────────────────

  const chartData: NetWorthChartPoint[] = snapshots.map((s) => ({
    date: formatDate(s.snapshot_date, "short"),
    netWorth: s.net_worth,
    grossAssets: s.gross_assets,
    totalDebt: s.total_debt,
  }));

  // Stacked bar — derive allocation from latest known balances applied to last 3 snapshots
  const totalPropertyEquity = properties.reduce(
    (sum, p) => sum + ((p.current_value ?? 0) - (p.debt_balance ?? 0)),
    0
  );
  const totalInvestments = investments.reduce(
    (sum, a) => sum + (a.current_balance ?? 0),
    0
  );

  const last3Snapshots = snapshots.slice(-3);
  const barData = last3Snapshots.map((s) => {
    const reEquity = Math.min(totalPropertyEquity, s.net_worth);
    const invPortion = Math.min(totalInvestments, Math.max(s.net_worth - reEquity, 0));
    const cash = Math.max(s.net_worth - reEquity - invPortion, 0);
    return {
      date: formatDate(s.snapshot_date, "month-year"),
      "RE Equity": reEquity,
      Investments: invPortion,
      Cash: cash,
    };
  });

  // ── Asset table derived values ────────────────────────────────────────────

  const displayedProperties = properties.slice(0, 6);
  const totalPropertyValue = properties.reduce((sum, p) => sum + (p.current_value ?? 0), 0);
  const totalPropertyDebt = properties.reduce((sum, p) => sum + (p.debt_balance ?? 0), 0);
  const totalEquity = properties.reduce((sum, p) => sum + ((p.current_value ?? 0) - (p.debt_balance ?? 0)), 0);

  const latestSnapshot = snapshots[snapshots.length - 1];
  const grossAssets = latestSnapshot?.gross_assets ?? totalPropertyValue + totalInvestments;
  const totalDebt = latestSnapshot?.total_debt ?? totalPropertyDebt;
  const netWorth = latestSnapshot?.net_worth ?? grossAssets - totalDebt;

  const yAxisFormatter = (v: number) => formatCurrency(v, { compact: true });

  const chartBg = { backgroundColor: "#111" };

  // ── Error state ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="terminal-card p-6 text-center">
        <p className="font-mono text-sm" style={{ color: "var(--accent-red)" }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
      {/* ══════════════════════════════════════════════════════════════════════
          LEFT COLUMN — CHARTS
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-4">

        {/* Net Worth over time */}
        <div className="terminal-card">
          <div className="panel-header">
            <span className="panel-title">NET WORTH CENTER</span>
            {!loading && latestSnapshot && (
              <span
                className="font-mono text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {formatDate(latestSnapshot.snapshot_date, "medium")}
              </span>
            )}
          </div>

          {/* Gap-to-Goal callout */}
          {!loading && netWorth !== null && (() => {
            const nextMilestone = TARGET_LINES.find((t) => t.value > netWorth);
            if (!nextMilestone) return null;
            const gap = nextMilestone.value - netWorth;
            // Estimate months to milestone using avg monthly growth from snapshots
            let paceMonths: number | null = null;
            if (snapshots.length >= 2) {
              const first = snapshots[0];
              const last = snapshots[snapshots.length - 1];
              const months = Math.max(
                (new Date(last.snapshot_date).getTime() - new Date(first.snapshot_date).getTime()) /
                  (1000 * 60 * 60 * 24 * 30.44),
                1
              );
              const monthlyGrowth = (last.net_worth - first.net_worth) / months;
              if (monthlyGrowth > 0) paceMonths = gap / monthlyGrowth;
            }
            const paceDate = paceMonths
              ? (() => {
                  const d = new Date();
                  d.setMonth(d.getMonth() + Math.round(paceMonths));
                  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
                })()
              : null;
            return (
              <div
                className="mx-4 mt-3 mb-0 px-3 py-2 rounded-sm flex items-center justify-between"
                style={{ backgroundColor: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.15)" }}
              >
                <span className="font-mono text-xs" style={{ color: "var(--accent-green)" }}>
                  → {formatCurrency(gap, { compact: true })} gap to {nextMilestone.label}
                </span>
                {paceDate && (
                  <span className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                    on pace: {paceDate}
                  </span>
                )}
              </div>
            );
          })()}

          <div className="p-4" style={chartBg}>
            {loading ? (
              <div className="skeleton" style={{ height: 260 }} />
            ) : chartData.length === 0 ? (
              <div
                className="flex items-center justify-center font-mono text-xs"
                style={{ height: 260, color: "var(--text-secondary)" }}
              >
                No snapshot data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a2a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      fill: "#888",
                    }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={yAxisFormatter}
                    tick={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      fill: "#888",
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      paddingTop: 8,
                    }}
                  />

                  {TARGET_LINES.map((t) => (
                    <ReferenceLine
                      key={t.value}
                      y={t.value}
                      stroke="#3a3a3a"
                      strokeDasharray="4 4"
                      label={{
                        value: t.label,
                        fill: "#555",
                        fontSize: 9,
                        fontFamily: "monospace",
                        position: "insideTopRight",
                      }}
                    />
                  ))}

                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    name="Net Worth"
                    stroke="#00ff88"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#00ff88" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="grossAssets"
                    name="Gross Assets"
                    stroke="#ffaa00"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="5 2"
                    activeDot={{ r: 3, fill: "#ffaa00" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalDebt"
                    name="Total Debt"
                    stroke="#ff4444"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="5 2"
                    activeDot={{ r: 3, fill: "#ff4444" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Equity composition — stacked bar */}
        <div className="terminal-card">
          <div className="panel-header">
            <span className="panel-title">EQUITY COMPOSITION</span>
            <span
              className="font-mono text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              LAST 3 SNAPSHOTS
            </span>
          </div>

          <div className="p-4" style={chartBg}>
            {loading ? (
              <div className="skeleton" style={{ height: 160 }} />
            ) : barData.length === 0 ? (
              <div
                className="flex items-center justify-center font-mono text-xs"
                style={{ height: 160, color: "var(--text-secondary)" }}
              >
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={barData}
                  margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a2a"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      fill: "#888",
                    }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={yAxisFormatter}
                    tick={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      fill: "#888",
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <Tooltip content={<BarTooltip />} />
                  <Legend
                    wrapperStyle={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      paddingTop: 4,
                    }}
                  />
                  <Bar dataKey="RE Equity" stackId="nw" fill="#ffaa00" />
                  <Bar dataKey="Investments" stackId="nw" fill="#00ff88" />
                  <Bar
                    dataKey="Cash"
                    stackId="nw"
                    fill="#4488cc"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT COLUMN — TABLES
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-4">

        {/* Real estate properties */}
        <div className="terminal-card">
          <div className="panel-header">
            <span className="panel-title">ASSET BREAKDOWN</span>
            {!loading && (
              <span
                className="font-mono text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                {properties.length} PROPERTIES
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["ADDRESS", "VALUE", "DEBT", "EQUITY", "EQ%"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-mono uppercase tracking-wider"
                      style={{
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                        fontSize: 10,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRowSkeleton key={i} cols={5} />
                  ))
                ) : displayedProperties.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-4 text-center font-mono text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      No properties found
                    </td>
                  </tr>
                ) : (
                  displayedProperties.map((p) => {
                    const equity = (p.current_value ?? 0) - (p.debt_balance ?? 0);
                    const equityPct =
                      p.current_value > 0 ? (equity / p.current_value) * 100 : 0;
                    const shortAddr =
                      p.address.split(",")[0]?.trim() ?? p.address;
                    return (
                      <tr
                        key={p.id}
                        style={{ borderBottom: "1px solid var(--border)" }}
                        className="hover:bg-surface-2 transition-colors"
                      >
                        <td
                          className="px-3 py-2 font-mono"
                          style={{
                            color: "var(--text-primary)",
                            maxWidth: 130,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={p.address}
                        >
                          {shortAddr}
                        </td>
                        <td
                          className="px-3 py-2 mono-num tabular-nums"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {formatCurrency(p.current_value, { compact: true })}
                        </td>
                        <td
                          className="px-3 py-2 mono-num tabular-nums"
                          style={{ color: "var(--accent-red)" }}
                        >
                          {formatCurrency(p.debt_balance, { compact: true })}
                        </td>
                        <td
                          className="px-3 py-2 mono-num tabular-nums"
                          style={{ color: "var(--accent-green)" }}
                        >
                          {formatCurrency(equity, { compact: true })}
                        </td>
                        <td
                          className="px-3 py-2 mono-num tabular-nums"
                          style={{
                            color:
                              equityPct >= 40
                                ? "var(--accent-green)"
                                : equityPct >= 20
                                ? "var(--accent-amber)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {formatPercent(equityPct)}
                        </td>
                      </tr>
                    );
                  })
                )}

                {/* Property totals */}
                {!loading && displayedProperties.length > 0 && (
                  <tr
                    style={{
                      borderTop: "2px solid var(--border)",
                      backgroundColor: "rgba(0,255,136,0.04)",
                    }}
                  >
                    <td
                      className="px-3 py-2 font-mono font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-secondary)", fontSize: 10 }}
                    >
                      TOTAL RE
                    </td>
                    <td
                      className="px-3 py-2 mono-num font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatCurrency(totalPropertyValue, { compact: true })}
                    </td>
                    <td
                      className="px-3 py-2 mono-num font-semibold"
                      style={{ color: "var(--accent-red)" }}
                    >
                      {formatCurrency(totalPropertyDebt, { compact: true })}
                    </td>
                    <td
                      className="px-3 py-2 mono-num font-semibold"
                      style={{ color: "var(--accent-green)" }}
                    >
                      {formatCurrency(totalEquity, { compact: true })}
                    </td>
                    <td
                      className="px-3 py-2 mono-num font-semibold"
                      style={{ color: "var(--accent-green)" }}
                    >
                      {totalPropertyValue > 0
                        ? formatPercent(
                            (totalEquity / totalPropertyValue) * 100
                          )
                        : "—"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Investment accounts */}
        <div className="terminal-card">
          <div className="panel-header">
            <span className="panel-title">INVESTMENT ACCOUNTS</span>
            {!loading && investments.length > 0 && (() => {
              const dates = investments
                .filter((a) => a.last_updated)
                .map((a) => a.last_updated as string)
                .sort();
              const oldest = dates[0];
              if (!oldest) return null;
              const daysAgo = Math.round(
                (Date.now() - new Date(oldest).getTime()) / (1000 * 60 * 60 * 24)
              );
              return (
                <span className="font-mono text-xs" style={{ color: daysAgo > 14 ? "var(--accent-amber)" : "var(--text-secondary)" }}>
                  updated {daysAgo}d ago
                </span>
              );
            })()}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["ACCOUNT", "TYPE", "BALANCE", "+/MO"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-mono uppercase tracking-wider"
                      style={{
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                        fontSize: 10,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRowSkeleton key={i} cols={4} />
                    ))
                  : investments.map((account) => (
                      <tr
                        key={account.id}
                        style={{ borderBottom: "1px solid var(--border)" }}
                        className="hover:bg-surface-2 transition-colors"
                      >
                        <td
                          className="px-3 py-2 font-mono"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {account.account_name}
                        </td>
                        <td
                          className="px-3 py-2 font-mono uppercase"
                          style={{ color: "var(--text-secondary)", fontSize: 10 }}
                        >
                          {account.account_type}
                        </td>
                        <td
                          className="px-3 py-2 mono-num tabular-nums font-semibold"
                          style={{
                            color: account.current_balance > 0
                              ? "var(--accent-green)"
                              : "var(--text-secondary)",
                          }}
                        >
                          {formatCurrency(account.current_balance)}
                        </td>
                        <td
                          className="px-3 py-2 mono-num tabular-nums"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {account.monthly_contribution > 0
                            ? `+${formatCurrency(account.monthly_contribution)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Grand totals */}
        <div className="terminal-card">
          <table className="w-full" style={{ fontSize: 12 }}>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={2} />
                ))
              ) : (
                <>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <td
                      className="px-4 py-3 font-mono uppercase tracking-wider"
                      style={{ color: "var(--text-secondary)", fontSize: 10 }}
                    >
                      TOTAL GROSS ASSETS
                    </td>
                    <td
                      className="px-4 py-3 mono-num font-bold text-right"
                      style={{ color: "var(--accent-amber)", fontSize: 14 }}
                    >
                      {formatCurrency(grossAssets, { compact: true })}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <td
                      className="px-4 py-3 font-mono uppercase tracking-wider"
                      style={{ color: "var(--text-secondary)", fontSize: 10 }}
                    >
                      TOTAL DEBT
                    </td>
                    <td
                      className="px-4 py-3 mono-num font-bold text-right"
                      style={{ color: "var(--accent-red)", fontSize: 14 }}
                    >
                      -{formatCurrency(totalDebt, { compact: true })}
                    </td>
                  </tr>
                  <tr
                    style={{
                      backgroundColor: "rgba(0,255,136,0.06)",
                    }}
                  >
                    <td
                      className="px-4 py-3 font-mono font-bold uppercase tracking-widest"
                      style={{ color: "var(--accent-green)", fontSize: 11 }}
                    >
                      NET WORTH
                    </td>
                    <td
                      className="px-4 py-3 mono-num font-bold text-right"
                      style={{ color: "var(--accent-green)", fontSize: 16 }}
                    >
                      {formatCurrency(netWorth, { compact: true })}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
