# Master Plan

This is the operating system for building smart, beautiful apps and websites with specialized agents.

## Main Principle

Only one phase is active at a time.

Good builds usually fail when teams do too much at once:
- backend too early
- polish too early
- monetization too late
- content depth too late
- verification too late

This system prevents that by sequencing the work.

## Standard Phase Workflow

### Step 1: Scout Audit

The Scout must first inspect the repo and report:
- what already exists
- what is partial
- what is missing
- what files are involved
- what risks could derail the phase

### Step 2: Phase Contract

The Chief Builder confirms:
- active phase
- goal
- in-scope work
- out-of-scope work
- lead agent
- support agents
- definition of done

### Step 3: Execution Brief

The lead agent translates the phase into:
- user-facing outcome
- implementation approach
- likely files to change
- review checklist

### Step 4: Build

Implementation happens within the current phase only.

### Step 5: Review

The Design Auditor and Verifier review against the phase contract.

### Step 6: Decision

The Chief Builder issues one of:
- approved
- approved with debt
- needs another pass

### Step 7: Learning Update

The Learning Steward records:
- what worked
- what caused friction
- what should be reused
- what prompts or templates should improve

## Handoff Format

Every agent should hand off in this structure:

```text
Context
What phase is active and what I was asked to do.

Findings / Work Completed
What I found or changed.

Risks
What could still go wrong.

Decision Needed
What the next agent or Chief Builder needs to decide.

Recommended Next Step
The single best next move.
```

## Global Rules

- Only one phase is active at a time.
- Never widen scope beyond the active phase.
- Do not migrate backend systems before the product flow is stable unless blocked.
- Do not claim launch readiness before verification passes.
- If repo reality conflicts with a phase playbook, update the playbook before continuing.
- Prefer one cleanly completed phase over scattered progress across many phases.

## Best Use Cases

This system works especially well for:
- SaaS apps
- learning platforms
- content-rich products
- AI-enabled tools
- client websites with product logic
- marketplaces
- dashboards
- premium consumer experiences

## Default Execution Command

Use commands like:

`Execute Phase 01 using phases/PHASE-01-product-clarity.md and follow docs/MASTER-PLAN.md.`

Or:

`Act as Chief Builder. Read docs/MASTER-PLAN.md and set up this repo for Phase 01 execution.`
