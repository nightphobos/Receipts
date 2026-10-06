#!/usr/bin/env bash
# Ralph Wiggum loop: one fresh Claude Code run per task until tasks.md has no open "- [ ]".
# Usage: caffeinate -dimsu ./ralph.sh      (env: MAX_ITER=60 MODEL=claude-opus-5-5)
set -uo pipefail
cd "$(dirname "$0")"

MAX_ITER="${MAX_ITER:-60}"
MODEL="${MODEL:-claude-opus-5-5}"
STALL_LIMIT="${STALL_LIMIT:-4}"     # stop after N iterations in a row with no new commit
TASKS=".specify/tasks.md"
mkdir -p .ralph/logs
LOG=".ralph/progress.log"

open_tasks() { grep -c '^- \[ \]' "$TASKS" || true; }
head_commit() { git rev-parse HEAD 2>/dev/null || echo none; }

stall=0
for i in $(seq 1 "$MAX_ITER"); do
  left="$(open_tasks)"
  if [ "$left" -eq 0 ]; then
    echo "[$(date '+%F %T')] no open tasks left — finished" | tee -a "$LOG"
    break
  fi
  next="$(grep -m1 '^- \[ \]' "$TASKS" | cut -c7-80)"
  before="$(head_commit)"
  echo "[$(date '+%F %T')] iter $i/$MAX_ITER · open: $left · next: $next" | tee -a "$LOG"

  claude -p "$(cat PROMPT.md)" \
    --model "$MODEL" \
    --dangerously-skip-permissions \
    --output-format stream-json --verbose \
    > ".ralph/logs/iter-$(printf '%03d' "$i").jsonl" 2>&1
  rc=$?
  after="$(head_commit)"

  if grep -qiE 'usage limit|rate.?limit|overloaded|529' ".ralph/logs/iter-$(printf '%03d' "$i").jsonl" && [ "$before" = "$after" ]; then
    echo "[$(date '+%F %T')] rate/usage limit hit (rc=$rc) — sleeping 15 min" | tee -a "$LOG"
    sleep 900
    continue
  fi

  if [ "$before" = "$after" ]; then
    stall=$((stall + 1))
    echo "[$(date '+%F %T')] no new commit (rc=$rc), stall $stall/$STALL_LIMIT" | tee -a "$LOG"
    if [ "$stall" -ge "$STALL_LIMIT" ]; then
      echo "[$(date '+%F %T')] stalled — stopping. See NOTES.md and the last logs." | tee -a "$LOG"
      break
    fi
  else
    stall=0
  fi

  if grep -q 'ALL_TASKS_DONE' ".ralph/logs/iter-$(printf '%03d' "$i").jsonl" && [ "$(open_tasks)" -eq 0 ]; then
    echo "[$(date '+%F %T')] completion promise received — finished" | tee -a "$LOG"
    break
  fi
  sleep 5
done

echo "--- summary ---" | tee -a "$LOG"
echo "done:    $(grep -c '^- \[x\]' "$TASKS" || true)" | tee -a "$LOG"
echo "blocked: $(grep -c '^- \[!\]' "$TASKS" || true)" | tee -a "$LOG"
echo "open:    $(open_tasks)" | tee -a "$LOG"
ls -1 dist/*.apk 2>/dev/null | tee -a "$LOG"
