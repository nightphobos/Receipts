# Receipts («Чеки»)

A Solana Mobile (Seeker) app for crypto price calls that **can't be cleaned up afterwards**.

You call a direction: "SOL **up ▲** in 24 h". The app seals the call on Solana as a hash right away, so nobody can see your side yet. After the deadline you reveal it, and the call is scored against the market: the price when the commit landed (P0) vs. the price at the deadline (PT). **If you never reveal a call, it counts as a miss.** You can't delete misses, edit calls, or show only the wins. Your record comes straight from your wallet's on-chain history, and a public leaderboard ranks everyone with the same rules.

- **No custom program.** Each step is one transaction with an [SPL Memo](https://spl.solana.com/memo) (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`) plus a **0-lamport** System transfer to the registry address `E5YRG7uSptKAd2T4WbMyK8xadyuZ8v132Ji6XhAxX5SJ`. The transfer moves no money; it only tags the transaction so that `getSignaturesForAddress(registry)` lists every Receipts call of every user. Nobody holds the registry's key.
- **No backend.** The app reads everything from the Solana RPC, Pyth Hermes (SOL) and KuCoin's public market API (SKR). The leaderboard is a static site built by a deterministic script anyone can re-run.
- **No funds held.** No stakes, no bets, no escrow. The only token movement is an optional **SKR tip** you send from your own wallet to another caller.
- Assets: **SOL** and **SKR** (the Seeker token).

## Rules (v2)

### A call

- Asset (SOL or SKR), direction **up ▲** or **down ▼**, horizon **24h** (default), **3d**, **7d**, or **1h "practice"**.
- There is no target price. A call is only a direction relative to the market price at the moment the commit lands on chain, so a call can never be "already true" when you make it.
- **SKR Daily Call**: a preset "SKR · 24h" whose deadline is the next 12:00 UTC that is at least 12 h away. Everybody's SKR Daily shares the same deadline and has its own leaderboard tab.

### Scoring (exact, so anyone can recompute)

- `t0 = ceil_to_minute(commit blockTime)`. If the block time is already on a minute boundary, `t0 = blockTime + 60` (so t0 is always strictly after the commit). `P0 = priceAt(asset, t0)`.
- `PT = priceAt(asset, deadline)`.
- `priceAt(SOL, ts)` = Pyth `Crypto.SOL/USD` price at `ts`.
- `priceAt(SKR, ts)` = **median of the closes of the 5 KuCoin `SKR-USDT` 1-minute candles that end at `floor(ts/60)*60`** (candles starting at end−300 … end−60; even count → mean of the middle two). SKR is quoted in USDT.
- **HIT** if (up and PT > P0) or (down and PT < P0). **MISS** if the opposite. **VOID** if PT == P0: it is excluded from every count.
- **Forfeited**: no valid reveal by deadline + 24 h → counts as a **MISS**.
- **One open call per (wallet, asset, horizon class).** The class comes from `deadline − commit blockTime`: ≤ 2 h → 1h, ≤ 36 h → 24h, ≤ 4 d → 3d, else 7d. A commit that lands while an earlier commit of the same wallet + asset + class is still before its deadline is an **overlap = MISS**. The app disables Seal in that case; a hand-crafted overlap still counts against you.

### Statuses

| Status | Condition |
|---|---|
| `sealed` | commit on chain, now < deadline |
| `awaiting_reveal` | now ≥ deadline, no valid reveal, now < deadline + 24 h |
| `forfeited` | no valid reveal and now ≥ deadline + 24 h — **a miss** |
| `hit` / `miss` / `void` | valid reveal, scored with P0 and PT |
| `overlap` | commit opened a second position in the same asset + class — **a miss** |
| `unresolved` | valid reveal but a price is not available yet |
| `legacy` | v1 (`rcpt:1:`) receipt: shown, not counted |

### Rating

- Primary number: **z = (H − M) / √N**, with N = H + M (M includes forfeits and overlaps), shown as "**+1.9σ vs coin flip**". A coin-flipper hovers around 0σ however many calls they make. Next to it: N and hit-rate.
- Profile also shows "**hidden & forfeited: K**" and a **streak** (consecutive UTC days with at least one seal or reveal; it rewards showing up, not winning).
- **Leaderboard eligibility**: N ≥ 10 resolved calls with a horizon ≥ 24h, commits on ≥ 3 distinct UTC days, and the wallet holds a **Seeker Genesis Token**. 1h practice calls count in your own stats but never on the leaderboard.
- **SKR Daily** board: wallets with a Genesis Token and at least one scored SKR Daily call, ranked on SKR Daily calls only.
- Ranking: z descending, then N descending, then wallet address.

## Anti-cheat

Honesty of the score is the product. Each obvious trick, and why it doesn't pay:

- **Show only the wins.** The commit is public the moment you seal. A call you don't reveal within 24 h after the deadline is a forfeit, which is a miss. Deleting the app or the local data doesn't help: the commit stays on chain.
- **Edit a call later.** The commit is `sha256(json | salt)`. A different direction gives a different hash, and the reveal must also keep the commit's deadline and asset.
- **"Above $0.001" farming** (v1 problem). v2 has no target: you only call the direction from the price *after* your commit lands (t0 is the next minute boundary), so you can't seal something that is already true.
- **Hedging** (seal ▲ and ▼, reveal only the winner). The loser is forfeited = miss, so you get 1 hit + 1 miss: z gets worse, not better. And the second commit in the same asset + class is an **overlap**, which is itself a miss.
- **Staking one coin flip 100×** (many commits on the same move). Only one open call per wallet + asset + horizon class; every extra commit before the first one's deadline is an overlap = miss.
- **Sybil wallets** (spray coin flips over many wallets, promote the lucky one). The leaderboard requires a Seeker Genesis Token (one per Seeker phone), N ≥ 10 calls of ≥ 24 h, on ≥ 3 different UTC days. z = (H − M)/√N also means a lucky short run isn't worth much.
- **Front-running the reference price.** P0 is taken at the next full minute after the block time, not at a price you saw in the app. SKR uses a median of 5 one-minute closes, so one thin print on KuCoin can't decide a call (SOL uses Pyth's aggregate price).
- **Exact tie.** PT == P0 is **VOID**: not a hit, not a miss, not counted anywhere.
- **Untagged or third-party transactions.** Only transactions that carry the registry tag paid by the wallet itself count, commit and reveal alike. That way the app and the indexer see exactly the same receipts. A reveal sent from another wallet is ignored.

