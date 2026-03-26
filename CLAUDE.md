# CLAUDE.md

This file provides guidance for AI assistants (like Claude Code) working in this repository.

## Repository Overview

**Repository**: terrysc107-cloud/Claude-code
**Project**: Capacity Intelligence Sync — Notion → Google Sheets pipeline

## Capacity Intelligence Project Rules

### Role
This project maintains a Notion-to-Google-Sheets capacity intelligence system.

### Architecture
- **Notion** = source of truth (Brain Dump Inbox database, collection `05218dbf-6ac0-48ff-9b52-098c79013100`)
- **Google Sheets** = analytics layer (tabs: `tasks_log`, `metrics`, `dashboard`, `weekly_log`)
- **Claude Code** = sync + interpretation layer
- **OpenClaw** is not in scope

### Rules
- Do not redesign the Notion structure
- Do not use CSV workflows
- Prefer direct API/script execution first
- Preserve working formulas
- Repair only what is broken
- Upsert by `task_id` only
- Keep outputs short and operational
- Choose the fastest stable implementation path

### Main Objective
Sync Notion task updates into `tasks_log`, preserve metrics/dashboard integrity, and generate short daily/weekly capacity summaries.

### Success Criteria
- Notion updates sync into Sheets via Apps Script (15-min trigger)
- Existing rows update in place by `task_id`
- Metrics remain accurate
- Founder metrics work
- SGR displays as decimal ratio (not percent)
- Daily and weekly summaries generate correctly from live sheet values

### Key Files
- `sync/Code.gs` — full Google Apps Script implementation
- `sync/Runbook.md` — setup, deployment, and troubleshooting guide

### Notion Status Normalization
Notion `Done` → Sheet `Completed` (all metric filters use "Completed")

This document will be updated as the project evolves. The conventions below apply from project inception.

---

## Git Workflow

### Branch Naming
- Feature branches: `claude/<description>-<session-id>` (used by Claude Code agents)
- Human feature branches: `feature/<description>`
- Bug fixes: `fix/<description>`
- Documentation: `docs/<description>`

### Commit Conventions
- Use clear, descriptive commit messages in the imperative mood: `Add X`, `Fix Y`, `Update Z`
- Keep commits focused and atomic — one logical change per commit
- Include a session URL at the end of AI-generated commits:
  ```
  <summary line>

  https://claude.ai/code/session_<id>
  ```

### Push Rules
- Always push with `-u` to set tracking: `git push -u origin <branch-name>`
- Branch names for Claude Code agents **must** start with `claude/`
- Never force-push to `main`/`master` without explicit user confirmation
- Never skip hooks (`--no-verify`) without explicit user request

---

## Development Workflow

### Before Making Changes
1. Read relevant files before editing — never modify code you haven't read
2. Understand the existing patterns before introducing new ones
3. For multi-step tasks, use `TodoWrite` to track progress

### Making Changes
- Prefer editing existing files over creating new ones
- Keep changes minimal and focused on the task at hand
- Do not add docstrings, comments, or refactors to unchanged code
- Avoid over-engineering: no premature abstractions, no hypothetical future requirements

### After Making Changes
- Verify the change works as intended
- Commit with a clear message
- Push to the feature branch

---

## Code Conventions (To Be Defined)

> These sections will be populated once source code is added to the repository.

### Languages & Frameworks
- **Google Apps Script** (ES5-compatible JavaScript) — sync layer
- **Python 3** — data utilities (scraper.py)

### Directory Structure
```
sync/
  Code.gs       — Apps Script: Notion → Sheets sync + summaries
  Runbook.md    — Setup, deployment, troubleshooting
scraper.py      — Philadelphia OPA property lead scraper (separate utility)
requirements.txt
sample_leads.csv
```

### Naming Conventions
- Apps Script functions: camelCase (`syncNotionToTasksLog`, `getConfig`)
- Sheet columns: snake_case (`task_id`, `cognitive_load`)
- Config keys: SCREAMING_SNAKE_CASE (`NOTION_API_KEY`)

### Testing
- Run functions manually in Apps Script editor (Run button)
- `validateMetrics()` — checks formula integrity + metric outputs
- `generateDailyCapacitySummary()` / `generateWeeklyCapacitySummary()` — verify live output

### Build & Run
- Paste `sync/Code.gs` into Apps Script editor attached to your Google Sheet
- Run `setProperties()` once to store secrets
- Run `createTimeTrigger()` once to install 15-min auto-sync
- See `sync/Runbook.md` for full deployment steps

---

## Working with Claude Code

### Key Behaviors
- Claude Code reads files before editing; it will not guess at file contents
- Risky/destructive actions (delete files, force push, drop tables) require explicit user confirmation
- Claude Code uses parallel tool calls where tasks are independent
- Claude Code tracks multi-step work via a todo list visible to the user

### Permissions & Safety
- Claude Code will not run `rm -rf`, `git reset --hard`, or other destructive commands without confirmation
- Claude Code will not skip pre-commit hooks
- Claude Code will not push to branches other than the designated feature branch

### Hooks (if configured)
- Document any `settings.json` hooks here so AI assistants know what runs automatically
- Example: pre-commit hook runs `npm test` → ensure tests pass before committing

---

## Security Guidelines

- Do not commit secrets, API keys, or credentials
- Do not add `.env` files to version control
- Use environment variables for sensitive configuration
- Validate all external input at system boundaries

---

## Updating This Document

This CLAUDE.md should be updated:
- When the tech stack is chosen
- When build/test/lint commands are established
- When directory structure is finalized
- When new conventions are adopted by the team

Keep this document accurate — AI assistants rely on it to work effectively in this codebase.
