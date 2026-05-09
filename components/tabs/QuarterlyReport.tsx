'use client';

import { useState, useEffect } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import type { QuarterlyReportRequest, QuarterlyReportResponse } from '@/types';

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
type Quarter = (typeof QUARTERS)[number];

function currentQuarter(): Quarter {
  const month = new Date().getMonth(); // 0-based
  if (month < 3) return 'Q1';
  if (month < 6) return 'Q2';
  if (month < 9) return 'Q3';
  return 'Q4';
}

function currentYear(): number {
  return new Date().getFullYear();
}

/**
 * Minimal markdown renderer — no external lib.
 * Handles: ## headers, **bold**, - list items, blank-line paragraph breaks.
 * Output is an array of React-renderable strings / JSX-like segments,
 * but we keep it simple and return the styled raw text in a pre block
 * with selective inline transforms using regex.
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // H2 —— ## Header
    if (line.startsWith('## ')) {
      nodes.push(
        <h2
          key={key++}
          className="font-mono text-xs font-bold status-green tracking-widest uppercase mt-5 mb-2 border-b border-border pb-1"
        >
          {line.slice(3)}
        </h2>
      );
      continue;
    }

    // H3 —— ### Header
    if (line.startsWith('### ')) {
      nodes.push(
        <h3
          key={key++}
          className="font-mono text-xs font-semibold text-text-primary tracking-wider uppercase mt-3 mb-1"
        >
          {line.slice(4)}
        </h3>
      );
      continue;
    }

    // List item —— - item or * item or 1. item
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const content = line.replace(/^[-*]\s/, '').replace(/^\d+\.\s/, '');
      nodes.push(
        <div key={key++} className="flex gap-2 my-0.5">
          <span className="status-green shrink-0 font-mono text-xs">›</span>
          <span className="font-mono text-xs text-text-primary leading-relaxed">
            {renderInline(content)}
          </span>
        </div>
      );
      continue;
    }

    // Blank line — spacer
    if (line.trim() === '') {
      nodes.push(<div key={key++} className="h-2" />);
      continue;
    }

    // Default paragraph line
    nodes.push(
      <p key={key++} className="font-mono text-xs text-text-primary leading-relaxed">
        {renderInline(line)}
      </p>
    );
  }

  return nodes;
}

/**
 * Inline: convert **bold** and `code` markers.
 */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="text-accent-green font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="text-accent-amber font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

/** Simple toast component */
function SaveToast({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 terminal-card px-4 py-3 flex items-center gap-2 shadow-lg border border-accent-green/30">
      <span className="inline-block w-2 h-2 rounded-full bg-accent-green" />
      <span className="font-mono text-xs status-green font-semibold tracking-widest">
        SAVE COMPLETE — report saved to AI Insights
      </span>
    </div>
  );
}

export function QuarterlyReport() {
  const [quarter, setQuarter] = useState<Quarter>(currentQuarter());
  const [year, setYear] = useState<number>(currentYear());
  const [yearInput, setYearInput] = useState<string>(String(currentYear()));
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<QuarterlyReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [dotsCount, setDotsCount] = useState(1);

  // Animated dots during loading
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setDotsCount((c) => (c % 3) + 1);
    }, 500);
    return () => clearInterval(interval);
  }, [loading]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(false), 4000);
    return () => clearTimeout(t);
  }, [showToast]);

  const handleYearChange = (val: string) => {
    setYearInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 2020 && parsed <= currentYear()) {
      setYear(parsed);
    }
  };

  async function generateReport() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const body: QuarterlyReportRequest = { quarter, year };
      const res = await fetch('/api/quarterly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as QuarterlyReportResponse;
      setReport(data);
      setShowToast(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }

  const dots = '.'.repeat(dotsCount);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="terminal-card">
        <div className="panel-header">
          <span className="panel-title">Quarterly Report Generator</span>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-6">
          {/* Quarter selector */}
          <div className="space-y-1.5">
            <label className="data-label">Quarter</label>
            <div className="flex gap-1">
              {QUARTERS.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuarter(q)}
                  disabled={loading}
                  className={`text-xs font-mono px-3 py-1.5 rounded-sm border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    quarter === q
                      ? 'border-accent-green text-accent-green bg-accent-green/10'
                      : 'border-border text-text-secondary hover:border-accent-green/40 hover:text-text-primary'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Year input */}
          <div className="space-y-1.5">
            <label className="data-label">Year</label>
            <input
              type="number"
              value={yearInput}
              onChange={(e) => handleYearChange(e.target.value)}
              disabled={loading}
              min={2020}
              max={currentYear()}
              className="bg-surface-2 border border-border rounded-sm px-3 py-1.5 text-xs font-mono text-text-primary w-24 focus:outline-none focus:border-accent-green/60 tabular-nums disabled:opacity-40"
            />
          </div>

          {/* Generate button */}
          <button
            onClick={generateReport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-sm border border-accent-green text-accent-green bg-accent-green/10 font-mono text-xs font-semibold tracking-widest uppercase hover:bg-accent-green/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : (
              <FileText size={12} />
            )}
            {loading ? 'GENERATING' : 'GENERATE REPORT'}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="terminal-card p-8 flex flex-col items-center justify-center gap-3">
          <RefreshCw size={20} className="status-green animate-spin" />
          <p className="font-mono text-sm status-green tracking-widest">
            GENERATING ANALYSIS{dots}
          </p>
          <p className="font-mono text-xs text-text-secondary">
            Analyzing {quarter} {year} transactions and comparing to prior quarter
          </p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="terminal-card p-4 border border-accent-red/30">
          <p className="font-mono text-xs status-red font-semibold tracking-wider mb-1">
            ERROR — Report generation failed
          </p>
          <p className="font-mono text-xs text-text-secondary">{error}</p>
          <button
            onClick={generateReport}
            className="mt-3 font-mono text-xs status-red hover:text-accent-red/80 transition-colors underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Report display */}
      {!loading && !error && report && (
        <div className="terminal-card">
          <div className="panel-header">
            <span className="panel-title">
              {report.quarter} {report.year} — Quarterly Financial Report
            </span>
            <span className="font-mono text-xs text-text-secondary">
              {new Date(report.generatedAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>
          <div className="p-5 space-y-1">
            {renderMarkdown(report.report)}
          </div>
        </div>
      )}

      {/* What the report includes (shown before first generation) */}
      {!loading && !error && !report && (
        <div className="terminal-card p-4">
          <p className="data-label mb-3">Report Sections</p>
          <ul className="space-y-1.5">
            {[
              'Executive Summary — 3-4 sentence quarter overview',
              'Income Analysis — sources, totals, vs prior quarter',
              'Spending Analysis — top 5 categories, anomaly flags',
              'Recurring Cost Audit — fixed cost run rate',
              'Net Position — cash flow & savings rate vs $9,575/mo target',
              'Cash Flow vs Prior Quarter — delta analysis',
              '3 Specific Action Items — numbered, dollar-specific',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 font-mono text-xs text-text-secondary">
                <span className="status-green mt-0.5 shrink-0">›</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="font-mono text-xs text-text-secondary/60 mt-4 pt-3 border-t border-border">
            Reports are automatically saved to North Star AI Insights for future reference.
          </p>
        </div>
      )}

      {/* Save toast */}
      <SaveToast show={showToast} />
    </div>
  );
}

export default QuarterlyReport;
