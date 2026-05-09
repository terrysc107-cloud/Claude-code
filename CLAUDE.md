# ts-fin-app

This is the visual front-end and AI chat interface for the North Star OS wealth system.

## Context
Full operator context lives in the north-star-os repo:
- Identity, voice, goals → `you/`
- Build playbook, patterns, decisions → `playbook/`
- Learnings → `learnings/`
- App registry entry for this repo → `apps/ts-fin-app.md`

## Architecture
- **This repo** owns the UI layer only (dashboard, AI chat, routes, components)
- **Supabase `north_star` schema** is the source of truth for all wealth data (net worth, goals, properties, context_store)
- **north-star-os repo** owns all `north_star` schema migrations — do NOT add migrations here that touch `north_star`
- **Supabase project:** `supabase-crimson-ladder` (shared with north-star-os)

## Key rules
- All LLM/AI calls go through a server route — never expose keys client-side
- `north_star.context_store` is how the AI chat gets grounded data — query it server-side before calling the model
- Do not duplicate `north_star` data into a `public` schema — read it directly with proper RLS policies
- Stack: Next.js + Supabase + Tailwind + shadcn/ui
