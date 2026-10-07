/**
 * Global leaderboard aggregation, shared by scripts/indexer.ts and the app (T040).
 * Pure TS: no RN/Expo imports; RPC, prices and clock are handled by the caller.
 */
import type { Asset, DirectionV2 } from "./call";
import { buildReceiptsV2, type MemoTx } from "./history";
import { refTimeForCommit } from "./price";
import {
  eligibility,
  statsV2,
  statusOfV2,
  streak,
  utcDay,
  type Eligibility,
  type HorizonClass,
  type ReceiptV2,
  type StatsV2,
  type StatusV2,
} from "./score";
import { mostAppreciated, type AppreciatedRow, type TipTotal } from "./tips";

/** Bumped when the JSON shape of site/leaderboard.json or site/u/<wallet>.json changes. */
export const LEADERBOARD_VERSION = 2;

/** A price is only fetched once its timestamp is this old (sources need a moment to settle). */
export const PRICE_SETTLE_SEC = 60;

/** Permanent price cache: `priceKey(asset, ts)` → price. Only resolved (non-null) prices are stored. */
export type PriceCache = Record<string, number>;

export const priceKey = (asset: Asset, ts: number): string => `${asset}:${ts}`;

/** Registry txs (all wallets) → v2 receipts per signer, wallets in sorted order. */
export function receiptsByWallet(txs: readonly MemoTx[]): Map<string, ReceiptV2[]> {
  const bySigner = new Map<string, MemoTx[]>();
  for (const tx of txs) {
    const list = bySigner.get(tx.signer);
    if (list) list.push(tx);
    else bySigner.set(tx.signer, [tx]);
  }
  const out = new Map<string, ReceiptV2[]>();
  for (const wallet of [...bySigner.keys()].sort()) {
    const receipts = buildReceiptsV2(bySigner.get(wallet)!, wallet);
    if (receipts.length > 0) out.set(wallet, receipts);
  }
  return out;
}

export interface PriceNeed {
  asset: Asset;
  ts: number;
}

/** Prices to fetch: P0 of every commit, PT of every revealed call; deduped, settled by `nowSec`. */
export function pricesNeeded(receipts: readonly ReceiptV2[], nowSec: number): PriceNeed[] {
  const seen = new Set<string>();
  const out: PriceNeed[] = [];
  const add = (asset: Asset, ts: number) => {
    const key = priceKey(asset, ts);
    if (ts + PRICE_SETTLE_SEC > nowSec || seen.has(key)) return;
    seen.add(key);
    out.push({ asset, ts });
  };
  for (const r of receipts) {
    add(r.asset, refTimeForCommit(r.commit.blockTime));
    if (r.reveal) add(r.asset, r.deadline);
  }
  return out;
}

/** Copy of `r` with p0 (always) and pt (revealed only) from the cache; null when not cached. */
export function withPrices(r: ReceiptV2, cache: Readonly<PriceCache>): ReceiptV2 {
  const p0 = cache[priceKey(r.asset, refTimeForCommit(r.commit.blockTime))] ?? null;
  const pt = r.reveal ? (cache[priceKey(r.asset, r.deadline)] ?? null) : null;
  return { ...r, p0, pt };
}

const DAY = 86400;
const NOON = 12 * 3600;

/** SKR Daily Call: SKR, deadline at 12:00 UTC, at least 12 h after the commit, 24h class. */
export function isSkrDaily(r: ReceiptV2): boolean {
  return (
    r.asset === "SKR" &&
    r.deadline % DAY === NOON &&
    r.deadline - r.commit.blockTime >= NOON &&
    r.horizon === "24h"
  );
}

/** SKR Daily calls that keep a streak alive: everything except forfeited and overlap (VOID keeps it). */
function skrDailyDays(receipts: readonly ReceiptV2[], nowSec: number): Set<number> {
  const days = new Set<number>();
  for (const r of receipts) {
    if (r.overlap || !isSkrDaily(r)) continue;
    if (statusOfV2(r, nowSec) === "forfeited") continue;
    days.add(utcDay(r.commit.blockTime));
  }
  return days;
}

