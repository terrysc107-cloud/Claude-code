"""
plaid_analyze.py — Generate AI financial analysis using the Anthropic SDK with prompt caching.

Called by plaid_sync.py after each sync. Returns a markdown analysis report.
"""

import json
import os
from datetime import datetime, timedelta, timezone

import anthropic
from dotenv import load_dotenv

load_dotenv()

MODEL = "claude-sonnet-4-6"


def analyze_transactions(transactions: list[dict]) -> str:
    """Send transactions to Claude and return a markdown analysis report."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("  WARNING: ANTHROPIC_API_KEY not set — skipping AI analysis")
        return ""

    # Last 90 days, max 500 posted transactions
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).date().isoformat()
    recent = [t for t in transactions if t.get("date", "") >= cutoff and not t.get("pending")]
    recent.sort(key=lambda t: t.get("date", ""), reverse=True)
    sample = recent[:500]

    slim = [
        {
            "date": t.get("date"),
            "merchant": t.get("merchant_name") or t.get("name"),
            "amount": t.get("amount"),
            "category": t.get("category_primary"),
            "channel": t.get("payment_channel"),
        }
        for t in sample
    ]

    system_prompt = """You are a personal finance analyst. Analyze bank transactions and provide a concise financial report in the exact markdown format requested. Be specific with amounts and actionable with recommendations."""

    user_prompt = f"""Analyze the following bank transactions and provide a concise financial report.

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
*Analysis generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}*"""

    client = anthropic.Anthropic(api_key=api_key)

    print(f"  Calling Claude API ({MODEL}) with prompt caching...")
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=3000,
            system=[
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_prompt}],
        )
        usage = response.usage
        cache_info = ""
        if hasattr(usage, "cache_read_input_tokens") and usage.cache_read_input_tokens:
            cache_info = f" (cache hit: {usage.cache_read_input_tokens} tokens)"
        elif hasattr(usage, "cache_creation_input_tokens") and usage.cache_creation_input_tokens:
            cache_info = f" (cache created: {usage.cache_creation_input_tokens} tokens)"
        print(f"  AI analysis complete{cache_info}.")
        return response.content[0].text
    except anthropic.APIError as e:
        print(f"  WARNING: Claude API error: {e}")
        return ""
