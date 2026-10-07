/**
 * Receipts leaderboard indexer (spec v2 "Global leaderboard without a backend").
 * Deterministic and re-runnable by anyone: reads only the Solana RPC and public price APIs,
 * aggregates with the same src/core code as the app, writes static files for GitHub Pages.
 *
 *   npx tsx scripts/indexer.ts
 *   INDEXER_RPC_URL=<rpc>  PYTH_API_KEY=<hermes key>  (or EXPO_PUBLIC_PYTH_API_KEY, e.g. --env-file=.env)
 *
 * State (committed): indexer-data/registry.json (registry memo txs + newest signature, for incremental
 * sync — delete it to re-read the whole registry), indexer-data/prices.json (permanent price cache).
 * Output: site/leaderboard.json, site/u/<wallet>.json, site/index.html, site/u/<wallet>.html.
 */
import * as fs from "fs";
import * as path from "path";
import { Connection, PublicKey } from "@solana/web3.js";
import { fetchRegistry } from "../src/chain/fetchHistory";
import { hasSeekerGenesisToken } from "../src/chain/genesis";
import { REGISTRY_KEY } from "../src/chain/memoTx";
import { fetchSkrBalance } from "../src/chain/skrBalance";
import type { MemoTx } from "../src/core/history";
import {
  buildLeaderboard,
  priceKey,
  pricesNeeded,
  receiptsByWallet,
  walletProfile,
  withPrices,
  type PriceCache,
  type WalletEntry,
} from "../src/core/leaderboard";
import { priceAt, selectPriceSource } from "../src/core/price";
import type { FetchFn } from "../src/core/pyth";
import { renderLeaderboardHtml, renderProfileHtml } from "../src/core/site";
import { isSkrHolder } from "../src/core/tip";
import { tipTotals } from "../src/core/tips";

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "indexer-data");
const SITE_DIR = path.join(ROOT, "site");
const REGISTRY_FILE = path.join(DATA_DIR, "registry.json");
const PRICES_FILE = path.join(DATA_DIR, "prices.json");

const RPC_URL = process.env.INDEXER_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
const PYTH_KEY = (process.env.PYTH_API_KEY || process.env.EXPO_PUBLIC_PYTH_API_KEY || "").trim();
/** ≤ 5 requests per second (plan v2). */
const MIN_REQUEST_GAP_MS = 200;
const BASE58_WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface RegistryState {
  /** Newest registry signature already read; next run reads only newer ones. */
  newest: string | null;
  txs: MemoTx[];
}

/** Serialises calls with a minimum gap between their starts. */
function throttled<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  let next = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return (...args: A) => {
    const run = chain.then(async () => {
      const wait = next - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      next = Date.now() + MIN_REQUEST_GAP_MS;
    });
    chain = run;
    return run.then(() => fn(...args));
  };
}

const toJson = (x: unknown) => JSON.stringify(x, null, 1) + "\n";

function readJson<T>(file: string, fallback: T): T {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback;
}

function writeFile(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const txKey = (t: MemoTx) => `${t.signature}|${t.signer}|${t.memo}`;

async function syncRegistry(conn: Connection): Promise<MemoTx[]> {
  const state = readJson<RegistryState>(REGISTRY_FILE, { newest: null, txs: [] });
  const [head] = await conn.getSignaturesForAddress(REGISTRY_KEY, { limit: 1 }, "confirmed");
  const fresh = await fetchRegistry(conn, { until: state.newest ?? undefined });
  const byKey = new Map(state.txs.map((t) => [txKey(t), t]));
  for (const t of fresh) byKey.set(txKey(t), t);
  const txs = [...byKey.values()].sort(
    (a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0) || (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0),
  );
  writeFile(REGISTRY_FILE, toJson({ newest: head?.signature ?? state.newest, txs } satisfies RegistryState));
  console.log(`registry: ${fresh.length} new memo txs, ${txs.length} total`);
  return txs;
}

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  const rpcFetch = throttled((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => fetch(input, init));
  const conn = new Connection(RPC_URL, { commitment: "confirmed", fetch: rpcFetch as typeof fetch });

  const txs = await syncRegistry(conn);
  const wallets = [...receiptsByWallet(txs)].filter(([w]) => BASE58_WALLET.test(w));

  // Prices: permanent cache; only resolved prices are stored.
  const cache = readJson<PriceCache>(PRICES_FILE, {});
  const source = selectPriceSource({ EXPO_PUBLIC_PYTH_API_KEY: PYTH_KEY }, fetch as unknown as FetchFn, () =>
    Math.floor(Date.now() / 1000),
  );
  const needs = pricesNeeded(
    wallets.flatMap(([, rs]) => rs),
    nowSec,
  ).filter((p) => cache[priceKey(p.asset, p.ts)] === undefined);
  let failed = 0;
  for (const need of needs) {
    try {
      const p = await priceAt(source, need.asset, need.ts);
      if (p) cache[priceKey(need.asset, need.ts)] = p.price;
    } catch (e) {
      failed++;
      console.warn(`price ${need.asset}@${need.ts}: ${(e as Error).message}`);
    }
  }
  const sortedCache = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFile(PRICES_FILE, toJson(sortedCache));
  console.log(`prices: ${needs.length} fetched (${failed} failed), ${Object.keys(cache).length} cached`);

  // Seeker Genesis Token and SKR balance gate (re-checked every run: tokens can be transferred).
  const entries: WalletEntry[] = [];
  for (const [wallet, receipts] of wallets) {
    let hasGenesis = false;
    let skrHolder = false;
    try {
      hasGenesis = await hasSeekerGenesisToken(conn, new PublicKey(wallet));
    } catch (e) {
      console.warn(`genesis ${wallet}: ${(e as Error).message}`);
    }
    try {
      skrHolder = isSkrHolder(await fetchSkrBalance(conn, new PublicKey(wallet)));
    } catch (e) {
      console.warn(`skr balance ${wallet}: ${(e as Error).message}`);
    }
    entries.push({ wallet, receipts: receipts.map((r) => withPrices(r, cache)), hasGenesis, skrHolder });
  }

  // SKR tips (rcpt:2:t: memos + registry tag; amounts from the parsed transfers).
  const tips = tipTotals(txs);
  const lb = buildLeaderboard(entries, nowSec, tips);
  writeFile(path.join(SITE_DIR, "leaderboard.json"), toJson(lb));
  writeFile(path.join(SITE_DIR, "index.html"), renderLeaderboardHtml(lb));
  writeFile(path.join(SITE_DIR, ".nojekyll"), "");
  for (const e of entries) {
    const profile = walletProfile(e.wallet, e.receipts, e.hasGenesis, nowSec, {
      skrHolder: e.skrHolder,
      tips: tips.get(e.wallet),
    });
    writeFile(path.join(SITE_DIR, "u", `${e.wallet}.json`), toJson(profile));
    writeFile(path.join(SITE_DIR, "u", `${e.wallet}.html`), renderProfileHtml(profile));
  }
  console.log(
    `site: ${entries.length} wallets, overall ${lb.overall.length}, SKR Daily ${lb.skrDaily.length}, tipped ${lb.appreciated.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
