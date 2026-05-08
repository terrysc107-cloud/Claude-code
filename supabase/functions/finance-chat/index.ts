import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.0";

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

const SYSTEM_PROMPT = `You are a personal finance assistant. You have access to the user's bank transaction history from Plaid. Answer questions about their spending, subscriptions, patterns, and financial health concisely and helpfully. Use markdown formatting in your responses. When showing amounts, always use dollar formatting. Be specific with numbers from the transaction data provided.`;

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const { message, conversation = [] } = await req.json().catch(() => ({}));

  if (!message) {
    return new Response(JSON.stringify({ error: "Missing message" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Fetch last 90 days of transactions for context
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { data: transactions } = await supabase
    .from("transactions")
    .select("date, name, merchant_name, amount, category_primary, payment_channel, pending")
    .gte("date", cutoff.toISOString().slice(0, 10))
    .eq("pending", false)
    .gt("amount", 0)
    .order("date", { ascending: false })
    .limit(500);

  const txSummary = transactions?.map((t) => ({
    date: t.date,
    merchant: t.merchant_name || t.name,
    amount: t.amount,
    category: t.category_primary,
    channel: t.payment_channel,
  })) ?? [];

  const contextMessage = `Here is the user's transaction data for the last 90 days (${txSummary.length} transactions):\n${JSON.stringify(txSummary, null, 2)}\n\nUser question: ${message}`;

  // Keep conversation history but replace first user message with enriched context
  const messages: Anthropic.MessageParam[] = [
    ...conversation.slice(-10), // last 10 turns for context
    { role: "user", content: contextMessage },
  ];

  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // @ts-ignore cache_control is valid in the API
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });

    const reply = (response.content[0] as Anthropic.TextBlock).text;

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
});
