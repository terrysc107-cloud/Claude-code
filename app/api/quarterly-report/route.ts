import { NextRequest, NextResponse } from "next/server";
import { createServerClient, CLIENT_ID } from "@/lib/supabase";
import { createAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic";
import {
  fetchTransactions,
  buildTransactionSummary,
  buildMonthlyPL,
  groupByMonth,
} from "@/lib/transactions";
import { getQuarterDates } from "@/lib/formatters";
import type { QuarterlyReportRequest } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as QuarterlyReportRequest;
    const { quarter, year } = body;

    if (!quarter || !year) {
      return NextResponse.json(
        { error: "quarter and year are required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const anthropic = createAnthropicClient();

    const { start, end } = getQuarterDates(quarter, year);

    // Fetch current quarter transactions
    const transactions = await fetchTransactions(supabase, start, end);

    // Fetch prior quarter for comparison
    const priorQuarterMap: Record<string, string> = {
      Q1: "Q4",
      Q2: "Q1",
      Q3: "Q2",
      Q4: "Q3",
    };
    const priorQuarter = priorQuarterMap[quarter] as
      | "Q1"
      | "Q2"
      | "Q3"
      | "Q4";
    const priorYear = quarter === "Q1" ? year - 1 : year;
    const priorDates = getQuarterDates(priorQuarter, priorYear);
    const priorTransactions = await fetchTransactions(
      supabase,
      priorDates.start,
      priorDates.end
    );

    // Build summaries
    const currentPL = buildMonthlyPL(transactions, priorTransactions);
    const byMonth = groupByMonth(transactions);
    const monthSummaries = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, txs]) =>
        buildTransactionSummary(txs, month)
      )
      .join("\n\n");

    const overallSummary = buildTransactionSummary(
      transactions,
      `${quarter} ${year} Overall`
    );
    const priorSummary = buildTransactionSummary(
      priorTransactions,
      `${priorQuarter} ${priorYear} (Prior Quarter)`
    );

    const promptContent = `
${overallSummary}

${priorSummary}

Monthly Breakdown:
${monthSummaries}

Net/Savings Rate: ${currentPL.savingsRate.toFixed(1)}%
Total Transactions: ${transactions.length}
Date Range: ${start} to ${end}
    `.trim();

    const systemPrompt = `You are Terry Scott's personal CFO analyst. Analyze this quarter's transactions and produce a structured report with the following sections:

1. **Executive Summary** — 3-4 sentences on the quarter's financial performance
2. **Income Analysis** — total income, sources breakdown, vs prior quarter
3. **Spending Analysis** — top 5 categories, flag anomalies, % of income
4. **Recurring Cost Audit** — fixed costs identified, annual run rate
5. **Net Position** — net cash flow, savings rate, vs target ($9,575/mo cash flow goal)
6. **Cash Flow vs Prior Quarter** — delta analysis, trend direction
7. **3 Specific Action Items** — concrete, numbered, dollar-specific actions for next quarter

Be direct. Numbers-anchored. No generic advice. Use exact figures from the data.`;

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: promptContent,
        },
      ],
    });

    const reportContent =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Save to ai_insights
    await supabase.from("north_star.ai_insights").insert({
      client_id: CLIENT_ID,
      session_date: new Date().toISOString().split("T")[0],
      insight_type: "quarterly_report",
      topic: `${quarter} ${year} Quarterly Report`,
      insight: reportContent,
      tags: [quarter, String(year), "quarterly_report"],
    });

    return NextResponse.json({
      report: reportContent,
      quarter,
      year,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Quarterly report error:", err);
    return NextResponse.json(
      { error: "Failed to generate quarterly report" },
      { status: 500 }
    );
  }
}
