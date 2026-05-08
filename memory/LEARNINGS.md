# Learnings

## Launch Sprint — 2026-05-08

### What we found
- Inline JSON injection in dashboard template works but will balloon at scale — fine for now, revisit at ~5k transactions
- `plaid_sync.py` silently ignored Plaid `modified` and `removed` transaction arrays — only `added` was processed
- Raw `requests` calls to Anthropic API when the SDK was already a dep — SDK is cleaner and enables prompt caching
- `pandas` and `tqdm` were dead dependencies never imported anywhere
- CORS wildcard on Vercel API endpoints — acceptable dev default, needs env var override for production
- `finance.md` skill contained real personal financial data — scrub before publishing any course repo
- Unrelated project files (`scraper.py`, `sample_leads.csv`) were left in root — always clean before launch
- `.gitignore` had a `/dashboard.html` rule matching nothing — root-anchored paths don't match subdirectories
- Category labels were raw API values (`FOOD_AND_DRINK`) — always transform API enums for display
- Markdown renderer regex had `[h|u|l|h|e]` character class with literal `|` — test your regexes
- Sync button called an undeployed edge function — always test every button in the UI before shipping

### Patterns that worked
- Static dashboard generation (Python → HTML with embedded JSON) is simple and fast — keep it
- Supabase edge functions for Plaid OAuth keeps secrets server-side — correct architecture
- Prompt caching on the system prompt saves tokens on every sync after the first
- Masterbuilder phase structure (Wave 1 blockers → Wave 2 polish → Wave 3 content → Wave 4 ship) kept focus
