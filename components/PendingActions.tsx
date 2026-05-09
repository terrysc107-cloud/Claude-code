"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency, formatDate } from "@/lib/formatters";

interface PendingItem {
  id: string;
  category: string;
  sender: string;
  subject: string;
  amount: number | null;
  due_date: string | null;
  snippet: string | null;
  created_at: string;
  source: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  invoice: "Invoice",
  bank_alert: "Bank Alert",
  payment_request: "Payment Request",
  statement: "Statement",
  trade: "Trade",
  bill: "Bill",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  invoice: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  bank_alert: "text-red-400 bg-red-400/10 border-red-400/20",
  payment_request: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  statement: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  trade: "text-green-400 bg-green-400/10 border-green-400/20",
  bill: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  other: "text-text-secondary bg-surface border-border",
};

export default function PendingActions() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/pending-items");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function runScan() {
    setScanning(true);
    try {
      const res = await fetch("/api/morning-scan");
      if (res.ok) {
        await fetchItems();
      }
    } finally {
      setScanning(false);
    }
  }

  async function updateStatus(id: string, status: "acknowledged" | "dismissed") {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch("/api/pending-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  }

  const urgentCount = items.filter(
    (i) => i.due_date && new Date(i.due_date) <= new Date(Date.now() + 7 * 86400_000)
  ).length;

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-semibold text-text-primary">
            Pending Actions
          </span>
          {items.length > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
              {items.length}
            </span>
          )}
          {urgentCount > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 border border-red-400/20">
              {urgentCount} urgent
            </span>
          )}
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="text-xs font-mono text-text-secondary hover:text-text-primary border border-border hover:border-accent/40 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
        >
          {scanning ? "Scanning..." : "Run Scan"}
        </button>
      </div>

      {/* Content */}
      <div className="divide-y divide-border">
        {loading && (
          <div className="px-4 py-6 text-center text-xs font-mono text-text-secondary">
            Loading...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="px-4 py-6 text-center text-xs font-mono text-text-secondary">
            No pending items — inbox clear
          </div>
        )}

        {items.map((item) => {
          const isExpanded = expanded === item.id;
          const overdue =
            item.due_date && new Date(item.due_date) < new Date();
          const dueSoon =
            item.due_date &&
            !overdue &&
            new Date(item.due_date) <= new Date(Date.now() + 7 * 86400_000);

          return (
            <div key={item.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                {/* Category badge */}
                <span
                  className={`shrink-0 text-xs font-mono px-1.5 py-0.5 rounded border mt-0.5 ${
                    CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other
                  }`}
                >
                  {CATEGORY_LABELS[item.category] ?? item.category}
                </span>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : item.id)}
                    className="text-left w-full"
                  >
                    <p className="text-xs font-mono text-text-primary truncate leading-snug">
                      {item.subject}
                    </p>
                    <p className="text-xs font-mono text-text-secondary truncate mt-0.5">
                      {item.sender}
                    </p>
                  </button>

                  {isExpanded && item.snippet && (
                    <p className="text-xs font-mono text-text-secondary mt-2 leading-relaxed whitespace-pre-line">
                      {item.snippet}
                    </p>
                  )}
                </div>

                {/* Right side: amount + due + actions */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {item.amount != null && (
                    <span className="text-xs font-mono font-semibold text-text-primary">
                      {formatCurrency(item.amount, { decimals: 2 })}
                    </span>
                  )}
                  {item.due_date && (
                    <span
                      className={`text-xs font-mono ${
                        overdue
                          ? "text-red-400"
                          : dueSoon
                          ? "text-yellow-400"
                          : "text-text-secondary"
                      }`}
                    >
                      {overdue ? "OVERDUE " : "due "}
                      {formatDate(item.due_date, "short")}
                    </span>
                  )}
                  <div className="flex gap-1 mt-0.5">
                    <button
                      onClick={() => updateStatus(item.id, "acknowledged")}
                      className="text-xs font-mono text-green-400 hover:text-green-300 border border-green-400/20 hover:border-green-400/40 px-1.5 py-0.5 rounded transition-colors"
                      title="Acknowledge"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => updateStatus(item.id, "dismissed")}
                      className="text-xs font-mono text-text-secondary hover:text-text-primary border border-border hover:border-border px-1.5 py-0.5 rounded transition-colors"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="px-4 py-2 border-t border-border flex justify-end">
          <button
            onClick={() => {
              items.forEach((i) => updateStatus(i.id, "acknowledged"));
            }}
            className="text-xs font-mono text-text-secondary hover:text-text-primary transition-colors"
          >
            Acknowledge all
          </button>
        </div>
      )}
    </div>
  );
}
