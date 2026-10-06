# NOTES — run log

<!-- Morning summary goes here (task T019). -->

Iterations append below: `## <task id> — done|attempt N <date>`.

## T001 — done 2026-10-06
- Baseline: `yarn install` OK (needed repo-local `.yarnrc` `--ignore-engines true`: node v23.10.0 rejected by transitive `eslint-visitor-keys@5` engine range). `yarn.lock` now committed. `npx tsc --noEmit` exit 0. Versions: expo 52.0.49, react-native 0.76.9, @solana/web3.js 1.99.0. `.gitignore` already covered node_modules, dist, android/build, android/app/build, .env*, .ralph/logs.
- Template map: `App.tsx` = polyfills → QueryClient → `ClusterProvider` (`src/components/cluster/cluster-data-access.tsx`, defaults devnet/testnet via `clusterApiUrl`, `getExplorerUrl` = explorer.solana.com) → `ConnectionProvider` (`src/utils/ConnectionProvider.tsx`, `useConnection()`) → Paper theme → `AppNavigator` (native stack: HomeStack + Settings) → `HomeNavigator` (bottom tabs Home/Blank, `TopBar` header). Plan wants env `EXPO_PUBLIC_RPC_URL`/`EXPO_PUBLIC_CLUSTER` (mainnet default) — cluster provider must be adapted in Phase 3.
- Wallet: `src/utils/useMobileWallet.tsx` (`connect`, `disconnect`, `signAndSendTransaction(tx, minContextSlot)`, `signMessage`) over MWA `transact`; `src/utils/useAuthorization.tsx` hardcodes `CLUSTER = "devnet"` chain id and `APP_IDENTITY` "Solana Mobile Expo Template" (change both in Phase 3), auth cached in AsyncStorage. Tx pattern to copy: `createTransaction` in `src/components/account/account-data-access.tsx` (getLatestBlockhashAndContext → TransactionMessage.compileToLegacyMessage → VersionedTransaction → signAndSend → confirmTransaction). Polyfills (`src/polyfills.ts`) set Buffer + crypto.getRandomValues via expo-crypto.
