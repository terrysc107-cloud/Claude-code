# Finance Analyzer

Personal finance analysis and reporting skill for Terry Scott's Plaid → Supabase pipeline.

## Setup
- **Supabase project**: `acouuzccqkcpyrckrgwg`
- **Tables**: `transactions`, `plaid_tokens`
- **Connected accounts**: PFCU checking, Chase, AMEX Platinum, AMEX Bonvoy (6 tokens total)
- **Dashboard**: https://claude-code-eight-xi.vercel.app/dashboard.html
- **Sync script**: `python /home/user/Claude-code/plaid_sync.py`

## Key context about Terry's finances
- Apple Cash transfers: ~$10k/month sent weekly to one person (known, ignore for spend analysis)
- Credit cards: AMEX, Capital One (~$5k/mo), Apple Card (~$4k/mo) — treat as real spending
- Rent: LTS Properties ~$2,600–$3,400/month
- PFCU transfer: $1,124.88/month exact (savings/loan payment)
- Scott Advisory / JPMorgan: $2,000/month (investment account)
- Insurance: State Farm $223/mo + New York Life $77/mo
- Gas (PGW): $250–$537/month seasonal

## How to use this skill

Run `/finance-analyze` followed by what you want, or just `/finance-analyze` alone for a full summary.

Examples:
- `/finance-analyze` — full monthly snapshot with trends
- `/finance-analyze q1 p&l` — Q1 profit & loss report
- `/finance-analyze subscriptions` — full subscription audit
- `/finance-analyze [category]` — e.g. food, travel, shopping
- `/finance-analyze compare jan feb mar` — month-over-month comparison
- `/finance-analyze top spenders` — top merchants by total spend
- `/finance-analyze save money` — actionable recommendations
- `/finance-analyze sync` — pull latest transactions from all accounts
- `/finance-analyze export` — export all transactions to CSV
- `/finance-analyze report [month]` — full markdown report for a month

---

## Core SQL queries (use with mcp__ab74041b-fa0a-40f8-ac45-4958470ce990__execute_sql, project_id: acouuzccqkcpyrckrgwg)

### Monthly P&L summary
```sql
SELECT
  to_char(date_trunc('month', date::date), 'Mon YYYY') as month,
  SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as spending,
  SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as income,
  SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) -
  SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as net,
  COUNT(*) as transactions
FROM transactions
WHERE NOT pending
GROUP BY 1, date_trunc('month', date::date)
ORDER BY date_trunc('month', date::date) DESC
LIMIT 12;
```

### Spending by category (exclude transfers)
```sql
SELECT
  category_primary,
  SUM(amount) as total,
  COUNT(*) as count,
  ROUND(AVG(amount)::numeric, 2) as avg_amount
FROM transactions
WHERE amount > 0
  AND NOT pending
  AND category_primary NOT IN ('TRANSFER_IN','TRANSFER_OUT','LOAN_PAYMENTS','TRANSFER_OUT_ACCOUNT_TRANSFER')
  AND date >= date_trunc('month', CURRENT_DATE)
GROUP BY 1
ORDER BY 2 DESC;
```

### Top merchants all time
```sql
SELECT
  COALESCE(NULLIF(merchant_name,''), name) as merchant,
  COUNT(*) as charges,
  SUM(amount) as total,
  ROUND(AVG(amount)::numeric, 2) as avg,
  MIN(date) as first_seen,
  MAX(date) as last_seen
FROM transactions
WHERE amount > 0 AND NOT pending
GROUP BY 1
ORDER BY 3 DESC
LIMIT 25;
```

### Recurring / subscriptions (same merchant 2+ months)
```sql
SELECT
  COALESCE(NULLIF(merchant_name,''), name) as merchant,
  COUNT(DISTINCT date_trunc('month', date::date)) as months,
  COUNT(*) as total_charges,
  ROUND(AVG(amount)::numeric, 2) as avg_amount,
  ROUND(SUM(amount)::numeric, 2) as total_spent,
  MAX(date) as last_charge
FROM transactions
WHERE amount > 0 AND NOT pending AND amount < 500
GROUP BY 1
HAVING COUNT(DISTINCT date_trunc('month', date::date)) >= 2
ORDER BY 4 DESC;
```

### Month-over-month comparison (last 6 months)
```sql
SELECT
  to_char(date_trunc('month', date::date), 'Mon YYYY') as month,
  category_primary,
  SUM(amount) as total
FROM transactions
WHERE amount > 0
  AND NOT pending
  AND category_primary NOT IN ('TRANSFER_IN','TRANSFER_OUT','LOAN_PAYMENTS')
  AND date >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY 1, date_trunc('month', date::date), 2
ORDER BY date_trunc('month', date::date) DESC, 3 DESC;
```

### Large / unusual transactions
```sql
SELECT date, name, merchant_name, amount, category_primary, account_id
FROM transactions
WHERE amount > 500 AND NOT pending
  AND category_primary NOT IN ('TRANSFER_IN','TRANSFER_OUT','LOAN_PAYMENTS')
ORDER BY amount DESC
LIMIT 30;
```

### Specific category deep-dive (replace :cat with category name)
```sql
SELECT date, name, merchant_name, amount, category_detailed
FROM transactions
WHERE amount > 0
  AND NOT pending
  AND category_primary ILIKE '%FOOD%'   -- change this
ORDER BY date DESC
LIMIT 50;
```

### Cash flow by week
```sql
SELECT
  date_trunc('week', date::date) as week,
  SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as spending,
  SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as income
FROM transactions
WHERE NOT pending AND date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1 DESC;
```

### Apple Cash sent (track separately)
```sql
SELECT date, name, amount
FROM transactions
WHERE name ILIKE '%apple cash%' AND amount > 0
ORDER BY date DESC;
```

---

## Response format

### For analysis requests
1. Run the relevant query/queries
2. Interpret the numbers in plain English — don't just dump raw data
3. Call out anything surprising, high, or actionable
4. End with 2–3 specific recommendations when relevant

### For P&L / quarterly report
Format as a professional financial summary:
```
# Q[N] [YYYY] Financial Report
Generated: [date]

## Income
| Source | Amount |
|--------|--------|
| ...    | ...    |
Total Income: $X

## Spending
| Category | Amount | % of Total |
|----------|--------|------------|
| ...      | ...    |            |
Total Spending: $X

## Net
Net Cash Flow: $X
Savings Rate: X%

## Highlights
- ...

## Recommendations
1. ...
```

### For sync
```bash
cd /home/user/Claude-code && python plaid_sync.py
```
Report: how many new transactions, which accounts had activity, new total in DB.
After sync, offer to regenerate and push dashboard with:
```bash
git add public/dashboard.html exports/ && git commit -m "Update dashboard" && git push -u origin claude/secure-api-integration-Us7bb
```

### For export
Query all transactions and write to `/home/user/Claude-code/exports/transactions_YYYY-MM-DD.csv`.

### For monthly report
Write full markdown report to `/home/user/Claude-code/exports/report_YYYY-MM.md` and confirm file path.

---

## Default behavior (no args)
Run the monthly P&L query + top categories query, then give:
1. One-paragraph snapshot of this month vs last month
2. Top 5 spending categories with amounts
3. Any standout transactions or patterns
4. One actionable insight
