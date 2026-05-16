"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { createBrowserClient, CLIENT_ID } from "@/lib/supabase";
import { formatCurrency, daysUntil } from "@/lib/formatters";
import type { Property, Goal, NetWorthSnapshot } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashFlowData {
  income: number;
  spending: number;
  net: number;
}

interface CommandBarState {
  netWorth: number | null;
  netWorthTarget: number;
  cashFlow: CashFlowData | null;
  vacantProperties: Property[];
  vacancyBleed: number;
  nextGoal: { name: string; daysUntil: number } | null;
  lastUpdated: Date | null;
  lastTxDate: string | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TickerSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-4 border-r border-border shrink-0">
      <div className="skeleton h-2.5 w-16 rounded-sm" />
      <div className="skeleton h-4 w-24 rounded-sm" />
      <div className="skeleton h-1 w-20 rounded-full" />
    </div>
  );
}

function Divider() {
  return <div className="h-8 w-px bg-border shrink-0" aria-hidden="true" />;
}

function ProgressBar({
  value,
  max,
  color = "green",
}: {
  value: number;
  max: number;
  color?: "green" | "amber" | "red";
}) {
  const pct = Math.min(Math.max((value / max) * 100, 0), 100);
  const colorMap = {
    green: "var(--accent-green)",
    amber: "var(--accent-amber)",
    red: "var(--accent-red)",
  };
  return (
    <div className="progress-track w-28 mt-0.5">
      <div
        className="progress-fill"
        style={{
          width: `${pct}%`,
          backgroundColor: colorMap[color],
        }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CommandBar() {
  const [state, setState] = useState<CommandBarState>({
    netWorth: null,
    netWorthTarget: 2_500_000,
    cashFlow: null,
    vacantProperties: [],
    vacancyBleed: 0,
    nextGoal: null,
    lastUpdated: null,
    lastTxDate: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blink, setBlink] = useState(true);

  // Pulse the live indicator
  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 900);
    return () => clearInterval(id);
  }, []);

  const fetchData = useCallback(async () => {
    const supabase = createBrowserClient();

    try {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);

      // Fire all queries in parallel
      const [snapResult, propertiesResult, goalsResult, txResult, lastTxResult] =
        await Promise.all([
          supabase
            .schema("north_star")
            .from("net_worth_snapshots")
            .select("net_worth, snapshot_date")
            .eq("client_id", CLIENT_ID)
            .order("snapshot_date", { ascending: false })
            .limit(1)
            .single(),

          supabase
            .schema("north_star")
            .from("properties")
            .select("id, address, monthly_rent, vacancy_status, current_value, debt_balance, client_id")
            .eq("client_id", CLIENT_ID),

          supabase
            .schema("north_star")
            .from("goals")
            .select("id, goal_name, target_date, status, client_id, target_value, current_value, layer")
            .eq("client_id", CLIENT_ID)
            .order("target_date", { ascending: true }),

          supabase
            .from("transactions")
            .select("amount, name, category_primary")
            .gte("date", monthStart)
            .lte("date", monthEnd),

          supabase
            .from("transactions")
            .select("date")
            .order("date", { ascending: false })
            .limit(1)
            .single(),
        ]);

      // Net worth
      const netWorth = snapResult.data?.net_worth ?? null;

      // Properties
      const properties: Property[] = propertiesResult.data ?? [];
      const vacantProperties = properties.filter(
        (p) => p.vacancy_status === "vacant"
      );
      const vacancyBleed = vacantProperties.reduce(
        (sum, p) => sum + (p.monthly_rent ?? 0),
        0
      );

      // Goals — find nearest future deadline
      const todayStr = now.toISOString().slice(0, 10);
      const futureGoals: Goal[] = (goalsResult.data ?? []).filter(
        (g) => g.target_date >= todayStr && g.status !== "completed"
      );
      const nextGoal =
        futureGoals.length > 0
          ? {
              name: futureGoals[0].goal_name,
              daysUntil: daysUntil(futureGoals[0].target_date),
            }
          : null;

      // Cash flow — sum this month's transactions
      const txRows = txResult.data ?? [];
      let income = 0;
      let spending = 0;
      for (const tx of txRows) {
        // Skip Apple Cash transfers (internal)
        if (
          tx.name?.toLowerCase().includes("apple cash") ||
          tx.category_primary?.toLowerCase().includes("transfer")
        ) {
          continue;
        }
        if (tx.amount < 0) {
          income += Math.abs(tx.amount);
        } else {
          spending += tx.amount;
        }
      }
      const net = income - spending;

      setState({
        netWorth,
        netWorthTarget: 2_500_000,
        cashFlow: { income, spending, net },
        vacantProperties,
        vacancyBleed,
        nextGoal,
        lastUpdated: new Date(),
        lastTxDate: lastTxResult.data?.date ?? null,
      });
    } catch (err) {
      console.error("[CommandBar] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const {
    netWorth,
    netWorthTarget,
    cashFlow,
    vacantProperties,
    vacancyBleed,
    nextGoal,
    lastUpdated,
    lastTxDate,
  } = state;

  // Cash flow color logic
  const cashFlowTarget = 9_575;
  const cfNet = cashFlow?.net ?? 0;
  const cfColor =
    cfNet >= cashFlowTarget
      ? "var(--accent-green)"
      : cfNet >= cashFlowTarget * 0.8
      ? "var(--accent-amber)"
      : "var(--accent-red)";
  const cfBarColor: "green" | "amber" | "red" =
    cfNet >= cashFlowTarget
      ? "green"
      : cfNet >= cashFlowTarget * 0.8
      ? "amber"
      : "red";

  // Deadline color
  const deadlineDays = nextGoal?.daysUntil ?? 999;
  const deadlineColor =
    deadlineDays < 7
      ? "var(--accent-red)"
      : deadlineDays < 30
      ? "var(--accent-amber)"
      : "var(--accent-green)";

  return (
    <div
      className="sticky top-0 z-50 w-full border-b border-border"
      style={{ backgroundColor: "var(--background)", height: "56px" }}
    >
      <div className="flex items-center h-full px-3 gap-0 overflow-x-auto">
        {/* Brand / live indicator */}
        <div className="flex items-center gap-2 pr-4 border-r border-border shrink-0 h-full">
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              backgroundColor: "var(--accent-green)",
              opacity: blink ? 1 : 0.35,
              transition: "opacity 0.3s",
            }}
          />
          <span
            className="font-mono font-bold uppercase tracking-widest"
            style={{ fontSize: 11, color: "var(--accent-green)" }}
          >
            COTTONSTONE
          </span>
        </div>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="ml-2 p-1.5 shrink-0 text-text-secondary hover:text-accent-green transition-colors disabled:opacity-30"
          title="Refresh command bar"
          aria-label="Refresh"
        >
          <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
        </button>

        {loading ? (
          <div className="flex items-center gap-0 h-full">
            {[0, 1, 2, 3].map((i) => (
              <TickerSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-0 h-full">
            {/* ── NET WORTH ── */}
            <div className="flex flex-col justify-center gap-0.5 px-4 border-r border-border shrink-0 h-full">
              <span className="data-label" style={{ fontSize: 9 }}>
                NET WORTH
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className="mono-num font-semibold"
                  style={{ fontSize: 13, color: "var(--accent-green)" }}
                >
                  {netWorth !== null
                    ? formatCurrency(netWorth, { compact: true })
                    : "—"}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                  $2.5M TARGET
                </span>
              </div>
              <ProgressBar
                value={netWorth ?? 0}
                max={netWorthTarget}
                color="green"
              />
            </div>

            {/* ── MONTHLY CASH FLOW ── */}
            <div className="flex flex-col justify-center gap-0.5 px-4 border-r border-border shrink-0 h-full">
              <span className="data-label" style={{ fontSize: 9 }}>
                MONTHLY CASH FLOW
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className="mono-num font-semibold"
                  style={{ fontSize: 13, color: cfColor }}
                >
                  {cashFlow ? formatCurrency(cfNet) : "—"}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                  $9,575 TARGET
                </span>
              </div>
              <ProgressBar
                value={Math.max(cfNet, 0)}
                max={cashFlowTarget}
                color={cfBarColor}
              />
            </div>

            {/* ── VACANCY BLEED ── */}
            <div className="flex flex-col justify-center gap-0.5 px-4 border-r border-border shrink-0 h-full">
              <span className="data-label" style={{ fontSize: 9 }}>
                VACANCY BLEED
              </span>
              {vacantProperties.length === 0 ? (
                <span
                  className="mono-num font-semibold"
                  style={{ fontSize: 13, color: "var(--accent-green)" }}
                >
                  FULLY LEASED
                </span>
              ) : (
                <>
                  <span
                    className="mono-num font-semibold alert-blink"
                    style={{ fontSize: 13, color: "var(--accent-red)" }}
                  >
                    -{formatCurrency(vacancyBleed)}/mo
                  </span>
                  <span style={{ fontSize: 10, color: "var(--accent-red)", fontFamily: "monospace", opacity: 0.75 }}>
                    {vacantProperties.length} vacant unit
                    {vacantProperties.length !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>

            {/* ── NEXT DEADLINE ── */}
            <div className="flex flex-col justify-center gap-0.5 px-4 border-r border-border shrink-0 h-full">
              <span className="data-label" style={{ fontSize: 9 }}>
                NEXT DEADLINE
              </span>
              {nextGoal ? (
                <>
                  <span
                    className="mono-num font-semibold"
                    style={{
                      fontSize: 13,
                      color: deadlineColor,
                    }}
                  >
                    {nextGoal.daysUntil > 0 ? `${nextGoal.daysUntil} DAYS` : "TODAY"}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-secondary)",
                      fontFamily: "monospace",
                      maxWidth: 140,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={nextGoal.name}
                  >
                    {nextGoal.name}
                  </span>
                </>
              ) : (
                <span
                  className="mono-num"
                  style={{ fontSize: 13, color: "var(--text-secondary)" }}
                >
                  —
                </span>
              )}
            </div>

            {/* ── TX SYNC ── */}
            <div className="flex flex-col justify-center gap-0.5 px-4 shrink-0 h-full">
              <span className="data-label" style={{ fontSize: 9 }}>
                TX SYNC
              </span>
              {lastTxDate ? (() => {
                const daysAgo = Math.round(
                  (Date.now() - new Date(lastTxDate).getTime()) / (1000 * 60 * 60 * 24)
                );
                const stale = daysAgo > 7;
                const color = daysAgo <= 1
                  ? "var(--accent-green)"
                  : daysAgo <= 7
                  ? "var(--accent-amber)"
                  : "var(--accent-red)";
                return (
                  <>
                    <span className="mono-num font-semibold" style={{ fontSize: 13, color }}>
                      {daysAgo === 0 ? "TODAY" : `${daysAgo}d AGO`}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                      {stale ? "⚠ STALE" : lastTxDate}
                    </span>
                  </>
                );
              })() : (
                <span className="mono-num" style={{ fontSize: 13, color: "var(--text-secondary)" }}>—</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
