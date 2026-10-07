/**
 * Where the app's Leaderboard tab gets its data (spec v2): the indexer's static files at
 * `EXPO_PUBLIC_LEADERBOARD_URL`, or — when unset — computed in-app from the registry txs with the
 * same aggregation as scripts/indexer.ts (slower, trustless). Pure TS; fetch/RPC are injected.
 */
import type { Asset } from "./call";
import type { MemoTx } from "./history";
import {
  LEADERBOARD_VERSION,
  buildLeaderboard,
  isSkrDaily,
  priceKey,
  pricesNeeded,
  receiptsByWallet,
  walletProfile,
  withPrices,
  type Leaderboard,
  type LeaderboardRow,
  type PriceCache,
  type WalletEntry,
  type WalletProfile,
} from "./leaderboard";
import { eligibility } from "./score";
import { isSkrHolder } from "./tip";
import { tipTotals } from "./tips";

export interface LeaderboardEnv {
  EXPO_PUBLIC_LEADERBOARD_URL?: string;
}

/** Base URL of the indexer site (no trailing slash), or null → compute in-app. */
export function leaderboardBaseUrl(env: LeaderboardEnv): string | null {
  const raw = env.EXPO_PUBLIC_LEADERBOARD_URL?.trim();
  if (!raw || !/^https?:\/\/\S+$/i.test(raw)) return null;
  return raw.replace(/\/leaderboard\.json$/i, "").replace(/\/+$/, "");
}

export const leaderboardUrl = (base: string): string => `${base}/leaderboard.json`;
export const profileUrl = (base: string, wallet: string): string => `${base}/u/${encodeURIComponent(wallet)}.json`;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isNumOrNull = (x: unknown) => x === null || isNum(x);

function isRow(x: unknown): x is LeaderboardRow {
  return (
    isObj(x) &&
    typeof x.wallet === "string" &&
    isNumOrNull(x.z) &&
    isNumOrNull(x.hitRate) &&
    ["rank", "n", "hits", "misses", "forfeited", "overlaps", "voids", "days", "streak", "tipsSkr"].every((k) =>
      isNum(x[k]),
    ) &&
    (x.bestStreak === undefined || isNum(x.bestStreak))
  );
}

const isAppreciated = (x: unknown) =>
  isObj(x) && typeof x.wallet === "string" && isNum(x.tipsSkr) && isNum(x.tippers);

/** Validated site/leaderboard.json of the current version, else null. */
export function parseLeaderboard(json: unknown): Leaderboard | null {
  if (!isObj(json) || json.version !== LEADERBOARD_VERSION) return null;
  if (!isNum(json.generatedAt) || !isNum(json.wallets)) return null;
  if (!Array.isArray(json.overall) || !json.overall.every(isRow)) return null;
  if (!Array.isArray(json.skrDaily) || !json.skrDaily.every(isRow)) return null;
  if (!Array.isArray(json.appreciated) || !json.appreciated.every(isAppreciated)) return null;
  return json as unknown as Leaderboard;
}

/** Validated site/u/<wallet>.json of the current version, else null (receipt rows are trusted as-is). */
export function parseWalletProfile(json: unknown): WalletProfile | null {
  if (!isObj(json) || json.version !== LEADERBOARD_VERSION) return null;
  if (typeof json.wallet !== "string" || typeof json.hasGenesis !== "boolean" || !isNum(json.generatedAt)) return null;
  if (!isObj(json.stats) || !isObj(json.leaderboardStats) || !isObj(json.eligibility) || !isNum(json.streak)) return null;
  if (typeof json.skrHolder !== "boolean" || !isNum(json.skrDailyStreak) || !isNum(json.bestSkrDailyStreak)) return null;
  if (!isObj(json.tips) || !isNum(json.tips.tipsSkr) || !isNum(json.tips.tippers) || !isNum(json.tips.tipsCount))
    return null;
  if (!Array.isArray(json.receipts) || !json.receipts.every(isObj)) return null;
  return json as unknown as WalletProfile;
}

export interface ComputeLeaderboardInput {
  /** Registry memo txs of all wallets (fetchRegistry). */
  txs: readonly MemoTx[];
  nowSec: number;
  /** priceAt(asset, ts).price; null/throw → unresolved. */
  price: (asset: Asset, ts: number) => Promise<number | null>;
  /** Seeker Genesis check; throw → treated as no Genesis. */
  hasGenesis: (wallet: string) => Promise<boolean>;
  /** Whole-SKR balance (skrBalanceOf); throw → not a holder. Missing → nobody is a holder. */
  skrBalance?: (wallet: string) => Promise<number>;
}

export interface ComputedLeaderboard {
  leaderboard: Leaderboard;
  profiles: Map<string, WalletProfile>;
}

/**
 * In-app equivalent of scripts/indexer.ts: same receipts, prices, tips and ranking. Genesis and the
 * SKR balance are only checked for wallets that could be listed (eligible apart from the gate, or
 * with an SKR Daily call).
 */
export async function computeLeaderboard(input: ComputeLeaderboardInput): Promise<ComputedLeaderboard> {
  const { txs, nowSec } = input;
  const wallets = [...receiptsByWallet(txs)];

  const cache: PriceCache = {};
  const needs = pricesNeeded(
    wallets.flatMap(([, rs]) => rs),
    nowSec,
  );
  await Promise.all(
    needs.map(async ({ asset, ts }) => {
      try {
        const p = await input.price(asset, ts);
        if (p !== null && Number.isFinite(p)) cache[priceKey(asset, ts)] = p;
      } catch {
        // unresolved
      }
    }),
  );

  const entries: WalletEntry[] = await Promise.all(
    wallets.map(async ([wallet, raw]) => {
      const receipts = raw.map((r) => withPrices(r, cache));
      const candidate = eligibility(receipts, nowSec, true).eligible || receipts.some(isSkrDaily);
      let hasGenesis = false;
      let skrHolder = false;
      if (candidate) {
        const [g, b] = await Promise.all([
          input.hasGenesis(wallet).catch(() => false),
          input.skrBalance ? input.skrBalance(wallet).catch(() => 0) : Promise.resolve(0),
        ]);
        hasGenesis = g === true;
        skrHolder = isSkrHolder(b);
      }
      return { wallet, receipts, hasGenesis, skrHolder };
    }),
  );

  const tips = tipTotals(txs);
  const profiles = new Map(
    entries.map((e) => [
      e.wallet,
      walletProfile(e.wallet, e.receipts, e.hasGenesis, nowSec, { skrHolder: e.skrHolder, tips: tips.get(e.wallet) }),
    ]),
  );
  return { leaderboard: buildLeaderboard(entries, nowSec, tips), profiles };
}
