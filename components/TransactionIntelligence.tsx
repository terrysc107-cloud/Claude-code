'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import MonthlyPL from '@/components/tabs/MonthlyPL';
import SpendCategories from '@/components/tabs/SpendCategories';
import { RecurringSpend } from '@/components/tabs/RecurringSpend';
import { CashFlowTrend } from '@/components/tabs/CashFlowTrend';
import { QuarterlyReport } from '@/components/tabs/QuarterlyReport';
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
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey());

  return (
    <div className="terminal-card">
      {/* Panel header */}
      <div className="panel-header">
        <span className="panel-title">Transaction Intelligence</span>
        <span className="font-mono text-xs text-text-secondary">
          {dateRangeLabel(selectedMonth)}
        </span>
      </div>

      {/* Tab container */}
      <div className="p-4">
        <Tabs defaultValue="monthly-pl">
          <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="monthly-pl">Monthly P&amp;L</TabsTrigger>
            <TabsTrigger value="categories">Spend Categories</TabsTrigger>
            <TabsTrigger value="recurring">Recurring</TabsTrigger>
            <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
            <TabsTrigger value="quarterly">Quarterly Report</TabsTrigger>
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

          <TabsContent value="quarterly">
            <QuarterlyReport />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default TransactionIntelligence;
