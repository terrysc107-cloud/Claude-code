import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  fetchLastNMonthsTransactions,
  detectRecurringSpend,
} from "@/lib/transactions";

export async function GET() {
  try {
    const supabase = createServerClient();

    const transactions = await fetchLastNMonthsTransactions(supabase, 3);
    const recurring = detectRecurringSpend(transactions, 2);

    return NextResponse.json({
      items: recurring,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Recurring spend error:", err);
    return NextResponse.json(
      { error: "Failed to fetch recurring spend" },
      { status: 500 }
    );
  }
}
