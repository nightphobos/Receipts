# Receipts («Чеки»)

A Solana Mobile (Seeker) app for crypto price calls that **can't be cleaned up afterwards**.

You make a call ("SOL above $200 by Oct 7, 00:00 UTC"). The app seals it on Solana as a hash right away and keeps the call text secret. After the deadline you reveal it, and the app scores it against the market price at the deadline (SOL: Pyth SOL/USD, SKR: KuCoin SKR-USDT). **If you never reveal a call, it counts as a miss.** You can't delete misses, edit calls, or show only the wins. The hit-rate comes straight from your wallet's on-chain history.

- No custom program and no token transfers. Each step is one [SPL Memo](https://spl.solana.com/memo) transaction (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`).
- No backend. The app reads everything from the Solana RPC, Pyth Hermes (SOL) and KuCoin's public market API (SKR).
- Assets: **SOL** and **SKR** (the Seeker token).

## How it works

1. **Seal.** You choose an asset, a direction (`above`/`below`), a target in USD and a deadline (from now + 1 h to now + 30 d). The app generates a random 16-byte salt and computes the commit hash. It stores the call and the salt **on the phone** before signing, then sends the commit memo through Mobile Wallet Adapter (Seed Vault on the Seeker).
2. **Wait.** The receipt shows as `sealed` with a countdown.
3. **Reveal.** From the deadline until deadline + 24 h, the receipt shows `awaiting_reveal` and a Reveal button. Revealing sends a second memo with the call JSON and the salt.
4. **Resolve.** The app fetches the price at the deadline: `above` is a HIT only if the price is **strictly greater** than the target, and `below` only if it is **strictly less**. A price equal to the target is a MISS.
5. **Forfeit.** If there is no valid reveal by deadline + 24 h, the call is `forfeited` and counts as a miss.

Hit-rate = hits / (hits + misses + forfeited). Pending calls (`sealed`, `awaiting_reveal`, `unresolved`) are left out.

## Formats

**Call JSON (canonical).** Keys appear in exactly this order, with no whitespace. `target` is a plain decimal (never `1e-7`). Times are unix seconds.

```json
{"v":1,"asset":"SOL","dir":"above","target":200,"deadline":1791331200,"created":1791244800}
```

**Commit hash**

```
hash = hex( sha256( utf8( canonicalJson + "|" + saltHex ) ) )
saltHex = 16 random bytes as 32 lowercase hex chars
```

**Memos** (UTF-8, ≤ 500 bytes)

```
commit: rcpt:1:c:<hash>:<deadline>
reveal: rcpt:1:r:<hash>:<base64url(canonicalJson), no padding>:<saltHex>
```

## Verify a receipt by hand

To check a receipt, you only need the two transactions, a shell and a price chart. You don't have to trust the app.

Worked example (it is the same as the code computes; you can run it yourself):

```
commit memo: rcpt:1:c:98056fab472b8e716e2d57f1cbf758f5a1c7198faab58acec5bd4ee8b3e9d153:1791331200
reveal memo: rcpt:1:r:98056fab472b8e716e2d57f1cbf758f5a1c7198faab58acec5bd4ee8b3e9d153:eyJ2IjoxLCJhc3NldCI6IlNPTCIsImRpciI6ImFib3ZlIiwidGFyZ2V0IjoyMDAsImRlYWRsaW5lIjoxNzkxMzMxMjAwLCJjcmVhdGVkIjoxNzkxMjQ0ODAwfQ:0123456789abcdef0123456789abcdef
```

1. **Find the memos.** Open both transactions on Solscan (the app's detail screen and its share text link to them) and copy the memo text.
2. **Check the signer.** Both transactions must be signed by the same wallet, the one whose record you are checking.
3. **Check the timing.**
   - The commit's block time must be **≤ the deadline**.
   - The reveal's block time must be ≥ the commit's block time and **< deadline + 86 400 s**.
   - A reveal that misses this window doesn't count, and the call is forfeited.
4. **Decode the call.** Take the third field of the reveal memo (base64url, no padding):
   ```sh
   echo 'eyJ2IjoxLCJhc3NldCI6IlNPTCIsImRpciI6ImFib3ZlIiwidGFyZ2V0IjoyMDAsImRlYWRsaW5lIjoxNzkxMzMxMjAwLCJjcmVhdGVkIjoxNzkxMjQ0ODAwfQ==' \
     | tr '_-' '/+' | base64 -d
   # {"v":1,"asset":"SOL","dir":"above","target":200,"deadline":1791331200,"created":1791244800}
   ```
   (Before decoding, add `=` until the length is a multiple of 4.)
5. **Recompute the hash** from the decoded JSON plus `|` and the salt (the last field). Use `printf '%s'` so no newline gets added:
   ```sh
   printf '%s' '{"v":1,"asset":"SOL","dir":"above","target":200,"deadline":1791331200,"created":1791244800}|0123456789abcdef0123456789abcdef' \
     | shasum -a 256
   # 98056fab472b8e716e2d57f1cbf758f5a1c7198faab58acec5bd4ee8b3e9d153
   ```
   The result must equal the hash in **both** memos.
6. **Check the deadline.** The `deadline` in the JSON must equal the last field of the commit memo (`1791331200` = 2026-10-07 00:00 UTC).
7. **Score it.** For **SKR**, take the close of the KuCoin `SKR-USDT` 1-minute candle that ends at `floor(deadline/60)*60`: `GET https://api.kucoin.com/api/v1/market/candles?type=1min&symbol=SKR-USDT&startAt=<end-60>&endAt=<end>` (public, no key; row = `[start, open, close, high, low, volume, turnover]`). For **SOL**, look up the Pyth `Crypto.SOL/USD` price at the deadline, for example with `GET https://hermes.pyth.network/v2/updates/price/1791331200?ids[]=<feed id>&parsed=true` (now requires an API key), or with any Pyth price chart. Then apply the strict hit rule.

If no valid reveal exists for a commit and deadline + 24 h has passed, count it as a **miss**.

The same rules are implemented and unit-tested in `src/core/history.ts` (matching reveals to commits) and `src/core/score.ts` (statuses and stats).

## Build and run

Requirements: Node ≥ 18, Yarn 1, JDK 21, and the Android SDK (`ANDROID_HOME`). Gradle installs the NDK it needs.

```sh
yarn install
yarn test        # jest: src/core, src/chain, src/storage
yarn typecheck   # tsc --noEmit
```

**Release APK** (`android/` is already committed, so prebuild isn't needed):

```sh
cd android && ./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../dist/receipts-$(date +%Y%m%d-%H%M).apk
adb install -r ../dist/receipts-*.apk   # with the Seeker connected over USB
```

- On macOS with Homebrew, set the environment first:
  ```sh
  JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
  ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
  ```
- The release build is signed with the debug keystore. That is fine for the hackathon.
- A cold build takes about 20 minutes, and incremental builds less than a minute.
- If `android/` ever goes missing, regenerate it with `npx expo prebuild --platform android --no-install`.

**Dev:** run `yarn android` (`expo run:android`, a dev client on a connected device) or `yarn start`.

### Configuration (`.env`, git-ignored)

Expo inlines `EXPO_PUBLIC_*` variables **when it bundles the app**, so rebuild the APK after you change them.

```sh
# .env
EXPO_PUBLIC_CLUSTER=mainnet-beta                        # or devnet (default: mainnet-beta)
EXPO_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com # default
EXPO_PUBLIC_PYTH_API_KEY=<your Pyth Hermes token>       # needed for SOL prices
EXPO_PUBLIC_MOCK_ASSETS=                                # e.g. SKR → demo prices for that asset only
EXPO_PUBLIC_PRICE_SOURCE=                               # "mock" forces demo prices even with a key
```

## Architecture

```
src/core/      pure TypeScript, no React Native/Expo imports, all I/O injected (reusable by a future web view)
  call.ts        Call type, validateCall, canonicalJson
  commit.ts      makeSalt, commitHash (@noble/hashes)
  memo.ts        encode/decode commit and reveal memos (strict; malformed → null)
  history.ts     on-chain memo txs → receipts (same signer, hash, deadline, reveal window)
  score.ts       statusOf, resolve (strict compare), stats
  pyth.ts        Hermes client + pinned feed ids (SOL, SKR)
  kucoin.ts      KuCoin public spot client (SKR): level1 + 1-min candle close
  price.ts       PriceSource: pyth | kucoin | deterministic mock; RESOLUTION_SOURCE (SOL→pyth, SKR→kucoin)
  share.ts, format.ts, draft.ts, cluster.ts
src/chain/     memoTx.ts (Memo + priority-fee tx), fetchHistory.ts (signatures → parsed txs → rcpt memos),
               seal.ts, reveal.ts (MWA sign & send)
src/storage/   secrets.ts: call JSON + salt per hash in AsyncStorage (rcpt:secret:<hash>)
src/hooks/     useReceipts (react-query: chain → receipts → prices), usePriceSource, useNow
src/screens/   ReceiptsList (Home), NewReceipt, ReceiptDetail, Profile, Settings
```

The app is built from the Solana Mobile Expo template (Expo 52, React Native 0.76, `@solana/web3.js` 1.x, Mobile Wallet Adapter 2).

## Known limitations

- **Price sources are fixed per asset** (part of the scoring rules): SOL → Pyth `Crypto.SOL/USD` (needs `EXPO_PUBLIC_PYTH_API_KEY`; Hermes returns `401` without one since 2026-08-26), SKR → KuCoin `SKR-USDT` 1-minute candle close (Pyth has a `Crypto.SKR/USD` feed id, but Hermes does not serve it for our key). SKR is quoted in USDT, not USD.
  - The app never switches to demo prices on its own. Demo prices only with `EXPO_PUBLIC_PRICE_SOURCE=mock` or `EXPO_PUBLIC_MOCK_ASSETS`, and then every price, HIT and MISS shows a **DEMO PRICES** badge and the share text starts with `[DEMO PRICES — not real results]`.
- **Secrets are only on the phone.**
  - The call and salt live in AsyncStorage on the device.
  - If you uninstall the app or lose the phone before revealing, the call can't be revealed and will be forfeited. This is by design: it can't be undone.
  - To keep a backup, use Profile → "Export secrets", which copies them to the clipboard.
  - The app warns about this once, on the first seal.
- **Reveal window is 24 h** after the deadline. A late reveal does not count.
- **No web view yet.** Other people can verify a receipt by hand (see above) or with Solscan, but there is no hosted verifier page or leaderboard.
- **Public RPC.** The default mainnet RPC is rate-limited. For heavier use, set `EXPO_PUBLIC_RPC_URL` to a private endpoint.
- **Mainnet only**, plus devnet set at build time. The cluster can't be switched inside the app.
- **Android only**, since Mobile Wallet Adapter doesn't exist on iOS.
- **Seeker verified badge** (Profile) checks the wallet's Token-2022 accounts for a Seeker Genesis Token (mint authority `GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4`, group `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te`); it is cosmetic and only meaningful on mainnet.
- The Pyth API key, if set, is bundled into the APK. That is acceptable for a hackathon demo, not for production.
