# Constitution — Receipts («Чеки»)

These rules override everything else. If a task conflicts with them, the task is wrong: mark it blocked and explain.

## Product
1. Receipts makes crypto price calls verifiable: commit a hash now, reveal later, unrevealed counts as a miss. Honesty of the score is the product. Never add a code path that lets a user hide, edit or cherry-pick a call.
2. No custom on-chain program. On-chain primitives: the SPL Memo program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`), a **0-lamport System transfer to the registry address `E5YRG7uSptKAd2T4WbMyK8xadyuZ8v132Ji6XhAxX5SJ`** (an indexing tag only), and **user-initiated SKR tips** (direct wallet→wallet SPL transfer the user approves in the wallet). No escrow, no stakes, no bets, no pooled funds, nothing the app holds.
3. No backend server. Everything is read from the Solana RPC and public price APIs (Pyth Hermes, KuCoin). The leaderboard indexer is a deterministic script anyone can re-run (GitHub Actions → static files); it is a convenience, never the source of truth.

## Architecture
4. All business logic lives in `src/core/` as pure TypeScript with **zero** React Native / Expo imports, so a web build can reuse it later. UI and chain I/O live outside `src/core/`.
5. I/O (fetch, RPC, storage, randomness, clock) is injected into core functions, never imported directly, so it can be tested.
6. Use the stack the Solana Mobile Expo template ships with. Do not upgrade the Expo SDK, React Native, or `@solana/web3.js` major versions. Add a dependency only when a task needs it; prefer `@noble/hashes` for hashing (works in RN and web).

## Quality gates
7. Every task in `src/core/` is test-first: write the failing test, then the code. A task is done only when `yarn test` and `yarn typecheck` pass.
8. Never mark a task `[x]` with failing tests, skipped tests, or `// @ts-ignore` added to make it pass.
9. Keep each commit to one task. Commit message: `[speckit] <task id>: <short title>`.

## Autonomy and safety (unattended overnight run)
10. You run without a human. Anything that needs a human — approving a wallet popup, tapping on the phone, entering credentials, buying something — cannot be done by you. Implement everything around it, then mark the task `[!]` (blocked) with a one-line reason in `NOTES.md`, and move on.
11. If the same task fails in 3 iterations (check `NOTES.md`), mark it `[!]`, write what you tried and the last error, and move on.
12. Work only inside this repository directory. Do not read or modify anything in the user's home directory outside it (no `~/.config`, `~/.ssh`, `~/.codex`, other projects). Do not change global git, npm, yarn, gradle or shell config.
13. Never `git push`, never create remote repos, never publish packages, never send transactions with real funds, never commit secrets or `.env` files.
14. Destructive commands (`rm -rf`, `git reset --hard`, `git clean`) only on paths inside this repo, and only on generated directories (`node_modules`, `android/build`, `dist`).
