# Decisions

## Product Brief

**What are we building?** A Claude Code course repo — a personal finance dashboard (Plaid → Supabase → Dashboard) that serves as both a working app and a live demo/teaching artifact for a course on building with Claude Code.

**Who is it for?** Developers learning to build real AI-powered apps with Claude Code. The repo is the course.

**What does success look like?** The app works end-to-end, the code is clean and safe, the repo is self-documenting, and it can be shared publicly without apology.

## Stack Decisions

- **Plaid API** (production) — PFCU checking account connected
- **Supabase** `acouuzccqkcpyrckrgwg` — stores tokens + transactions + hosts edge functions
- **Vercel** — static hosting for `public/index.html` + `public/dashboard.html`
- **Python** — `plaid_sync.py` syncs on demand, `plaid_analyze.py` calls Claude API
- **Anthropic SDK** — switching from raw requests to SDK with prompt caching (decided 2026-05-08)

## Masterbuilder Integration (2026-05-08)

- Imported full masterbuilder template (agents, commands, helpers, skills, docs, phases, templates, workflows)
- Ruflo daemon hooks re-enabled in settings.json (2026-05-09) — hooks are safe no-ops if Ruflo not installed
- Using Phase 10 (Production Hardening) + Phase 11 (Launch Readiness) for tonight's ship sprint

## Active Phase: LAUNCH SPRINT (Phase 10 + 11 combined)

Tonight's goal: fix all blockers, polish, write README, ship.
