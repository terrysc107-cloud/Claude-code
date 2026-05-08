import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

  const plaidEnv = (Deno.env.get("PLAID_ENV") ?? "sandbox").toLowerCase();
  const baseUrl = PLAID_ENVS[plaidEnv] ?? PLAID_ENVS.sandbox;
  const clientId = Deno.env.get("PLAID_CLIENT_ID") ?? "";
  const secret = Deno.env.get("PLAID_SECRET") ?? "";

  if (!clientId || !secret) {
    return new Response(JSON.stringify({ error: "Missing Plaid credentials" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  try {
    const res = await fetch(`${baseUrl}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        user: { client_user_id: "finance-dashboard-user" },
        client_name: "Finance Dashboard",
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data.error_message ?? "Failed to create link token" }),
        { status: res.status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } },
      );
    }

    return new Response(JSON.stringify({ link_token: data.link_token }), {
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
