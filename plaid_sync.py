"""
plaid_sync.py — Sync Plaid transactions via Supabase and regenerate the dashboard.

Usage:
    python plaid_sync.py

Reads access_token + cursor from Supabase plaid_tokens table.
Upserts transactions to Supabase transactions table.
Regenerates public/dashboard.html with the full dataset embedded.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from plaid_analyze import analyze_transactions

load_dotenv()

DASHBOARD_FILE = Path("public/dashboard.html")

PLAID_ENVS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def supabase_headers() -> dict:
    key = os.environ.get("SUPABASE_KEY", "")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def supabase_url() -> str:
    return os.environ.get("SUPABASE_URL", "")


def supabase_get(table: str, params: str = "") -> list[dict]:
    url = f"{supabase_url()}/rest/v1/{table}?{params}" if params else f"{supabase_url()}/rest/v1/{table}"
    resp = requests.get(url, headers=supabase_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def supabase_upsert(table: str, rows: list[dict], on_conflict: str = "") -> None:
    if not rows:
        return
    headers = supabase_headers()
    if on_conflict:
        headers["Prefer"] = f"resolution=merge-duplicates,return=minimal"
    url = f"{supabase_url()}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    # Batch in chunks of 500
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        resp = requests.post(url, headers=headers, json=chunk, timeout=30)
        resp.raise_for_status()


def supabase_update(table: str, match: dict, data: dict) -> None:
    headers = supabase_headers()
    headers["Prefer"] = "return=minimal"
    params = "&".join(f"{k}=eq.{v}" for k, v in match.items())
    url = f"{supabase_url()}/rest/v1/{table}?{params}"
    resp = requests.patch(url, headers=headers, json=data, timeout=15)
    resp.raise_for_status()


def supabase_delete(table: str, ids: list[str], id_col: str = "transaction_id") -> None:
    if not ids:
        return
    headers = supabase_headers()
    headers["Prefer"] = "return=minimal"
    # PostgREST IN filter: col=in.(a,b,c)
    values = ",".join(ids)
    url = f"{supabase_url()}/rest/v1/{table}?{id_col}=in.({values})"
    resp = requests.delete(url, headers=headers, timeout=30)
    resp.raise_for_status()


# ---------------------------------------------------------------------------
# Plaid helpers
# ---------------------------------------------------------------------------

def get_base_url() -> str:
    env = os.environ.get("PLAID_ENV", "sandbox").lower()
    if env not in PLAID_ENVS:
        print(f"ERROR: PLAID_ENV must be one of {list(PLAID_ENVS)}. Got: {env!r}")
        sys.exit(1)
    return PLAID_ENVS[env]


def load_credentials() -> tuple[str, str]:
    client_id = os.environ.get("PLAID_CLIENT_ID", "").strip()
    secret = os.environ.get("PLAID_SECRET", "").strip()
    if not client_id or not secret:
        print("ERROR: PLAID_CLIENT_ID and PLAID_SECRET must be set in .env")
        sys.exit(1)
    return client_id, secret


def plaid_post(base_url: str, path: str, payload: dict) -> dict:
    url = f"{base_url}{path}"
    resp = requests.post(url, json=payload, timeout=30)
    data = resp.json()
    if resp.status_code != 200:
        error = data.get("error_message", data.get("display_message", str(data)))
        print(f"ERROR calling {path}: {error}")
        sys.exit(1)
    return data


def flatten_transaction(txn: dict, sync_time: str) -> dict:
    pfc = txn.get("personal_finance_category") or {}
    return {
        "transaction_id": txn.get("transaction_id", ""),
        "account_id": txn.get("account_id", ""),
        "date": txn.get("date", ""),
        "authorized_date": txn.get("authorized_date") or None,
        "name": txn.get("name", ""),
        "merchant_name": txn.get("merchant_name") or "",
        "amount": txn.get("amount", 0),
        "iso_currency_code": txn.get("iso_currency_code") or "",
        "pending": txn.get("pending", False),
        "payment_channel": txn.get("payment_channel") or "",
        "category_primary": pfc.get("primary", ""),
        "category_detailed": pfc.get("detailed", ""),
        "sync_time": sync_time,
    }


# ---------------------------------------------------------------------------
# Sync logic
# ---------------------------------------------------------------------------

def sync_transactions(
    base_url: str, client_id: str, secret: str, access_token: str, cursor: str
) -> tuple[list[dict], list[dict], list[str], str]:
    sync_time = datetime.now(timezone.utc).isoformat()

    all_added: list[dict] = []
    all_modified: list[dict] = []
    all_removed_ids: list[str] = []
    has_more = True
    page = 0

    while has_more:
        page += 1
        payload: dict = {"client_id": client_id, "secret": secret, "access_token": access_token}
        if cursor:
            payload["cursor"] = cursor

        data = plaid_post(base_url, "/transactions/sync", payload)
        added = data.get("added", [])
        modified = data.get("modified", [])
        removed = data.get("removed", [])

        all_added.extend(flatten_transaction(t, sync_time) for t in added)
        all_modified.extend(flatten_transaction(t, sync_time) for t in modified)
        all_removed_ids.extend(r["transaction_id"] for r in removed if r.get("transaction_id"))

        cursor = data.get("next_cursor", cursor)
        has_more = data.get("has_more", False)
        print(f"  Page {page}: {len(added)} added, {len(modified)} modified, {len(removed)} removed, has_more={has_more}")

    return all_added, all_modified, all_removed_ids, cursor


# ---------------------------------------------------------------------------
# Dashboard generation
# ---------------------------------------------------------------------------

DASHBOARD_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Financial Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #1C1714;
    --surface: #262220;
    --surface2: #302B28;
    --accent: #DA7756;
    --accent2: #C05746;
    --text: #F5EDE6;
    --muted: #9E8E84;
    --green: #5ABF8A;
    --red: #E06060;
    --border: #3D3530;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 18px; font-weight: 600; color: var(--text); }
  header .sync-info { font-size: 12px; color: var(--muted); }
  main { padding: 24px; max-width: 1400px; margin: 0 auto; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 8px; }
  .card .value { font-size: 26px; font-weight: 700; color: var(--text); }
  .card .sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  @media (max-width: 900px) { .charts { grid-template-columns: 1fr; } }
  .chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .chart-card h2 { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 16px; }
  .chart-wrap { position: relative; height: 280px; }
  .section { margin-bottom: 24px; }
  .section h2 { font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 12px; }
  .controls { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .controls input, .controls select { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); padding: 8px 12px; font-size: 13px; outline: none; }
  .controls input:focus, .controls select:focus { border-color: var(--accent); }
  .controls input { flex: 1; min-width: 180px; }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
  th { background: var(--surface2); text-align: left; padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); cursor: pointer; user-select: none; white-space: nowrap; }
  th:hover { color: var(--text); }
  th .sort-arrow { margin-left: 4px; opacity: .5; }
  td { padding: 10px 14px; border-top: 1px solid var(--border); font-size: 13px; }
  tr:hover td { background: var(--surface2); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-green { background: rgba(90,191,138,.15); color: var(--green); }
  .badge-red { background: rgba(224,96,96,.15); color: var(--red); }
  .badge-purple { background: rgba(218,119,86,.15); color: var(--accent); }
  .amount-neg { color: var(--red); }
  .amount-pos { color: var(--green); }
  .sub-table { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .sub-table th, .sub-table td { padding: 10px 16px; }
  .waste-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .waste-item { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--accent2); border-radius: 8px; padding: 12px 16px; }
  .waste-item .w-name { font-weight: 600; margin-bottom: 4px; }
  .waste-item .w-detail { font-size: 12px; color: var(--muted); }
  .empty { color: var(--muted); font-size: 13px; padding: 24px; text-align: center; }
  .pagination { display: flex; align-items: center; gap: 8px; margin-top: 12px; justify-content: flex-end; }
  .pagination button { background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
  .pagination button:disabled { opacity: .4; cursor: default; }
  .pagination span { font-size: 12px; color: var(--muted); }
  .ai-section { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: 12px; padding: 24px 28px; margin-bottom: 24px; }
  .ai-section h2 { font-size: 13px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .ai-section .ai-badge { background: rgba(218,119,86,.15); color: var(--accent); font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
  .ai-body h2 { font-size: 15px; font-weight: 700; color: var(--text); margin: 20px 0 8px; text-transform: none; letter-spacing: 0; }
  .ai-body h2:first-child { margin-top: 0; }
  .ai-body p { font-size: 14px; color: var(--muted); line-height: 1.7; margin-bottom: 10px; }
  .ai-body ul, .ai-body ol { margin: 8px 0 10px 20px; }
  .ai-body li { font-size: 14px; color: var(--muted); line-height: 1.7; margin-bottom: 4px; }
  .ai-body strong { color: var(--text); font-weight: 600; }
  .ai-body em { color: var(--muted); font-size: 12px; }
  .ai-body hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
  .ai-empty { color: var(--muted); font-size: 13px; font-style: italic; }
  .range-chips { display: flex; gap: 6px; margin-bottom: 16px; }
  .range-chip { background: var(--surface); border: 1px solid var(--border); color: var(--muted); border-radius: 20px; padding: 5px 14px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; }
  .range-chip:hover { border-color: var(--accent); color: var(--accent); }
  .range-chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .header-actions { display: flex; gap: 8px; align-items: center; }
  .btn { padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; transition: opacity .15s; }
  .btn:hover { opacity: .8; }
  .btn:disabled { opacity: .5; cursor: default; }
  .btn-sync { background: var(--accent); color: #fff; }
  .btn-export { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
  .btn-chat { background: var(--green); color: #0f1117; }
  .chat-panel { position: fixed; right: 0; top: 0; height: 100vh; width: min(420px, 100vw); background: var(--surface); border-left: 1px solid var(--border); display: flex; flex-direction: column; transform: translateX(100%); transition: transform .3s ease; z-index: 1000; box-shadow: -4px 0 24px rgba(0,0,0,.4); }
  .chat-panel.open { transform: translateX(0); }
  .chat-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .chat-header h3 { font-size: 14px; font-weight: 600; color: var(--text); }
  .chat-close { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 20px; line-height: 1; padding: 2px 6px; border-radius: 4px; }
  .chat-close:hover { background: var(--surface2); color: var(--text); }
  .chat-prompts { padding: 10px 14px; border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0; }
  .prompt-chip { background: var(--surface2); border: 1px solid var(--border); color: var(--muted); border-radius: 20px; padding: 4px 10px; font-size: 11px; cursor: pointer; white-space: nowrap; }
  .prompt-chip:hover { border-color: var(--accent); color: var(--accent); }
  .chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .msg { max-width: 92%; padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.65; word-break: break-word; }
  .msg-user { background: var(--accent); color: #fff; align-self: flex-end; border-radius: 12px 12px 2px 12px; }
  .msg-ai { background: var(--surface2); color: var(--text); align-self: flex-start; border-radius: 12px 12px 12px 2px; }
  .msg-ai h2, .msg-ai h3 { font-size: 13px; font-weight: 700; color: var(--text); margin: 10px 0 4px; }
  .msg-ai h2:first-child, .msg-ai h3:first-child { margin-top: 0; }
  .msg-ai p { margin-bottom: 6px; color: var(--muted); }
  .msg-ai ul, .msg-ai ol { margin: 4px 0 6px 16px; color: var(--muted); }
  .msg-ai li { margin-bottom: 2px; }
  .msg-ai table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 8px 0; }
  .msg-ai th { background: var(--bg); padding: 5px 8px; text-align: left; color: var(--muted); font-size: 11px; border-bottom: 1px solid var(--border); }
  .msg-ai td { padding: 5px 8px; border-top: 1px solid var(--border); color: var(--muted); }
  .msg-ai strong { color: var(--text); font-weight: 600; }
  .msg-ai code { background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 11px; }
  .msg-ai hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
  .msg-thinking { color: var(--muted); font-style: italic; font-size: 12px; align-self: flex-start; padding: 10px 14px; }
  .chat-input-row { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; flex-shrink: 0; }
  .chat-input { flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); padding: 8px 12px; font-size: 13px; outline: none; resize: none; min-height: 40px; max-height: 120px; font-family: inherit; }
  .chat-input:focus { border-color: var(--accent); }
  .chat-send { background: var(--accent); border: none; color: #fff; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 13px; font-weight: 600; align-self: flex-end; }
  .chat-send:disabled { opacity: .4; cursor: default; }
</style>
</head>
<body>
<header>
  <h1>Financial Dashboard</h1>
  <div class="header-actions">
    <span class="sync-info" id="syncInfo"></span>
    <button class="btn btn-sync" onclick="syncNow()">&#x21BB; Sync</button>
    <button class="btn btn-export" onclick="exportCSV()">&#x2193; Export CSV</button>
    <button class="btn btn-chat" onclick="toggleChat()">&#x1F4AC; Ask AI</button>
  </div>
</header>
<main>
  <div class="ai-section" id="aiSection" style="display:none">
    <h2>AI Analysis <span class="ai-badge">Claude</span></h2>
    <div class="ai-body" id="aiBody"></div>
  </div>
  <div class="range-chips" id="rangeChips">
    <button class="range-chip" data-days="7" onclick="setRange(7)">7 days</button>
    <button class="range-chip active" data-days="30" onclick="setRange(30)">30 days</button>
    <button class="range-chip" data-days="90" onclick="setRange(90)">90 days</button>
    <button class="range-chip" data-days="0" onclick="setRange(0)">All time</button>
  </div>
  <div class="cards" id="summaryCards"></div>
  <div class="charts">
    <div class="chart-card">
      <h2 id="catChartTitle">Spending by Category (30d)</h2>
      <div class="chart-wrap"><canvas id="catChart"></canvas></div>
    </div>
    <div class="chart-card">
      <h2>Monthly Spending Trend</h2>
      <div class="chart-wrap"><canvas id="trendChart"></canvas></div>
    </div>
  </div>
  <div class="section">
    <h2>Recurring / Subscriptions</h2>
    <div id="subscriptions"></div>
  </div>
  <div class="section">
    <h2>Potential Waste</h2>
    <div class="waste-list" id="wasteList"></div>
  </div>
  <div class="section">
    <h2>All Transactions</h2>
    <div class="controls">
      <input type="text" id="searchBox" placeholder="Search merchant, category...">
      <select id="catFilter"><option value="">All categories</option></select>
      <select id="channelFilter"><option value="">All channels</option></select>
      <select id="monthFilter"><option value="">All months</option></select>
    </div>
    <table id="txTable">
      <thead>
        <tr>
          <th data-col="date">Date <span class="sort-arrow"></span></th>
          <th data-col="merchant_name">Merchant <span class="sort-arrow"></span></th>
          <th data-col="name">Description <span class="sort-arrow"></span></th>
          <th data-col="amount">Amount <span class="sort-arrow"></span></th>
          <th data-col="category_primary">Category <span class="sort-arrow"></span></th>
          <th data-col="payment_channel">Channel <span class="sort-arrow"></span></th>
          <th data-col="pending">Status <span class="sort-arrow"></span></th>
        </tr>
      </thead>
      <tbody id="txBody"></tbody>
    </table>
    <div class="pagination" id="pagination"></div>
  </div>
</main>

<script>
const TRANSACTIONS = __TRANSACTIONS_JSON__;
const LAST_SYNC = "__LAST_SYNC__";
const AI_ANALYSIS = `__AI_ANALYSIS__`;

// Render AI analysis section
(function renderAnalysis() {
  if (!AI_ANALYSIS.trim()) return;
  document.getElementById("aiSection").style.display = "";
  // Simple markdown → HTML (handles ## headings, **bold**, *em*, - lists, hr, paragraphs)
  const html = AI_ANALYSIS
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, "<hr>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)+/g, m => `<ul>${m}</ul>`)
    .replace(/^(?!<(?:h[1-6]|ul|ol|li|p|hr|table|thead|tbody|tr))(.*\S.*)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
  document.getElementById("aiBody").innerHTML = html;
})();

document.getElementById("syncInfo").textContent =
  LAST_SYNC ? "Last synced: " + new Date(LAST_SYNC).toLocaleString() : "No sync yet";

const fmtCurrency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const titleCase = (s) => (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const now = new Date();
let activeDays = 30;
let catChartInstance = null;

function getWindowTx(days) {
  if (!days) return TRANSACTIONS.filter(t => !t.pending && t.amount > 0);
  const ms = days * 24 * 60 * 60 * 1000;
  return TRANSACTIONS.filter(t => (now - new Date(t.date)) <= ms && !t.pending && t.amount > 0);
}

function setRange(days) {
  activeDays = days;
  document.querySelectorAll(".range-chip").forEach(c => c.classList.toggle("active", +c.dataset.days === days));
  buildCards(days);
  buildCatChart(days);
}

function buildCards(days) {
  const txWindow = getWindowTx(days);
  const label = days ? `${days} days` : "all time";
  const total = txWindow.reduce((s, t) => s + t.amount, 0);
  const avg = txWindow.length ? total / txWindow.length : 0;
  const catCounts = {};
  txWindow.forEach(t => { catCounts[t.category_primary] = (catCounts[t.category_primary] || 0) + t.amount; });
  const topCat = Object.entries(catCounts).sort((a,b) => b[1]-a[1])[0];
  const cards = [
    { label: `Spent (${label})`, value: fmtCurrency(total), sub: `${txWindow.length} transactions` },
    { label: "Avg transaction", value: fmtCurrency(avg), sub: "Posted only" },
    { label: "Top category", value: topCat ? titleCase(topCat[0]) : "--", sub: topCat ? fmtCurrency(topCat[1]) : "" },
    { label: "Total transactions", value: TRANSACTIONS.length.toLocaleString(), sub: "All time" },
  ];
  document.getElementById("summaryCards").innerHTML = cards.map(c => `<div class="card"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`).join("");
}

function buildCatChart(days) {
  const txWindow = getWindowTx(days);
  const label = days ? `${days}d` : "All Time";
  document.getElementById("catChartTitle").textContent = `Spending by Category (${label})`;
  const map = {};
  txWindow.forEach(t => { map[t.category_primary || "OTHER"] = (map[t.category_primary || "OTHER"] || 0) + t.amount; });
  const sorted = Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 10);
  const colors = ["#DA7756","#5ABF8A","#7BB3D4","#F0C070","#C05746","#8BAF7A","#D4956A","#B07060","#E0A868","#8A9EBF"];
  if (catChartInstance) catChartInstance.destroy();
  catChartInstance = new Chart(document.getElementById("catChart"), {
    type: "bar",
    data: { labels: sorted.map(([k]) => titleCase(k)), datasets: [{ data: sorted.map(([,v]) => v), backgroundColor: colors, borderRadius: 6 }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtCurrency(ctx.raw) } } },
      scales: { x: { ticks: { color: "#9E8E84", callback: v => "$"+Math.round(v) }, grid: { color: "#3D3530" } }, y: { ticks: { color: "#F5EDE6" }, grid: { display: false } } }
    }
  });
}

buildCards(30);
buildCatChart(30);

(function buildTrendChart() {
  const map = {};
  TRANSACTIONS.filter(t => !t.pending && t.amount > 0).forEach(t => { const mo = t.date.slice(0,7); map[mo] = (map[mo]||0) + t.amount; });
  const months = Object.keys(map).sort();
  new Chart(document.getElementById("trendChart"), {
    type: "line",
    data: { labels: months, datasets: [{ data: months.map(m => map[m]), borderColor: "#DA7756", backgroundColor: "rgba(218,119,86,.12)", fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: "#DA7756" }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtCurrency(ctx.raw) } } },
      scales: { x: { ticks: { color: "#9E8E84" }, grid: { color: "#3D3530" } }, y: { ticks: { color: "#9E8E84", callback: v => "$"+Math.round(v) }, grid: { color: "#3D3530" } } }
    }
  });
})();

(function buildSubs() {
  const byMerchant = {};
  TRANSACTIONS.filter(t => !t.pending && t.amount > 0).forEach(t => { const key = (t.merchant_name || t.name).trim(); if (!byMerchant[key]) byMerchant[key] = []; byMerchant[key].push(t); });
  const subs = [];
  for (const [merchant, txns] of Object.entries(byMerchant)) {
    const months = [...new Set(txns.map(t => t.date.slice(0,7)))];
    if (months.length >= 2) {
      const amounts = txns.map(t => t.amount);
      const avgAmt = amounts.reduce((s,a) => s+a, 0) / amounts.length;
      const maxAmt = Math.max(...amounts); const minAmt = Math.min(...amounts);
      const consistent = (maxAmt - minAmt) / avgAmt < 0.1;
      if (consistent || avgAmt < 20) subs.push({ merchant, months: months.length, avgAmt, txns: txns.length, category: txns[0].category_primary });
    }
  }
  subs.sort((a,b) => b.avgAmt - a.avgAmt);
  const el = document.getElementById("subscriptions");
  if (!subs.length) { el.innerHTML = '<div class="empty">No recurring charges detected yet.</div>'; return; }
  const escSub = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  el.innerHTML = `<table class="sub-table"><thead><tr><th>Merchant</th><th>Category</th><th>Avg Amount</th><th>Months</th><th>Charges</th></tr></thead><tbody>${subs.map(s => `<tr><td><strong>${escSub(s.merchant)}</strong></td><td><span class="badge badge-purple">${escSub(titleCase(s.category))}</span></td><td>${fmtCurrency(s.avgAmt)}</td><td>${s.months}</td><td>${s.txns}</td></tr>`).join("")}</tbody></table>`;
})();

(function buildWaste() {
  const waste = [];
  // Small recurring charges (< $10, seen in 2+ months) — likely forgotten subscriptions
  const micro = {};
  TRANSACTIONS.filter(t => !t.pending && t.amount > 0 && t.amount < 10).forEach(t => {
    const key = (t.merchant_name || t.name).trim();
    if (!micro[key]) micro[key] = { months: new Set(), total: 0 };
    micro[key].months.add(t.date.slice(0,7));
    micro[key].total += t.amount;
  });
  for (const [name, { months, total }] of Object.entries(micro)) {
    if (months.size >= 2) waste.push({ name, detail: `Small recurring · ${months.size} months · ${fmtCurrency(total)} total` });
  }
  // Duplicate streaming / similar-category subscriptions
  const streamingCats = ["ENTERTAINMENT", "VIDEO_STREAMING", "MUSIC_STREAMING", "DIGITAL_ENTERTAINMENT"];
  const streaming = TRANSACTIONS.filter(t => !t.pending && t.amount > 0 && streamingCats.some(c => (t.category_primary + t.category_detailed).includes(c)));
  const streamMerchants = [...new Set(streaming.map(t => (t.merchant_name || t.name).trim()))];
  if (streamMerchants.length >= 3) {
    waste.push({ name: "Multiple streaming services", detail: `${streamMerchants.slice(0,3).join(", ")}${streamMerchants.length > 3 ? ` +${streamMerchants.length - 3} more` : ""}` });
  }
  const el = document.getElementById("wasteList");
  if (!waste.length) { el.innerHTML = '<div class="empty">No potential waste detected.</div>'; return; }
  const escW = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  el.innerHTML = waste.slice(0,20).map(w => `<div class="waste-item"><div class="w-name">${escW(w.name)}</div><div class="w-detail">${escW(w.detail)}</div></div>`).join("");
})();

(function buildTable() {
  let filtered = [...TRANSACTIONS]; let sortCol = "date"; let sortDir = -1; let page = 0; const PAGE_SIZE = 50;
  const cats = [...new Set(TRANSACTIONS.map(t => t.category_primary).filter(Boolean))].sort();
  const channels = [...new Set(TRANSACTIONS.map(t => t.payment_channel).filter(Boolean))].sort();
  const months = [...new Set(TRANSACTIONS.map(t => t.date.slice(0,7)).filter(Boolean))].sort().reverse();
  const catSel = document.getElementById("catFilter"); const chSel = document.getElementById("channelFilter"); const moSel = document.getElementById("monthFilter");
  cats.forEach(c => catSel.appendChild(new Option(titleCase(c), c)));
  channels.forEach(c => chSel.appendChild(new Option(c, c)));
  months.forEach(m => moSel.appendChild(new Option(m, m)));
  function applyFilters() {
    const q = document.getElementById("searchBox").value.toLowerCase();
    const cat = catSel.value; const ch = chSel.value; const mo = moSel.value;
    filtered = TRANSACTIONS.filter(t => {
      if (q && !(t.name + t.merchant_name + t.category_primary).toLowerCase().includes(q)) return false;
      if (cat && t.category_primary !== cat) return false;
      if (ch && t.payment_channel !== ch) return false;
      if (mo && !t.date.startsWith(mo)) return false;
      return true;
    });
    page = 0; render();
  }
  function sortData() { filtered.sort((a, b) => { let av = a[sortCol], bv = b[sortCol]; if (sortCol === "amount") { av = +av; bv = +bv; } if (av < bv) return -sortDir; if (av > bv) return sortDir; return 0; }); }
  function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function render() {
    sortData(); const total = filtered.length; const start = page * PAGE_SIZE; const slice = filtered.slice(start, start + PAGE_SIZE);
    const body = document.getElementById("txBody");
    if (!slice.length) { body.innerHTML = `<tr><td colspan="7" class="empty">No transactions found.</td></tr>`; }
    else { body.innerHTML = slice.map(t => { const amtClass = t.amount < 0 ? "amount-pos" : "amount-neg"; const amtDisplay = t.amount < 0 ? `+${fmtCurrency(-t.amount)}` : fmtCurrency(t.amount); const status = t.pending ? `<span class="badge badge-purple">Pending</span>` : `<span class="badge badge-green">Posted</span>`; return `<tr><td>${esc(t.date)}</td><td>${esc(t.merchant_name) || "--"}</td><td>${esc(t.name)}</td><td class="${amtClass}">${amtDisplay}</td><td>${esc(titleCase(t.category_primary))}</td><td>${esc(t.payment_channel) || "--"}</td><td>${status}</td></tr>`; }).join(""); }
    const pages = Math.ceil(total / PAGE_SIZE);
    document.getElementById("pagination").innerHTML = `<span>${total.toLocaleString()} transactions</span><button onclick="prevPage()" ${page===0?"disabled":""}>Prev</button><span>Page ${page+1} of ${Math.max(1,pages)}</span><button onclick="nextPage()" ${page>=pages-1?"disabled":""}>Next</button>`;
  }
  window.prevPage = () => { if (page > 0) { page--; render(); } };
  window.nextPage = () => { if (page < Math.ceil(filtered.length/PAGE_SIZE)-1) { page++; render(); } };
  document.querySelectorAll("#txTable th[data-col]").forEach(th => { th.addEventListener("click", () => { const col = th.dataset.col; if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = -1; } render(); }); });
  document.getElementById("searchBox").addEventListener("input", applyFilters);
  catSel.addEventListener("change", applyFilters); chSel.addEventListener("change", applyFilters); moSel.addEventListener("change", applyFilters);
  render();
})();

// ── Chat Panel ──────────────────────────────────────────────────────────────
const SUPABASE_FN = "__SUPABASE_FN__";
let chatConversation = [];

function toggleChat() {
  document.getElementById("chatPanel").classList.toggle("open");
}

function handleChatKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function sendPrompt(text) {
  document.getElementById("chatInput").value = text;
  sendMessage();
  document.getElementById("chatPanel").classList.add("open");
}

function mdToHtml(md) {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)+/g, m => `<ul>${m}</ul>`)
    .replace(/^\|(.+)\|$/gm, m => {
      const cells = m.split("|").filter((c, i, a) => i > 0 && i < a.length - 1);
      return "<tr>" + cells.map(c => `<td>${c.trim()}</td>`).join("") + "</tr>";
    })
    .replace(/(<tr>[\s\S]*?<\/tr>)+/g, m => {
      const rows = m.trim().split("</tr>").filter(r => r.includes("<tr>") && !r.includes("---")).map(r => r + "</tr>");
      if (!rows.length) return m;
      const [head, ...body] = rows;
      const th = head.replace(/<td>/g, "<th>").replace(/<\/td>/g, "</th>");
      return `<table><thead>${th}</thead><tbody>${body.join("")}</tbody></table>`;
    })
    .replace(/^---$/gm, "<hr>")
    .replace(/\\n\\n/g, "<br>")
    .replace(/^(?!<(?:h[1-6]|ul|ol|li|p|hr|table|thead|tbody|tr))(.*\S.*)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}

async function sendMessage() {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (!msg) return;
  input.value = "";
  const msgs = document.getElementById("chatMessages");
  msgs.innerHTML += `<div class="msg msg-user">${msg.replace(/</g,"&lt;")}</div>`;
  const thinkId = "think_" + Date.now();
  msgs.innerHTML += `<div class="msg msg-thinking" id="${thinkId}">Thinking...</div>`;
  msgs.scrollTop = msgs.scrollHeight;
  document.getElementById("chatSend").disabled = true;
  try {
    const res = await fetch(`${SUPABASE_FN}/finance-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, conversation: chatConversation }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    chatConversation.push({ role: "user", content: msg });
    chatConversation.push({ role: "assistant", content: data.reply });
    if (chatConversation.length > 20) chatConversation = chatConversation.slice(-20);
    document.getElementById(thinkId).outerHTML = `<div class="msg msg-ai">${mdToHtml(data.reply)}</div>`;
  } catch(e) {
    document.getElementById(thinkId).outerHTML = `<div class="msg msg-ai" style="color:var(--red)">Error: ${e.message}</div>`;
  }
  document.getElementById("chatSend").disabled = false;
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Sync ─────────────────────────────────────────────────────────────────────
async function syncNow() {
  const btn = document.querySelector(".btn-sync");
  btn.textContent = "Syncing...";
  btn.disabled = true;
  try {
    const res = await fetch(`${SUPABASE_FN}/plaid-sync`, { method: "POST" });
    if (res.status === 404) throw new Error("Run `python plaid_sync.py` locally to sync");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (data.new_count > 0) {
      btn.textContent = `✓ ${data.new_count} new — reloading`;
      setTimeout(() => location.reload(), 1500);
    } else {
      btn.textContent = "✓ Up to date";
      setTimeout(() => { btn.textContent = "↻ Sync"; btn.disabled = false; }, 2500);
    }
  } catch(e) {
    btn.textContent = "↻ Sync";
    btn.disabled = false;
    const syncInfo = document.getElementById("syncInfo");
    syncInfo.style.color = "var(--red)";
    syncInfo.textContent = e.message;
    setTimeout(() => { syncInfo.style.color = ""; syncInfo.textContent = LAST_SYNC ? "Last synced: " + new Date(LAST_SYNC).toLocaleString() : "No sync yet"; }, 5000);
  }
}

// ── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
  const cols = ["date","merchant_name","name","amount","category_primary","payment_channel","pending","account_id"];
  const escape = v => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const rows = [cols.join(","), ...TRANSACTIONS.map(t => cols.map(c => escape(t[c])).join(","))];
  const blob = new Blob([rows.join("\\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `transactions_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}
</script>

<div class="chat-panel" id="chatPanel">
  <div class="chat-header">
    <h3>&#x1F4AC; Finance AI</h3>
    <button class="chat-close" onclick="toggleChat()">&#x2715;</button>
  </div>
  <div class="chat-prompts">
    <span class="prompt-chip" onclick="sendPrompt('Summarize my spending this month')">This month</span>
    <span class="prompt-chip" onclick="sendPrompt('Generate a Q1 2026 P&amp;L review with income and expenses')">Q1 P&amp;L</span>
    <span class="prompt-chip" onclick="sendPrompt('List all my recurring subscriptions with amounts')">Subscriptions</span>
    <span class="prompt-chip" onclick="sendPrompt('Compare my spending across the last 3 months')">3-month trend</span>
    <span class="prompt-chip" onclick="sendPrompt('What are my top 10 merchants by total spending?')">Top merchants</span>
    <span class="prompt-chip" onclick="sendPrompt('Find any unusual or unexpectedly large transactions')">Unusual charges</span>
    <span class="prompt-chip" onclick="sendPrompt('Where can I cut spending to save more money?')">Save money</span>
  </div>
  <div class="chat-messages" id="chatMessages"></div>
  <div class="chat-input-row">
    <textarea class="chat-input" id="chatInput" placeholder="Ask anything about your finances..." onkeydown="handleChatKey(event)" rows="1"></textarea>
    <button class="chat-send" id="chatSend" onclick="sendMessage()">Send</button>
  </div>
</div>

</body>
</html>"""


