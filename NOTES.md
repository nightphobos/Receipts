# NOTES — run log

## Morning summary (T019, 2026-10-07)

**State:** `yarn test` 16 suites / 321 tests pass, `yarn typecheck` clean, release build OK → `dist/receipts-20261007-0000.apk` (65 MB, `com.clockin.receipts`, debug-keystore signed, mainnet-beta + public RPC, DEMO PRICES). Only uncommitted file before this task was the loop's own `.ralph/progress.log`.

**Works (code + unit tests; not yet run on a phone):** seal a SOL/SKR above/below call as a `rcpt:1:` commit memo via MWA, secret kept in AsyncStorage; receipts list rebuilt from on-chain history (status chips, countdowns); reveal within 24 h of the deadline; scoring (unrevealed = miss, late reveals ignored); Profile hit-rate, share text with Solscan links, secret export; README with manual hash verification.

**Blocked / open:**
- T006 `[!]` — Pyth Hermes needs an API key (401 without). App uses a deterministic mock and shows DEMO PRICES badges everywhere. Fix: put `EXPO_PUBLIC_PYTH_API_KEY=...` in `.env`, rebuild (env vars are inlined at bundle time), re-record the two `*.docshape.json` fixtures from real responses.
- T020 — Seeker Genesis Token badge done after T019 (see T020 entry); latest APK is `dist/receipts-20261007-0004.apk`.
- Never run on a device: `adb devices` was empty for T017/T024/T019. No real seal/reveal transaction has been sent yet.

**Test on the Seeker:**
1. Enable USB debugging, connect, `adb devices` shows it.
2. `adb install -r dist/receipts-20261007-0004.apk` (uninstall first if an older debug-signed build complains about signatures).
3. Open Receipts → Connect (Seed Vault wallet, mainnet). Needs a little SOL for fees (~0.00001 SOL per memo + priority fee).
4. New tab → SOL, above, target, deadline 1 h → Seal → approve in wallet. Dismiss the local-secret warning. Detail screen should open; list shows SEALED with countdown.
5. After the deadline (within 24 h): open the receipt → Reveal → approve. After refresh it shows HIT/MISS with a DEMO badge. Check both memos on Solscan.
6. Profile → Copy share text (starts with the demo prefix), Export secrets (JSON in clipboard — keep it; losing it turns open calls into misses).
7. To rebuild after changes: see README "Build" (incremental `./gradlew assembleRelease` with JDK 21, ~30 s).


Iterations append below: `## <task id> — done|attempt N <date>`.

## T001 — done 2026-10-06
- Baseline: `yarn install` OK (needed repo-local `.yarnrc` `--ignore-engines true`: node v23.10.0 rejected by transitive `eslint-visitor-keys@5` engine range). `yarn.lock` now committed. `npx tsc --noEmit` exit 0. Versions: expo 52.0.49, react-native 0.76.9, @solana/web3.js 1.99.0. `.gitignore` already covered node_modules, dist, android/build, android/app/build, .env*, .ralph/logs.
- Template map: `App.tsx` = polyfills → QueryClient → `ClusterProvider` (`src/components/cluster/cluster-data-access.tsx`, defaults devnet/testnet via `clusterApiUrl`, `getExplorerUrl` = explorer.solana.com) → `ConnectionProvider` (`src/utils/ConnectionProvider.tsx`, `useConnection()`) → Paper theme → `AppNavigator` (native stack: HomeStack + Settings) → `HomeNavigator` (bottom tabs Home/Blank, `TopBar` header). Plan wants env `EXPO_PUBLIC_RPC_URL`/`EXPO_PUBLIC_CLUSTER` (mainnet default) — cluster provider must be adapted in Phase 3.
- Wallet: `src/utils/useMobileWallet.tsx` (`connect`, `disconnect`, `signAndSendTransaction(tx, minContextSlot)`, `signMessage`) over MWA `transact`; `src/utils/useAuthorization.tsx` hardcodes `CLUSTER = "devnet"` chain id and `APP_IDENTITY` "Solana Mobile Expo Template" (change both in Phase 3), auth cached in AsyncStorage. Tx pattern to copy: `createTransaction` in `src/components/account/account-data-access.tsx` (getLatestBlockhashAndContext → TransactionMessage.compileToLegacyMessage → VersionedTransaction → signAndSend → confirmTransaction). Polyfills (`src/polyfills.ts`) set Buffer + crypto.getRandomValues via expo-crypto.

## T002 — done 2026-10-06
- Added jest@29, ts-jest@29, @types/jest@29 (dev). `jest.config.js`: roots `src/core` + `src/chain`, node env, tests match `**/__tests__/**/*.test.ts`, ts-jest with inline tsconfig (commonjs, strict) so the Expo base tsconfig isn't used for transpiling.
- Scripts: `yarn test` = `jest`, `yarn typecheck` = `tsc --noEmit` (covers test files too). Placeholder sanity tests in `src/core/__tests__/` and `src/chain/__tests__/` — delete once real tests exist.

## T003 — done 2026-10-06
- `src/core/call.ts`: `validateCall(x: unknown, nowSec)` → `{ok:true, call} | {ok:false, errors: string[]}` (user-facing messages, all collected); deadline/created must be safe integers; window inclusive [now+3600, now+30d]. `isCall(x)` = schema-only guard (exact 6 keys, no clock) — use it in the T005 reveal decoder.
- `canonicalJson` is hand-built (fixed key order, unknown keys dropped); target via `toPlainDecimal` so tiny BONK targets never serialize as `1e-7`. Removed core sanity placeholder test.

