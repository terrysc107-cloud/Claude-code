import {
  Transaction,
  MonthlyPLData,
  CategorySummary,
  MerchantSummary,
  RecurringItem,
  CashFlowMonth,
} from "@/types";

const APPLE_CASH_FILTER = "apple cash sent";

// ─── Raw Queries (server-side, pass in supabase client) ──────────────────────

// Using a structural duck-type interface so this works with both
// createBrowserClient() and createServerClient() return types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySupabaseClient = any;

/**
 * Fetch transactions for a date range, excluding Apple Cash
 */
export async function fetchTransactions(
  supabase: AnySupabaseClient,
  startDate: string,
  endDate: string
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .not("name", "ilike", `%${APPLE_CASH_FILTER}%`)
    .order("date", { ascending: false });

  if (error) {
    console.error("Error fetching transactions:", error);
    return [];
  }

  return (data as Transaction[]) ?? [];
}

/**
 * Fetch last N months of transactions
 */
export async function fetchLastNMonthsTransactions(
  supabase: AnySupabaseClient,
  n: number
): Promise<Transaction[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - n + 1, 1);
  const startDate = start.toISOString().split("T")[0];
  const endDate = now.toISOString().split("T")[0];

  return fetchTransactions(supabase, startDate, endDate);
}

// ─── Aggregation Helpers ──────────────────────────────────────────────────────

/**
 * Group transactions by YYYY-MM month key
 */
export function groupByMonth(
  transactions: Transaction[]
): Record<string, Transaction[]> {
  return transactions.reduce(
    (acc, tx) => {
      const month = tx.date.substring(0, 7);
      if (!acc[month]) acc[month] = [];
      acc[month].push(tx);
      return acc;
    },
    {} as Record<string, Transaction[]>
  );
}

/**
 * Separate income (amount < 0) and spending (amount > 0) transactions
 */
export function separateIncomeAndSpending(transactions: Transaction[]): {
  income: Transaction[];
  spending: Transaction[];
} {
  return {
    income: transactions.filter((tx) => tx.amount < 0),
    spending: transactions.filter((tx) => tx.amount > 0),
  };
}

/**
 * Group transactions by category and compute totals
 */