/** Forfeited SKR Daily days: they break a run even if another call landed the same day. */
function forfeitedSkrDailyDays(receipts: readonly ReceiptV2[], nowSec: number): Set<number> {
  const days = new Set<number>();
  for (const r of receipts)
    if (!r.overlap && isSkrDaily(r) && statusOfV2(r, nowSec) === "forfeited") days.add(utcDay(r.commit.blockTime));
  return days;
}

/**
 * SKR Daily streak: consecutive UTC commit days with a kept SKR Daily call (sealed, revealed or still
 * revealable — a forfeited one breaks the streak, a VOID does not), ending today, or yesterday while
 * today's SKR Daily is not sealed yet. Every SKR Daily sealed on day d shares the deadline d+1 12:00 UTC.
 */
export function skrDailyStreak(receipts: readonly ReceiptV2[], nowSec: number): number {
  const days = skrDailyDays(receipts, nowSec);
  const broken = forfeitedSkrDailyDays(receipts, nowSec);
  let d = utcDay(nowSec);
  if (!days.has(d)) d--;
  let count = 0;
  while (days.has(d) && !broken.has(d)) (count++, d--);
  return count;
}

/** Longest SKR Daily streak ever (same rules as skrDailyStreak). */
export function bestSkrDailyStreak(receipts: readonly ReceiptV2[], nowSec: number): number {
  const broken = forfeitedSkrDailyDays(receipts, nowSec);
  const days = [...skrDailyDays(receipts, nowSec)].filter((d) => !broken.has(d)).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export interface WalletEntry {
  wallet: string;
  /** With p0/pt filled (see withPrices). */
  receipts: ReceiptV2[];
  hasGenesis: boolean;
  /** SKR balance ≥ SKR_GATE_MIN. Missing = false. */
  skrHolder?: boolean;
}

export interface LeaderboardRow {
  rank: number;
  wallet: string;
  z: number | null;
  n: number;
  hits: number;
  misses: number;
  hitRate: number | null;
  forfeited: number;
  overlaps: number;
  voids: number;
  /** Distinct UTC commit days of the scored calls. */
  days: number;
  /** General streak on OVERALL rows; SKR Daily streak on SKR DAILY rows. */
  streak: number;
  /** SKR DAILY rows only: longest SKR Daily streak. */
  bestStreak?: number;
  /** Received SKR tips, whole SKR. */
  tipsSkr: number;
}

export interface Leaderboard {
  version: number;
  generatedAt: number;
  /** Wallets with at least one v2 receipt. */
  wallets: number;
  /** Eligible wallets only (≥ 24h calls, N ≥ 10, ≥ 3 UTC days, Seeker Genesis Token or SKR ≥ gate). */
  overall: LeaderboardRow[];
  /** Genesis or SKR holders with at least one scored SKR Daily call, over SKR Daily calls only. */
  skrDaily: LeaderboardRow[];
  /** "Most tipped": top recipients of SKR tips (any wallet, receipts not required). */
  appreciated: AppreciatedRow[];
}

const SCORED: ReadonlySet<StatusV2> = new Set(["hit", "miss", "forfeited", "overlap"]);

function row(
  wallet: string,
  receipts: readonly ReceiptV2[],
  all: readonly ReceiptV2[],
  nowSec: number,
  tipsSkr: number,
): LeaderboardRow {
  const s = statsV2(receipts, nowSec, { leaderboard: true });
  const days = new Set(
    receipts.filter((r) => r.horizon !== "1h" && SCORED.has(statusOfV2(r, nowSec))).map((r) => utcDay(r.commit.blockTime)),
  );
  return {
    rank: 0,
    wallet,
    z: s.z,
    n: s.n,
    hits: s.hits,
    misses: s.misses,
    hitRate: s.hitRate,
    forfeited: s.forfeited,
    overlaps: s.overlaps,
    voids: s.voids,
    days: days.size,
    streak: streak(all, nowSec),
    tipsSkr,
  };
}

/** z desc (null last), then N desc, then wallet asc; ranks 1..n. */
function ranked(rows: LeaderboardRow[]): LeaderboardRow[] {
  rows.sort(
    (a, b) =>
      (b.z ?? -Infinity) - (a.z ?? -Infinity) || b.n - a.n || (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0),
  );
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** `tips`: tipTotals of the registry txs (src/core/tips.ts); missing = no tips. */
export function buildLeaderboard(
  entries: readonly WalletEntry[],
  nowSec: number,
  tips: ReadonlyMap<string, TipTotal> = new Map(),
): Leaderboard {
  const overall: LeaderboardRow[] = [];
  const skrDaily: LeaderboardRow[] = [];
  for (const e of entries) {
    const tipped = tips.get(e.wallet)?.tipsSkr ?? 0;
    const holder = e.skrHolder === true;
    if (eligibility(e.receipts, nowSec, e.hasGenesis, holder).eligible)
      overall.push(row(e.wallet, e.receipts, e.receipts, nowSec, tipped));
    if (!e.hasGenesis && !holder) continue;
    const daily = row(e.wallet, e.receipts.filter(isSkrDaily), e.receipts, nowSec, tipped);
    if (daily.n === 0) continue;
    daily.streak = skrDailyStreak(e.receipts, nowSec);
    daily.bestStreak = bestSkrDailyStreak(e.receipts, nowSec);
    skrDaily.push(daily);
  }
  return {
    version: LEADERBOARD_VERSION,
    generatedAt: nowSec,
    wallets: entries.length,
    overall: ranked(overall),
    skrDaily: ranked(skrDaily),
    appreciated: mostAppreciated(tips),
  };
}

export interface ProfileReceipt {
  hash: string;
  asset: Asset;
  horizon: HorizonClass;
  skrDaily: boolean;
  deadline: number;
  commitSignature: string;
  commitBlockTime: number;
  overlap: boolean;
  status: StatusV2;
  /** Only once revealed. */
  dir?: DirectionV2;
  revealSignature?: string;
  revealBlockTime?: number;
  p0: number | null;
  pt: number | null;
}

export interface WalletProfile {
  version: number;
  generatedAt: number;
  wallet: string;
  hasGenesis: boolean;
  /** SKR balance ≥ SKR_GATE_MIN at generation time. */
  skrHolder: boolean;
  /** Personal stats (1h practice included). */
  stats: StatsV2;
  /** Leaderboard stats (1h practice excluded). */
  leaderboardStats: StatsV2;
  eligibility: Eligibility;
  streak: number;
  skrDailyStreak: number;
  bestSkrDailyStreak: number;
  /** Received SKR tips. */
  tips: { tipsSkr: number; tippers: number; tipsCount: number };
  /** Newest commit first. */
  receipts: ProfileReceipt[];
}

export function walletProfile(
  wallet: string,
  receipts: readonly ReceiptV2[],
  hasGenesis: boolean,
  nowSec: number,
  extra: { skrHolder?: boolean; tips?: TipTotal } = {},
): WalletProfile {
  const sorted = [...receipts].sort((a, b) => b.commit.blockTime - a.commit.blockTime);
  const skrHolder = extra.skrHolder === true;
  const t = extra.tips;
  return {
    version: LEADERBOARD_VERSION,
    generatedAt: nowSec,
    wallet,
    hasGenesis,
    skrHolder,
    stats: statsV2(sorted, nowSec),
    leaderboardStats: statsV2(sorted, nowSec, { leaderboard: true }),
    eligibility: eligibility(sorted, nowSec, hasGenesis, skrHolder),
    streak: streak(sorted, nowSec),
    skrDailyStreak: skrDailyStreak(sorted, nowSec),
    bestSkrDailyStreak: bestSkrDailyStreak(sorted, nowSec),
    tips: { tipsSkr: t?.tipsSkr ?? 0, tippers: t?.tippers ?? 0, tipsCount: t?.tipsCount ?? 0 },
    receipts: sorted.map((r) => ({
      hash: r.hash,
      asset: r.asset,
      horizon: r.horizon,
      skrDaily: isSkrDaily(r),
      deadline: r.deadline,
      commitSignature: r.commit.signature,
      commitBlockTime: r.commit.blockTime,
      overlap: r.overlap,
      status: statusOfV2(r, nowSec),
      ...(r.reveal
        ? { dir: r.reveal.call.dir, revealSignature: r.reveal.signature, revealBlockTime: r.reveal.blockTime }
        : {}),
      p0: r.p0 ?? null,
      pt: r.pt ?? null,
    })),
  };
}
