# Phase 10 Playbook - Production Hardening

## Objective

Make the product resilient, accessible, and reliable for real usage.

## Lead And Support Agents

- Lead: `Verifier`
- Support: `Backend Builder`, `Frontend Builder`, `Design Auditor`

## Scout Audit Questions

1. Where are loading, empty, and error states weak?
2. Which validations are thin?
3. What accessibility issues remain?
4. Where are trust-damaging rough edges hiding?
5. What deployment or environment assumptions are fragile?

## Required Outputs

- stronger resilience
- better validation
- improved accessibility
- fewer obvious rough edges
- stronger production readiness

## Exit Criteria

- the product feels reliable
- there are no obvious unhandled edges
- the product can be shown without apology

## Execution Prompt

```text
Execute Phase 10 using docs/MASTER-PLAN.md and this playbook.
Adopt the roles of Verifier, Backend Builder, Frontend Builder, Design Auditor, and Scout.
Audit the whole product for fragility first, then harden what matters most.
```
