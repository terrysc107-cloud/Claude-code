# Debt

## Deferred from Launch Sprint — 2026-05-08

### Backend
- **Plaid modified/removed transactions** — sync only handles `added`; modified and removed are silently ignored. Low risk for personal use, higher risk at scale.
- **Supabase edge functions not committed** — `create-link-token`, `exchange-token`, `plaid-sync`, `finance-chat` live in Supabase but not in this repo. Students can't follow without them. → Add `supabase/functions/` directory.
- **Dashboard pagination limit** — `limit=10000` hardcoded in `supabase_get()`. Will break at high transaction counts. → Add PostgREST range pagination.

### Frontend
- **Streaming AI chat** — chat panel waits for full response before rendering. Needs SSE/ReadableStream. → Requires edge function rewrite.
- **Date range picker** — 30-day window hardcoded in 3 places. No user control. → Add preset chips (7d / 30d / 90d / all).
- **Waste section accuracy** — stale pending transactions flagged as "waste" is misleading. → Improve detection logic.

### Course
- **No Supabase edge function source** — course is incomplete without the edge function code that powers the UI. → Priority for next session.
