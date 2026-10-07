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


---

# v2 — Up/Down calls, recoverable secrets, global leaderboard (decided 2026-10-07 by the human)

Replaces the absolute-target call. Rationale: with "above $X" a user could seal "above $0.001" while the price is $10 and farm a 100% hit-rate. v2 calls are only a direction relative to the market price at the moment the commit lands on chain, so a call can never be "already true".

## Call
- Asset SOL or SKR, direction **up ▲ / down ▼**, horizon: **24h (default)**, 3d, 7d, and **1h "practice"** (demo; counted in personal stats, excluded from the leaderboard).
- No target input. The New screen is: asset → two big ▲ / ▼ buttons → horizon chips → Seal.
- **SKR Daily Call**: a preset "SKR · 24h" whose deadline is the next 12:00 UTC that is at least 12 h away, so everybody's SKR Daily shares the same deadline. Separate leaderboard tab.

## Scoring rules (exact; README must state them so anyone can recompute)
- `t0 = ceil_to_minute(commit blockTime)` (if blockTime is already on a minute boundary, t0 = blockTime + 60). `P0 = priceAt(asset, t0)`.
- `PT = priceAt(asset, deadline)`.
- `priceAt(SOL, ts)` = Pyth Crypto.SOL/USD price at ts. `priceAt(SKR, ts)` = **median of the closes of the 5 KuCoin SKR-USDT 1-minute candles ending at floor(ts/60)*60**.
- HIT if (up and PT > P0) or (down and PT < P0). MISS if the opposite. **VOID if PT == P0** (excluded from every count).
- Not revealed by deadline + 24 h → **forfeited** = MISS.
- **One open call per (wallet, asset, horizon class)**: horizon class from `deadline − commit blockTime`: ≤ 2 h → 1h, ≤ 36 h → 24h, ≤ 4 d → 3d, else 7d. A commit made while an earlier commit of the same wallet+asset+class is still before its deadline is an **overlap = MISS** (prevents staking one coin-flip 100×). The UI disables Seal in that case.
- Hedging (sealing ▲ and ▼, revealing only the winner) yields 1 hit + 1 miss: no gain. State this in README and pitch.

## Rating
- Primary number: **z = (H − M) / √N**, N = H + M (M includes forfeits and overlaps), shown as "**+1.9σ vs coin flip**". Next to it: N and hit-rate.
- Leaderboard eligibility: N ≥ 10 resolved calls with horizon ≥ 24h, commits on ≥ 3 distinct UTC days, wallet holds a Seeker Genesis Token. 1h calls never count for the leaderboard.
- Profile shows a separate line **"hidden & forfeited: K"**.
- **Streak** = consecutive UTC days with at least one reveal or seal (rewards showing up, not winning).

## Secrets: derived from the wallet, recoverable on any device
- On first connect the app asks the wallet to sign the fixed message `Receipts master key v1\nSigning this lets Receipts hide and later reveal your call directions. It cannot move funds.` → `master = sha256(signature)`.
- Determinism self-check: sign it twice; if the two signatures differ, fall back to v1-style random salts stored locally (+ show "Export secrets" and a warning). Otherwise store master in `expo-secure-store`.
- `salt = hex(hmac_sha256(master, "rcpt:2|" + asset + "|" + deadline))[0..32]`.
- Recovery when nothing is stored: re-derive master, then for `created` in [commit blockTime − 900, commit blockTime] and dir in {up, down} find the json whose hash matches (≤ 1802 sha256, fast).
- README notes the trade-off: a phishing app that gets you to sign the same text learns your hidden directions early (no funds at risk).

## On-chain format v2
- Call JSON (canonical key order): `{"v":2,"asset":"SOL","dir":"up","deadline":1791400000,"created":1791313600}`.
- Commit memo: `rcpt:2:c:<hash64hex>:<deadline>:<ASSET>` (asset is public, direction hidden). Reveal memo: `rcpt:2:r:<hash64hex>:<base64url(json)>:<saltHex>`.
- Every v2 commit and reveal transaction also contains a **0-lamport SystemProgram.transfer(signer → registry `E5YRG7uSptKAd2T4WbMyK8xadyuZ8v132Ji6XhAxX5SJ`)** so that `getSignaturesForAddress(registry)` lists every Receipts transaction of every user. (Memo v2 rejects non-signer accounts, so the tag must be a separate instruction.)
- A reveal counts only if its commit was tagged. v1 (`rcpt:1:`) receipts are shown as "legacy", excluded from stats and leaderboard.

