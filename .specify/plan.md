# Plan — Receipts («Чеки»)

## Stack
- Base: `@solana-mobile/solana-mobile-expo-template` (Expo, React Native, TypeScript, `@solana/web3.js` v1, `@solana-mobile/mobile-wallet-adapter-protocol-web3js`). Reuse its wallet connect/auth and transaction-sending utilities instead of writing new ones; read the template's code first.
- Hashing: `@noble/hashes` (`sha256`, `bytesToHex`, `utf8ToBytes`).
- Randomness: `expo-crypto` `getRandomBytes(16)` in the app; injected into core.
- Storage: `@react-native-async-storage/async-storage` (add if the template lacks it).
- Haptics: `expo-haptics`.
- Tests: `jest` + `ts-jest` scoped to `src/core/**` and `src/chain/**` (node environment, no RN preset). Scripts: `yarn test`, `yarn typecheck` (`tsc --noEmit`).

## Directory layout
```
src/core/        pure TS: call.ts, commit.ts, memo.ts, pyth.ts, score.ts, history.ts, index.ts
src/core/__tests__/   unit tests + fixtures/*.json
src/chain/       memoTx.ts, fetchHistory.ts (+ tests with mocked Connection)
src/storage/     secrets.ts
src/screens/     NewReceipt, ReceiptsList, ReceiptDetail, Profile (adapt to the template's navigation)
dist/            built APKs (gitignored)
NOTES.md         run log: attempts, blockers, decisions
```

## Data formats (exact)
**Call** (`src/core/call.ts`):
```ts
type Asset = 'SOL' | 'BTC' | 'ETH' | 'JUP' | 'BONK';
type Direction = 'above' | 'below';
interface Call { v: 1; asset: Asset; dir: Direction; target: number; deadline: number; created: number } // unix seconds
```
Canonical JSON = `JSON.stringify` of an object with keys in this exact order: `v, asset, dir, target, deadline, created`. `target` serialized as a plain decimal number.

**Commit hash**: `hex(sha256(utf8(canonicalJson + "|" + saltHex)))`, salt = 16 random bytes as lowercase hex (32 chars).

**Memos** (UTF-8, must be ≤ 500 bytes, assert in tests):
- commit: `rcpt:1:c:<hash64hex>:<deadline>`
- reveal: `rcpt:1:r:<hash64hex>:<base64url(canonicalJson)>:<saltHex>`
Decoders return `null` for anything malformed (wrong prefix, version, hex length, non-integer deadline, invalid base64url/JSON, schema mismatch).

**Memo transaction**: one `TransactionInstruction` with programId `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, keys `[{ pubkey: signer, isSigner: true, isWritable: false }]`, data = UTF-8 memo bytes. Optionally prepend a ComputeBudget priority fee instruction (small, e.g. 10 000 micro-lamports).

## Chain reading
- `connection.getSignaturesForAddress(wallet, { limit: 1000 })`, then `connection.getParsedTransactions(sigs, { maxSupportedTransactionVersion: 0 })` in batches of ≤ 50.
- Extract memos from parsed instructions where `program === 'spl-memo'` (the `parsed` field is the memo string). Fall back to log lines `Program log: Memo (len N): "..."` if needed.
- Keep only memos starting with `rcpt:1:`, only from transactions where `wallet` is a signer, skip failed transactions (`meta.err != null`).
- Use the transaction `blockTime` as the on-chain timestamp. A commit whose blockTime > its deadline is invalid (ignore it).

## Network config
- `EXPO_PUBLIC_RPC_URL` (default `https://api.mainnet-beta.solana.com`) and `EXPO_PUBLIC_CLUSTER` (`mainnet-beta` default, `devnet` allowed). Solscan links include `?cluster=devnet` when on devnet.
- Pyth is always mainnet Hermes regardless of cluster.

## Pyth
- Latest price: `GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=<id>&parsed=true`.
- Price at deadline: `GET https://hermes.pyth.network/v2/updates/price/<deadline>?ids[]=<id>&parsed=true`.
- Price = `Number(price.price) * 10 ** price.expo`.
- Feed IDs: **look them up** with `GET https://hermes.pyth.network/v2/price_feeds?query=<SYMBOL>&asset_type=crypto`, pick `Crypto.<SYMBOL>/USD`, pin in `src/core/pyth.ts` with a comment and the lookup date. Expected (verify, do not trust blindly): SOL/USD `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`, BTC/USD `e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`, ETH/USD `ff61491a931112ddf1bd8147cd1b641375f79f82825126335ef5d8d6f3e1a3b6`. Save one real Hermes response per endpoint as a test fixture.

### Assets and price source (overrides the lines above where they conflict, 2026-10-06)
- `ASSETS = ['SOL', 'SKR']`. Remove BTC/ETH/JUP/BONK from code, feed ids and tests.
- SKR feed: look up `GET https://hermes.pyth.network/v2/price_feeds?query=SKR&asset_type=crypto` (this metadata endpoint worked without a key). If a `Crypto.SKR/USD` feed exists, pin its id with the lookup date. If not, set `FEED_IDS.SKR = null`, note it in NOTES.md, and SKR uses the mock source even when a Pyth key exists.
- `src/core/price.ts`: `interface PriceSource { kind: 'pyth' | 'mock'; latest(asset): Promise<PythPrice>; at(asset, ts): Promise<PythPrice | null> }`.
  - `pythSource(fetchFn, opts)` wraps the existing `fetchLatestPrice` / `fetchPriceAt`.
  - `mockSource(nowFn)`: deterministic, pure; base prices SOL 150, SKR 0.05; price(ts) = base × (1 + 0.04·sin(ts/5400) + 0.015·sin(ts/977)), rounded to 4 significant digits for SKR, 2 decimals for SOL; `at(asset, ts)` returns null if ts > nowFn() (not yet resolvable), else the formula at ts; `publishTime = ts`.
  - `selectPriceSource(env, fetchFn, nowFn)` → mock unless key set and `EXPO_PUBLIC_PRICE_SOURCE !== 'mock'`; per-asset fallback to mock when the feed id is null.
- App code must get prices only through the selected `PriceSource` (hook `usePriceSource()`), never by calling `fetchLatestPrice`/`fetchPriceAt` directly.
- `isDemo` (source kind === 'mock' for that asset) is shown as a DEMO PRICES badge on New Receipt (price hint), list rows with HIT/MISS, Receipt detail, and Profile; share text gets the `[DEMO PRICES — not real results]` prefix.

## Secrets
AsyncStorage key `rcpt:secret:<hash>` → `{ json: string; salt: string }`. Saved **before** the commit transaction is signed. If signing is rejected, delete it. "Export secrets" = JSON array of all entries copied to clipboard.

## Build
- `npx expo prebuild --platform android` (only if `android/` is missing), then `cd android && ./gradlew assembleRelease`. The Expo default release config signs with the debug keystore — acceptable for the hackathon.
- Copy `android/app/build/outputs/apk/release/app-release.apk` → `dist/receipts-<yyyymmdd-hhmm>.apk`.
- If `adb devices` lists a device: `adb install -r <apk>`. If not: note it in NOTES.md and continue.
- App display name: `Receipts`.
