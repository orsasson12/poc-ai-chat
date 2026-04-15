# Mission-Split Rule — Automatic Sequential Execution

When a task involves **3 or more distinct implementation steps**, automatically apply this workflow. Do NOT apply for simple 1-2 step tasks.

## Phase 1 — Analyze & Split

Before writing any code:

1. Break the task into **discrete missions** — each must be independently completable without needing context from prior missions
2. Number them and present the list to the user:
   ```
   This task has N missions:
   1. [Mission title] — [one-line scope]
   2. [Mission title] — [one-line scope]
   3. [Mission title] — [one-line scope]
   ```
3. Wait for user approval before starting. The user may reorder, add, remove, or merge missions.

### What makes a good mission boundary
- Each mission produces a working, verifiable result (compiles, no broken imports)
- Missions don't require remembering implementation details from earlier missions
- Each mission modifies a focused set of files
- Dependencies flow naturally (types → queries → UI, not interleaved)

## Phase 2 — Sequential Execution

Execute missions one at a time:

1. **Announce** — Print `"Mission X/N: [title]"` before starting
2. **Execute** — Complete all work for that mission
3. **Verify** — Run a quick check (build, lint, or type-check) to confirm nothing is broken
4. **Compact** — After the mission is complete and verified, run `/compact` to clear context
5. **Continue** — Move to the next mission. The compacted summary carries forward what was done.

Repeat until all missions are complete.

## Phase 3 — Completion

After the final mission, provide a brief summary:
```
All N missions complete:
1. [Mission title] — done
2. [Mission title] — done
3. [Mission title] — done
```

## Rules
- **No looping** — Linear execution only. Each mission runs once.
- **No skipping compaction** — Always compact between missions to preserve context window.
- **Fail-fast** — If a mission fails verification, stop and ask the user before continuing. Do not proceed to the next mission with broken state.
- **Mission independence** — If you realize during execution that missions are too coupled, stop and re-split before continuing.