## T004 — done 2026-10-06
- Added direct dep `@noble/hashes@1.8.0` (pinned to the version already in the lockfile; 2.x is ESM-only and would need jest transform changes). Import paths: `@noble/hashes/sha256`, `@noble/hashes/utils`.
- `src/core/commit.ts`: `makeSalt(randomBytes)` (throws on wrong length / all-zero RNG), `commitHash(json, saltHex)` (throws on non-lowercase-32-hex salt), plus `isSaltHex`/`isHash` guards for the T005 decoders. Pinned vector verified with `shasum -a 256` independently.

## T005 — done 2026-10-06
- `src/core/memo.ts`: `encodeCommitMemo(hash, deadline)`, `encodeRevealMemo(json, salt)` (computes hash itself; throws if json non-canonical or memo > 500 B), `decodeCommitMemo`/`decodeRevealMemo`/`decodeMemo` → typed object or null. Hand-rolled strict base64url (no Buffer in core; rejects padding, `+/`, non-zero trailing bits).
- `decodeRevealMemo` already rejects non-canonical/non-ASCII JSON and hash ≠ sha256(json|salt), returning `{hash, json, call, salt}`; T008 still must check same signer + commit deadline == `call.deadline`.

## T006 — blocked (needs human: Pyth API key) 2026-10-06
- Code done & tested: `src/core/pyth.ts` — `FEED_IDS` (looked up live via `/v2/price_feeds`, recorded in `fixtures/hermes-price-feeds-2026-10-06.json`; **ETH id in plan.md was wrong**, real one `ff61…0ace`), `fetchLatestPrice(asset, fetchFn, {apiKey?, baseUrl?})`, `fetchPriceAt(asset, ts, fetchFn, opts)` → `PythPrice | null` (null on 404 = `unresolved`; throws on other HTTP errors / price published before ts), `scaledPrice` does exact decimal shift instead of `Number*10**expo` float. Added `resolveJsonModule` to jest ts config.
- Blocker: every Hermes price endpoint (`/v2/updates/price/latest`, `/v2/updates/price/<ts>`, legacy `/api/*`, benchmarks) returns `HTTP 401 unauthorized` without `Authorization: Bearer <token>`. Price fixtures are therefore hand-made in the documented shape (`*.docshape.json`, with `_note`), not real recordings.
- Human: get a Pyth/Hermes API key, then (1) record real responses to replace the two `*.docshape.json` fixtures, (2) app should pass `{ apiKey: process.env.EXPO_PUBLIC_PYTH_API_KEY }` (to wire in T012/T014; key ends up in the APK — acceptable for hackathon only). Later tasks can proceed against the current API.

## T007 — done 2026-10-06
- `src/core/score.ts`: `Receipt { hash, deadline (from commit memo), commit: TxRef, reveal?: TxRef & {call,json,salt}, priceAtDeadline?: number|null }`; `reveal` must be set only for VALID reveals — T008 owns validity. `statusOf(r, now)`: revealed → `unresolved` if price null/undefined else hit/miss (never forfeits once revealed); else sealed / awaiting_reveal [deadline, deadline+24h) / forfeited.
- `resolve(call, price)` strict, throws on non-finite/≤0 price. `stats(receipts, now)` → `{total,hits,misses,forfeited,pending,hitRate|null}` (null when nothing scored).

## T008 — done 2026-10-06
- `src/core/history.ts`: `buildReceipts(txs: MemoTx[], wallet)` → `Receipt[]` newest commit first. `MemoTx = { signature, blockTime: number|null, signer, memo, failed }` — T010 must produce this shape (one entry per rcpt memo). Txs with null blockTime, failed, or signer ≠ wallet are dropped.
- Decision (honesty): reveal valid only if commit.blockTime ≤ reveal.blockTime < deadline + 24 h (`REVEAL_GRACE_SEC`) — a late reveal must not turn a forfeit into a hit. Early reveals (before deadline) are accepted (status `unresolved` until Pyth price exists). Duplicate commits/reveals: earliest blockTime wins.

## T009 — done 2026-10-06
- `src/chain/memoTx.ts`: `MEMO_PROGRAM_ID`, `memoInstruction(signer, memo)` (throws on empty / >500 UTF-8 bytes), `priorityFeeInstruction(microLamports)`, `buildMemoTransaction({signer, memo, recentBlockhash, priorityMicroLamports?})` → unsigned `VersionedTransaction` (legacy message, fee payer = signer; default 10 000 µlamports fee ix first, `0` omits it). T012: get blockhash via `getLatestBlockhashAndContext`, pass `context.slot` as minContextSlot to `signAndSendTransaction` like the template.
- Removed chain sanity placeholder test.

