# Finance Export

Export transaction data to CSV or generate a financial report.

## Instructions

When the user runs `/finance-export`, ask what they want (or default to full export if no args):

### Full CSV export
Query all transactions from Supabase (project: `acouuzccqkcpyrckrgwg`):

```sql
SELECT
  date,
  name,
  merchant_name,
  amount,
  iso_currency_code,
  category_primary,
  category_detailed,
  payment_channel,
  pending,
  account_id,
  transaction_id,
  sync_time
FROM transactions
ORDER BY date DESC;
```

Write to `/home/user/Claude-code/exports/transactions_YYYY-MM-DD.csv` (use today's date).
Create the `exports/` directory if it doesn't exist.

### Monthly report export
If user asks for a monthly report, generate a markdown file:

```sql
-- Monthly totals
SELECT date_trunc('month', date::date) as month,
  SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_out,
  SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_in,
  COUNT(*) as transactions
FROM transactions GROUP BY 1 ORDER BY 1 DESC;

-- Category breakdown current month
SELECT category_primary, SUM(amount) as total, COUNT(*) as count
FROM transactions
WHERE amount > 0 AND date >= date_trunc('month', CURRENT_DATE)
  AND category_primary NOT IN ('TRANSFER_IN','TRANSFER_OUT','LOAN_PAYMENTS')
GROUP BY 1 ORDER BY 2 DESC;

-- Top 10 transactions current month
SELECT date, name, merchant_name, amount
FROM transactions
WHERE date >= date_trunc('month', CURRENT_DATE) AND amount > 0
ORDER BY amount DESC LIMIT 10;
```

Write the formatted report to `/home/user/Claude-code/exports/report_YYYY-MM.md`.

### Arguments
- `/finance-export csv` — full CSV of all transactions
- `/finance-export monthly` — markdown report for current month
- `/finance-export [month]` — e.g. `/finance-export january` for a specific month
- No args — full CSV export (default)

Always confirm the file path after writing.