## Secrets: derived from your wallet, recoverable on any device

- On first use the app asks the wallet to sign the fixed message
  `Receipts master key v1\nSigning this lets Receipts hide and later reveal your call directions. It cannot move funds.`
  and sets `master = sha256(signature)` (64-byte ed25519 signature).
- **Determinism self-check**: the app asks for the signature twice in one session. If both match, master is stored in `expo-secure-store`. If not, the wallet's signatures aren't deterministic: the app falls back to random salts stored only on the phone, shows a warning, and offers "Export secrets".
- `salt = hex(hmac_sha256(master, "rcpt:2|" + asset + "|" + deadline))[0..32]`.
- **Recovery** (new phone, reinstall): sign the message again → same master → same salt. The call's `created` must lie in [commit blockTime − 900, commit blockTime] and `dir` is up or down, so the app finds the matching JSON with at most 1802 hashes.
- **Trade-off**: a phishing app that gets you to sign the exact same text learns your hidden directions early. It can't move funds, and it can't change your calls.

## Formats (v2)

**Call JSON (canonical).** Keys in exactly this order, no whitespace, times in unix seconds:

```json
{"v":2,"asset":"SOL","dir":"up","deadline":1791460800,"created":1791374513}
```

**Commit hash**

```
hash = hex( sha256( utf8( canonicalJson + "|" + saltHex ) ) )
```

**Memos** (UTF-8, ≤ 500 bytes). The asset is public in the commit, the direction is hidden:

```
commit: rcpt:2:c:<hash>:<deadline>:<ASSET>
reveal: rcpt:2:r:<hash>:<base64url(canonicalJson), no padding>:<saltHex>
```

Each v2 transaction = [Memo, SystemProgram.transfer(signer → `E5YRG7uSptKAd2T4WbMyK8xadyuZ8v132Ji6XhAxX5SJ`, 0 lamports)] (plus compute-budget priority fee).

## Verify a v2 receipt by hand

You only need the two transactions, a shell and a price source. You don't have to trust the app or the leaderboard.

Worked example (the same as the code computes; the master is a dummy `sha256` of 64 bytes `0x01`):

