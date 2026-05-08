# Phase 08 Playbook - Backend And Data Reality

## Objective

Replace local or fake systems with real auth, persistence, and safe data ownership.

## Lead And Support Agents

- Lead: `Backend Builder`
- Support: `Systems Architect`, `Frontend Builder`, `Verifier`

## Scout Audit Questions

1. Which flows still depend on local or fake state?
2. What data needs a stable schema?
3. What needs auth or permissions?
4. Which user-facing flows must remain unchanged during migration?
5. What backend scope is truly required now?

## Required Outputs

- real auth if needed
- real persistence if needed
- safer data model
- stronger route and data protection

## Exit Criteria

- core flows no longer depend on fake state
- data ownership and access are safer
- the backend is real enough to support the product honestly

## Execution Prompt

```text
Execute Phase 08 using docs/MASTER-PLAN.md and this playbook.
Adopt the roles of Backend Builder, Systems Architect, Frontend Builder, Verifier, and Scout.
Audit all fake-state-dependent flows first, then migrate only what the product is ready for.
```
