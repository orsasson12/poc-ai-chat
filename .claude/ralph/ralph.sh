#!/usr/bin/env bash
#
# Ralph Loop — autonomous fixer driver for poc-ai-chat
#
# Reads the next unchecked mission from queue.md, extracts the corresponding
# prompt section from prompts.md, runs `claude -p` with fresh context,
# verifies tsc still passes, commits + pushes to ralph/auto-fixes, marks
# the mission done, and moves to the next.
#
# Stops on first failure so you can inspect.
#
# Usage:
#   bash .claude/ralph/ralph.sh                # run all pending missions
#   bash .claude/ralph/ralph.sh --dry-run      # show what would run, do nothing
#   bash .claude/ralph/ralph.sh --only 3       # run only mission 3
#   bash .claude/ralph/ralph.sh --start-at 7   # resume from mission 7
#
set -euo pipefail

# ---------- config ----------
BRANCH="ralph/auto-fixes"
QUEUE_FILE=".claude/ralph/queue.md"
PROMPTS_FILE=".claude/ralph/prompts.md"
TSC_CMD="npx tsc --noEmit -p apps/web/tsconfig.json"
LINT_CMD="npx eslint ."                                 # runs inside apps/web
PUSH=1                                                   # 0 to disable push
DRY_RUN=0
ONLY=""
START_AT=""

# ---------- arg parsing ----------
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=1; shift ;;
    --no-push)   PUSH=0; shift ;;
    --only)      ONLY="$2"; shift 2 ;;
    --start-at)  START_AT="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

# ---------- colors ----------
if [ -t 1 ]; then
  CBOLD=$'\033[1m'; CRED=$'\033[31m'; CGRN=$'\033[32m'; CYEL=$'\033[33m'
  CBLU=$'\033[34m'; CMAG=$'\033[35m'; CRST=$'\033[0m'
else
  CBOLD=""; CRED=""; CGRN=""; CYEL=""; CBLU=""; CMAG=""; CRST=""
fi

log()   { printf "%s[ralph]%s %s\n" "$CBLU" "$CRST" "$*"; }
ok()    { printf "%s[ralph]%s %s%s%s\n" "$CBLU" "$CRST" "$CGRN" "$*" "$CRST"; }
warn()  { printf "%s[ralph]%s %s%s%s\n" "$CBLU" "$CRST" "$CYEL" "$*" "$CRST"; }
die()   { printf "%s[ralph]%s %s%s%s\n" "$CBLU" "$CRST" "$CRED" "$*" "$CRST"; exit 1; }

# ---------- preflight ----------
preflight() {
  # git repo?
  git rev-parse --show-toplevel >/dev/null 2>&1 || die "Not inside a git repo."
  cd "$(git rev-parse --show-toplevel)"

  [ -f "$QUEUE_FILE" ]   || die "Missing $QUEUE_FILE"
  [ -f "$PROMPTS_FILE" ] || die "Missing $PROMPTS_FILE"

  # claude CLI?
  command -v claude >/dev/null 2>&1 || die "'claude' CLI not found. Install: npm install -g @anthropic-ai/claude-code"

  # clean working tree?
  if [ -n "$(git status --porcelain)" ]; then
    die "Working tree is dirty. Commit or stash before running ralph."
  fi

  # branch
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    log "Checking out existing branch $BRANCH"
    git checkout "$BRANCH" >/dev/null
  else
    log "Creating branch $BRANCH"
    git checkout -b "$BRANCH" >/dev/null
  fi
}

# ---------- queue helpers ----------
next_mission() {
  # Outputs the next pending mission number, or empty.
  if [ -n "$ONLY" ]; then
    # --only mode: return $ONLY if it's still pending, else empty
    if grep -qE "^- \[ \] Mission $ONLY " "$QUEUE_FILE"; then
      echo "$ONLY"
    fi
    return
  fi

  local line num
  while IFS= read -r line; do
    num=$(echo "$line" | sed -nE 's/^- \[ \] Mission ([0-9]+) .*/\1/p')
    if [ -n "$num" ]; then
      if [ -n "$START_AT" ] && [ "$num" -lt "$START_AT" ]; then
        continue
      fi
      echo "$num"
      return
    fi
  done < "$QUEUE_FILE"
}

mission_title() {
  local n="$1"
  grep -E "^- \[[ x!]\] Mission $n " "$QUEUE_FILE" \
    | sed -E "s/^- \[[ x!]\] Mission $n — //"
}

