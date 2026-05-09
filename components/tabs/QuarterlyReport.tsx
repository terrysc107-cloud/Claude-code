"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, FileText } from "lucide-react";
import type { QuarterlyReportRequest, QuarterlyReportResponse } from "@/types";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1];

function currentQuarter(): typeof QUARTERS[number] {
  const month = new Date().getMonth();
  if (month < 3) return "Q1";
  if (month < 6) return "Q2";
  if (month < 9) return "Q3";
  return "Q4";
}

export function QuarterlyReport() {
  const [quarter, setQuarter] = useState<typeof QUARTERS[number]>(currentQuarter());
  const [year, setYear] = useState(CURRENT_YEAR);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<QuarterlyReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function generateReport() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/quarterly-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarter, year } satisfies QuarterlyReportRequest),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error);
      }

      const data = await res.json() as QuarterlyReportResponse;
      setReport(data);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-mono text-text-secondary uppercase tracking-wider">
            Quarter
          </label>
          <div className="flex gap-1">
            {QUARTERS.map((q) => (
              <button
                key={q}
                onClick={() => setQuarter(q)}
                className={`text-xs font-mono px-3 py-1.5 rounded-sm border transition-all ${
                  quarter === q
                    ? "border-accent-green text-accent-green bg-accent-green/10"
                    : "border-border text-text-secondary hover:border-accent-green/50"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-mono text-text-secondary uppercase tracking-wider">
            Year
          </label>
          <div className="flex gap-1">
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`text-xs font-mono px-3 py-1.5 rounded-sm border transition-all ${
                  year === y
                    ? "border-accent-green text-accent-green bg-accent-green/10"
                    : "border-border text-text-secondary hover:border-accent-green/50"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="green"
          onClick={generateReport}
          disabled={loading}
          className="flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileText className="h-3 w-3" />
              Generate {quarter} {year} Report
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-accent-red/10 border border-accent-red/30 rounded-sm">
          <p className="text-xs font-mono text-accent-red">{error}</p>
        </div>
      )}

      {/* Info */}
      <div className="bg-surface-2 border border-border rounded-sm p-4 space-y-2">
        <div className="text-xs font-mono text-text-secondary uppercase tracking-wider">
          Report Includes
        </div>
        <ul className="space-y-1">
          {[
            "Executive Summary",
            "Income Analysis (by source, vs prior quarter)",
            "Spending Analysis (top categories, anomaly flags)",
            "Recurring Cost Audit (annual run rate)",
            "Net Position & Savings Rate",
            "Cash Flow vs Prior Quarter",
            "3 Specific Action Items",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs font-mono text-text-secondary">
              <span className="text-accent-green">›</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-xs font-mono text-text-secondary pt-1">
          Reports are saved to North Star AI Insights for future reference.
        </p>
      </div>

      {/* Report Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {report?.quarter} {report?.year} — Quarterly Financial Report
            </DialogTitle>
          </DialogHeader>
          {report && (
            <div className="mt-4">
              <div className="text-xs font-mono text-text-secondary mb-4">
                Generated: {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "—"}
              </div>
              <div
                className="prose prose-invert prose-sm max-w-none font-mono text-sm leading-relaxed"
                style={{ color: "#e8e8e8" }}
              >
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-surface-2 p-4 rounded-sm border border-border overflow-auto max-h-[60vh]">
                  {report.report}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
