# Bootstrap A Project

Use this guide when you want to apply the builder system to a fresh product repo.

## Goal

Set up a target project so any capable LLM can step in and execute work in the same methodical way.

## Recommended Folder Copy

Copy these into the target repo:

- `docs/TEAM.md`
- `docs/AGENT-PROMPTS.md`
- `docs/MASTER-PLAN.md`
- `docs/PHASE-MODEL.md`
- `docs/LEARNING-LOOP.md`
- `docs/MAX-POTENTIAL.md`
- `docs/COMMANDS.md`
- `templates/`
- `phases/`
- `memory/`

## Setup Steps

### 1. Create a kickoff file

Use:
- `templates/PROJECT-KICKOFF-TEMPLATE.md`

Fill in:
- who the product serves
- what problem it solves
- core outcome
- primary user journey
- likely technical shape

### 2. Decide the first phase

Usually:
- start with `Phase 01` if the product still feels conceptually fuzzy
- start with `Phase 02` if the product is already clear but the flow is weak
- start with `Phase 03` only if the product and flow are already strong

### 3. Create live memory files

Suggested files in the target repo:
- `memory/DECISIONS.md`
- `memory/LEARNINGS.md`
- `memory/DEBT.md`
- `memory/PATTERNS.md`

### 4. Create a live project status file

Recommended file:
- `PROJECT-STATUS.md`

Use:
- `templates/PROJECT-STATUS-TEMPLATE.md`

### 5. Run the first audit

Use the Scout first. Do not begin implementation until the repo has been inspected.

## Best Bootstrap Command

Use something like:

```text
Act as Chief Builder and Scout.
Read docs/MASTER-PLAN.md, docs/TEAM.md, docs/PHASE-MODEL.md, docs/MAX-POTENTIAL.md, and templates/PROJECT-KICKOFF-TEMPLATE.md.
Audit this repo, create a kickoff understanding, choose the best first phase, and prepare a phase contract.
```

## Important Rule

Do not blindly run all phases. The system is ordered, but the depth and exact contents should adapt to the product.