## Global leaderboard without a backend
- `scripts/indexer.ts` (Node, reuses `src/core`): pages `getSignaturesForAddress(registry)`, parses v2 memos, builds receipts per wallet, resolves prices (permanent cache `indexer-data/prices.json`), checks Genesis tokens, writes `site/leaderboard.json`, `site/u/<wallet>.json`, and a minimal static `site/index.html` + `site/u/<wallet>.html` (web profile for share links).
- `.github/workflows/indexer.yml`: every 15 min, Pyth key from repo secret, deploys `site/` to GitHub Pages. (Human creates the repo and pushes; the loop never pushes.)
- App Leaderboard tab reads `EXPO_PUBLIC_LEADERBOARD_URL`; if unset, it computes the leaderboard itself from the registry with the same core code (slower, trustless).

## Viral surfaces
- **Reveal ceremony**: receipt-paper print animation (tx hash, sealed time, P0), price ticks to PT, HIT/MISS stamp + haptic.
- Share text (React Native Share + copy), English:
  - Sealed: `🔒 SEALED CALL\n$SOL · reveals <Fri 18:00 UTC>\nDirection: ██████\nSealed on Solana: <solscan link>\nGuess my side 👇`
  - Result: `🧾 RECEIPT #<n> — ✅ HIT\nSealed <Mon 14:02 UTC> @ $<P0>\nCall: $SOL ▲ by <Fri>\nActual: $<PT> (<+x.x%>)\nRecord: <H>/<N> · <M> misses, undeletable · <z>σ\nVerify: <solscan link>`

## SKR tips
- On another wallet's profile/leaderboard row: **Tip 10 / 50 / 100 SKR** → SPL transfer signed via MWA (create the recipient ATA idempotently). Pure user-to-user, the app never holds funds.

## Out of scope (v2)
Confidence slider/Brier, boldness tiers, "Fade me" deep links, push notifications, other assets.


---

# Visual style: «Night Register» (pixel JRPG) — chosen 2026-10-07 by the human

Mood: an old JRPG menu at 2 a.m. — a cash-register mimic prints your fate on thermal paper.
Reference mockups (3 screens): Design canvas "Receipts — стили экранов", row 1. Copy text in English.

## Tokens (src/theme/tokens.ts)
- bg `#14122B` (night indigo) · bgDeep `#0E0C20` (tab bar) · surface `#24214A` (menu windows) · border `#4A4580` · text `#F4EEDC` (paper) · textMuted `#B9B2D6`
- accent / CTA `#FFC94A` (gold, shadow `#9A7420`) · up/hit `#3EE08F` (shadow `#1E7A4E`) · down/miss `#FF5C7A` (shadow `#7A2234`) · sealed `#8C7BFF`
- paper `#F4EEDC`, ink on paper `#1B1A2E`, stamps on paper: hit `#137A45`, miss `#C81E3A`
- City layers: far `#1E1B3D`, near `#2B2756`, lit windows gold/purple/green/pink from the palette.
- Fonts (@expo-google-fonts): headings **Pixelify Sans** 500/700 · body **DotGothic16** · numbers **VT323** (≥ 20sp, never smaller).
- Status is shape + colour (colour-blind safe): HIT = round stamp with ✓, MISS = rectangle stamp with ✕, VOID = dashed grey rectangle, FORFEITED = MISS shape with "NO SHOW", SEALED = purple dither bar hiding the direction + countdown.

## Components (src/theme/*)
- **PixelButton**: square corners cut 2px, 2px border, hard 4–6px drop shadow (no blur) in the darker shade; on press it moves down by the shadow height, shadow disappears, a `▶` cursor appears on the left, light haptic. Variants: gold CTA, up (green), down (outlined pink), ghost.
- **PixelPanel**: JRPG window — 2px paper-coloured outer border + inner 2px `#4A4580` border on `surface`.
- **Chip** (horizon/asset), **StatusStamp**, **ReceiptPaper** (paper card with SVG zig-zag torn bottom edge, dashed separators, VT323 rows).
- **Pixel icons** 16×16 grid drawn as SVG rects with `shapeRendering="crispEdges"`, rendered at 3× (48dp) or 1.5×: up, down, lock/seal, clock, flame (streak), trophy (rank), receipt, share, SKR coin, gear, check, cross.
- **Tab bar**: 3 tabs — RECEIPTS (list + profile stats), NEW (centre), RANK. Active tab gold with `▶`.
- **Mascot «Chekko»** — original cash-register mimic (no existing character): purple body, display with eyes, paper tongue. Poses: idle, eat (on Seal), print (reveal), cheer (HIT), cry (MISS). Pixel art as rect arrays in code (16×16), shown in a PixelPanel dialog: "Where will SOL be in 24h? I'll print your receipt."