## T010 — done 2026-10-06
- `src/chain/fetchHistory.ts`: `fetchMemoHistory(conn: HistoryConnection, wallet, {pageSize?, maxSignatures?, prefilterByMemo?})` → `MemoTx[]` (newest first). Pages `getSignaturesForAddress` with `before` until exhausted (whole history, so old misses can't silently drop), `getParsedTransactions` in batches of 50 with `maxSupportedTransactionVersion: 0`. Pass the app's `Connection` directly (it satisfies `HistoryConnection`).
- Decision: by default only fetches sigs whose signature-info `memo` contains `rcpt:1:` and `err == null` (saves public-RPC calls); `prefilterByMemo: false` if an RPC doesn't fill `memo`. Memos: parsed spl-memo (top-level + inner), else `Program log: Memo (len N): "..."` lines (only `\"`/`\\` unescaped). Tx kept only if wallet is a signer; `signer` set to wallet.
- Fixture `src/chain/__tests__/fixtures/parsed-tx-memo-mainnet-2026-10-06.json` = real mainnet jsonParsed tx (public RPC worked without key); tests clone it and swap in rcpt memos.

## T011 — done 2026-10-06
- `src/storage/secrets.ts` (pure, no RN import): `KeyValueStore` interface — pass `AsyncStorage` directly (type-checked compatible). `saveSecret(store, hash, {json,salt})` throws unless sha256(json|salt) == hash; `loadSecret` → `Secret|null` (null on missing/corrupt/mismatch); `deleteSecret`; `exportAll` → `[{hash,json,salt}]` sorted by hash; `exportSecretsJson` = clipboard string.
- Jest roots now include `src/storage`. T012: save secret before signing, `deleteSecret` if wallet rejects.

## T012 — done 2026-10-06
- Pure helpers: `src/core/draft.ts` (`DEADLINE_PRESETS`, `parseTarget` (comma ok, no exponents), `parseCustomHours`, `draftCall(draft, now)` → `ValidationResult`); `src/chain/seal.ts` `sealCall(deps, call)` = salt → hash → saveSecret → blockhash → build memo tx → MWA sign/send. Secret deleted only if blockhash fetch fails or `isUserRejection(e)` (MWA code -1/-3/ERROR_WALLET_NOT_FOUND); other errors keep it (tx may have landed). Reuse `sealCall`'s pattern for reveal in T014.
- UI: `src/screens/NewReceiptScreen.tsx` replaces the template "Blank" tab (tab name `New`; BlankScreen deleted). First-seal warning flag in AsyncStorage `rcpt:warned-local-secrets`. Pyth hint via react-query key `["pyth-latest", asset]` with `EXPO_PUBLIC_PYTH_API_KEY` (shows "Pyth price unavailable" until a key exists, see T006). Added `expo-haptics@~14.0.1`.
- `ReceiptDetail` route (`{hash, signature?}`) added to root stack with a placeholder `ReceiptDetailScreen` — T014 replaces its body. `RootStackParamList` is now exported. Verified `npx expo export --platform android` bundles (output deleted).

## T013 — done 2026-10-06
- `src/screens/ReceiptsListScreen.tsx` (Home tab, title "Receipts"; template HomeScreen deleted) + `src/hooks/useReceipts.ts`: react-query key `["receipts", rpcEndpoint, wallet]` → `fetchMemoHistory` → `buildReceipts` → `ReceiptRow {receipt, call, hasSecret}` (call = revealed call or local secret's call; revealed receipts get `priceAtDeadline` via `fetchPriceAt`, any Pyth error → null = `unresolved`). NewReceipt invalidates `["receipts"]` after seal. T014 can reuse `useReceipts` rows (find by hash) or `loadRow` logic.
- Pure display helpers `src/core/format.ts` (`formatUsd` moved here, `formatCountdown`, `describeCall`, `callFromJson`) with tests; `STATUS_META`/`StatusChip` colours in `src/components/receipt/status-chip.tsx`; `useNowSec` ticks countdowns each second.
- Nav: tabs Home/New/Profile (`HomeTabParamList` exported); `ProfileScreen` is a placeholder for T015. Item tap → `ReceiptDetail {hash, signature: commit sig}`. `expo export --platform android` bundles OK.

## T014 — done 2026-10-06
- `src/chain/reveal.ts`: `canReveal(receipt, hasSecret, now)` (= secret present && status `awaiting_reveal`), `revealReceipt(deps, receipt)` re-checks the window, loads secret, checks stored call deadline == commit deadline, sends reveal memo. Never deletes the secret (retry possible). `solscanTxUrl(sig, cluster)` in `src/core/format.ts` (`?cluster=` only for devnet/testnet) — reuse in T015 share text.
- `ReceiptDetailScreen` reads the row from `useReceipts` (by hash); unknown hash → "waiting for commit to confirm" + refresh. After reveal: success haptic, local "Reveal sent" card, invalidates receipts after 3 s (no confirmTransaction wait). `Retry` for `unresolved` = refetch (re-queries Pyth). Cluster for links from `useCluster().selectedCluster.network` (still template devnet/testnet until cluster config is adapted).
- Bundle check: use `npx expo export --platform android --output-dir dist/export-check` (inside repo) then delete it.

## T015 — done 2026-10-06
- `src/core/share.ts`: `formatHitRate` ("67%" / "—"), `shareText(receipts, now, cluster)` = hit-rate line with counts + last 5 by commit blockTime (commit + reveal Solscan links) + verify line. Honesty: unrevealed calls are always shown as "hidden call" even if the secret is local (sharing them would be unverifiable).
- `ProfileScreen`: stats card from `stats` over `useReceipts` rows (same query key, pull-to-refresh), "Copy share text", "Export secrets" (works without wallet; `exportAll` → clipboard JSON, alert if none), cluster chip = `selectedCluster.name`, Snackbar for copy confirmation. Android bundle export OK.

## T016 — done 2026-10-06
- `app.json`: name `Receipts`, package/bundle id `com.clockin.receipts` (was template id; set before first prebuild), splash/adaptive bg `#111827`. Icon/splash/favicon generated by `scripts/make-assets.py` (Pillow bundled font, yellow "R"/"Receipts" on navy); MWA `APP_IDENTITY.name` = "Receipts".
- Toasts: `src/components/ui/toast.tsx` (`showToast`/`showErrorToast` callable outside React, `<ToastHost/>` mounted in App). Queries opt in via `meta: { errorToast }` (QueryCache onError; set on receipts query — Pyth hint deliberately silent, it 401s without key). Wallet connect/disconnect failures and cancelled seal/reveal → toast; real seal/reveal failures still use Alert (longer text).
- Still open (not in any task): `useAuthorization` chain `solana:devnet` and cluster provider still template devnet/testnet — plan wants `EXPO_PUBLIC_CLUSTER` mainnet default. Fix before T017 build if mainnet is intended.

## HUMAN — scope change 2026-10-06 ~23:20
- Assets narrowed to SOL + SKR. Pyth stays mocked until we have an API key (Hermes 401s without one since 2026-08-26). New tasks T021–T024 inserted after T017; spec.md "Price source" and plan.md "Assets and price source" describe them. DEMO PRICES must be visible whenever the mock is active — do not weaken that.

## T017 — done 2026-10-06
- APK: `dist/receipts-20261006-2336.apk` (65 MB, `com.clockin.receipts`, label "Receipts", minSdk 24, debug-keystore signed, all 4 ABIs). `adb devices` listed no device → not installed. Gradle log: `.ralph/logs/t017-gradle.log`.
- Build recipe: `npx expo prebuild --platform android --no-install` (android/ now committed; it rewrote `android`/`ios` scripts to `expo run:*`), then in `android/`: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ./gradlew assembleRelease --no-daemon` (~19 min cold; Gradle auto-installed NDK 26.1 into the SDK). Default JDK 23 not used.
- Cluster fixed at build time: `src/core/cluster.ts` `clusterConfig({cluster, rpcUrl})` from `EXPO_PUBLIC_CLUSTER`/`EXPO_PUBLIC_RPC_URL` (default mainnet-beta + public RPC; only `devnet` alternative). Provider exposes that single cluster; MWA chain `solana:mainnet`/`solana:devnet`; Settings picker is read-only. Env vars are inlined at bundle time → rebuild to change.

## T021 — done 2026-10-06
- `ASSETS = ["SOL", "SKR"]`. Hermes metadata lookup found `Crypto.SKR/USD` = `38846ec4d0dbe808091817f5c0d6ab8058e25422348ddf97db52b6c378a93bf9` (pinned; feeds fixture re-recorded with SOL+SKR only via curl — Python urllib gets 403 from Hermes).
- `FEED_IDS` is typed `Record<Asset, string | null>`; `fetchLatestPrice`/`fetchPriceAt` throw "No Pyth feed for X" on null — T022's per-asset mock fallback should check `FEED_IDS[asset] === null` before calling them. `hermes-at-bonk` fixture → `hermes-at-skr.docshape.json` (still hand-made, expo -8).

## T022 — done 2026-10-06
- `src/core/price.ts`: `PriceSource { kind, kindOf(asset), latest, at }` + `isDemo(source, asset)`. Added `kindOf` beyond plan's interface because of per-asset fallback; `kind` is conservative ("mock" if ANY asset is mock) — use it for global badges (Profile, share prefix), `isDemo(src, asset)` for per-row badges.
- `mockSource(nowFn)`: `mockPrice` formula per plan, conf 0, `at` null if ts > now, throws on non-integer ts; `latest` uses floor(now). `selectPriceSource(env, fetchFn, nowFn, feedIds = FEED_IDS)`: key trimmed; empty/whitespace key → mock. T023: build it in `usePriceSource()` from `process.env.EXPO_PUBLIC_*` (inline literal access so Expo bundles them), `fetch`, `() => Date.now()/1000`.

## T023 — done 2026-10-06
- `src/hooks/usePriceSource.ts`: module-level `selectPriceSource` from inlined `EXPO_PUBLIC_PYTH_API_KEY`/`EXPO_PUBLIC_PRICE_SOURCE`; no app code calls `fetchLatestPrice`/`fetchPriceAt` directly anymore. `useReceipts` resolves via `source.at` (query key now includes `source.kind`); New Receipt hint via `source.latest` (key `["price-latest", kind, asset]`).
- `DemoBadge` (`src/components/receipt/demo-badge.tsx`, yellow chip) on: New Receipt price hint, list rows with HIT/MISS, Receipt detail (any known call), Profile stats card. Labels say "Demo price" instead of "Pyth" when mock. `shareText(..., { demo })` adds `DEMO_SHARE_PREFIX` first line and "demo price $x" (tested). Android bundle export OK.

## T024 — done 2026-10-06
- APK: `dist/receipts-20261006-2358.apk` (65 MB) built with T021–T023 code (incremental `./gradlew assembleRelease`, 35 s; no native/app.json changes since T017 so no prebuild). Verified Hermes bundle in APK contains "DEMO PRICES"/"Demo price" strings. Log: `.ralph/logs/t024-gradle.log`.
- `adb devices` listed no device → not installed. Older `dist/receipts-20261006-2336.apk` is pre-SOL/SKR; ignore it.

## T018 — done 2026-10-06
- README.md rewritten (template text dropped): concept, formats, step-by-step manual verification with a worked example (commit/reveal memos, `base64 -d`, `shasum -a 256`) — hash verified independently against `commitHash`, build/run recipe, `.env` vars, architecture, limitations (demo prices, local secrets, 24 h reveal window, no web view, T020 badge pending).
- README "Build" lists the incremental gradle path (android/ committed); T019 should confirm it from a clean `git status`.

## T019 — done 2026-10-07
- Gates green (321 tests, tsc clean); incremental release build OK (log `.ralph/logs/t019-gradle.log`) → `dist/receipts-20261007-0000.apk`, bundle contains "DEMO PRICES". No device attached → not installed. Morning summary written at top.

## T020 — done 2026-10-07
- `src/core/genesis.ts`: `isSeekerGenesisMint(mint, parsed)` = Token-2022 mint with mintAuthority `GT2zuHV…`, `tokenGroupMember` {group `GT22s89…`, mint == itself}, and `groupMemberPointer` (if present) pointing at itself; `heldMints` (positive balances). Fixtures are real mainnet jsonParsed accounts (member mint `4od8ga…` #121124, group mint, owner `4ZGj29…` token accounts).
- `src/chain/genesis.ts` `hasSeekerGenesisToken(conn, owner)`: getParsedTokenAccountsByOwner(Token-2022) → getMultipleParsedAccounts in batches of 100, mint account owner must be Token-2022. Hook `useSeekerGenesis` (silent on errors, 1 h staleTime); purple "Seeker verified" chip in Profile under the address. Avoided importing `@solana/spl-token` in chain code (jest bigint warning) — program id pinned as `TOKEN_2022_PROGRAM`.
- APK rebuilt: `dist/receipts-20261007-0004.apk` (bundle contains "Seeker verified"); log `.ralph/logs/t020-gradle.log`. `adb devices` empty → not installed.

## HUMAN — v2 decision 2026-10-07
- Switch to up/down calls vs price at commit (spec "v2"), z-score rating, one open call per wallet+asset+horizon, derived recoverable secrets, registry tag + GitHub-Actions indexer for the global leaderboard, SKR Daily + SKR tips. Phase 6 tasks T030–T043. Start with T030 (devnet spike) and follow its outcome.

## T030 — attempt 1 2026-10-07
- Added `scripts/spike-registry.ts` (`npx tsx scripts/spike-registry.ts`, `tsx` devDependency added) and `.devnet/` to .gitignore; devnet key `5wY8DyzUmAVc9Hkv2uhqZuPvQWmeBd3w2Q4gsaAifFBa` in `.devnet/spike-keypair.json`.
- ed25519 (`@noble/curves`) signatures of the master message: deterministic=true, verify=true.
- Airdrop blocked: `429 ... You've either reached your airdrop limit today or the airdrop faucet has run dry` (public devnet faucet, also via curl with 0.1/0.5 SOL). No local validator installed (and installing outside repo is forbidden).
- Fallback evidence: script simulates [memo `rcpt:2:test`, 0-lamport transfer payer→REGISTRY] on devnet with a funded payer (sigVerify off, nothing sent) → `err=null`, memo + System program both `success`, REGISTRY unfunded. So the plain 0-lamport tag works; no rent funding needed.
- Next: rerun the script when the faucet allows (or fund the key from faucet.solana.com) to confirm the real send and `getSignaturesForAddress(REGISTRY)` listing; if still 429 after attempt 3, mark `[!]` (needs human faucet/captcha) and proceed with "plain 0-lamport transfer" as the chosen approach.

## T030 — attempt 2 2026-10-07
- Reran `npx tsx scripts/spike-registry.ts`: ed25519 deterministic=true valid=true; airdrop again `429 ... You've either reached your airdrop limit today or the airdrop faucet has run dry` (key `5wY8Dy…` balance 0).
- Simulation fallback again `err=null` (payer `AVm1ww…`, memo + System transfer 0 lamports both `success`). No code changes.
- Next (attempt 3): rerun once; if still 429, mark `[!]` (needs human: fund `5wY8DyzUmAVc9Hkv2uhqZuPvQWmeBd3w2Q4gsaAifFBa` via faucet.solana.com captcha) and adopt "plain 0-lamport transfer" for T035.

## T030 — attempt 3 2026-10-07 — BLOCKED [!]
- Reran `npx tsx scripts/spike-registry.ts`: ed25519 deterministic=true valid=true; airdrop still `429 ... You've either reached your airdrop limit today or the airdrop faucet has run dry`. Simulation of [memo `rcpt:2:test`, 0-lamport transfer → REGISTRY] again `err=null`, both programs `success`.
- Blocked: needs human to fund devnet key `5wY8DyzUmAVc9Hkv2uhqZuPvQWmeBd3w2Q4gsaAifFBa` via faucet.solana.com (captcha), then rerun the script to confirm real send + `getSignaturesForAddress(REGISTRY)` listing.
- Chosen approach (from simulation evidence): plain 0-lamport System transfer to REGISTRY, no rent funding. T035 should use it.

## T031 — done 2026-10-07
- Additive v2 API beside legacy v1 (v1 names unchanged, doc-marked legacy, so app/history keep compiling): `call.ts` `CallV2`/`DIRECTIONS_V2`/`isCallV2`/`validateCallV2`/`canonicalJsonV2`; `memo.ts` `MEMO_PREFIX_V2`, `REGISTRY`, `encode/decode{Commit,Reveal}MemoV2`, `decodeMemoV2`. v2 memo objects carry `v: 2` (v1 ones don't) for discrimination in T034.
- Commit v2 decode requires asset ∈ ASSETS (uppercase); reveal v2 rejects v1 JSON and verifies hash. Fixed vector in `memoV2.test.ts` computed with shasum/base64. v1 decoders return null for `rcpt:2:` memos; `fetchHistory` still filters on `MEMO_PREFIX` (v1) — T035 must widen it.

## T032 — done 2026-10-07
- `src/core/secret.ts`: `MASTER_MESSAGE` (exact spec text), `masterFromSignature(sig64) → Uint8Array(32)` (= sha256; rejects non-64-byte/all-zero), `saltFor(master, asset, deadline)` (HMAC via `@noble/hashes/hmac`), `recoverCall(master, {hash, deadline, asset}, blockTime) → {call, json, salt} | null` scanning created ∈ [blockTime−900, blockTime] × {up, down}.
- Fixed vector (sig = bytes 0..63) computed with Python hashlib/hmac in `secret.test.ts`. Master is raw bytes; secure-store persistence (hex) and the sign-twice determinism check belong to the app/chain layer (T035+).

## T033 — done 2026-10-07
- `price.ts`: `refTimeForCommit(bt) = floor(bt/60)*60 + 60`, `priceAt(source, asset, ts)` (validates ts, delegates to the source's per-asset routing). `kucoinSource.at` now = `fetchKucoinMedian5` (one request `startAt=end-300&endAt=end`, end = floor(ts/60)*60, null until end+5 s), so `selectPriceSource` SKR follows the v2 rule; legacy `fetchKucoinAt` kept but unused (v1 app path `useReceipts` therefore also gets the median for SKR until T034/T036 replace it).
- `medianClose`: only rows starting end−300…end−60 (KuCoin sometimes returns the row starting at endAt — ignored); fewer than 5 rows → median of those present (even → mean of middle two), none → null. Real fixture `kucoin-candles5-skr-2026-10-07.json` (end 1791348120 → 0.01646).

## T034 — done 2026-10-07
- Additive v2 beside legacy v1 (v1 `statusOf`/`stats`/`buildReceipts` untouched; app still on them). `score.ts`: `horizonClass`, `ReceiptV2 {v:2, asset, horizon, overlap, p0?, pt?}`, `LegacyReceipt = Receipt & {v:1}`, `AnyReceipt`, `resolveV2` (void on equal), `statusOfV2` (legacy > overlap > reveal/p0+pt > sealed/awaiting/forfeited), `zScore`, `statsV2(rs, now, {leaderboard})` (misses include forfeits+overlaps; leaderboard drops 1h), `eligibility(rs, now, hasGenesis)`, `utcDay`, `streak` (today empty doesn't break), `hasOpenPosition(rs, asset, class, now)` for the Seal-disable in T036.
- `history.ts`: `MemoTx.tagged?` (undefined = untagged; T035 must set it), `buildReceiptsV2` requires BOTH commit and reveal tagged (so app == indexer view), reveal must keep commit deadline+asset; overlap order = (blockTime, signature), an overlap doesn't open a position. `buildHistory` = v2 + v1-as-legacy, newest first. P0/PT are filled by the caller (T036/T039) via `priceAt(source, asset, refTimeForCommit(bt))`/`priceAt(.., deadline)`.

## T035 — done 2026-10-07
- `memoTx.ts`: `REGISTRY_KEY`, `registryTagInstruction(signer)` (0-lamport System transfer → REGISTRY, appended after the memo); `buildMemoTransaction` tags by default when memo starts with `rcpt:2:` (`registryTag` overrides). v1 txs unchanged.
- `fetchHistory.ts`: `registryTagSources(tx)` = sources of parsed System transfers to REGISTRY (top-level + inner). `toMemoTxs` now keeps rcpt:1 and rcpt:2 memos and sets `tagged` = the wallet itself paid a tag (stricter than "account keys include REGISTRY", so app and indexer agree). Prefilter accepts both prefixes.
- `fetchRegistry(conn, {before?, until?, pageSize?, maxSignatures?, prefilterByMemo?})` → rcpt:2 MemoTx[] of all wallets, each attributed to its tag payer (must be a signer). Indexer (T039) should use `until` = newest seen signature for incremental sync.

## HUMAN — visual style 2026-10-07
- Chosen style: «Night Register» pixel JRPG + parallax background (spec "Visual style"). Tasks T044–T046 inserted after T036 (so later screens are built themed), T047 (apply theme everywhere + icon/splash) before T042.

## T036 — done 2026-10-07
- Core: `draftV2.ts` (`HORIZON_CHOICES` 24h default/3d/7d/1h practice/skr-daily, `skrDailyDeadline` = next 12:00 UTC ≥ 12 h away, `draftCallV2`, SKR Daily forces SKR); `secret.ts` `decideMaster(sigA, sigB)` + `signatureFromSignedPayload` (MWA signed payload = bare sig or msg‖sig / sig‖msg); `format.ts` `callV2FromJson`, `describeCallV2`. `storage/master.ts`: per-wallet `rcpt.master.<base58>` → `derived:<hex>` | `random` (expo-secure-store ~14.0.1 added, app.json plugin auto-added; native module → needs gradle rebuild, autolinked).
- Chain: `sealCallV2` (derived salt, random fallback; secret always also saved in AsyncStorage), `findSecretV2`/`revealReceiptV2`/`canRevealV2` (local secret, else `recoverCall` from master → cached locally). App: `useMasterKey` (setup = ONE MWA session signing the message twice via new `useMobileWallet().signMessages`; `rederive` signs once, persisted only after it actually recovers a call), `useReceiptsV2` (shares one tx fetch with v1 via `fetchQuery` under `[receipts,"txs",…]`; P0/PT fetched only for revealed receipts — T037 may want P0 for sealed too).
- UI: New screen fully v2 (key-setup card / random-mode warning, ▲/▼, horizon chips, overlap → Seal disabled). List merges v2 + v1 rows; Detail renders `ReceiptDetailV2` (Recover with wallet & reveal). StatusChip takes `StatusV2` (void/overlap/legacy). Profile still v1 stats (T037).

## T044 — done 2026-10-07
- `src/theme/`: `tokens.ts` (colors/fonts/type/space/pixel), `fonts.ts` `useThemeFonts` (App renders a bg-coloured View until loaded), `paperTheme.ts` `nightTheme` (Paper MD3 dark + React Navigation, always dark, roundness 0, all variants → Pixelify/DotGothic16), `PixelBox` (notched corners via two overlapping fills + hard shadow; base of `PixelButton` gold/up/down/ghost and `Chip`), `PixelPanel`, `StatusStamp` (per `StatusV2`; sealed = SVG dither pattern + countdown prop), `ReceiptPaper`/`ReceiptRow`/`ReceiptDivider`/`ReceiptTitle`, `PixelIcon` (12 icons, 16×16 char grids merged into runs), `PixelTabBar`. Import from `../theme`.
- react-native-svg 15.8 has no `shapeRendering` prop → icons rely on integer grid + rounded size. Third tab is still Profile (trophy icon) until T040 makes it RANK; old `StatusChip` still used by screens (T047 swaps to `StatusStamp`).
- New native modules (react-native-svg, react-native-reanimated 3.16 — babel plugin auto-added by babel-preset-expo, expo-font plugin in app.json) → next APK needs `npx expo prebuild --platform android --no-install` before gradle.

## T045 — done 2026-10-07
- `src/core/parallax.ts`: `PARALLAX_LAYERS` (stars/far/near: 120/60/24 s, ±4/10/18 px, 0.1/0.25/0.5), `layerOffset` (x wraps into (-W,0], y = tilt − scroll·factor, snapped to grid, `still` → 0), `lowPass`, `normalizeTilt` (gamma abs, beta vs slowly low-passed rest angle, TILT_MAX_RAD 0.5), seeded `starTile`/`skylineTile` (exact-width seamless). Math fns carry `"worklet"` so Reanimated runs them on the UI thread.
- `src/theme/ParallaxBackground.tsx` wraps `AppNavigator` in App.tsx (art grid 3 dp, PAD 84, scroll capped at 120 dp); nav theme background + stack contentStyle + tab sceneContainerStyle now transparent. `useParallaxScroll()` (spread onto ScrollView/FlatList, resets on focus) wired into List, New, Profile, DetailV2 — T047 should add it to new screens (Leaderboard etc.). Reduce motion via `useReducedMotion`; sensor + frame callback stop when AppState ≠ active.
- Added `expo-sensors` ~14.0.2 (native) → next APK needs `npx expo prebuild --platform android --no-install`. Android bundle export OK (went to /tmp/rcpt-export-t045 by mistake — future exports use `dist/`). Not visually checked on device.

## T046 — done 2026-10-07
- `src/core/mascot.ts`: 5 poses (idle/eat/print/cheer/cry) as 16×16 char grids (codes D outline, B body, S display, E eyes, G keys, I ink, P paper, T tear, K sparkle), `mascotRuns`, `poseForStatus(status, {printing})` (hit→cheer, miss/forfeited/overlap→cry, printing→print, else idle), `mascotLine(pose, {asset, horizon})` (idle = spec question; skr-daily → "at 12:00 UTC").
- `src/theme/Mascot.tsx`: `Mascot` (colours mapped from tokens, 1-art-px bob via setInterval, still on reduce motion) + `MascotDialog` (PixelPanel, "CHEKKO" name). New screen: dialog at top, eat while sealing, holds 700 ms after success before navigating. DetailV2: dialog only when pose ≠ idle (print while revealing/pending, then cheer/cry). Not visually checked on device.

## T037 — done 2026-10-07
- `src/core/ceremony.ts`: timeline `ceremonyFrame(ms, {p0, pt})` (3 paper lines × 350 ms → price ticks P0→PT in ≤12 ease-out steps over 1.5 s → stamp), `formatSigma(z)` ("+1.9σ vs coin flip", "±0.0", "—"), `formatChangePct`. `components/receipt/reveal-ceremony.tsx` renders it on ReceiptPaper + StatusStamp, haptic on stamp (success/error/warning); reduce motion → final state. DetailV2 shows the printed receipt for hit/miss/void, auto-plays once after a reveal sent from this screen, "Replay reveal" remounts it.
- `useReceiptsV2` now fetches P0 for every receipt (PT only when revealed); list rows show `P0 $x · reveal opens…` and `P0 → PT (±x%)`, VOID marked "not counted". Profile = v2 statsV2 (zσ, N, hit-rate, void, pending, "hidden & forfeited", overlaps, streak with flame, leaderboard eligibility line) + legacy v1 card (old stats + legacy share text, until T038 adds v2 share). Not visually checked on device.

## T038 — done 2026-10-07
- `share.ts` v2: `sealedShareText(r, cluster)`, `resultShareText(r, allV2, now, cluster, {demo})` (null unless hit/miss/void; MISS = "❌ MISS", VOID = "➖ VOID (not counted)"; Record = statsV2 over all v2 receipts, z via new `ceremony.formatZ`; demo → `DEMO_SHARE_PREFIX` first line), `receiptNumber` (1-based by commit blockTime, signature), `formatUtcDay`/`formatUtcDayTime`. Both texts link the commit tx.
- DetailV2 gets `all` prop; "Share sealed call"/"Share result" (RN `Share`) + "Copy" (expo-clipboard) shown only when a text exists. Profile still uses the v1 `shareText`. Not visually checked on device.

## T039 — done 2026-10-07
- Core: `leaderboard.ts` (`receiptsByWallet` = registry MemoTx → buildReceiptsV2 per signer; `pricesNeeded` P0 all + PT revealed, settled ≥ 60 s; `PriceCache` keyed `ASSET:ts`, `withPrices`; `isSkrDaily` = SKR, deadline 12:00 UTC, ≥ 12 h after commit, 24h class; `buildLeaderboard` → `{version, generatedAt, wallets, overall (eligible only), skrDaily (Genesis + n ≥ 1, SKR Daily calls only)}` ranked z desc → N desc → wallet; `walletProfile` for `site/u/<w>.json`, direction hidden until revealed). `site.ts` renders minimal index/profile HTML. T040 should reuse `buildLeaderboard` for the in-app fallback.
- `scripts/indexer.ts` (`npx tsx --env-file=.env scripts/indexer.ts`; env `INDEXER_RPC_URL`, `PYTH_API_KEY` or `EXPO_PUBLIC_PYTH_API_KEY`): incremental via `indexer-data/registry.json` {newest, txs}, permanent `indexer-data/prices.json`, Genesis re-checked each run, RPC fetch throttled to 5 req/s. Ran on mainnet: registry has 0 txs yet → empty sample `site/`. Price path checked live (SOL Pyth 118.83, SKR KuCoin 0.01687).
- `.github/workflows/indexer.yml`: cron */15, commits indexer-data back, deploys site/ via Pages actions. Human: enable Pages (source GitHub Actions), add secrets PYTH_API_KEY (+ optional INDEXER_RPC_URL).

## T040 — done 2026-10-07
- Core `leaderboardSource.ts`: `leaderboardBaseUrl(env)` (http(s) only, strips `/` and `/leaderboard.json`), `leaderboardUrl`/`profileUrl` (`<base>/u/<w>.json`), `parseLeaderboard`/`parseWalletProfile` (version + shape checks), `computeLeaderboard({txs, nowSec, price, hasGenesis})` = indexer aggregation in-app (price/Genesis errors → unresolved / no Genesis; Genesis only checked for wallets that could be listed).
- App: `useLeaderboard`/`useWalletProfile` (site when `EXPO_PUBLIC_LEADERBOARD_URL` set, else one shared registry query, ≤ 5000 signatures, 5 min stale). Third tab is now RANK (`LeaderboardScreen`: OVERALL / SKR DAILY chips, own row gold); tap → stack `WalletProfile` (read-only, directions hidden until reveal, rows open Solscan). Own stats moved to stack screen `Profile` ("My stats" button atop the Receipts list). T041 adds tips to `WalletProfileScreen`.
- Android bundle export OK; not checked on device. README env block lists `EXPO_PUBLIC_LEADERBOARD_URL`.

## T041 — done 2026-10-07
- SKR mint verified on mainnet: `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`, owner SPL Token (Tokenkeg, not 2022), 6 decimals, Metaplex metadata name "Seeker" symbol "SKR" (uri r2.solanamobiledappstore.com/skr). Pinned in `core/tip.ts` (`TIP_AMOUNTS` 10/50/100, `skrToBaseUnits`, `canTip`).
- `chain/tipTx.ts`: `tipInstructions` = [createAssociatedTokenAccountIdempotent (payer = tipper), transferChecked], `buildTipTransaction` (legacy msg, priority fee like memos). Uses existing `@solana/spl-token` 0.4.
- `WalletProfileScreen` `TipPanel`: mainnet only, hidden on own profile, "connect" hint when no wallet; MWA signAndSend, cancel → toast. Leaderboard rows have no tip buttons (tap → profile). Not sent on chain (needs human wallet approval); Android bundle export OK.

## T047 — done 2026-10-07
- All screens off Paper widgets: new `src/theme/Text.tsx` (Title/Heading/Body/Muted/Num/Badge/PixelLink/Loading) + `PixelCard` (in PixelPanel.tsx); PixelButton gained `upOutline`/`downSolid` (New screen ▲/▼ selection). StatusChip replaced by StatusStamp everywhere (sealed rows show dither + countdown). TopBar = custom pixel bar (RECEIPTS, wallet Chip + Paper Menu, gear). Settings = read-only CLUSTER/DATA/ABOUT panels. Toast = themed Snackbar. Only Paper left: PaperProvider/theme, Snackbar, Menu.
- Removed template leftovers: Section.tsx, components/account/*, AccountScreen, app-modal, sign-in-feature (+SignInButton), cluster-ui/picker, status-chip, assets/background.png.
- Icons/splash: `src/core/iconArt.ts` (rasterizeGrid + encodePng, tested) and `npx tsx scripts/gen-icons.ts` → Chekko print pose on #14122B (icon 1024, adaptive fg in safe zone, splash 1024, favicon). Mascot colours moved to `tokens.mascotFill`. app.json: dark UI, bg #14122B. Prebuild + assembleRelease OK → `dist/receipts-20261007-1033.apk`. Not checked on device; reference mockups (Design canvas) not accessible from here, matched spec text instead.

## T042 — done 2026-10-07
- README rewritten v2-first: rules (t0, P0/PT, SKR 5-candle median, VOID, forfeit, overlap classes), z/eligibility/SKR Daily, anti-cheat section, derived secrets + phishing trade-off, v2 formats, hand-verification walkthrough with a worked example (dummy master = sha256(64×0x01); base64/shasum/openssl HMAC commands checked in shell), indexer + re-run, tips, human steps (repo, push, Pages, secrets, EXPO_PUBLIC_LEADERBOARD_URL), v1 kept as "Legacy".
- Build section now includes `npx expo prebuild --platform android --no-install` before gradle (native modules added since v1).
