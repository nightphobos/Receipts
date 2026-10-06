# Receipts («Чеки») — Clock In hackathon app

Seeker (Solana Mobile) app: seal a crypto price call as a hash memo now, reveal after the deadline, score against Pyth; unrevealed = miss.

- Rules: `.specify/memory/constitution.md` (always obey).
- What to build: `.specify/spec.md`. How: `.specify/plan.md`. Order: `.specify/tasks.md`.
- Run log and blockers: `NOTES.md`.
- Gates: `yarn test`, `yarn typecheck`. Release APK: see plan → Build.
- Pure logic only in `src/core/` (no RN/Expo imports). I/O is injected.
- Never `git push`. Never touch files outside this repo.