export function groupByCategory(
  transactions: Transaction[],
  totalAmount: number
): CategorySummary[] {
  const grouped = transactions.reduce(
    (acc, tx) => {
      const cat = tx.category_primary ?? "Uncategorized";
      if (!acc[cat]) acc[cat] = { total: 0, count: 0 };
      acc[cat].total += Math.abs(tx.amount);
      acc[cat].count += 1;
      return acc;
    },
    {} as Record<string, { total: number; count: number }>
  );

  return Object.entries(grouped)
    .map(([category, { total, count }]) => ({
      category,
      total,
      count,
      percentage: totalAmount > 0 ? (total / totalAmount) * 100 : 0,
      momChange: null,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Get top merchants by spend
 */
export function getTopMerchants(
  transactions: Transaction[],
  limit = 10
): MerchantSummary[] {
  const grouped = transactions.reduce(
    (acc, tx) => {
      const merchant = tx.merchant_name ?? tx.name;
      if (!acc[merchant]) {
        acc[merchant] = { total: 0, count: 0, category: tx.category_primary };
      }
      acc[merchant].total += Math.abs(tx.amount);
      acc[merchant].count += 1;
      return acc;
    },
    {} as Record<
      string,
      { total: number; count: number; category: string | null }
    >
  );

  return Object.entries(grouped)
    .map(([merchant, { total, count, category }]) => ({
      merchant,
      total,
      count,
      category,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/**
 * Build Monthly P&L data for a given month
 */
export function buildMonthlyPL(
  transactions: Transaction[],
  priorMonthTransactions?: Transaction[]
): MonthlyPLData {
  const { income, spending } = separateIncomeAndSpending(transactions);

  const totalIncome = income.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalSpending = spending.reduce((sum, tx) => sum + tx.amount, 0);
  const net = totalIncome - totalSpending;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;

  const incomeByCategory = groupByCategory(income, totalIncome);
  const spendingByCategory = groupByCategory(spending, totalSpending);

  // Add MoM change if prior month data provided
  if (priorMonthTransactions) {
    const { spending: priorSpending } =
      separateIncomeAndSpending(priorMonthTransactions);
    const priorByCategory = groupByCategory(
      priorSpending,
      priorSpending.reduce((s, tx) => s + tx.amount, 0)
    );
    const priorMap = new Map(priorByCategory.map((c) => [c.category, c.total]));

    spendingByCategory.forEach((cat) => {
      const prior = priorMap.get(cat.category);
      if (prior !== undefined && prior > 0) {
        cat.momChange = ((cat.total - prior) / prior) * 100;
      }
    });
  }

  const topMerchants = getTopMerchants(spending);

  return {
    income: totalIncome,
    spending: totalSpending,
    net,
    savingsRate,
    incomeByCategory,
    spendingByCategory,
    topMerchants,
  };
}

/**
 * Detect recurring spend patterns — merchants appearing in 2+ of the last 3 months
 */
export function detectRecurringSpend(
  transactions: Transaction[],
  minMonths = 2
): RecurringItem[] {
  const byMonthMerchant = new Map<
    string,
    Map<string, { amounts: number[]; category: string | null }>
  >();

  transactions.forEach((tx) => {
    if (tx.amount <= 0) return; // spending only
    const month = tx.date.substring(0, 7);
    const merchant = normalizeMerchantName(tx.merchant_name ?? tx.name);

    if (!byMonthMerchant.has(merchant)) {
      byMonthMerchant.set(merchant, new Map());
    }
    const monthMap = byMonthMerchant.get(merchant)!;
    if (!monthMap.has(month)) {
      monthMap.set(month, { amounts: [], category: tx.category_primary });
    }
    monthMap.get(month)!.amounts.push(tx.amount);
  });

  const recurring: RecurringItem[] = [];

  byMonthMerchant.forEach((monthMap, merchant) => {
    if (monthMap.size < minMonths) return;

    const months = Array.from(monthMap.keys()).sort();
    let totalAmount = 0;
    let totalCount = 0;
    let category: string | null = null;

    monthMap.forEach(({ amounts, category: cat }) => {
      amounts.forEach((a) => {
        totalAmount += a;
        totalCount++;
      });
      if (!category) category = cat;
    });

    const averageAmount = totalAmount / totalCount;
    const annualCost = (totalAmount / months.length) * 12;

    recurring.push({
      merchant,
      months,
      averageAmount,
      annualCost,
      category,
      frequency: monthMap.size,
    });
  });

  return recurring.sort((a, b) => b.annualCost - a.annualCost);
}

/**
 * Build 6-month cash flow trend data
 */
export function buildCashFlowTrend(
  transactions: Transaction[]
): CashFlowMonth[] {
  const byMonth = groupByMonth(transactions);

  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, txs]) => {
      const { income, spending } = separateIncomeAndSpending(txs);
      const totalIncome = income.reduce(
        (sum, tx) => sum + Math.abs(tx.amount),
        0
      );
      const totalSpending = spending.reduce((sum, tx) => sum + tx.amount, 0);
      const net = totalIncome - totalSpending;
      const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;

      return {
        month,
        income: totalIncome,
        spending: totalSpending,
        net,
        savingsRate,
      };
    });
}

/**
 * Normalize merchant name for grouping
 */
function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+#\d+.*$/, "")
    .replace(/\s+\d{4,}.*$/, "")
    .trim();
}

/**
 * Build a text summary of transactions for AI prompts
 */
export function buildTransactionSummary(
  transactions: Transaction[],
  label: string
): string {
  const { income, spending } = separateIncomeAndSpending(transactions);
  const totalIncome = income.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalSpending = spending.reduce((sum, tx) => sum + tx.amount, 0);
  const net = totalIncome - totalSpending;

  const spendByCategory = groupByCategory(spending, totalSpending);
  const topCategories = spendByCategory
    .slice(0, 5)
    .map((c) => `  - ${c.category}: $${c.total.toFixed(2)} (${c.percentage.toFixed(1)}%)`)
    .join("\n");

  const topMerchants = getTopMerchants(spending, 5)
    .map((m) => `  - ${m.merchant}: $${m.total.toFixed(2)}`)
    .join("\n");

  return `
=== ${label} ===
Total Income: $${totalIncome.toFixed(2)}
Total Spending: $${totalSpending.toFixed(2)}
Net: $${net.toFixed(2)}
Savings Rate: ${totalIncome > 0 ? ((net / totalIncome) * 100).toFixed(1) : "0"}%

Top Spending Categories:
${topCategories}

Top Merchants:
${topMerchants}
  `.trim();
}
