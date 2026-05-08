---
name: build
description: Start a new build from scratch. Asks what you're building, writes the brief, and kicks off Phase 01.
---

Ask the user these three questions if not already answered in `memory/DECISIONS.md`:

1. What are you building?
2. Who is it for?
3. What does success look like for a user?

Write their answers to `memory/DECISIONS.md` under `## Product Brief`.

Then run Phase 01:

```bash
./workflows/run-phase.sh 01
```

Report back with the Phase 01 output and confirm what Phase 02 will focus on.
