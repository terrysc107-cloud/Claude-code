export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, CLIENT_ID } from "@/lib/supabase";
import { createAnthropicClient, CLAUDE_MODEL, CFO_SYSTEM_PROMPT } from "@/lib/anthropic";
import { buildTransactionSummary, separateIncomeAndSpending, groupByCategory, getTopMerchants } from "@/lib/transactions";
import type { AskNorthStarRequest, ContextStoreEntry, NetWorthSnapshot, Goal, Transaction } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AskNorthStarRequest;
    const { question } = body;

    if (!question?.trim()) {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const anthropic = createAnthropicClient();

    // Calculate date range for last 90 days
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const startDate = ninetyDaysAgo.toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    // Load context in parallel
    const [contextResult, netWorthResult, goalsResult, txResult] =
      await Promise.all([
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
        supabase
          .schema("north_star")
          .from("goals")
          .select("*")
          .eq("client_id", CLIENT_ID)
          .eq("status", "active"),
        supabase
          .from("transactions")
          .select("*")
          .gte("date", startDate)
          .lte("date", endDate)
          .not("name", "ilike", "%apple cash sent%"),
      ]);

    const transactionsResult = (txResult.data as Transaction[] | null) ?? [];

    // Build context dump
    const contextEntries = (contextResult.data as ContextStoreEntry[] | null) ?? [];
    const contextDump = contextEntries
      .map((e) => `${e.context_key}: ${e.context_value}`)
      .join("\n");

    const latestNetWorth = netWorthResult.data?.[0] as NetWorthSnapshot | null;
    const activeGoals = (goalsResult.data as Goal[] | null) ?? [];

    const txSummary = buildTransactionSummary(transactionsResult, "Last 90 Days");

    const goalsText = activeGoals
      .map(
        (g) =>
          `- ${g.goal_name}: current $${g.current_value?.toLocaleString()} / target $${g.target_value?.toLocaleString()} by ${g.target_date}`
      )
      .join("\n");

    const contextBlock = `
=== FINANCIAL CONTEXT ===
${contextDump}

=== LATEST NET WORTH ===
Date: ${latestNetWorth?.snapshot_date ?? "N/A"}
Gross Assets: $${latestNetWorth?.gross_assets?.toLocaleString() ?? "N/A"}
Total Debt: $${latestNetWorth?.total_debt?.toLocaleString() ?? "N/A"}
Net Worth: $${latestNetWorth?.net_worth?.toLocaleString() ?? "N/A"}

=== ACTIVE GOALS ===
${goalsText || "No active goals found"}

=== TRANSACTION SUMMARY ===
${txSummary}
    `.trim();

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      system: `${CFO_SYSTEM_PROMPT}\n\nHere is your current financial data context:\n\n${contextBlock}`,
      messages: [
        {
          role: "user",
          content: question,
        },
      ],
    });

    const answer =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Log to ai_insights
    await supabase
      .schema("north_star")
      .from("ai_insights")
      .insert({
        client_id: CLIENT_ID,
        session_date: new Date().toISOString().split("T")[0],
        insight_type: "chat_qa",
        topic: question.substring(0, 100),
        insight: `Q: ${question}\n\nA: ${answer}`,
        tags: ["chat", "north_star"],
      });

    return NextResponse.json({
      answer,
      sources: ["context_store", "net_worth_snapshots", "goals", "transactions"],
    });
  } catch (err) {
    console.error("Ask North Star error:", err);
    return NextResponse.json(
      { error: "Failed to process question" },
      { status: 500 }
    );
  }
}