## Parallax background (src/theme/ParallaxBackground.tsx)
- Three pixel layers behind every screen: **stars** (two dot grids), **far city** silhouette, **near city** with lit windows. Each layer is a horizontally seamless tile twice the screen width.
- Motion sources, combined: (1) slow ambient drift — one tile width per 120 s / 60 s / 24 s; (2) **device tilt** via `expo-sensors` DeviceMotion (gamma/beta), low-pass filtered, ±4 / ±10 / ±18 px; (3) **scroll offset** of the screen's list, factors 0.1 / 0.25 / 0.5.
- Snap offsets to whole device pixels of the pixel grid so art never blurs. Run on the UI thread (Reanimated shared values). Sensor at ~30 Hz, paused when the app is backgrounded. Disabled entirely (static layers) when the OS "reduce motion" setting is on.
- The offset math is a pure function in `src/core/parallax.ts` (inputs: time, tilt, scroll, layer depth → x/y px, snapped) with unit tests.


---

# Demo mode (decided 2026-10-07 by the human)

Purpose: a judge (or anyone without SOL) can see populated screens and play the whole loop — seal → time warp → reveal ceremony → stats/leaderboard — in under a minute. Honesty is the product, so demo data must be impossible to mistake for real records.

## Architecture
- One `DataSource` seam (React context, `src/data/`): `live` (current behaviour) and `demo`. Screens and hooks read receipts, prices, leaderboard, profiles, clock and the "send memo/tip" actions only through it — no `if (demo)` scattered in screens.
- `demo` = an in-memory **simulated chain**: a list of `MemoTx` (same shape as real history) + a deterministic price table + a **demo clock** (`now = realNow + warpOffset`). All scoring, statuses, zσ, leaderboard and ceremony run through the real `src/core` functions on that data.
- Writes in demo: Seal/Reveal append synthetic `MemoTx` (signature `DEMO…`, signer = demo wallet, tagged) instead of calling MWA; Tip shows "Demo — nothing sent". Never calls MWA, never signs, never touches the master key, never sends a transaction, no network needed.
- Storage namespace `rcpt.demo.*` (AsyncStorage) for the demo session; "Reset demo" restores the seed. Real-mode storage/secrets are never read or written in demo.
- Prices in demo: deterministic per-minute series per asset (seeded random walk around SOL 118, SKR 0.0167) from `src/core/demoData.ts`; the hint and P0/PT use it.

## Seed dataset (`src/core/demoData.ts`, pure, seeded, test-covered)
- Demo wallet `DEMOyou1111…` (clearly fake base58-looking string starting with `DEMO`) with ~27 resolved v2 calls over the last 10 days: hits, misses, 1 VOID, 2 forfeited, 1 overlap, 1 practice, plus 2 currently sealed (one 24h with ~5 h left, one SKR Daily) → streak > 0, eligible for the leaderboard.
- ~12 other demo wallets `DEMO…` with varied records (some ineligible) for OVERALL and SKR DAILY tabs; some marked Seeker verified.
- Unit tests assert the seed produces the intended stats (e.g. you are eligible, z within an expected range, at least one of each status).

## Time warp
- In demo only, the banner has **⏩ +1h** and **⏩ +24h** buttons that advance the demo clock; sealed calls become revealable, the ceremony plays with demo prices.

## Guardrails (all required)
- Persistent diagonal **DEMO** ribbon on every screen (top-right corner, gold on indigo) + a slim banner "DEMO DATA — not real records · Exit" under the top bar. Chekko shows a small "DEMO" sign.
- No Solscan/explorer links for demo items (show "simulated" instead). Share texts start with `[DEMO — not a real record]` and contain no tx links.
- Leaderboard/profile in demo show only demo wallets; live leaderboard is never mixed with demo rows.
- Entry: first-run screen offers **Connect wallet** and **Try demo (no wallet)**; Settings has a Demo toggle + Reset demo. Exiting demo returns to live mode untouched.
- Build flag `EXPO_PUBLIC_DEMO_MODE` (`allowed` default for the hackathon build; `off` compiles the entry points out for the dApp Store build).
- The indexer and on-chain code never see demo data (it is never sent anywhere).
