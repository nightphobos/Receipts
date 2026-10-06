# NOTES — run log

## Morning summary (T019, 2026-10-07)

**State:** `yarn test` 16 suites / 321 tests pass, `yarn typecheck` clean, release build OK → `dist/receipts-20261007-0000.apk` (65 MB, `com.clockin.receipts`, debug-keystore signed, mainnet-beta + public RPC, DEMO PRICES). Only uncommitted file before this task was the loop's own `.ralph/progress.log`.

**Works (code + unit tests; not yet run on a phone):** seal a SOL/SKR above/below call as a `rcpt:1:` commit memo via MWA, secret kept in AsyncStorage; receipts list rebuilt from on-chain history (status chips, countdowns); reveal within 24 h of the deadline; scoring (unrevealed = miss, late reveals ignored); Profile hit-rate, share text with Solscan links, secret export; README with manual hash verification.

**Blocked / open:**
- T006 `[!]` — Pyth Hermes needs an API key (401 without). App uses a deterministic mock and shows DEMO PRICES badges everywhere. Fix: put `EXPO_PUBLIC_PYTH_API_KEY=...` in `.env`, rebuild (env vars are inlined at bundle time), re-record the two `*.docshape.json` fixtures from real responses.
- T020 — Seeker Genesis Token badge, not started (next task).
- Never run on a device: `adb devices` was empty for T017/T024/T019. No real seal/reveal transaction has been sent yet.

**Test on the Seeker:**
1. Enable USB debugging, connect, `adb devices` shows it.
2. `adb install -r dist/receipts-20261007-0000.apk` (uninstall first if an older debug-signed build complains about signatures).
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
