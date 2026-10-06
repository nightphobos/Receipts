# Spec — Receipts («Чеки»), Clock In MVP

## Problem
Crypto Twitter is full of price calls. Nobody can check a caller's real hit-rate: people delete misses, edit posts, and screenshot only wins. Timestamps on social platforms prove nothing.

## Solution in one sentence
A Seeker app where every call is sealed on Solana as a hash now, revealed after its deadline, and scored automatically against Pyth prices — with unrevealed calls counted as misses — so your hit-rate cannot be cleaned up.

## Users
- Primary: a Seeker owner who trades and posts calls.
- Secondary: anyone who opens a receipt link to check a caller (web view is out of scope tonight; the core must be reusable for it).

## Core flow (must work end to end)
1. **Connect** wallet via Mobile Wallet Adapter (Seed Vault Wallet on Seeker; Phantom/Solflare elsewhere).
2. **Seal a call.** The user picks:
   - asset: **SOL or SKR** (fixed list; SKR = Solana Mobile / Seeker token — this is the Seeker-native angle and the SKR-integration prize);
   - direction: `above` or `below`;
   - target price in USD (> 0);
   - deadline: presets 1 h, 24 h, 3 d, 7 d, or custom; must be ≥ now + 1 h and ≤ now + 30 d.
   The app shows the current Pyth price as a hint. On "Seal", the app generates a random salt, computes the commit hash, **stores the call JSON + salt locally before signing**, then sends one Memo transaction signed through MWA.
3. **List.** Home screen lists all the user's receipts read from chain, newest first, with status chips and a countdown.
4. **Reveal.** After the deadline, the receipt shows a "Reveal" button that sends a second Memo transaction containing the call JSON and salt.
5. **Resolve.** For a revealed receipt the app fetches the Pyth price at the deadline timestamp and shows HIT or MISS with the price.
6. **Profile.** Hit-rate and counts: total, hits, misses, forfeited, pending; plus a "copy share text" button with the Solscan links.

## Statuses
| Status | Condition |
|---|---|
| `sealed` | commit on chain, now < deadline |
| `awaiting_reveal` | now ≥ deadline, no valid reveal, now < deadline + 24 h |
| `forfeited` | no valid reveal and now ≥ deadline + 24 h — **counts as a miss** |
| `hit` / `miss` | valid reveal; resolved against Pyth price at deadline |
| `unresolved` | valid reveal but Pyth price not yet fetchable (show retry) |

Hit rule: `above` → price at deadline **strictly greater** than target; `below` → **strictly less**. Equal = miss.
Hit-rate = hits / (hits + misses + forfeited). Pending (`sealed`, `awaiting_reveal`, `unresolved`) are excluded.

## Integrity rules
- A reveal is valid only if `sha256(canonicalJson + "|" + salt)` equals a commit hash made **by the same wallet**, and the deadline inside the JSON equals the deadline in the commit memo.
- A reveal from another wallet, a reveal with a mismatching hash, or a duplicate reveal is ignored.
- The UI must not offer reveal before the deadline.
- Losing local data means the call can't be revealed and will be forfeited. Show this warning once on first seal; offer "Export secrets" (copy JSON to clipboard) in Profile.

## Seeker specifics
- Signing through MWA → Seed Vault on Seeker.
- Haptic feedback on seal and on reveal.
- P2 (if time): "Seeker verified" badge if the wallet holds a Seeker Genesis Token.

## Price source (changed 2026-10-06)
Pyth Hermes requires an API key since 2026-08-26 and we don't have one yet. Prices come through a `PriceSource` interface with two implementations:
- `pyth` — real Hermes, used when `EXPO_PUBLIC_PYTH_API_KEY` is set and `EXPO_PUBLIC_PRICE_SOURCE` is not `mock`.
- `mock` — deterministic demo prices, used otherwise (the default tonight).
Honesty rule: whenever the mock source is active, every screen that shows a price or a HIT/MISS shows a visible **DEMO PRICES** badge, and "Copy share text" prefixes the text with `[DEMO PRICES — not real results]`. Mock results must never be presentable as real.

## Out of scope tonight
Web profile, leaderboard, share image card, push notifications, other wallets' profiles, Genesis badge (P2 only).

## Acceptance criteria
- AC1: All `src/core` logic covered by unit tests; `yarn test` and `yarn typecheck` green.
- AC2: A release-mode APK builds from a clean checkout with one documented command and installs on the connected Seeker via `adb install -r`.
- AC3: On device (checked by the human in the morning): connect → seal → see it listed as `sealed` → after a 1 h deadline, reveal → see HIT/MISS.
- AC4: README explains how anyone can verify a receipt by hand from the two memos.
