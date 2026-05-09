export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, CLIENT_ID } from "@/lib/supabase";

// ── Gmail OAuth helpers ───────────────────────────────────────────────────────

async function getGmailAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_REFRESH_TOKEN / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail token refresh failed: ${err}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

async function gmailSearch(accessToken: string, query: string, maxResults = 10): Promise<GmailThread[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.threads ?? []) as GmailThread[];
}

async function gmailGetThread(accessToken: string, threadId: string): Promise<GmailThreadDetail | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  return (await res.json()) as GmailThreadDetail;
}

// ── Extraction helpers ────────────────────────────────────────────────────────

function extractAmount(text: string): number | null {
  const match = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}

function extractDueDate(text: string): string | null {
  const patterns = [
    /due\s+([A-Z][a-z]+ \d{1,2},?\s+\d{4})/i,
    /due\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /by\s+([A-Z][a-z]+ \d{1,2},?\s+\d{4})/i,
    /payment date[:\s]+([A-Z][a-z]+ \d{1,2},?\s+\d{4})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }
  }
  return null;
}

function getHeader(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// ── Gmail search queries ──────────────────────────────────────────────────────

const FINANCIAL_QUERIES = [
  { query: "subject:(payment due OR invoice OR bill) newer_than:14d -in:sent -in:draft", category: "invoice" },
  { query: "subject:(bank alert OR account alert OR unusual activity OR low balance) newer_than:14d -in:sent -in:draft", category: "bank_alert" },
  { query: "subject:(payment request OR Zelle request OR Venmo request) newer_than:14d -in:sent -in:draft", category: "payment_request" },
  { query: "subject:(statement OR eStatement) newer_than:14d -in:sent -in:draft", category: "statement" },
  { query: "subject:(trade confirmation OR order executed OR order filled) newer_than:14d -in:sent -in:draft", category: "trade" },
  { query: "subject:(receipt OR toll OR E-ZPass OR SunPass) newer_than:7d -in:sent -in:draft", category: "bill" },
] as const;

// ── Route handlers ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Load known thread IDs to deduplicate
  const { data: existing } = await supabase
    .schema("north_star")
    .from("pending_items")
    .select("email_thread_id")
    .eq("client_id", CLIENT_ID)
    .not("email_thread_id", "is", null);

  const knownThreadIds = new Set(
    (existing ?? []).map((r: { email_thread_id: string }) => r.email_thread_id)
  );

  let accessToken: string;
  try {
    accessToken = await getGmailAccessToken();
  } catch (err) {
    console.error("Gmail auth failed:", err);
    return NextResponse.json({ error: "Gmail authentication failed" }, { status: 503 });
  }

  const itemsToInsert: Record<string, unknown>[] = [];

  for (const { query, category } of FINANCIAL_QUERIES) {
    try {
      const threads = await gmailSearch(accessToken, query, 10);

      for (const thread of threads) {
        if (knownThreadIds.has(thread.id)) continue;

        const detail = await gmailGetThread(accessToken, thread.id);
        const firstMsg = detail?.messages?.[0];
        if (!firstMsg) continue;

        const subject = getHeader(firstMsg, "Subject") || "(no subject)";
        const sender = getHeader(firstMsg, "From") || "";
        const snippet = detail.snippet ?? firstMsg.snippet ?? "";
        const combined = `${subject} ${snippet}`;

        itemsToInsert.push({
          client_id: CLIENT_ID,
          source: "gmail",
          email_thread_id: thread.id,
          category,
          sender,
          subject,
          snippet: snippet.substring(0, 500),
          amount: extractAmount(combined),
          due_date: extractDueDate(combined),
          status: "pending",
        });

        knownThreadIds.add(thread.id);
      }
    } catch {
      // Skip failed query — don't block the whole scan
    }
  }

  if (itemsToInsert.length > 0) {
    const { error } = await supabase
      .schema("north_star")
      .from("pending_items")
      .insert(itemsToInsert);
    if (error) console.error("Insert error:", error);
  }

  return NextResponse.json({
    scanned: FINANCIAL_QUERIES.length,
    inserted: itemsToInsert.length,
    scannedAt: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface GmailThread {
  id: string;
  snippet?: string;
}

interface GmailMessage {
  id: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

interface GmailThreadDetail {
  id: string;
  snippet?: string;
  messages?: GmailMessage[];
}
