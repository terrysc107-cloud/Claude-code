'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { createBrowserClient, CLIENT_ID } from '@/lib/supabase';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import type { Property } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STABILIZED_TARGET_MO = 9_575;
const MORTGAGE_RATE_ANNUAL = 0.065;
const MORTGAGE_TERM_MONTHS = 360; // 30yr

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Rough monthly mortgage payment estimate using standard amortisation formula.
 * P * [r(1+r)^n] / [(1+r)^n - 1]
 */
function estimateMonthlyPayment(debt: number): number {
  if (debt <= 0) return 0;
  const r = MORTGAGE_RATE_ANNUAL / 12;
  const n = MORTGAGE_TERM_MONTHS;
  return (debt * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
}

function estimateNetCF(property: Property): number {
  const rent = property.monthly_rent ?? 0;
  const payment = estimateMonthlyPayment(property.debt_balance);
  return rent - payment;
}

function propertyEquity(property: Property): number {
  return (property.current_value ?? 0) - (property.debt_balance ?? 0);
}

function equityPct(property: Property): number {
  if ((property.current_value ?? 0) <= 0) return 0;
  return (propertyEquity(property) / property.current_value) * 100;
}

function isVacant(status: string): boolean {
  const s = status.toLowerCase();
  return s !== 'occupied' && s !== 'leased';
}

function statusLabel(status: string): string {
  return status.toUpperCase();
}

function shortAddress(address: string): string {
  // Truncate long addresses so the table stays readable
  return address.length > 32 ? address.slice(0, 30) + '…' : address;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="terminal-card p-4 space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="skeleton h-8 w-full" />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="terminal-card p-6 flex flex-col items-center gap-3">
      <AlertTriangle className="text-accent-red" size={28} />
      <p className="text-sm font-mono text-accent-red">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-border rounded-sm hover:border-accent-green hover:text-accent-green transition-colors"
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CashFlowTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] px-3 py-2 rounded-sm text-xs font-mono">
      <p className="text-[#888] mb-1">{label}</p>
      <p className={val >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}>
        {formatCurrency(val)} / mo
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface RentCollectionEntry {
  month_period: string;
  amount: number;
}

export default function RealEstateCommand() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [rentCollected, setRentCollected] = useState<number | null>(null);
  const [rentMonth, setRentMonth] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const now = new Date();
      const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const prevPeriod = (() => {
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })();

      const [propResult, rentResult] = await Promise.all([
        supabase
          .schema('north_star')
          .from('properties')
          .select('*')
          .eq('client_id', CLIENT_ID),
        supabase
          .schema('north_star')
          .from('income_streams')
          .select('month_period, amount')
          .eq('client_id', CLIENT_ID)
          .eq('source', 'Real Estate')
          .in('month_period', [currentPeriod, prevPeriod])
          .order('month_period', { ascending: false })
          .limit(1),
      ]);

      if (propResult.error) throw new Error(propResult.error.message);
      setProperties((propResult.data as Property[]) ?? []);

      const rentEntry = (rentResult.data as RentCollectionEntry[] | null)?.[0];
      if (rentEntry) {
        setRentCollected(rentEntry.amount);
        setRentMonth(rentEntry.month_period);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load properties');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={fetchProperties} />;
  if (properties.length === 0) {
    return (
      <div className="terminal-card p-6 text-center">
        <p className="text-xs font-mono text-[#888] uppercase tracking-widest">
          No properties found
        </p>
      </div>
    );
  }

  // Derived data
  const withCF = properties.map((p) => ({ ...p, netCF: estimateNetCF(p) }));
  const vacantProperties = withCF.filter((p) => isVacant(p.vacancy_status));
  const totalMonthlyBleed = vacantProperties.reduce(
    (sum, p) => sum + (p.monthly_rent ?? 0),
    0
  );

  const totals = {
    value: withCF.reduce((s, p) => s + (p.current_value ?? 0), 0),
    debt: withCF.reduce((s, p) => s + (p.debt_balance ?? 0), 0),
    equity: withCF.reduce((s, p) => s + propertyEquity(p), 0),
    rent: withCF.reduce((s, p) => s + (p.monthly_rent ?? 0), 0),
    netCF: withCF.reduce((s, p) => s + p.netCF, 0),
  };
  const totalEquityPct =
    totals.value > 0 ? (totals.equity / totals.value) * 100 : 0;

  const chartData = withCF.map((p) => ({
    name: shortAddress(p.address),
    netCF: Math.round(p.netCF),
  }));

  const stabilizationProgress = Math.min(
    (totals.netCF / STABILIZED_TARGET_MO) * 100,
    100
  );
  const isStabilized = totals.netCF >= STABILIZED_TARGET_MO;
  const gapToTarget = STABILIZED_TARGET_MO - totals.netCF;
  const draggingProperties = withCF
    .filter((p) => p.netCF < 0)
    .sort((a, b) => a.netCF - b.netCF);
  const cfPositiveCount = withCF.filter((p) => p.netCF >= 0).length;

  // Rent collection: expected = sum of occupied properties' monthly_rent
  const occupiedMonthlyRent = withCF
    .filter((p) => !isVacant(p.vacancy_status))
    .reduce((s, p) => s + (p.monthly_rent ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* ── Section A — Vacancy Monitor ───────────────────────────────────── */}
      {vacantProperties.length > 0 && (
        <div className="terminal-card border border-[#ff4444]">
          <div className="panel-header border-b border-[#ff4444]">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-accent-red alert-blink" />
              <span className="panel-title text-accent-red">
                VACANCY ALERT — {vacantProperties.length} UNIT
                {vacantProperties.length !== 1 ? 'S' : ''} VACANT
              </span>
            </div>
            <span className="text-xs font-mono text-[#888]">REVENUE IMPACT</span>
          </div>
          <div className="p-4 space-y-2">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-2 border-b border-[#2a2a2a]">
              <span className="data-label">ADDRESS</span>
              <span className="data-label text-right">RENT LOST</span>
              <span className="data-label text-right">STATUS</span>
            </div>
            {vacantProperties.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[1fr_auto_auto] gap-4 items-center py-1"
              >
                <span className="text-xs font-mono text-[#e8e8e8] truncate">
                  {p.address}
                </span>
                <span className="mono-num text-sm text-accent-red text-right">
                  {formatCurrency(p.monthly_rent ?? 0)}/mo
                </span>
                <span className="text-xs font-mono text-accent-red alert-blink text-right uppercase">
                  {p.vacancy_status}
                </span>
              </div>
            ))}
            {/* Total bleed */}
            <div className="pt-3 border-t border-[#2a2a2a] flex items-center justify-between">
              <span className="data-label">TOTAL MONTHLY BLEED</span>
              <span className="font-mono tabular-nums text-2xl font-bold text-accent-red">
                {formatCurrency(totalMonthlyBleed)}/mo
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Section B — Property Portfolio Table ─────────────────────────── */}
      <div className="terminal-card">
        <div className="panel-header">
          <span className="panel-title">Property Portfolio</span>
          <span className="text-xs font-mono text-[#888]">
            {properties.length} ASSETS
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-[#2a2a2a]">
                {[
                  'ADDRESS',
                  'VALUE',
                  'DEBT',
                  'EQUITY',
                  'EQUITY%',
                  'RENT',
                  'STATUS',
                  'EST. NET CF',
                ].map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left uppercase tracking-wider text-[#888] font-semibold whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withCF.map((p) => {
                const status = p.vacancy_status.toLowerCase();
                const isOccupied = status === 'occupied' || status === 'leased';
                const isPending = status === 'pending';
                const cfPositive = p.netCF >= 0;

                return (
                  <tr
                    key={p.id}
                    className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors"
                  >
                    <td className="px-3 py-2.5 text-[#e8e8e8] whitespace-nowrap max-w-[200px] truncate">
                      {p.address}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-right whitespace-nowrap">
                      {formatCurrency(p.current_value, { compact: true })}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-right whitespace-nowrap text-[#888]">
                      {formatCurrency(p.debt_balance, { compact: true })}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-right whitespace-nowrap text-accent-green">
                      {formatCurrency(propertyEquity(p), { compact: true })}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-right whitespace-nowrap">
                      {formatPercent(equityPct(p))}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-right whitespace-nowrap">
                      {p.monthly_rent != null
                        ? formatCurrency(p.monthly_rent)
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {isOccupied ? (
                        <span className="text-accent-green font-semibold">
                          {statusLabel(p.vacancy_status)}
                        </span>
                      ) : isPending ? (
                        <span className="text-accent-amber font-semibold">
                          {statusLabel(p.vacancy_status)}
                        </span>
                      ) : (
                        <span className="text-accent-red font-semibold alert-blink">
                          {statusLabel(p.vacancy_status)}
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2.5 tabular-nums text-right whitespace-nowrap font-semibold ${
                        cfPositive ? 'text-accent-green' : 'text-accent-red'
                      }`}
                    >
                      {formatCurrency(Math.round(p.netCF))}
                    </td>
                  </tr>
                );
              })}

              {/* Totals row */}
              <tr className="border-t-2 border-[#2a2a2a] bg-[#111111]">
                <td className="px-3 py-2.5 font-semibold uppercase tracking-wider text-[#e8e8e8]">
                  TOTAL
                </td>
                <td className="px-3 py-2.5 tabular-nums text-right font-semibold">
                  {formatCurrency(totals.value, { compact: true })}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-right font-semibold text-[#888]">
                  {formatCurrency(totals.debt, { compact: true })}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-right font-semibold text-accent-green">
                  {formatCurrency(totals.equity, { compact: true })}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-right font-semibold">
                  {formatPercent(totalEquityPct)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-right font-semibold">
                  {formatCurrency(totals.rent)}
                </td>
                <td className="px-3 py-2.5" />
                <td
                  className={`px-3 py-2.5 tabular-nums text-right font-bold text-base ${
                    totals.netCF >= 0 ? 'text-accent-green' : 'text-accent-red'
                  }`}
                >
                  {formatCurrency(Math.round(totals.netCF))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section C — Cash Flow Waterfall ──────────────────────────────── */}
      <div className="terminal-card">
        <div className="panel-header">
          <span className="panel-title">Cash Flow Waterfall</span>
          <span className="text-xs font-mono text-accent-amber">
            TARGET: {formatCurrency(STABILIZED_TARGET_MO)}/MO STABILIZED
          </span>
        </div>
        <div className="p-4" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 8, bottom: 40 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#2a2a2a"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fill: '#888', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                angle={-30}
                textAnchor="end"
                interval={0}
                stroke="#2a2a2a"
              />
              <YAxis
                tick={{ fill: '#888', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(v: number) => formatCurrency(v, { compact: true })}
                stroke="#2a2a2a"
              />
              <Tooltip content={<CashFlowTooltip />} cursor={{ fill: '#1a1a1a' }} />
              <ReferenceLine
                y={STABILIZED_TARGET_MO}
                stroke="#ffaa00"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{
                  value: `TARGET $${(STABILIZED_TARGET_MO / 1000).toFixed(1)}K`,
                  fill: '#ffaa00',
                  fontSize: 9,
                  fontFamily: 'JetBrains Mono',
                  position: 'insideTopRight',
                }}
              />
              <ReferenceLine y={0} stroke="#e8e8e8" strokeWidth={1} />
              <Bar dataKey="netCF" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.netCF >= 0 ? '#00ff88' : '#ff4444'}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Section D — Stabilization Progress ───────────────────────────── */}
      <div className="terminal-card">
        <div className="panel-header">
          <span className="panel-title">Stabilization Progress</span>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-[#888]">
              {cfPositiveCount}/{withCF.length} CF+
            </span>
            {isStabilized && (
              <span className="text-xs font-mono text-accent-green font-semibold">
                STABILIZED ✓
              </span>
            )}
          </div>
        </div>
        <div className="p-4 space-y-4">
          {/* Current CF vs target */}
          <div className="flex items-end justify-between">
            <div>
              <p className="data-label mb-1">CURRENT TOTAL NET CF</p>
              <p
                className={`font-mono tabular-nums text-3xl font-bold ${
                  totals.netCF >= 0 ? 'text-accent-green' : 'text-accent-red'
                }`}
              >
                {formatCurrency(Math.round(totals.netCF))}/mo
              </p>
            </div>
            <div className="text-right">
              <p className="data-label mb-1">TARGET</p>
              <p className="font-mono tabular-nums text-xl text-accent-amber">
                {formatCurrency(STABILIZED_TARGET_MO)}/mo
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="progress-track h-3">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.max(0, stabilizationProgress)}%`,
                  backgroundColor:
                    stabilizationProgress >= 100 ? '#00ff88' : '#ffaa00',
                }}
              />
            </div>
            <div className="flex justify-between">
              <span className="data-label">
                {stabilizationProgress.toFixed(1)}% OF TARGET
              </span>
              <span className="data-label">
                {formatCurrency(STABILIZED_TARGET_MO)}/mo
              </span>
            </div>
          </div>

          {/* Gap or stabilized message */}
          <div
            className={`px-3 py-2.5 rounded-sm border ${
              isStabilized
                ? 'border-accent-green bg-[rgba(0,255,136,0.05)]'
                : 'border-[#2a2a2a] bg-surface-2'
            }`}
          >
            {isStabilized ? (
              <p className="text-sm font-mono text-accent-green font-semibold">
                Portfolio is operating at or above stabilized target.
                Surplus: {formatCurrency(Math.round(totals.netCF - STABILIZED_TARGET_MO))}/mo
              </p>
            ) : (
              <p className="text-sm font-mono text-accent-amber">
                {formatCurrency(Math.round(gapToTarget))}/month to stabilized
              </p>
            )}
          </div>

          {/* Properties dragging on CF */}
          {draggingProperties.length > 0 && (
            <div className="space-y-2">
              <p className="data-label">PROPERTIES CONTRIBUTING TO GAP</p>
              {draggingProperties.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-1.5 border-b border-[#1a1a1a]"
                >
                  <span className="text-xs font-mono text-[#e8e8e8] truncate max-w-[60%]">
                    {p.address}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="data-label uppercase">{p.vacancy_status}</span>
                    <span className="mono-num text-sm text-accent-red font-semibold">
                      {formatCurrency(Math.round(p.netCF))}/mo
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section E — Rent Collection Status ─────────────────────────────── */}
      <div className="terminal-card">
        <div className="panel-header">
          <span className="panel-title">Rent Collection</span>
          {rentMonth && (
            <span className="text-xs font-mono text-[#888]">{rentMonth}</span>
          )}
        </div>
        <div className="p-4">
          {rentCollected === null ? (
            <p className="text-xs font-mono text-[#888] text-center uppercase tracking-widest py-2">
              No collection data for current period
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <p className="data-label mb-1">COLLECTED</p>
                  <p className="font-mono tabular-nums text-2xl font-bold text-accent-green">
                    {formatCurrency(rentCollected)}/mo
                  </p>
                </div>
                <div className="text-right">
                  <p className="data-label mb-1">EXPECTED (OCCUPIED)</p>
                  <p className="font-mono tabular-nums text-xl text-accent-amber">
                    {formatCurrency(occupiedMonthlyRent)}/mo
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="progress-track h-2">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min((rentCollected / Math.max(occupiedMonthlyRent, 1)) * 100, 100)}%`,
                      backgroundColor: rentCollected >= occupiedMonthlyRent ? '#00ff88' : '#ffaa00',
                    }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="data-label">
                    {occupiedMonthlyRent > 0
                      ? `${((rentCollected / occupiedMonthlyRent) * 100).toFixed(0)}% of expected`
                      : '—'}
                  </span>
                  {rentCollected < occupiedMonthlyRent && (
                    <span className="data-label text-accent-amber">
                      {formatCurrency(occupiedMonthlyRent - rentCollected)} gap
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
