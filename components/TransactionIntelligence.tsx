"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import MonthlyPL from "@/components/tabs/MonthlyPL";
import SpendCategories from "@/components/tabs/SpendCategories";
import { RecurringSpend } from "@/components/tabs/RecurringSpend";
import { CashFlowTrend } from "@/components/tabs/CashFlowTrend";
import { QuarterlyReport } from "@/components/tabs/QuarterlyReport";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function TransactionIntelligence() {
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle>Transaction Intelligence</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="monthly-pl">
          <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="monthly-pl">Monthly P&L</TabsTrigger>
            <TabsTrigger value="categories">Spend Categories</TabsTrigger>
            <TabsTrigger value="recurring">Recurring Spend</TabsTrigger>
            <TabsTrigger value="cashflow">Cash Flow Trend</TabsTrigger>
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
      </CardContent>
    </Card>
  );
}
