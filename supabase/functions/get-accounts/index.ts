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
    if (!tokens?.length) return Response.json({ accounts: [] }, { headers: CORS });

    const plaidEnv = Deno.env.get("PLAID_ENV") || "production";
    const plaidBase = plaidEnv === "sandbox"
      ? "https://sandbox.plaid.com"
      : "https://production.plaid.com";

    const accounts: unknown[] = [];

    for (const { access_token } of tokens) {
      const res = await fetch(`${plaidBase}/accounts/balance/get`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: Deno.env.get("PLAID_CLIENT_ID"),
          secret: Deno.env.get("PLAID_SECRET"),
          access_token,
        }),
      });
      const data = await res.json();
      if (data.accounts) {
        accounts.push(...data.accounts.map((a: Record<string, unknown>) => ({
          account_id: a.account_id,
          name: a.name,
          official_name: a.official_name,
          type: a.type,
          subtype: a.subtype,
          mask: a.mask,
          balances: a.balances,
        })));
      }
    }

    return Response.json({ accounts }, { headers: CORS });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS });
  }
});
