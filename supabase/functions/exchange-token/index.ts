import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLAID_ENVS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

const corsHeaders = (origin: string) => {
  const allowed = Deno.env.get("ALLOWED_ORIGIN") ?? "";
  const allowOrigin = allowed && origin === allowed ? origin : (allowed ? "" : origin || "*");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
};

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const { public_token } = await req.json().catch(() => ({}));

  if (!public_token) {
    return new Response(JSON.stringify({ error: "Missing public_token" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  const plaidEnv = (Deno.env.get("PLAID_ENV") ?? "sandbox").toLowerCase();
  const baseUrl = PLAID_ENVS[plaidEnv] ?? PLAID_ENVS.sandbox;
  const clientId = Deno.env.get("PLAID_CLIENT_ID") ?? "";
  const secret = Deno.env.get("PLAID_SECRET") ?? "";

  try {
    // Exchange public token for access token
    const plaidRes = await fetch(`${baseUrl}/item/public_token/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, secret, public_token }),
    });

    const plaidData = await plaidRes.json();

    if (!plaidRes.ok) {
      return new Response(
        JSON.stringify({ error: plaidData.error_message ?? "Token exchange failed" }),
        { status: plaidRes.status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } },
      );
    }

    const { access_token, item_id } = plaidData;

    // Upsert into Supabase — safe to call multiple times (idempotent on item_id)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error: dbError } = await supabase
      .from("plaid_tokens")
      .upsert({ item_id, access_token, cursor: "" }, { onConflict: "item_id" });

    if (dbError) throw new Error(dbError.message);

    return new Response(JSON.stringify({ success: true, item_id }), {
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
