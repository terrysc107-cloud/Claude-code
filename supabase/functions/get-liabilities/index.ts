import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokens } = await supabase.from("plaid_tokens").select("access_token");
    if (!tokens?.length) return Response.json({ liabilities: [] }, { headers: CORS });

    const plaidEnv = Deno.env.get("PLAID_ENV") || "production";
    const plaidBase = plaidEnv === "sandbox"
      ? "https://sandbox.plaid.com"
      : "https://production.plaid.com";

    const liabilities: unknown[] = [];

    for (const { access_token } of tokens) {
      const res = await fetch(`${plaidBase}/liabilities/get`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: Deno.env.get("PLAID_CLIENT_ID"),
          secret: Deno.env.get("PLAID_SECRET"),
          access_token,
        }),
      });
      const data = await res.json();
      if (data.liabilities?.credit) {
        liabilities.push(...data.liabilities.credit.map((c: Record<string, unknown>) => ({
          account_id: c.account_id,
          aprs: c.aprs,
          last_payment_amount: c.last_payment_amount,
          last_payment_date: c.last_payment_date,
          last_statement_balance: c.last_statement_balance,
          last_statement_issue_date: c.last_statement_issue_date,
          minimum_payment_amount: c.minimum_payment_amount,
          next_payment_due_date: c.next_payment_due_date,
          credit_limit: data.accounts?.find(
            (a: Record<string, unknown>) => a.account_id === c.account_id
          )?.balances?.limit ?? null,
        })));
      }
    }

    return Response.json({ liabilities }, { headers: CORS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
