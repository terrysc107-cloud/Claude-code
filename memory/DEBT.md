# Debt

## Open Items

### Backend
- **Dashboard pagination limit** — `limit=10000` hardcoded in `supabase_get()`. Will break at high transaction counts. → Add PostgREST range pagination. (Low priority — most users won't hit 10k.)

### Frontend
- **Streaming AI chat** — chat panel waits for full response before rendering. Needs SSE/ReadableStream in both the edge function and dashboard JS. → Medium effort, good UX improvement for next session.

---

## Resolved

### Phase 2 — 2026-05-08
- ~~Plaid modified/removed transactions~~ — now handled in `plaid_sync.py` (added `supabase_delete`) and `plaid-sync` edge function
- ~~Supabase edge functions not committed~~ — all 4 functions committed in `supabase/functions/` with config and migration
- ~~Date range hardcoded~~ — preset chips (7d / 30d / 90d / All time) implemented, cards and category chart react live
- ~~Waste section misleading~~ — removed stale-pending logic, improved to detect small recurring charges + duplicate streaming services

### Phase 1 — 2026-05-08
- ~~XSS in transaction table~~ — all user-data fields escaped via `esc()` before innerHTML injection
- ~~Personal data in finance.md~~ — generalized for public course use
- ~~Unrelated files in repo~~ — scraper.py + sample_leads.csv deleted
- ~~Dead .gitignore rule~~ — removed `/dashboard.html` that matched nothing
- ~~All-caps category labels~~ — title-cased throughout
- ~~Unused deps~~ — pandas + tqdm removed from requirements.txt
- ~~Raw requests for Anthropic API~~ — migrated to SDK with prompt caching, max_tokens 3000
- ~~CORS wildcard~~ — reads ALLOWED_ORIGIN env var
- ~~ON CONFLICT missing~~ — exchange_token.py now upserts on item_id
- ~~Hardcoded Supabase URL in JS~~ — injected at build time from env
- ~~No README~~ — full setup guide written