```
commit memo: rcpt:2:c:e11b64aedd313fb6590d7345e95c478893ea95a68d7ada1f8db45e35385a464c:1791460800:SOL
reveal memo: rcpt:2:r:e11b64aedd313fb6590d7345e95c478893ea95a68d7ada1f8db45e35385a464c:eyJ2IjoyLCJhc3NldCI6IlNPTCIsImRpciI6InVwIiwiZGVhZGxpbmUiOjE3OTE0NjA4MDAsImNyZWF0ZWQiOjE3OTEzNzQ1MTN9:72d25e64930e1492be1fdee811a41824
commit block time: 1791374518 (2026-10-07 12:01:58 UTC)
```

1. **Find the transactions.** Open both on Solscan (the app's detail screen, the share text and the leaderboard profile link to them). Copy the memo text.
2. **Check the signer and the tag.** Both transactions must be signed by the wallet you are checking, and each must contain a 0-lamport System transfer **from that wallet** to `E5YRG7uSptKAd2T4WbMyK8xadyuZ8v132Ji6XhAxX5SJ`.
3. **Check the timing.**
   - Commit block time ≤ deadline (the 4th field of the commit memo; `1791460800` = 2026-10-08 12:00 UTC).
   - Reveal block time ≥ commit block time and **< deadline + 86 400 s**. Otherwise the call is forfeited.
4. **Decode the call** (third field of the reveal memo, base64url without padding; add `=` until the length is a multiple of 4):
   ```sh
   echo 'eyJ2IjoyLCJhc3NldCI6IlNPTCIsImRpciI6InVwIiwiZGVhZGxpbmUiOjE3OTE0NjA4MDAsImNyZWF0ZWQiOjE3OTEzNzQ1MTN9' \
     | tr '_-' '/+' | base64 -d
   # {"v":2,"asset":"SOL","dir":"up","deadline":1791460800,"created":1791374513}
   ```
5. **Recompute the hash** from the JSON, `|` and the salt (last field). `printf '%s'` adds no newline:
   ```sh
   printf '%s' '{"v":2,"asset":"SOL","dir":"up","deadline":1791460800,"created":1791374513}|72d25e64930e1492be1fdee811a41824' \
     | shasum -a 256
   # e11b64aedd313fb6590d7345e95c478893ea95a68d7ada1f8db45e35385a464c
   ```
   It must equal the hash in **both** memos. The JSON's `deadline` and `asset` must equal the commit memo's.
6. **Check for overlap.** List the wallet's other tagged `rcpt:2:c:` commits. If an earlier one (by block time, then signature) with the same asset and horizon class has a deadline after this commit's block time, and it is not itself an overlap, this call is an overlap = miss. Here the class is 24h (`1791460800 − 1791374518` = 86 282 s ≤ 36 h).
7. **Get P0 and PT.**
   - `t0 = floor(1791374518/60)*60 + 60 = 1791374520`; `T = 1791460800`.
   - **SOL**: Pyth `Crypto.SOL/USD` at t0 and at T, e.g. `GET https://hermes.pyth.network/v2/updates/price/<ts>?ids[]=<feed id>&parsed=true` (needs an API key since 2026-08-26) or any Pyth price chart. Feed id: `FEED_IDS.SOL` in `src/core/pyth.ts`.
   - **SKR**: with `end = floor(ts/60)*60`, `GET https://api.kucoin.com/api/v1/market/candles?type=1min&symbol=SKR-USDT&startAt=<end-300>&endAt=<end>` (public, no key; row = `[start, open, close, high, low, volume, turnover]`). Keep the rows whose start is end−300 … end−60 (KuCoin sometimes also returns the row starting at `end`; ignore it) and take the median of their closes.
8. **Score it.** `up`: HIT if PT > P0, MISS if PT < P0. `down`: the opposite. PT == P0: VOID.

**Optional — check the salt is derived** (only the owner can do this, since it needs the master):

```sh
printf '%s' 'rcpt:2|SOL|1791460800' \
  | openssl dgst -sha256 -mac HMAC -macopt hexkey:7c8975e1e60a5c8337f28edf8c33c3b180360b7279644a9bc1af3c51e6220bf5 \
  | awk '{print substr($NF,1,32)}'
# 72d25e64930e1492be1fdee811a41824
```

The same rules are implemented and unit-tested in `src/core/history.ts` (matching reveals to commits, tags, overlaps), `src/core/score.ts` (statuses, z, eligibility), `src/core/price.ts` + `src/core/kucoin.ts` (t0, P0/PT) and `src/core/leaderboard.ts` (aggregation).

## Leaderboard and indexer

`scripts/indexer.ts` is a deterministic Node script that reuses `src/core`. It pages `getSignaturesForAddress(registry)`, parses the v2 memos, builds receipts per wallet, fetches prices, checks Genesis tokens and writes:

- `site/leaderboard.json`, `site/index.html` (overall + SKR Daily),
- `site/u/<wallet>.json`, `site/u/<wallet>.html` (read-only profiles; directions stay hidden until revealed),
- `indexer-data/registry.json` (incremental sync state) and `indexer-data/prices.json` (permanent price cache).

The site is a convenience, never the source of truth: anyone can re-run it and should get the same files.

```sh
# .env: INDEXER_RPC_URL=<mainnet RPC> (optional, default public mainnet; requests throttled to 5/s)
#       PYTH_API_KEY=<Hermes key> (or EXPO_PUBLIC_PYTH_API_KEY; required for SOL prices)
npx tsx --env-file=.env scripts/indexer.ts
```

To re-run from scratch, delete `indexer-data/registry.json` (and `prices.json` to re-fetch every price).

`.github/workflows/indexer.yml` runs it every 15 minutes, commits `indexer-data/` back and deploys `site/` to GitHub Pages.

In the app, the **RANK** tab reads `EXPO_PUBLIC_LEADERBOARD_URL` (the Pages site). If it is unset, the app computes the same leaderboard itself from the registry with the same core code (slower, but trustless).

## SKR tips

On another wallet's profile (from the RANK tab): **Tip 10 / 50 / 100 SKR**. It is a plain SPL `transferChecked` of SKR (mint `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`, 6 decimals) from your wallet to theirs, creating their token account if needed, signed by you in the wallet. Mainnet only. The app never holds funds.

## Human steps (to go live)

These need a person; the build loop doesn't do them.

1. **Create a GitHub repo** and push this one:
   ```sh
   git remote add origin git@github.com:<you>/receipts.git
   git push -u origin master
   ```
2. **Enable Pages**: repo Settings → Pages → Source: **GitHub Actions**.
3. **Add secrets**: Settings → Secrets and variables → Actions → `PYTH_API_KEY` (Hermes key, required for SOL prices) and optionally `INDEXER_RPC_URL` (a private mainnet RPC).
4. Run the **indexer** workflow once (Actions → indexer → Run workflow) and open `https://<you>.github.io/receipts/leaderboard.json`.
5. **Point the app at it**: set `EXPO_PUBLIC_LEADERBOARD_URL=https://<you>.github.io/receipts` in `.env` and rebuild the APK (Expo inlines the value at bundle time).

## Build and run

Requirements: Node ≥ 18, Yarn 1, JDK 21, and the Android SDK (`ANDROID_HOME`). Gradle installs the NDK it needs.

```sh
yarn install
yarn test        # jest: src/core, src/chain, src/storage
yarn typecheck   # tsc --noEmit
```

**Release APK:**

```sh
npx expo prebuild --platform android --no-install   # needed after native modules were added (secure-store, svg, reanimated, sensors, fonts)
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

**Dev:** run `yarn android` (`expo run:android`, a dev client on a connected device) or `yarn start`.

**Icons and splash** are generated from the mascot pixel art: `npx tsx scripts/gen-icons.ts`.

### Configuration (`.env`, git-ignored)

Expo inlines `EXPO_PUBLIC_*` variables **when it bundles the app**, so rebuild the APK after you change them.

```sh
# .env
EXPO_PUBLIC_CLUSTER=mainnet-beta                        # or devnet (default: mainnet-beta)
EXPO_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com # default
EXPO_PUBLIC_PYTH_API_KEY=<your Pyth Hermes token>       # needed for SOL prices
EXPO_PUBLIC_MOCK_ASSETS=                                # e.g. SKR → demo prices for that asset only
EXPO_PUBLIC_PRICE_SOURCE=                               # "mock" forces demo prices even with a key
EXPO_PUBLIC_LEADERBOARD_URL=                            # indexer GitHub Pages site; unset → Rank tab computes from the registry
```

## Architecture

```
src/core/      pure TypeScript, no React Native/Expo imports, all I/O injected (reusable by a future web view)
  call.ts        Call/CallV2, validation, canonical JSON
  commit.ts      salts, commit hash (@noble/hashes)
  memo.ts        rcpt:1 / rcpt:2 memos (strict; malformed → null), REGISTRY
  secret.ts      master key, derived salts, recovery
  history.ts     memo txs → receipts (signer, tag, hash, deadline, reveal window, overlap)
  score.ts       statuses, resolve (strict compare, VOID), z, eligibility, streak
  price.ts       PriceSource (pyth | kucoin | mock), t0, priceAt
  pyth.ts        Hermes client + pinned feed ids
  kucoin.ts      KuCoin public spot client (SKR): level1, candle close, 5-candle median
  leaderboard.ts, leaderboardSource.ts, site.ts   indexer aggregation, site JSON/HTML, in-app fallback
  draftV2.ts, ceremony.ts, share.ts, format.ts, tip.ts, genesis.ts, parallax.ts, mascot.ts, iconArt.ts, …
src/chain/     memoTx.ts (Memo + registry tag + priority fee), fetchHistory.ts (wallet + registry reads),
               seal.ts, reveal.ts, tipTx.ts, genesis.ts (MWA sign & send, RPC)
src/storage/   secrets.ts (per-hash call + salt), master.ts (secure-store master per wallet)
src/hooks/     useReceipts, useMasterKey, useLeaderboard, usePriceSource, useSeekerGenesis, useNow
src/screens/   ReceiptsList, NewReceipt, ReceiptDetail(V2), Profile, Leaderboard, WalletProfile, Settings
src/theme/     «Night Register» pixel UI: tokens, PixelButton/Panel, StatusStamp, ReceiptPaper, Mascot, ParallaxBackground
scripts/       indexer.ts, gen-icons.ts
```

The app is built from the Solana Mobile Expo template (Expo 52, React Native 0.76, `@solana/web3.js` 1.x, Mobile Wallet Adapter 2).

## Legacy v1 receipts

The first version used absolute targets ("SOL above $200"), which could be farmed ("above $0.001"). v1 receipts (`rcpt:1:`) are still read and shown as **legacy**, but they are excluded from stats and the leaderboard. Format:

```
call:   {"v":1,"asset":"SOL","dir":"above","target":200,"deadline":1791331200,"created":1791244800}
commit: rcpt:1:c:<hash>:<deadline>
reveal: rcpt:1:r:<hash>:<base64url(json)>:<saltHex>
```

Same hash rule and reveal window as v2; v1 used random salts stored only on the phone, and the price was a single point at the deadline (SKR: the one KuCoin 1-minute candle ending at `floor(deadline/60)*60`). HIT only if strictly above/below the target.

## Known limitations

- **Price sources are fixed per asset** (part of the scoring rules): SOL → Pyth `Crypto.SOL/USD` (needs a Pyth API key; Hermes returns `401` without one since 2026-08-26), SKR → KuCoin `SKR-USDT` (Hermes doesn't serve the Pyth SKR feed for our key).
  - The app never switches to demo prices on its own. Demo prices only with `EXPO_PUBLIC_PRICE_SOURCE=mock` or `EXPO_PUBLIC_MOCK_ASSETS`, and then every price and result shows a **DEMO PRICES** badge and the share text starts with `[DEMO PRICES — not real results]`.
- **Random-salt fallback.** If the wallet's signatures aren't deterministic, secrets live only on the phone; uninstalling before revealing forfeits the call. Use "Export secrets" for a backup.
- **Reveal window is 24 h** after the deadline. A late reveal does not count.
- **Public RPC.** The default mainnet RPC is rate-limited; the in-app leaderboard fallback reads at most 5000 registry signatures. For heavier use, set `EXPO_PUBLIC_RPC_URL` / `INDEXER_RPC_URL` to a private endpoint.
- **Mainnet only**, plus devnet set at build time. The cluster can't be switched inside the app. Tips are mainnet only.
- **Android only**, since Mobile Wallet Adapter doesn't exist on iOS.
- **Seeker Genesis Token** check: the wallet's Token-2022 accounts are searched for a token with mint authority `GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4` and group `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te`.
- The Pyth API key, if set, is bundled into the APK. That is acceptable for a hackathon demo, not for production.
