# Ralph Loop

Autonomous fixer that processes the poc-ai-chat fix queue one mission at a time.

## What it does

Reads `.claude/ralph/queue.md` to find the next unchecked mission, extracts the
prompt from `.claude/ralph/prompts.md`, runs it in a fresh `claude -p` invocation,
verifies tsc still passes, commits + pushes the change to `ralph/auto-fixes`,
marks the mission done, and moves to the next one.

Fresh context per mission. Stops on the first failure.

## Scope

Configured for missions **1-12** (critical + high priority). See the full
review at `outputs/poc-ai-chat-review.md` for context on each mission.

## Prerequisites

1. **Claude Code CLI** installed globally:
   ```
   npm install -g @anthropic-ai/claude-code
   ```
2. **Clean working tree** — commit or stash any pending changes first.
3. **Remote configured** — `git remote -v` should show `origin`.
4. **You're on the repo root** when you run the script.

## Running it

```bash
# Run all pending missions
bash .claude/ralph/ralph.sh

# Dry run — show what would happen, do nothing
bash .claude/ralph/ralph.sh --dry-run

# Run only one specific mission
bash .claude/ralph/ralph.sh --only 3

# Resume from a specific mission (skip earlier ones even if unchecked)
bash .claude/ralph/ralph.sh --start-at 7

# Skip the git push step (local commits only)
bash .claude/ralph/ralph.sh --no-push
```

On Windows, run from **Git Bash**, **WSL**, or **Warp** (any bash shell).
The script is POSIX-ish and tested against bash + GNU/BSD sed.

## What the loop does per mission

1. Extract the mission prompt from `prompts.md`.
2. Invoke `claude -p --dangerously-skip-permissions` piping the prompt in.
   Each invocation has fresh context — claude doesn't remember prior missions.
3. Run `npx tsc --noEmit -p apps/web/tsconfig.json`. If it fails, halt.
4. Run `npx eslint .` (report-only, not a gate).
5. `git add -A && git commit -m "ralph: mission N — Title"`.
6. `git push -u origin ralph/auto-fixes`.
7. Mark the mission `[x]` in `queue.md` and append a log line.

## When it stops

- **All missions complete** — the loop exits cleanly.
- **claude exits non-zero** — the mission gets marked `[!]` and the loop halts.
- **tsc breaks after a mission** — marked `[!]`, halts. Your branch holds the
  broken state so you can inspect.
- **Working tree dirty at start** — refuses to start. Commit or stash first.

Resume after a halt by fixing the issue and running:
```bash
bash .claude/ralph/ralph.sh --start-at <next-mission-number>
```

## Files

| File | Purpose |
|---|---|
| `.claude/agents/ralph-fixer.md` | Subagent persona (can also be invoked manually from Claude Code) |
| `.claude/ralph/queue.md` | Mission checklist with status markers |
| `.claude/ralph/prompts.md` | Full prompt text for each mission |
| `.claude/ralph/ralph.sh` | The driver loop |
| `.claude/ralph/README.md` | This file |

## After the loop finishes

You'll have a `ralph/auto-fixes` branch with 12 commits on it. Workflow:

1. Review the diff: `git log --stat main..ralph/auto-fixes`
2. Open a PR: `gh pr create --base main --head ralph/auto-fixes`
3. Skim each commit individually — each is independently reviewable.
4. Merge or cherry-pick what you like.

## Safety notes

- The loop uses `--dangerously-skip-permissions` so claude can run file edits
  and bash without confirmation. This is why it works unattended, and also
  why you should **only ever run it against a branch**, never main.
- The working-tree-dirty guard stops you from running it with unsaved work.
- Each mission gets its own commit, so `git revert <sha>` rolls back one
  mission cleanly.
- The script does NOT auto-merge. Review happens on your schedule.
