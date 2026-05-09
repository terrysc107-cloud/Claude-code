import { CommandBar } from "@/components/CommandBar";
import { NetWorthCenter } from "@/components/NetWorthCenter";
import { TransactionIntelligence } from "@/components/TransactionIntelligence";
import RealEstateCommand from "@/components/RealEstateCommand";
import BusinessIncome from "@/components/BusinessIncome";
import AIInsightsFeed from "@/components/AIInsightsFeed";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top command bar — always visible */}
      <CommandBar />

      {/* Main content */}
      <main className="container mx-auto px-4 py-6 max-w-screen-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-mono font-bold tracking-tight text-text-primary">
              Cottonstone Command Center
            </h1>
            <p className="text-xs font-mono text-text-secondary mt-0.5">
              North Star OS — Wealth Intelligence Dashboard
            </p>
          </div>
          <div className="text-xs font-mono text-text-secondary">
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>

        {/* Module grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* MODULE 2: Net Worth Center — hero panel */}
          <NetWorthCenter />

          {/* MODULE 3: Transaction Intelligence */}
          <TransactionIntelligence />

          {/* MODULE 4: Real Estate Command */}
          <RealEstateCommand />

          {/* MODULE 5: Business Income */}
          <BusinessIncome />

          {/* MODULE 6: AI Insights Feed — full width */}
          <div className="xl:col-span-2">
            <AIInsightsFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
