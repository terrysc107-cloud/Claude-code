# System Improvement Protocol

Use this protocol to improve the builder system after each real project or major phase.

## Purpose

The system should become sharper each time it is used.

The goal is not just to record lessons. The goal is to evolve:
- prompts
- templates
- phase sequencing
- specialist activation rules
- review quality

## When To Run This Protocol

Run it:
- after a full project
- after a failed phase
- after a phase that exposed real weaknesses in the system
- after repeated success patterns emerge

## Inputs To Review

Look at:
- `memory/DECISIONS.md`
- `memory/LEARNINGS.md`
- `memory/DEBT.md`
- `memory/PATTERNS.md`
- phase reviews
- kickoff docs
- execution briefs

## Questions To Ask

1. Which prompts produced the best work?
2. Which prompts were too vague or too broad?
3. Which phases caused the most confusion?
4. Which specialist roles were missing?
5. Which specialist roles were unnecessary?
6. Which templates slowed the team down?
7. Which review criteria were too weak?
8. Where did the system allow premature work?

## Required Outputs

After running this protocol, update one or more of:
- `docs/AGENT-PROMPTS.md`
- `docs/MASTER-PLAN.md`
- `docs/PHASE-MODEL.md`
- `docs/SPECIALISTS.md`
- any file under `templates/`
- `docs/COMMANDS.md`

## Improvement Rule

Do not expand the system just to expand it.

Only make changes that do one of these:
- increase clarity
- reduce repeated failure
- improve execution speed without losing quality
- improve role precision

## Suggested Review Prompt

```text
Act as Chief Builder and Learning Steward.
Read docs/SYSTEM-IMPROVEMENT-PROTOCOL.md, docs/MASTER-PLAN.md, docs/SPECIALISTS.md, and everything in memory/.
Review what this system learned from real execution.
Recommend only the highest-leverage improvements to prompts, templates, roles, and phase sequencing.
```