def build_dashboard(transactions: list[dict], last_sync: str, analysis: str = "", supabase_fn: str = "") -> str:
    return DASHBOARD_TEMPLATE.replace(
        "__TRANSACTIONS_JSON__",
        json.dumps(transactions, ensure_ascii=False),
    ).replace("__LAST_SYNC__", last_sync).replace(
        "__SUPABASE_FN__", supabase_fn,
    ).replace(
        "__AI_ANALYSIS__",
        analysis.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${") if analysis else "",
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    sb_url = supabase_url()
    sb_key = os.environ.get("SUPABASE_KEY", "")
    if not sb_url or not sb_key:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env")
        sys.exit(1)

    base_url = get_base_url()
    client_id, secret = load_credentials()

    # Read ALL tokens from Supabase
    print("Reading access tokens from Supabase...")
    tokens = supabase_get("plaid_tokens", "order=created_at.asc")
    if not tokens:
        print("No access token found in Supabase. Connect your bank first.")
        sys.exit(1)

    print(f"  Found {len(tokens)} connected account(s)")
    total_new = 0
    last_sync = datetime.now(timezone.utc).isoformat()

    # Sync each connected account
    for token_row in tokens:
        access_token = token_row["access_token"]
        cursor = token_row.get("cursor") or ""
        item_id = token_row.get("item_id", "")
        print(f"\nSyncing item: {item_id}")

        new_txns, modified_txns, removed_ids, next_cursor = sync_transactions(
            base_url, client_id, secret, access_token, cursor
        )
        print(f"  Fetched {len(new_txns)} added, {len(modified_txns)} modified, {len(removed_ids)} removed")
        total_new += len(new_txns)

        if new_txns:
            supabase_upsert("transactions", new_txns, on_conflict="transaction_id")
        if modified_txns:
            supabase_upsert("transactions", modified_txns, on_conflict="transaction_id")
        if removed_ids:
            supabase_delete("transactions", removed_ids)
            print(f"  Deleted {len(removed_ids)} removed transaction(s)")

        supabase_update("plaid_tokens", {"item_id": item_id}, {
            "cursor": next_cursor,
            "last_sync": last_sync,
        })

    print(f"\nTotal new transactions across all accounts: {total_new}")

    # Read all transactions for dashboard
    print("  Fetching all transactions for dashboard...")
    all_txns = supabase_get("transactions", "order=date.desc&limit=10000")
    print(f"  {len(all_txns)} total transactions in database")

    # Generate AI analysis
    print("\nGenerating AI financial analysis...")
    analysis = analyze_transactions(all_txns)
    if analysis:
        Path("exports").mkdir(exist_ok=True)
        Path("exports/analysis_report.md").write_text(analysis, encoding="utf-8")
        print("  Analysis saved to exports/analysis_report.md")

    # Regenerate dashboard
    supabase_fn_url = f"{sb_url}/functions/v1"
    DASHBOARD_FILE.parent.mkdir(parents=True, exist_ok=True)
    html = build_dashboard(all_txns, last_sync, analysis, supabase_fn=supabase_fn_url)
    DASHBOARD_FILE.write_text(html, encoding="utf-8")
    print(f"  Dashboard written to {DASHBOARD_FILE}")
    print("\nDone.")


if __name__ == "__main__":
    main()
