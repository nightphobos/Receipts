# Tasks — Receipts («Чеки»)

Legend: `- [ ]` open · `- [x]` done · `- [!]` blocked (reason in NOTES.md). Do them **in order**, one per iteration.

## Phase 0 — Baseline
- [x] T001 Read the template code (wallet connect, transaction sending, navigation, cluster config) and summarise it in NOTES.md. Run `yarn install` and `npx tsc --noEmit`; record baseline result. Ensure `.gitignore` covers `node_modules`, `android/build`, `android/app/build`, `dist`, `.env*`, `.ralph/logs`.
- [x] T002 Add `jest` + `ts-jest` for `src/core` and `src/chain` (node env), scripts `test` and `typecheck` in package.json, one trivial passing test. Both commands green.

## Phase 1 — Core (pure TS, test-first)
- [x] T003 `src/core/call.ts`: types, `validateCall(call, nowSec)` (asset list, dir, target > 0 and finite, deadline window now+1h…now+30d, created ≤ now), `canonicalJson(call)` with fixed key order. Tests incl. boundaries.
- [x] T004 `src/core/commit.ts`: `makeSalt(randomBytes)` (injected), `commitHash(json, salt)` with @noble/hashes. Tests with a fixed known vector (compute once, pin it), salt format checks.
- [x] T005 `src/core/memo.ts`: encode/decode commit and reveal memos per plan, base64url without padding, ≤ 500 bytes assert, all malformed cases → null. Round-trip tests.
- [!] T006 `src/core/pyth.ts`: verified feed IDs for all five assets, `fetchLatestPrice(asset, fetchFn)`, `fetchPriceAt(asset, ts, fetchFn)`, parsing price × 10^expo. Tests use recorded real Hermes fixtures (save them under `src/core/__tests__/fixtures/`).
- [x] T007 `src/core/score.ts`: `statusOf(receipt, nowSec)`, `resolve(call, priceAtDeadline)` (strict compare, equal = miss), `stats(receipts)` (hit-rate excludes pending, forfeited counts as miss). Tests for every status and boundary (exactly deadline, exactly deadline + 24 h).
- [x] T008 `src/core/history.ts`: from a list of `{ signature, blockTime, signer, memo, failed }` build receipts: match reveals to commits by hash and same signer, verify hash and deadline, ignore forged/duplicate/foreign reveals, ignore commits with blockTime > deadline, ignore failed tx. Tests with fixtures covering each rule.

## Phase 2 — Chain and storage
- [x] T009 `src/chain/memoTx.ts`: build the Memo instruction/transaction (program id, signer key, UTF-8 data, optional priority fee). Unit test instruction data and keys.
- [x] T010 `src/chain/fetchHistory.ts`: `getSignaturesForAddress` + batched `getParsedTransactions`, extract `rcpt:1:` memos (parsed spl-memo, log fallback), map to the T008 input shape. Tests with a mocked Connection and a recorded parsed-transaction fixture.
- [x] T011 `src/storage/secrets.ts`: save/load/delete/exportAll over AsyncStorage (injected interface). Tests with an in-memory mock.

## Phase 3 — App
- [x] T012 New Receipt screen: asset picker, above/below toggle, target input with live Pyth hint, deadline presets + custom, validation messages from `validateCall`, Seal button → save secret → MWA sign & send memo (reuse template utilities) → haptic → navigate to detail. First-seal warning about local secrets. `yarn typecheck` green.
- [x] T013 Receipts list (home): connect state, pull-to-refresh from chain, status chips with colours, countdown for `sealed`, empty state. Wire navigation for all screens.
- [x] T014 Receipt detail: call details, commit/reveal Solscan links, Reveal button only when status is `awaiting_reveal` and the secret exists locally, resolution with price at deadline, retry for `unresolved`, haptic on reveal.
- [x] T015 Profile: hit-rate and counts from `stats`, "Copy share text" (hit-rate + last 5 receipts with Solscan links), "Export secrets", cluster indicator.
- [x] T016 Polish: app display name `Receipts`, simple icon/splash from a solid colour + text (no copyrighted art), error toasts for RPC/wallet failures, loading states.

## Phase 4 — Ship
- [x] T017 Android release build per plan → `dist/receipts-*.apk`; `adb install -r` if a device is connected (record result). If the build fails, fix and retry within this task; follow constitution rule 11.

## Phase 4a — SOL/SKR focus + mock prices (added 2026-10-06 by the human; do these before T018)
- [x] T021 Assets → `['SOL', 'SKR']` per plan "Assets and price source": update `call.ts`, `pyth.ts` FEED_IDS (look up SKR feed, null if absent), drafts/format/UI pickers and all tests/fixtures that used BTC/ETH/JUP/BONK. Gates green.
- [x] T022 `src/core/price.ts`: `PriceSource`, `pythSource`, `mockSource`, `selectPriceSource` per plan, test-first (determinism, null for future ts, per-asset fallback, env selection).
- [x] T023 Wire the app to `usePriceSource()` everywhere prices are read (New Receipt hint, useReceipts resolution, detail retry). DEMO PRICES badge on every price/HIT/MISS surface and share-text prefix when mock. `yarn typecheck` green and `npx expo export --platform android` bundles.
- [x] T024 Rebuild the release APK (as in T017) with the new code, `adb install -r` if a device is connected; record result in NOTES.md.

- [x] T018 README.md: what it is, the commit/reveal formula and how to verify a receipt by hand from two memos, build/run commands, architecture, known limitations (local secrets, no web view yet, **demo prices until a Pyth API key is set** — how to set `EXPO_PUBLIC_PYTH_API_KEY` in `.env`).
- [x] T019 Final gate: `yarn test`, `yarn typecheck`, release build all green from a clean `git status`. Write a morning summary at the top of NOTES.md: what works, what is blocked, exact steps for the human to test on the Seeker.

