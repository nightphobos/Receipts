You are one iteration of an unattended overnight build loop. You have no human to ask. Each iteration starts with a fresh context; the repository files are your only memory.

1. Read `.specify/memory/constitution.md` (rules that override everything), then `NOTES.md` (what previous iterations did, attempts, blockers).
2. Read `.specify/tasks.md`. Find the FIRST line that starts with `- [ ]`.
   - If there is none: run `yarn test` and `yarn typecheck`. If both pass, output exactly `<promise>ALL_TASKS_DONE</promise>` and stop. If they fail, append a new task `- [ ] T9xx Fix: <what fails>` at the end of Phase 4 and stop.
3. Read `.specify/spec.md` and `.specify/plan.md` for the requirements and exact formats relevant to that task. Read the existing code you will touch before changing it.
4. Implement ONLY that one task. For `src/core` and `src/chain`: write the failing test first, then the code.
5. Run `yarn test` and `yarn typecheck` (once they exist). Fix failures caused by your change. Do not weaken or skip tests.
6. If the task is done and the gates pass:
   - change its `- [ ]` to `- [x]` in `.specify/tasks.md`;
   - append to `NOTES.md`: `## <task id> — done <date>` plus 1–3 lines on decisions and anything the next iteration must know;
   - `git add -A && git commit -m "[speckit] <task id>: <short title>"`.
7. If you cannot finish it in this iteration:
   - append to `NOTES.md`: `## <task id> — attempt <n> <date>` with what you did, the exact error, and the next step;
   - commit work in progress that does not break the gates; otherwise `git stash` it and note that;
   - if this is attempt 3 for the task, or it needs a human (wallet approval, phone tap, credentials, payment), change `- [ ]` to `- [!]`, record the reason in NOTES.md, and commit.
8. Stop after one task. Do not start the next one.

Never output the completion promise unless step 2 found zero `- [ ]` lines and both gates passed.
