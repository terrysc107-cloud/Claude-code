---
name: phase
description: Run a masterbuilder phase (01–11). Usage: /phase 01
---

Read `memory/DECISIONS.md` first to get current context.

Then run the requested phase workflow:

```bash
./workflows/run-phase.sh $ARGUMENTS
```

After the phase completes, confirm agents have written output to `memory/DECISIONS.md` and the relevant `phases/` contract file.

Report what was completed and what the next phase is.
