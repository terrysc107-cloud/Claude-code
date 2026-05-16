'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import MonthlyPL from '@/components/tabs/MonthlyPL';
import SpendCategories from '@/components/tabs/SpendCategories';
import { RecurringSpend } from '@/components/tabs/RecurringSpend';
import { CashFlowTrend } from '@/components/tabs/CashFlowTrend';
import { createBrowserClient } from '@/lib/supabase';
import { formatMonthKey } from '@/lib/formatters';

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dateRangeLabel(selectedMonth: string): string {
  try {
    const [year, month] = selectedMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  } catch {
    return selectedMonth;
  }
}

export function TransactionIntelligence() {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [lastTxDate, setLastTxDate] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setSelectedMonth(currentMonthKey());
  }, []);

  // Check last transaction date so we can show a stale-data warning
  useEffect(() => {
    const supabase = createBrowserClient();
    supabase
      .from('transactions')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        setLastTxDate(data?.date ?? null);
      });
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch('/api/plaid/sync', { method: 'POST' });
      // Re-check last tx date after sync
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from('transactions')
        .select('date')
        .order('date', { ascending: false })
        .limit(1)
        .single();
      setLastTxDate(data?.date ?? null);
    } finally {
      setSyncing(false);
    }
  }, []);

  const daysStale = lastTxDate
    ? Math.round((Date.now() - new Date(lastTxDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const showStaleBanner = daysStale === null || daysStale > 2;

  return (
    <div className="terminal-card">
      {/* Panel header */}
      <div className="panel-header">
        <span className="panel-title">Transaction Intelligence</span>
        <span className="font-mono text-xs text-text-secondary">
          {selectedMonth ? dateRangeLabel(selectedMonth) : ''}
        </span>
      </div>

      {/* Stale data banner */}
      {showStaleBanner && (
        <div
          className="mx-4 mt-3 px-3 py-2 rounded-sm flex items-center justify-between gap-3"
          style={{ backgroundColor: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.2)' }}
        >
          <span className="font-mono text-xs" style={{ color: 'var(--accent-amber)' }}>
            {lastTxDate
              ? `⚠ Last transaction ${daysStale}d ago — data may be stale`
              : '⚠ No transactions found — Plaid sync required'}
          </span>
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border border-border rounded-sm hover:border-accent-green hover:text-accent-green transition-colors disabled:opacity-40 shrink-0"
          >
            <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'SYNCING...' : 'SYNC NOW'}
          </button>
        </div>
      )}

      {/* Tab container */}
      <div className="p-4">
        <Tabs defaultValue="monthly-pl">
          <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="monthly-pl">Monthly P&amp;L</TabsTrigger>
            <TabsTrigger value="categories">Spend Categories</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
          </TabsList>

          <TabsContent value="monthly-pl">
            <MonthlyPL
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
            />
          </TabsContent>

          <TabsContent value="categories">
            <SpendCategories selectedMonth={selectedMonth} />
          </TabsContent>

          <TabsContent value="recurring">
            <RecurringSpend />
          </TabsContent>

          <TabsContent value="cashflow">
            <CashFlowTrend />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default TransactionIntelligence;
