"""
plaid_analyze.py — Generate AI financial analysis using Claude API.

Called by plaid_sync.py after each sync. Reads transactions from Supabase,
sends them to Claude, and returns a markdown analysis report.
"""

import json
import os
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-4-6"


def analyze_transactions(transactions: list[dict]) -> str:
    """Send transactions to Claude and return a markdown analysis report."""
    if not ANTHROPIC_API_KEY:
        print("  WARNING: ANTHROPIC_API_KEY not set — skipping AI analysis")
        return ""

    # Summarize transactions to keep prompt size manageable
    # Send last 90 days, max 500 transactions
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).date().isoformat()
    recent = [t for t in transactions if t.get("date", "") >= cutoff and not t.get("pending")]
    recent.sort(key=lambda t: t.get("date", ""), reverse=True)
    sample = recent[:500]

    # Strip bulky fields to reduce token count
    slim = [
        {
            "date": t.get("date"),
            "name": t.get("name"),
            "merchant": t.get("merchant_name") or t.get("name"),
            "amount": t.get("amount"),
            "category": t.get("category_primary"),
            "channel": t.get("payment_channel"),
        }
        for t in sample
    ]

    prompt = f"""You are a personal finance analyst. Analyze the following bank transactions and provide a concise financial report.

Transactions (last 90 days, {len(slim)} total):
{json.dumps(slim, indent=2)}

Provide your analysis in this exact markdown format:

## Executive Summary
3-4 sentences summarizing overall financial health, total spending, and key patterns.

## Spending by Category
A breakdown of spending by category with amounts and percentages.

## Notable Transactions
Flag any unusually large, suspicious, or one-time transactions worth reviewing.

## Recurring Charges & Subscriptions
List all detected recurring charges with merchant name, typical amount, and frequency.

## Top 3 Recommendations
Specific, actionable recommendations to reduce spending or improve financial health.

---
*Analysis generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}*
"""

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": MODEL,
        "max_tokens": 1500,
        "messages": [{"role": "user", "content": prompt}],
    }

    print(f"  Calling Claude API ({MODEL}) for financial analysis...")
    resp = requests.post(ANTHROPIC_URL, headers=headers, json=body, timeout=60)
    if resp.status_code != 200:
        print(f"  WARNING: Claude API error {resp.status_code}: {resp.text[:200]}")
        return ""

    data = resp.json()
    report = data["content"][0]["text"]
    print("  AI analysis complete.")
    return report
