export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, CLIENT_ID } from "@/lib/supabase";
import { createAnthropicClient, CLAUDE_MODEL, CFO_SYSTEM_PROMPT } from "@/lib/anthropic";
import {
  fetchTransactions,
  separateIncomeAndSpending,
  groupByCategory,
  getTopMerchants,
  buildMonthlyPL,
  detectRecurringSpend,
  buildCashFlowTrend,
  groupByMonth,
} from "@/lib/transactions";
import type { Transaction, ContextStoreEntry, NetWorthSnapshot } from "@/types";

// ─── Plaid helpers (mirrors sync route) ──────────────────────────────────────

const PLAID_BASE: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

function plaidBaseUrl() {
  const env = (process.env.PLAID_ENV ?? "production").toLowerCase();
  return PLAID_BASE[env] ?? PLAID_BASE.production;
}

async function plaidPost<T = unknown>(path: string, body: object): Promise<T> {
  const res = await fetch(`${plaidBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Plaid ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as T;
}

interface PlaidAccount {
  account_id: string;
  name: string;
  official_name?: string;
  type: string;
  subtype?: string;
  mask?: string;
  balances: {
    current?: number;
    available?: number;
    limit?: number;
    iso_currency_code?: string;
  };
}

interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  date: string;
  name: string;
  merchant_name?: string;
  amount: number;
  personal_finance_category?: { primary: string; detailed?: string };
  payment_channel?: string;
  pending: boolean;
}

function flattenTx(t: PlaidTransaction) {
  return {
    transaction_id: t.transaction_id,
    account_id: t.account_id,
    date: t.date,
    name: t.name,
    merchant_name: t.merchant_name ?? null,
    amount: t.amount,
    category_primary: t.personal_finance_category?.primary ?? null,
    category_detailed: t.personal_finance_category?.detailed ?? null,
    payment_channel: t.payment_channel ?? null,
    pending: t.pending,
  };
}

// ─── Account aggregations ─────────────────────────────────────────────────────

interface AccountSummary {
  account_id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  current_balance: number | null;
  available_balance: number | null;
  limit_balance: number | null;
  currency: string;
}

function summarizeAccounts(accounts: AccountSummary[]) {
  const byType: Record<string, { count: number; balance: number }> = {};
  for (const a of accounts) {
    if (!byType[a.type]) byType[a.type] = { count: 0, balance: 0 };
    byType[a.type].count++;
    byType[a.type].balance += a.current_balance ?? 0;
  }

  const depository = accounts.filter((a) => a.type === "depository");
  const credit = accounts.filter((a) => a.type === "credit");
  const investment = accounts.filter((a) => a.type === "investment");
  const loan = accounts.filter((a) => a.type === "loan");

  const totalCash = depository.reduce((s, a) => s + (a.current_balance ?? 0), 0);
  const totalCredit = credit.reduce((s, a) => s + (a.current_balance ?? 0), 0);
  const totalCreditLimit = credit.reduce((s, a) => s + (a.limit_balance ?? 0), 0);
  const totalInvestment = investment.reduce((s, a) => s + (a.current_balance ?? 0), 0);
  const totalLoan = loan.reduce((s, a) => s + (a.current_balance ?? 0), 0);

  return {
    byType,
    totalCash,
    totalCredit,
    totalCreditLimit,
    totalCreditAvailable: totalCreditLimit - totalCredit,
    totalInvestment,
    totalLoan,
    totalLiquid: totalCash + (totalCreditLimit - totalCredit),
    accountList: accounts,
  };
}

// ─── Context store upsert helpers ────────────────────────────────────────────

type ContextUpdate = { context_key: string; context_value: string };

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    return NextResponse.json(
      { error: "PLAID_CLIENT_ID and PLAID_SECRET must be set in environment" },
      { status: 500 }
    );
  }

  const supabase = createServerClient();
  const anthropic = createAnthropicClient();
  const auditedAt = new Date().toISOString();

  // ── 1. Load Plaid tokens ─────────────────────────────────────────────────
  const { data: tokens, error: tokensErr } = await supabase
    .from("plaid_tokens")
    .select("id, item_id, access_token, cursor")
    .order("created_at");

  if (tokensErr || !tokens?.length) {
    return NextResponse.json(
      { error: tokensErr?.message ?? "No Plaid tokens found" },
      { status: 404 }
    );
  }

  // ── 2. Full sync + account fetch per token ───────────────────────────────
  const allAccounts: AccountSummary[] = [];
  const syncResults: Array<{ item_id: string; txAdded: number; error?: string }> = [];

  for (const token of tokens) {
    const syncResult = { item_id: token.item_id as string, txAdded: 0, error: undefined as string | undefined };

    try {
      // Transaction sync (paginated)
      let nextCursor = (token.cursor as string) ?? "";
      let hasMore = true;

      while (hasMore) {
        const payload: Record<string, string> = { access_token: token.access_token as string };
        if (nextCursor) payload.cursor = nextCursor;

        const data = await plaidPost<{
          added: PlaidTransaction[];
          modified: PlaidTransaction[];
          removed: { transaction_id: string }[];
          next_cursor: string;
          has_more: boolean;
        }>("/transactions/sync", payload);

        if (data.added.length) {
          await supabase
            .from("transactions")
            .upsert(data.added.map(flattenTx), { onConflict: "transaction_id" });
          syncResult.txAdded += data.added.length;
        }
        if (data.modified.length) {
          await supabase
            .from("transactions")
            .upsert(data.modified.map(flattenTx), { onConflict: "transaction_id" });
        }
        if (data.removed.length) {
          const ids = data.removed.map((r) => r.transaction_id).filter(Boolean);
          if (ids.length) await supabase.from("transactions").delete().in("transaction_id", ids);
        }

        nextCursor = data.next_cursor ?? nextCursor;
        hasMore = data.has_more ?? false;
      }

      await supabase
        .from("plaid_tokens")
        .update({ cursor: nextCursor, last_sync: auditedAt })
        .eq("item_id", token.item_id);

      // Account balances
      const accountsData = await plaidPost<{ accounts: PlaidAccount[] }>("/accounts/get", {
        access_token: token.access_token,
      });

      for (const acct of accountsData.accounts ?? []) {
        const row = {
          client_id: CLIENT_ID,
          account_id: acct.account_id,
          account_name: acct.name,
          official_name: acct.official_name ?? null,
          account_type: acct.type,
          account_subtype: acct.subtype ?? null,
          current_balance: acct.balances.current ?? null,
          available_balance: acct.balances.available ?? null,
          limit_balance: acct.balances.limit ?? null,
          currency: acct.balances.iso_currency_code ?? "USD",
          mask: acct.mask ?? null,
          last_updated: auditedAt,
        };
        await supabase
          .schema("north_star")
          .from("plaid_accounts")
          .upsert(row, { onConflict: "account_id" });

        allAccounts.push({
          account_id: acct.account_id,
          name: acct.name,
          type: acct.type,
          subtype: acct.subtype ?? null,
          mask: acct.mask ?? null,
          current_balance: acct.balances.current ?? null,
          available_balance: acct.balances.available ?? null,
          limit_balance: acct.balances.limit ?? null,
          currency: acct.balances.iso_currency_code ?? "USD",
        });
      }
    } catch (err) {
      syncResult.error = err instanceof Error ? err.message : String(err);
    }

    syncResults.push(syncResult);
  }

  // ── 3. Pull full 12-month transaction history ────────────────────────────
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const startDate = twelveMonthsAgo.toISOString().split("T")[0];
  const endDate = now.toISOString().split("T")[0];

  const transactions = await fetchTransactions(supabase, startDate, endDate);

  // ── 4. Analytics ─────────────────────────────────────────────────────────
  const { income: allIncome, spending: allSpending } = separateIncomeAndSpending(transactions);
  const totalIncome12mo = allIncome.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalSpending12mo = allSpending.reduce((s, t) => s + t.amount, 0);
  const netCashFlow12mo = totalIncome12mo - totalSpending12mo;

  // Monthly P&L for last 12 months
  const byMonth = groupByMonth(transactions);
  const sortedMonths = Object.keys(byMonth).sort();
  const monthlyPL = sortedMonths.map((month, idx) => {
    const priorTxs = idx > 0 ? byMonth[sortedMonths[idx - 1]] : undefined;
    return { month, ...buildMonthlyPL(byMonth[month], priorTxs) };
  });

  // Last 3 months averages
  const last3Months = monthlyPL.slice(-3);
  const avg3moIncome = last3Months.length
    ? last3Months.reduce((s, m) => s + m.income, 0) / last3Months.length
    : 0;
  const avg3moSpending = last3Months.length
    ? last3Months.reduce((s, m) => s + m.spending, 0) / last3Months.length
    : 0;
  const avg3moNet = avg3moIncome - avg3moSpending;
  const avg3moSavingsRate = avg3moIncome > 0 ? (avg3moNet / avg3moIncome) * 100 : 0;

  // Recurring spend
  const recurringItems = detectRecurringSpend(transactions, 2);
  const recurringAnnualTotal = recurringItems.reduce((s, r) => s + r.annualCost, 0);

  // Top spending categories (12mo)
  const spendingCategories = groupByCategory(allSpending, totalSpending12mo).slice(0, 8);

  // Cash flow trend (last 12 months)
  const cashFlowTrend = buildCashFlowTrend(transactions);

  // Top merchants
  const topMerchants = getTopMerchants(allSpending, 15);

  // Account summary
  const accountSummary = summarizeAccounts(allAccounts);

  // ── 5. Load existing north_star context + net worth ──────────────────────
  const [contextRes, netWorthRes] = await Promise.all([
    supabase
      .schema("north_star")
      .from("context_store")
      .select("context_key, context_value")
      .eq("client_id", CLIENT_ID),
    supabase
      .schema("north_star")
      .from("net_worth_snapshots")
      .select("*")
      .eq("client_id", CLIENT_ID)
      .order("snapshot_date", { ascending: false })
      .limit(1),
  ]);

  const contextEntries = (contextRes.data as ContextStoreEntry[] | null) ?? [];
  const contextDump = contextEntries.map((e) => `${e.context_key}: ${e.context_value}`).join("\n");
  const latestNetWorth = netWorthRes.data?.[0] as NetWorthSnapshot | null;

  // ── 6. Build AI audit prompt ─────────────────────────────────────────────
  const accountInventory = allAccounts
    .map(
      (a) =>
        `  - ${a.name} (${a.type}/${a.subtype ?? "—"}) mask:${a.mask ?? "?"} | current: $${(a.current_balance ?? 0).toLocaleString()} | available: $${(a.available_balance ?? 0).toLocaleString()}`
    )
    .join("\n");

  const monthlyPLText = monthlyPL
    .slice(-6)
    .map(
      (m) =>
        `  ${m.month}: income=$${m.income.toFixed(0)} spending=$${m.spending.toFixed(0)} net=$${m.net.toFixed(0)} savings=${m.savingsRate.toFixed(1)}%`
    )
    .join("\n");

  const topCategoriesText = spendingCategories
    .map((c) => `  - ${c.category}: $${c.total.toFixed(0)} (${c.percentage.toFixed(1)}%)`)
    .join("\n");

  const recurringText = recurringItems
    .slice(0, 10)
    .map((r) => `  - ${r.merchant}: ~$${r.averageAmount.toFixed(0)}/mo | $${r.annualCost.toFixed(0)}/yr`)
    .join("\n");

  const auditDataBlock = `
=== ACCOUNT INVENTORY (${allAccounts.length} accounts) ===
${accountInventory}

=== BALANCE SUMMARY ===
Cash / Depository: $${accountSummary.totalCash.toLocaleString()}
Credit Balances Owed: $${accountSummary.totalCredit.toLocaleString()}
Credit Available: $${accountSummary.totalCreditAvailable.toLocaleString()} / $${accountSummary.totalCreditLimit.toLocaleString()} limit
Investment: $${accountSummary.totalInvestment.toLocaleString()}
Loans Owed: $${accountSummary.totalLoan.toLocaleString()}
Total Liquid (cash + available credit): $${accountSummary.totalLiquid.toLocaleString()}

=== 12-MONTH CASH FLOW (${startDate} → ${endDate}) ===
Total Income: $${totalIncome12mo.toFixed(0)}
Total Spending: $${totalSpending12mo.toFixed(0)}
Net Cash Flow: $${netCashFlow12mo.toFixed(0)}
Transaction Count: ${transactions.length}

=== MONTHLY P&L (last 6 months) ===
${monthlyPLText}

=== 3-MONTH AVERAGES ===
Avg Monthly Income: $${avg3moIncome.toFixed(0)}
Avg Monthly Spending: $${avg3moSpending.toFixed(0)}
Avg Monthly Net: $${avg3moNet.toFixed(0)}
Avg Savings Rate: ${avg3moSavingsRate.toFixed(1)}%

=== TOP SPENDING CATEGORIES (12mo) ===
${topCategoriesText}

=== RECURRING SPEND (annual total: $${recurringAnnualTotal.toFixed(0)}) ===
${recurringText}

=== NET WORTH CONTEXT ===
${latestNetWorth ? `As of ${latestNetWorth.snapshot_date}: Net Worth $${latestNetWorth.net_worth?.toLocaleString()} | Gross Assets $${latestNetWorth.gross_assets?.toLocaleString()} | Total Debt $${latestNetWorth.total_debt?.toLocaleString()}` : "No snapshot on file"}

=== EXISTING CONTEXT STORE ===
${contextDump || "(empty)"}
`.trim();

  const auditPrompt = `Perform a complete CFO-level account audit. Based on the data below, produce:

1. **ACCOUNT HEALTH SUMMARY** — inventory of all accounts, balances, liquidity position, credit utilization
2. **CASH FLOW VERDICT** — 12-month trend, monthly P&L assessment, savings rate trajectory
3. **SPENDING INTELLIGENCE** — top categories, concerning patterns, optimization opportunities with $ impact
4. **RECURRING COST AUDIT** — subscriptions/recurring charges to review, total annual drag
5. **NORTH STAR OS UPDATES** — 5-10 specific context_store key-value pairs I should update to keep the AI grounded. Format as JSON block labeled \`CONTEXT_UPDATES\`.
6. **ACTIONS** — top 3 highest-leverage financial actions based on this data

Be specific with dollar amounts. No generic advice.

${auditDataBlock}`;

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    system: CFO_SYSTEM_PROMPT,
    messages: [{ role: "user", content: auditPrompt }],
  });

  const auditNarrative = message.content[0].type === "text" ? message.content[0].text : "";

  // ── 7. Parse context updates from AI output ──────────────────────────────
  let aiContextUpdates: ContextUpdate[] = [];
  const jsonMatch = auditNarrative.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        aiContextUpdates = parsed.filter(
          (e): e is ContextUpdate =>
            typeof e?.context_key === "string" && typeof e?.context_value === "string"
        );
      }
    } catch {
      // AI JSON parse failed — fall through to hardcoded updates
    }
  }

  // ── 8. Build deterministic context updates ───────────────────────────────
  const deterministicUpdates: ContextUpdate[] = [
    { context_key: "plaid_last_audit_date", context_value: auditedAt },
    { context_key: "monthly_income_avg_3mo", context_value: avg3moIncome.toFixed(2) },
    { context_key: "monthly_spending_avg_3mo", context_value: avg3moSpending.toFixed(2) },
    { context_key: "monthly_net_avg_3mo", context_value: avg3moNet.toFixed(2) },
    { context_key: "savings_rate_avg_3mo", context_value: avg3moSavingsRate.toFixed(1) },
    { context_key: "total_cash_balances", context_value: accountSummary.totalCash.toFixed(2) },
    { context_key: "total_credit_owed", context_value: accountSummary.totalCredit.toFixed(2) },
    { context_key: "total_credit_available", context_value: accountSummary.totalCreditAvailable.toFixed(2) },
    { context_key: "total_investment_balances", context_value: accountSummary.totalInvestment.toFixed(2) },
    { context_key: "total_loan_balances", context_value: accountSummary.totalLoan.toFixed(2) },
    { context_key: "recurring_annual_total", context_value: recurringAnnualTotal.toFixed(2) },
    { context_key: "account_count", context_value: String(allAccounts.length) },
    {
      context_key: "top_spending_categories",
      context_value: spendingCategories
        .slice(0, 5)
        .map((c) => `${c.category}:$${c.total.toFixed(0)}`)
        .join(", "),
    },
    { context_key: "net_cash_flow_12mo", context_value: netCashFlow12mo.toFixed(2) },
  ];

  // Merge: deterministic takes priority, then AI suggestions for novel keys
  const deterministicKeys = new Set(deterministicUpdates.map((u) => u.context_key));
  const mergedUpdates = [
    ...deterministicUpdates,
    ...aiContextUpdates.filter((u) => !deterministicKeys.has(u.context_key)),
  ];

  // ── 9. Upsert context_store ──────────────────────────────────────────────
  const contextUpserts = mergedUpdates.map((u) => ({
    client_id: CLIENT_ID,
    context_key: u.context_key,
    context_value: u.context_value,
  }));

  await supabase
    .schema("north_star")
    .from("context_store")
    .upsert(contextUpserts, { onConflict: "client_id,context_key" });

  // ── 10. Log audit to ai_insights ─────────────────────────────────────────
  await supabase
    .schema("north_star")
    .from("ai_insights")
    .insert({
      client_id: CLIENT_ID,
      session_date: auditedAt.split("T")[0],
      insight_type: "account_audit",
      topic: `Full Account Audit — ${allAccounts.length} accounts, ${transactions.length} transactions (12mo)`,
      insight: auditNarrative,
      tags: ["audit", "plaid", "north_star_export"],
    });

  // ── 11. Return full audit payload ─────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    auditedAt,
    syncResults,
    summary: {
      accountCount: allAccounts.length,
      transactionCount: transactions.length,
      dateRange: { startDate, endDate },
      balances: {
        totalCash: accountSummary.totalCash,
        totalCredit: accountSummary.totalCredit,
        totalCreditAvailable: accountSummary.totalCreditAvailable,
        totalCreditLimit: accountSummary.totalCreditLimit,
        totalInvestment: accountSummary.totalInvestment,
        totalLoan: accountSummary.totalLoan,
        totalLiquid: accountSummary.totalLiquid,
      },
      cashFlow12mo: {
        totalIncome: totalIncome12mo,
        totalSpending: totalSpending12mo,
        netCashFlow: netCashFlow12mo,
      },
      avg3mo: {
        income: avg3moIncome,
        spending: avg3moSpending,
        net: avg3moNet,
        savingsRate: avg3moSavingsRate,
      },
      recurringAnnualTotal,
    },
    accounts: allAccounts,
    monthlyPL,
    cashFlowTrend,
    topCategories: spendingCategories,
    topMerchants,
    recurringItems,
    contextUpdates: mergedUpdates,
    auditNarrative,
  });
}
