import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLAID_ENVS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

interface Transaction {
  transaction_id: string;
  account_id: string;
  date: string;
  authorized_date: string | null;
  name: string;
  merchant_name: string;
  amount: number;
  iso_currency_code: string;
  pending: boolean;
  payment_channel: string;
  category_primary: string;
  category_detailed: string;
  sync_time: string;
}

function flattenTransaction(txn: Record<string, unknown>, syncTime: string): Transaction {
  const pfc = (txn.personal_finance_category as Record<string, string>) ?? {};
  return {
    transaction_id: (txn.transaction_id as string) ?? "",
    account_id: (txn.account_id as string) ?? "",
    date: (txn.date as string) ?? "",
    authorized_date: (txn.authorized_date as string | null) ?? null,
    name: (txn.name as string) ?? "",
    merchant_name: (txn.merchant_name as string) ?? "",
    amount: (txn.amount as number) ?? 0,
    iso_currency_code: (txn.iso_currency_code as string) ?? "",
    pending: (txn.pending as boolean) ?? false,
    payment_channel: (txn.payment_channel as string) ?? "",
    category_primary: pfc.primary ?? "",
    category_detailed: pfc.detailed ?? "",
    sync_time: syncTime,
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const plaidEnv = (Deno.env.get("PLAID_ENV") ?? "sandbox").toLowerCase();
  const baseUrl = PLAID_ENVS[plaidEnv] ?? PLAID_ENVS.sandbox;
  const clientId = Deno.env.get("PLAID_CLIENT_ID") ?? "";
  const secret = Deno.env.get("PLAID_SECRET") ?? "";

  try {
    const { data: tokens, error: tokensError } = await supabase
      .from("plaid_tokens")
      .select("*")
      .order("created_at", { ascending: true });

    if (tokensError) throw new Error(tokensError.message);
    if (!tokens?.length) {
      return new Response(JSON.stringify({ error: "No connected accounts" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    const syncTime = new Date().toISOString();
    let totalNew = 0;

    for (const tokenRow of tokens) {
      const { access_token, item_id, cursor } = tokenRow;
      let nextCursor = cursor ?? "";
      let hasMore = true;
      const allAdded: Transaction[] = [];
      const removedIds: string[] = [];

      while (hasMore) {
        const body: Record<string, unknown> = { client_id: clientId, secret, access_token };
        if (nextCursor) body.cursor = nextCursor;

        const plaidRes = await fetch(`${baseUrl}/transactions/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await plaidRes.json();
        if (!plaidRes.ok) throw new Error(data.error_message ?? "Plaid sync failed");

        const added: Record<string, unknown>[] = data.added ?? [];
        const modified: Record<string, unknown>[] = data.modified ?? [];
        const removed: { transaction_id: string }[] = data.removed ?? [];

        allAdded.push(...added.map((t) => flattenTransaction(t, syncTime)));
        // Modified transactions are treated as upserts (same as added)
        allAdded.push(...modified.map((t) => flattenTransaction(t, syncTime)));
        removedIds.push(...removed.map((r) => r.transaction_id));

        nextCursor = data.next_cursor ?? nextCursor;
        hasMore = data.has_more ?? false;
      }

      // Upsert added + modified
      if (allAdded.length) {
        const { error } = await supabase
          .from("transactions")
          .upsert(allAdded, { onConflict: "transaction_id" });
        if (error) throw new Error(error.message);
        totalNew += allAdded.length;
      }

      // Delete removed
      if (removedIds.length) {
        await supabase.from("transactions").delete().in("transaction_id", removedIds);
      }

      // Update cursor and last_sync
      await supabase
        .from("plaid_tokens")
        .update({ cursor: nextCursor, last_sync: syncTime })
        .eq("item_id", item_id);
    }

    return new Response(JSON.stringify({ success: true, new_count: totalNew }), {
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
