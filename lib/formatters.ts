/**
 * Format a number as USD currency
 */
export function formatCurrency(
  value: number,
  options: { compact?: boolean; decimals?: number } = {}
): string {
  const { compact = false, decimals = 0 } = options;

  if (!isFinite(value) || isNaN(value)) return "—";

  if (compact) {
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    }
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a number as a percentage
 */
export function formatPercent(
  value: number,
  options: { decimals?: number; showSign?: boolean } = {}
): string {
  if (!isFinite(value) || isNaN(value)) return "—";
  const { decimals = 1, showSign = false } = options;
  const sign = showSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format a date string to a readable label
 */
export function formatDate(
  dateStr: string,
  format: "short" | "medium" | "month-year" = "medium"
): string {
  const date = new Date(dateStr + "T00:00:00");

  if (format === "short") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  if (format === "month-year") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a YYYY-MM string to month label
 */
export function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/**
 * Calculate days until a date
 */
export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Get the start and end dates of a quarter
 */
export function getQuarterDates(
  quarter: "Q1" | "Q2" | "Q3" | "Q4",
  year: number
): { start: string; end: string } {
  const quarterMap: Record<string, { startMonth: number; endMonth: number }> = {
    Q1: { startMonth: 1, endMonth: 3 },
    Q2: { startMonth: 4, endMonth: 6 },
    Q3: { startMonth: 7, endMonth: 9 },
    Q4: { startMonth: 10, endMonth: 12 },
  };

  const { startMonth, endMonth } = quarterMap[quarter];
  const lastDay = new Date(year, endMonth, 0).getDate();

  return {
    start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    end: `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`,
  };
}

/**
 * Get last N months as YYYY-MM strings, most recent first
 */
export function getLastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();

  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = String(d.getMonth() + 1).padStart(2, "0");
    months.push(`${d.getFullYear()}-${month}`);
  }

  return months;
}

/**
 * Get the current month as YYYY-MM
 */
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
