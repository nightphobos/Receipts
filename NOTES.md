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
