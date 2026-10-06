# NOTES — run log

<!-- Morning summary goes here (task T019). -->

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