## Phase 5 — Stretch (only if everything above is done)
- [x] T020 Seeker verified badge: check Seeker Genesis Token (Token-2022 accounts of the wallet → mint with mintAuthority `GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4` and group `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te`); show badge in Profile. Core logic tested with fixtures. Rebuild APK.


## Phase 6 — v2: up/down, recoverable secrets, leaderboard (added 2026-10-07 by the human; see spec "v2" — overrides older sections where they conflict)
- [!] T030 Devnet spike `scripts/spike-registry.ts` (run with tsx): devnet keypair in `.devnet/` (gitignored), airdrop, send ONE tx = [memo `rcpt:2:test`, SystemProgram.transfer 0 lamports signer→REGISTRY]. Confirm success and that `getSignaturesForAddress(REGISTRY)` on devnet returns it. If the 0-lamport transfer fails, try after funding REGISTRY rent-exempt from the devnet key; record exact results and the chosen approach in NOTES.md. Also assert ed25519 (tweetnacl/web3 Keypair) signatures of the master message are deterministic. Devnet only — no mainnet funds.
- [x] T031 `src/core`: Call v2 (`dir: up|down`, no target), canonical JSON v2, commit/reveal memo v2 encode/decode (`rcpt:2:`), REGISTRY constant; v1 decoding kept and marked legacy. Test-first.
- [x] T032 `src/core/secret.ts`: master from signature bytes, `saltFor(master, asset, deadline)`, `recoverCall(master, commit, blockTime)` brute force per spec. Test-first incl. a fixed vector.
- [x] T033 `src/core/price.ts` + `kucoin.ts`: `refTimeForCommit`, `priceAt` per spec (SKR median of 5 closes, SOL Pyth at ts). Test-first with fixtures.
- [x] T034 `src/core/score.ts` + `history.ts` v2: statuses hit/miss/void/forfeited/overlap/sealed/awaiting_reveal/unresolved/legacy, horizon class, one-open-position rule, tagged-commit requirement, `zScore`, eligibility, streak, forfeited count. Test-first, every rule.
- [x] T035 `src/chain`: memo tx builder adds the registry tag (per T030 outcome); `fetchHistory` sets `tagged`; `fetchRegistry(conn, {before?, until?})` pages all registry signatures → MemoTx[] of all wallets. Tests with mocked Connection.
- [x] T036 App seal/reveal v2: master-key setup via MWA `signMessage` (+ determinism double-check, SecureStore, fallback), New screen (asset, ▲/▼, horizon chips 24h default / 3d / 7d / 1h practice, SKR Daily preset, Seal disabled on overlap), seal v2, reveal with recovery when no local secret. `yarn typecheck` green, bundle exports.
- [x] T044 Theme foundation per spec "Visual style: Night Register": `src/theme/tokens.ts`, fonts via `npx expo install expo-font @expo-google-fonts/pixelify-sans @expo-google-fonts/dotgothic16 @expo-google-fonts/vt323` (+ `react-native-svg`, `react-native-reanimated` if missing, configured per Expo docs), Paper theme mapped to tokens, PixelButton, PixelPanel, Chip, StatusStamp, ReceiptPaper, pixel icon set, 3-tab bar. `yarn typecheck` green, bundle exports.
- [x] T045 Parallax background per spec: `src/core/parallax.ts` (pure, test-first), `ParallaxBackground` with drift + DeviceMotion tilt (`expo-sensors`) + scroll offset, pixel snapping, reduce-motion off switch, paused in background. Mount it behind all screens.
- [x] T046 Mascot Chekko (5 poses as pixel rect data) + dialog panel; idle on New, eat on Seal, print → cheer/cry on reveal.
- [x] T037 App: reveal ceremony animation + haptic; Profile v2 (zσ, N, hit-rate, hidden & forfeited, streak, legacy section); list/detail show P0/PT and VOID.
- [x] T038 Share texts (sealed + result) via RN `Share` + copy, exactly per spec; unit-test the text builders in core.
- [x] T039 `scripts/indexer.ts` + `.github/workflows/indexer.yml` per spec; run once against mainnet locally, commit `site/` sample and `indexer-data/`. Unit-test the aggregation in core.
- [x] T040 App Leaderboard tab: overall (≥24h, eligible only) and SKR Daily tabs; from `EXPO_PUBLIC_LEADERBOARD_URL` or computed in-app from the registry if unset; tap → read-only profile of that wallet.
- [x] T041 SKR tips: verify SKR mint, tx builder (idempotent ATA + transfer), Tip 10/50/100 on read-only profiles via MWA. Tests for the builder.
- [x] T047 Apply the Night Register theme to every screen (New, Receipts/profile, Detail/Reveal ceremony, Leaderboard, read-only profile + tips, Settings), app icon + splash (pixel register on `#14122B`, no third-party art), remove template leftovers. Match the reference mockups. Bundle exports, release build OK.
- [x] T042 README: v2 rules, anti-cheat section (hedging, overlap, sybil/Genesis, VOID, SKR median), how to verify a v2 receipt by hand, indexer/re-run instructions, human steps (create GitHub repo, push, enable Pages, set PYTH secret, set EXPO_PUBLIC_LEADERBOARD_URL).
- [ ] T043 Release build, `adb install -r` if a device is connected, update the morning summary at the top of NOTES.md (what to test on the phone: master-key determinism, seal, reveal on a reinstall, leaderboard, tip).