mark_mission() {
  # $1=num, $2=status ([x] or [!])
  local n="$1" status="$2"
  # Portable in-place sed (works on macOS and GNU)
  sed -E -i.bak "s|^- \[ \] Mission $n |- $status Mission $n |" "$QUEUE_FILE"
  rm -f "$QUEUE_FILE.bak"
}

append_log() {
  local n="$1" title="$2" outcome="$3"
  printf "\n- %s — Mission %s (%s): %s" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$n" "$outcome" "$title" \
    >> "$QUEUE_FILE"
}

# ---------- prompt extraction ----------
extract_prompt() {
  local n="$1"
  awk -v target="$n" '
    /^## Mission [0-9]+ / {
      m = $0
      sub(/^## Mission /, "", m)
      sub(/ .*/, "", m)
      capturing = (m == target) ? 1 : 0
      next
    }
    /^---$/ && capturing { capturing = 0; next }
    capturing { print }
  ' "$PROMPTS_FILE"
}

# ---------- verify ----------
verify_tsc() {
  log "Running tsc..."
  if $TSC_CMD; then
    ok "tsc passes (0 errors)"
    return 0
  else
    warn "tsc FAILED"
    return 1
  fi
}

verify_lint() {
  log "Running eslint..."
  # Don't fail on lint — count and report. Real gate is tsc.
  local errs warns
  local out
  out="$(cd apps/web && npx eslint . 2>&1 || true)"
  errs=$(  echo "$out" | grep -oE '[0-9]+ error'   | head -1 | awk '{print $1}' || echo "?")
  warns=$( echo "$out" | grep -oE '[0-9]+ warning' | head -1 | awk '{print $1}' || echo "?")
  log "eslint: $errs errors, $warns warnings"
}

# ---------- main loop ----------
preflight

log "Branch: $BRANCH"
log "Queue:  $QUEUE_FILE"
log "Mode:   $([ $DRY_RUN -eq 1 ] && echo 'DRY RUN' || echo 'EXECUTE')"
echo

while true; do
  N=$(next_mission)
  if [ -z "$N" ]; then
    ok "All pending missions complete. 🎉"
    break
  fi

  TITLE=$(mission_title "$N")
  echo "${CBOLD}=============================================="
  echo "🚀  Mission $N — $TITLE"
  echo "==============================================${CRST}"

  if [ $DRY_RUN -eq 1 ]; then
    log "(dry run — would extract prompt and invoke claude)"
    mark_mission "$N" "[x]"
    append_log "$N" "$TITLE" "dry-run"
    continue
  fi

  PROMPT_CONTENT="$(extract_prompt "$N")"
  if [ -z "$PROMPT_CONTENT" ]; then
    die "Could not extract prompt for mission $N from $PROMPTS_FILE"
  fi

  # Fresh context: each claude invocation is a new process.
  # --dangerously-skip-permissions allows file edits + bash without confirmation.
  log "Invoking claude (fresh context)..."
  set +e
  echo "$PROMPT_CONTENT" | claude -p --dangerously-skip-permissions
  CLAUDE_EXIT=$?
  set -e

  if [ $CLAUDE_EXIT -ne 0 ]; then
    warn "claude exited non-zero ($CLAUDE_EXIT). Halting."
    mark_mission "$N" "[!]"
    append_log "$N" "$TITLE" "claude-failed"
    die "Mission $N failed inside claude. Inspect and resume with: bash .claude/ralph/ralph.sh --start-at $N"
  fi

  # Verify
  if ! verify_tsc; then
    warn "Mission $N broke tsc. Halting."
    mark_mission "$N" "[!]"
    append_log "$N" "$TITLE" "tsc-regression"
    die "Fix tsc manually, then resume with: bash .claude/ralph/ralph.sh --start-at $((N+1))"
  fi
  verify_lint

  # Commit
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "$(printf 'ralph: mission %s — %s\n\nAutomated via .claude/ralph/ralph.sh' "$N" "$TITLE")"
    ok "Committed"
  else
    warn "Mission $N made no file changes — not committing"
  fi

  # Push
  if [ $PUSH -eq 1 ]; then
    if git push -u origin "$BRANCH" >/dev/null 2>&1; then
      ok "Pushed to origin/$BRANCH"
    else
      warn "Push failed (network? no remote?). Continuing with local commit."
    fi
  fi

  # Mark done
  mark_mission "$N" "[x]"
  append_log "$N" "$TITLE" "ok"
  ok "Mission $N complete"
  echo

  # Break if --only mode (we only wanted one)
  if [ -n "$ONLY" ]; then
    break
  fi
done
