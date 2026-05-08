# Masterbuilder — Bootstrap Guide

A Ruflo-powered multi-agent OS for building apps and websites phase by phase.

## What This Is

Masterbuilder gives you a 13-agent specialist team and an 11-phase build system.
Ruflo gives those agents real coordination, memory, and execution power.
Together they turn a product idea into a production-ready app without improvising.

## Requirements

- Node.js 20+
- Claude Code CLI
- Ruflo: `npm install -g ruflo`

## Start a New Project

### 1. Use this template
Click **Use this template** on GitHub to create your new project repo.

### 2. Install Ruflo (once per machine)
```bash
curl -fsSL https://raw.githubusercontent.com/ruvnet/ruflo/main/scripts/install.sh | bash --full
```

### 3. Initialize your project
```bash
cd your-project
ruflo init --full
ruflo daemon start
ruflo memory init
ruflo swarm init
```

### 4. Define your product
Edit `memory/DECISIONS.md` and answer:
- What are you building?
- Who is it for?
- What does success look like for a user?

### 5. Run Phase 01
```bash
./workflows/run-phase.sh 01
```
The agent team will clarify your product, audit the repo, and produce a Phase 01 contract.

### 6. Continue phase by phase
```bash
./workflows/run-phase.sh 02
./workflows/run-phase.sh 03
# ... through 11
```

Each phase builds on the last. Agents read prior memory automatically.

## The Team

| Agent | Role |
|-------|------|
| Chief Builder | Scope control, signoff, launch |
| Scout | Repo audit, reality check |
| Product Architect | Product promise, user outcomes |
| Flow Architect | Onboarding, navigation, momentum |
| Frontend Builder | UI implementation |
| Design Auditor | Hierarchy, accessibility, polish |
| Content Systems Builder | Prompts, resources, structured assets |
| Assessment Builder | Checkpoints, feedback loops |
| Offer Strategist | Pricing, premium paths |
| Backend Builder | Auth, persistence, APIs |
| Systems Architect | Architecture, long-term shape |
| Verifier | Regression, definition of done |
| Learning Steward | Captures decisions, improves the system |

## The Phases

| Phase | Goal |
|-------|------|
| 01 | Product Clarity |
| 02 | Core User Flow |
| 03 | Frontend Foundation |
| 04 | Core Experience Completion |
| 05 | Content & Resource System |
| 06 | Assessment & Feedback Layer |
| 07 | Offer & Monetization |
| 08 | Backend & Data Reality |
| 09 | Intelligence & Personalization |
| 10 | Production Hardening |
| 11 | Launch Readiness |

## Key Files

- `docs/TEAM.md` — full agent roster and responsibilities
- `docs/PHASE-MODEL.md` — phase goals, leads, and support agents
- `docs/MASTER-PLAN.md` — the operating system for running builds
- `docs/AGENT-PROMPTS.md` — reusable prompts for each specialist
- `workflows/` — Ruflo workflow files, one per phase
- `memory/` — decisions, learnings, debt, patterns (written by agents)
- `phases/` — phase contracts (output of each phase run)
- `templates/` — kickoff, review, and audit templates

## Memory

Agents write to `memory/` automatically during each phase:
- `DECISIONS.md` — what was decided and why
- `LEARNINGS.md` — what was discovered
- `PATTERNS.md` — reusable patterns for future builds
- `DEBT.md` — deferred items and known gaps

## Session Start

Ruflo auto-starts on every Claude Code session (daemon, memory, swarm).
No manual setup needed after the first `ruflo init`.
