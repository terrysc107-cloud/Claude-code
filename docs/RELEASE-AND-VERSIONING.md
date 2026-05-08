# Release And Versioning

Use this guide to keep the builder system stable as it improves over time.

## Why Versioning Matters

If you sell, reuse, or distribute this system, you need a way to say:
- what changed
- what improved
- what prompts or phases were updated
- what buyers or collaborators should trust in a given release

## Recommended Version Pattern

Use simple semantic versioning:

- `v1.0.0` for the first stable public release
- `v1.1.0` for meaningful additions such as new specialists or templates
- `v1.1.1` for small fixes or wording improvements
- `v2.0.0` for major structural changes to phase sequencing or agent roles

## Recommended Release Checklist

Before tagging a release:
- review `docs/MASTER-PLAN.md`
- review `docs/COMMANDS.md`
- review `docs/SPECIALISTS.md`
- review templates for consistency
- review memory-derived improvements
- confirm README still matches repo reality

## Suggested Files To Add Over Time

- `CHANGELOG.md`
- `LICENSE`
- `PROJECT-EXAMPLES/`

## Suggested Release Rule

Do not release after brainstorming changes alone.

Release after:
- the system has been used
- the learning loop has been updated
- prompts and templates were improved based on real execution
