"""
plaid_sync.py — Sync Plaid transactions and regenerate the interactive dashboard.

Usage:
    python plaid_sync.py

Reads access_token + cursor from plaid_state.json (created by plaid_setup.py).
Appends new/updated transactions to transactions.json.
Regenerates dashboard.html with the full dataset embedded.

Schedule via cron:
    0 */6 * * * cd /path/to/repo && python plaid_sync.py >> plaid_sync.log 2>&1
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

STATE_FILE = Path("plaid_state.json")
TRANSACTIONS_FILE = Path("transactions.json")
DASHBOARD_FILE = Path("dashboard.html")

PLAID_ENVS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


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
        "authorized_date": txn.get("authorized_date") or "",
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

def sync_transactions(base_url: str, client_id: str, secret: str, state: dict) -> tuple[list[dict], str]:
    access_token = state["access_token"]
    cursor = state.get("cursor", "")
    sync_time = datetime.now(timezone.utc).isoformat()

    all_added: list[dict] = []
    has_more = True
    page = 0

    while has_more:
        page += 1
        payload: dict = {
            "client_id": client_id,
            "secret": secret,
            "access_token": access_token,
        }
        if cursor:
            payload["cursor"] = cursor

        data = plaid_post(base_url, "/transactions/sync", payload)
        added = data.get("added", [])
        all_added.extend(flatten_transaction(t, sync_time) for t in added)
        cursor = data.get("next_cursor", cursor)
        has_more = data.get("has_more", False)

        if page == 1:
            print(f"  Page {page}: {len(added)} added, has_more={has_more}")
        else:
            print(f"  Page {page}: {len(added)} added, has_more={has_more}")

    return all_added, cursor


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
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #22263a;
    --accent: #6c63ff;
    --accent2: #ff6584;
    --text: #e8eaf6;
    --muted: #8b8fa8;
    --green: #43d98f;
    --red: #ff6584;
    --border: #2a2d3e;
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
  .badge-green { background: rgba(67,217,143,.15); color: var(--green); }
  .badge-red { background: rgba(255,101,132,.15); color: var(--red); }
  .badge-purple { background: rgba(108,99,255,.15); color: var(--accent); }
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
</style>
</head>
<body>
<header>
  <h1>Financial Dashboard</h1>
  <span class="sync-info" id="syncInfo"></span>
</header>
<main>
  <!-- Summary cards -->
  <div class="cards" id="summaryCards"></div>

  <!-- Charts -->
  <div class="charts">
    <div class="chart-card">
      <h2>Spending by Category (30d)</h2>
      <div class="chart-wrap"><canvas id="catChart"></canvas></div>
    </div>
    <div class="chart-card">
      <h2>Monthly Spending Trend</h2>
      <div class="chart-wrap"><canvas id="trendChart"></canvas></div>
    </div>
  </div>

  <!-- Subscriptions -->
  <div class="section">
    <h2>Recurring / Subscriptions</h2>
    <div id="subscriptions"></div>
  </div>

  <!-- Potential waste -->
  <div class="section">
    <h2>Potential Waste</h2>
    <div class="waste-list" id="wasteList"></div>
  </div>

  <!-- Transaction table -->
  <div class="section">
    <h2>All Transactions</h2>
    <div class="controls">
      <input type="text" id="searchBox" placeholder="Search merchant, category…">
      <select id="catFilter"><option value="">All categories</option></select>
      <select id="channelFilter"><option value="">All channels</option></select>
      <select id="monthFilter"><option value="">All months</option></select>
    </div>
    <table id="txTable">
      <thead>
        <tr>
          <th data-col="date">Date <span class="sort-arrow">↕</span></th>
          <th data-col="merchant_name">Merchant <span class="sort-arrow">↕</span></th>
          <th data-col="name">Description <span class="sort-arrow">↕</span></th>
          <th data-col="amount">Amount <span class="sort-arrow">↕</span></th>
          <th data-col="category_primary">Category <span class="sort-arrow">↕</span></th>
          <th data-col="payment_channel">Channel <span class="sort-arrow">↕</span></th>
          <th data-col="pending">Status <span class="sort-arrow">↕</span></th>
        </tr>
      </thead>
      <tbody id="txBody"></tbody>
    </table>
    <div class="pagination" id="pagination"></div>
  </div>
</main>

<script>
// ── Data injected by plaid_sync.py ──────────────────────────────────────────
const TRANSACTIONS = __TRANSACTIONS_JSON__;
const LAST_SYNC = "__LAST_SYNC__";
// ────────────────────────────────────────────────────────────────────────────

document.getElementById("syncInfo").textContent =
  LAST_SYNC ? "Last synced: " + new Date(LAST_SYNC).toLocaleString() : "No sync yet";

const fmtCurrency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const now = new Date();
const ms30d = 30 * 24 * 60 * 60 * 1000;
const txLast30 = TRANSACTIONS.filter(t => {
  const d = new Date(t.date);
  return (now - d) <= ms30d && !t.pending && t.amount > 0;
});

// ── Summary cards ─────────────────────────────────────────────────────────
(function buildCards() {
  const total30 = txLast30.reduce((s, t) => s + t.amount, 0);
  const avgTx = txLast30.length ? total30 / txLast30.length : 0;
  const catCounts = {};
  txLast30.forEach(t => { catCounts[t.category_primary] = (catCounts[t.category_primary] || 0) + t.amount; });
  const topCat = Object.entries(catCounts).sort((a,b) => b[1]-a[1])[0];

  const cards = [
    { label: "Spent (30 days)", value: fmtCurrency(total30), sub: `${txLast30.length} transactions` },
    { label: "Avg transaction", value: fmtCurrency(avgTx), sub: "Posted only" },
    { label: "Top category", value: topCat ? topCat[0].replace(/_/g," ") : "—", sub: topCat ? fmtCurrency(topCat[1]) : "" },
    { label: "Total transactions", value: TRANSACTIONS.length.toLocaleString(), sub: "All time" },
  ];
  const el = document.getElementById("summaryCards");
  el.innerHTML = cards.map(c => `<div class="card"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`).join("");
})();

// ── Category chart ────────────────────────────────────────────────────────
(function buildCatChart() {
  const map = {};
  txLast30.forEach(t => { map[t.category_primary || "OTHER"] = (map[t.category_primary || "OTHER"] || 0) + t.amount; });
  const sorted = Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 10);
  const colors = ["#6c63ff","#ff6584","#43d98f","#ffbb28","#ff8042","#8dd1e1","#a4de6c","#d0ed57","#ffc658","#83a6ed"];
  new Chart(document.getElementById("catChart"), {
    type: "bar",
    data: {
      labels: sorted.map(([k]) => k.replace(/_/g," ")),
      datasets: [{ data: sorted.map(([,v]) => v), backgroundColor: colors, borderRadius: 6 }]
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtCurrency(ctx.raw) } } },
      scales: {
        x: { ticks: { color: "#8b8fa8", callback: v => "$"+Math.round(v) }, grid: { color: "#2a2d3e" } },
        y: { ticks: { color: "#e8eaf6" }, grid: { display: false } }
      }
    }
  });
})();

// ── Monthly trend ─────────────────────────────────────────────────────────
(function buildTrendChart() {
  const map = {};
  TRANSACTIONS.filter(t => !t.pending && t.amount > 0).forEach(t => {
    const mo = t.date.slice(0, 7);
    map[mo] = (map[mo] || 0) + t.amount;
  });
  const months = Object.keys(map).sort();
  new Chart(document.getElementById("trendChart"), {
    type: "line",
    data: {
      labels: months,
      datasets: [{
        data: months.map(m => map[m]),
        borderColor: "#6c63ff", backgroundColor: "rgba(108,99,255,.12)",
        fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: "#6c63ff"
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtCurrency(ctx.raw) } } },
      scales: {
        x: { ticks: { color: "#8b8fa8" }, grid: { color: "#2a2d3e" } },
        y: { ticks: { color: "#8b8fa8", callback: v => "$"+Math.round(v) }, grid: { color: "#2a2d3e" } }
      }
    }
  });
})();

// ── Subscription detector ─────────────────────────────────────────────────
(function buildSubs() {
  // Group by merchant, look for charges appearing in >= 2 distinct months
  const byMerchant = {};
  TRANSACTIONS.filter(t => !t.pending && t.amount > 0).forEach(t => {
    const key = (t.merchant_name || t.name).trim();
    if (!byMerchant[key]) byMerchant[key] = [];
    byMerchant[key].push(t);
  });

  const subs = [];
  for (const [merchant, txns] of Object.entries(byMerchant)) {
    const months = [...new Set(txns.map(t => t.date.slice(0,7)))];
    if (months.length >= 2) {
      const amounts = txns.map(t => t.amount);
      const avgAmt = amounts.reduce((s,a) => s+a, 0) / amounts.length;
      const maxAmt = Math.max(...amounts);
      const minAmt = Math.min(...amounts);
      const consistent = (maxAmt - minAmt) / avgAmt < 0.1; // within 10%
      if (consistent || avgAmt < 20) {
        subs.push({ merchant, months: months.length, avgAmt, txns: txns.length, category: txns[0].category_primary });
      }
    }
  }
  subs.sort((a,b) => b.avgAmt - a.avgAmt);

  const el = document.getElementById("subscriptions");
  if (!subs.length) { el.innerHTML = '<div class="empty">No recurring charges detected yet — sync more data over multiple months.</div>'; return; }

  el.innerHTML = `<table class="sub-table">
    <thead><tr><th>Merchant</th><th>Category</th><th>Avg Amount</th><th>Months Active</th><th>Total Charges</th></tr></thead>
    <tbody>${subs.map(s => `<tr>
      <td><strong>${s.merchant}</strong></td>
      <td><span class="badge badge-purple">${(s.category||"").replace(/_/g," ")}</span></td>
      <td>${fmtCurrency(s.avgAmt)}</td>
      <td>${s.months}</td>
      <td>${s.txns}</td>
    </tr>`).join("")}</tbody>
  </table>`;
})();

// ── Potential waste ───────────────────────────────────────────────────────
(function buildWaste() {
  const waste = [];
  // Pending transactions older than 5 days
  TRANSACTIONS.filter(t => t.pending).forEach(t => {
    const age = Math.round((now - new Date(t.date)) / 86400000);
    if (age >= 5) waste.push({ name: t.merchant_name || t.name, detail: `Pending ${age} days · ${fmtCurrency(t.amount)}` });
  });
  // Small recurring (< $5, >= 2 months)
  const micro = {};
  TRANSACTIONS.filter(t => !t.pending && t.amount > 0 && t.amount < 5).forEach(t => {
    const key = (t.merchant_name || t.name).trim();
    if (!micro[key]) micro[key] = new Set();
    micro[key].add(t.date.slice(0,7));
  });
  for (const [name, months] of Object.entries(micro)) {
    if (months.size >= 2) waste.push({ name, detail: `Small recurring · ${months.size} months` });
  }

  const el = document.getElementById("wasteList");
  if (!waste.length) { el.innerHTML = '<div class="empty">No potential waste detected.</div>'; return; }
  el.innerHTML = waste.slice(0, 20).map(w => `<div class="waste-item"><div class="w-name">${w.name}</div><div class="w-detail">${w.detail}</div></div>`).join("");
})();

// ── Transaction table with sort, filter, pagination ───────────────────────
(function buildTable() {
  let filtered = [...TRANSACTIONS];
  let sortCol = "date";
  let sortDir = -1;
  let page = 0;
  const PAGE_SIZE = 50;

  // Populate filters
  const cats = [...new Set(TRANSACTIONS.map(t => t.category_primary).filter(Boolean))].sort();
  const channels = [...new Set(TRANSACTIONS.map(t => t.payment_channel).filter(Boolean))].sort();
  const months = [...new Set(TRANSACTIONS.map(t => t.date.slice(0,7)).filter(Boolean))].sort().reverse();

  const catSel = document.getElementById("catFilter");
  const chSel = document.getElementById("channelFilter");
  const moSel = document.getElementById("monthFilter");
  cats.forEach(c => { const o = new Option(c.replace(/_/g," "), c); catSel.appendChild(o); });
  channels.forEach(c => { const o = new Option(c, c); chSel.appendChild(o); });
  months.forEach(m => { const o = new Option(m, m); moSel.appendChild(o); });

  function applyFilters() {
    const q = document.getElementById("searchBox").value.toLowerCase();
    const cat = catSel.value;
    const ch = chSel.value;
    const mo = moSel.value;
    filtered = TRANSACTIONS.filter(t => {
      if (q && !(t.name + t.merchant_name + t.category_primary).toLowerCase().includes(q)) return false;
      if (cat && t.category_primary !== cat) return false;
      if (ch && t.payment_channel !== ch) return false;
      if (mo && !t.date.startsWith(mo)) return false;
      return true;
    });
    page = 0;
    render();
  }

  function sortData() {
    filtered.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (sortCol === "amount") { av = +av; bv = +bv; }
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return 0;
    });
  }

  function render() {
    sortData();
    const total = filtered.length;
    const start = page * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    const body = document.getElementById("txBody");
    if (!slice.length) {
      body.innerHTML = `<tr><td colspan="7" class="empty">No transactions found.</td></tr>`;
    } else {
      body.innerHTML = slice.map(t => {
        const amtClass = t.amount < 0 ? "amount-pos" : "amount-neg";
        const amtDisplay = t.amount < 0 ? `+${fmtCurrency(-t.amount)}` : fmtCurrency(t.amount);
        const status = t.pending
          ? `<span class="badge badge-purple">Pending</span>`
          : `<span class="badge badge-green">Posted</span>`;
        return `<tr>
          <td>${t.date}</td>
          <td>${t.merchant_name || "—"}</td>
          <td>${t.name}</td>
          <td class="${amtClass}">${amtDisplay}</td>
          <td>${(t.category_primary||"").replace(/_/g," ")}</td>
          <td>${t.payment_channel || "—"}</td>
          <td>${status}</td>
        </tr>`;
      }).join("");
    }

    // Pagination
    const pages = Math.ceil(total / PAGE_SIZE);
    const pag = document.getElementById("pagination");
    pag.innerHTML = `
      <span>${total.toLocaleString()} transactions</span>
      <button onclick="prevPage()" ${page === 0 ? "disabled" : ""}>← Prev</button>
      <span>Page ${page+1} of ${Math.max(1,pages)}</span>
      <button onclick="nextPage()" ${page >= pages-1 ? "disabled" : ""}>Next →</button>
    `;
  }

  window.prevPage = () => { if (page > 0) { page--; render(); } };
  window.nextPage = () => { const pages = Math.ceil(filtered.length / PAGE_SIZE); if (page < pages-1) { page++; render(); } };

  // Sort on header click
  document.querySelectorAll("#txTable th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) sortDir *= -1;
      else { sortCol = col; sortDir = -1; }
      render();
    });
  });

  document.getElementById("searchBox").addEventListener("input", applyFilters);
  catSel.addEventListener("change", applyFilters);
  chSel.addEventListener("change", applyFilters);
  moSel.addEventListener("change", applyFilters);

  render();
})();
</script>
</body>
</html>"""


def build_dashboard(transactions: list[dict], last_sync: str) -> str:
    html = DASHBOARD_TEMPLATE.replace(
        "__TRANSACTIONS_JSON__",
        json.dumps(transactions, ensure_ascii=False),
    ).replace("__LAST_SYNC__", last_sync)
    return html


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not STATE_FILE.exists():
        print("plaid_state.json not found. Run plaid_setup.py first.")
        sys.exit(1)

    state = json.loads(STATE_FILE.read_text())
    if not state.get("access_token"):
        print("No access_token in plaid_state.json. Run plaid_setup.py first.")
        sys.exit(1)

    base_url = get_base_url()
    client_id, secret = load_credentials()

    print("Syncing transactions from Plaid...")
    new_txns, next_cursor = sync_transactions(base_url, client_id, secret, state)
    print(f"  Fetched {len(new_txns)} transaction(s) from API")

    # Load existing transactions and deduplicate
    existing: list[dict] = []
    if TRANSACTIONS_FILE.exists():
        existing = json.loads(TRANSACTIONS_FILE.read_text())

    index = {t["transaction_id"]: t for t in existing}
    added_count = 0
    updated_count = 0
    for txn in new_txns:
        tid = txn["transaction_id"]
        if tid in index:
            updated_count += 1
        else:
            added_count += 1
        index[tid] = txn

    merged = sorted(index.values(), key=lambda t: t["date"], reverse=True)
    TRANSACTIONS_FILE.write_text(json.dumps(merged, indent=2, ensure_ascii=False))
    print(f"  {added_count} new, {updated_count} updated → {len(merged)} total in {TRANSACTIONS_FILE}")

    # Persist updated cursor and sync time
    last_sync = datetime.now(timezone.utc).isoformat()
    state["cursor"] = next_cursor
    state["last_sync"] = last_sync
    STATE_FILE.write_text(json.dumps(state, indent=2))

    # Regenerate dashboard
    html = build_dashboard(merged, last_sync)
    DASHBOARD_FILE.write_text(html, encoding="utf-8")
    print(f"  Dashboard written to {DASHBOARD_FILE}")
    print(f"\nDone. Open {DASHBOARD_FILE.resolve()} in your browser to view.")


if __name__ == "__main__":
    main()
