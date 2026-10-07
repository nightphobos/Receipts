/** Receipt statuses, resolution against Pyth and profile stats. Pure TS: no RN/Expo imports. */
import type { Asset, Call, CallV2, DirectionV2 } from "./call";

/** After the deadline the caller has 24 h to reveal; then the call is forfeited (= miss). */
export const REVEAL_GRACE_SEC = 24 * 3600;

export type Outcome = "hit" | "miss";
export type Status = "sealed" | "awaiting_reveal" | "forfeited" | "unresolved" | Outcome;

export interface TxRef {
  signature: string;
  /** Unix seconds from the transaction's blockTime. */
  blockTime: number;
}

/**
 * One sealed call as read from chain. `reveal` is present only for a valid reveal
 * (validity is decided by history.ts). `priceAtDeadline`: Pyth price at `deadline`,
 * undefined/null while not fetched or not available yet.
 */
export interface Receipt {
  hash: string;
  /** Deadline from the commit memo. */
  deadline: number;
  commit: TxRef;
  reveal?: TxRef & { call: Call; json: string; salt: string };
  priceAtDeadline?: number | null;
}

/** Strict compare: `above` needs price > target, `below` needs price < target; equal = miss. */
export function resolve(call: Call, priceAtDeadline: number): Outcome {
  if (!Number.isFinite(priceAtDeadline) || priceAtDeadline <= 0) throw new Error("Invalid price");
  const hit = call.dir === "above" ? priceAtDeadline > call.target : priceAtDeadline < call.target;
  return hit ? "hit" : "miss";
}

export function statusOf(receipt: Receipt, nowSec: number): Status {
  if (receipt.reveal) {
    const p = receipt.priceAtDeadline;
    return p == null ? "unresolved" : resolve(receipt.reveal.call, p);
  }
  if (nowSec < receipt.deadline) return "sealed";
  if (nowSec < receipt.deadline + REVEAL_GRACE_SEC) return "awaiting_reveal";
  return "forfeited";
}

export interface Stats {
  total: number;
  hits: number;
  misses: number;
  forfeited: number;
  /** sealed + awaiting_reveal + unresolved. */
  pending: number;
  /** hits / (hits + misses + forfeited); null when nothing is scored yet. */
  hitRate: number | null;
}

export function stats(receipts: readonly Receipt[], nowSec: number): Stats {
  const s: Stats = { total: receipts.length, hits: 0, misses: 0, forfeited: 0, pending: 0, hitRate: null };
  for (const r of receipts) {
    const st = statusOf(r, nowSec);
    if (st === "hit") s.hits++;
    else if (st === "miss") s.misses++;
    else if (st === "forfeited") s.forfeited++;
    else s.pending++;
  }
  const scored = s.hits + s.misses + s.forfeited;
  s.hitRate = scored === 0 ? null : s.hits / scored;
  return s;
}

// ---------------------------------------------------------------------------------------------
// v2: up/down vs the price at commit (spec "v2"). The v1 API above is legacy.

/** Horizon class from `deadline − commit blockTime`: ≤ 2 h → 1h, ≤ 36 h → 24h, ≤ 4 d → 3d, else 7d. */
export type HorizonClass = "1h" | "24h" | "3d" | "7d";

export function horizonClass(commitBlockTime: number, deadline: number): HorizonClass {
  const d = deadline - commitBlockTime;
  if (d <= 2 * 3600) return "1h";
  if (d <= 36 * 3600) return "24h";
  if (d <= 4 * 86400) return "3d";
  return "7d";
}

export type OutcomeV2 = "hit" | "miss" | "void";
export type StatusV2 =
  | "sealed"
  | "awaiting_reveal"
  | "unresolved"
  | "forfeited"
  | "overlap"
  | "legacy"
  | OutcomeV2;

/**
 * A v2 receipt as built by history.ts from tagged txs. `overlap`: committed while an earlier
 * position of the same wallet + asset + horizon class was still before its deadline (= MISS).
 * `p0` = priceAt(asset, refTimeForCommit(commit.blockTime)), `pt` = priceAt(asset, deadline);
 * undefined/null while not fetched or not available yet.
 */
export interface ReceiptV2 {
  v: 2;
  hash: string;
  asset: Asset;
  /** Deadline from the commit memo. */
  deadline: number;
  horizon: HorizonClass;
  commit: TxRef;
  overlap: boolean;
  reveal?: TxRef & { call: CallV2; json: string; salt: string };
  p0?: number | null;
  pt?: number | null;
}

/** A v1 receipt, shown as "legacy" and excluded from v2 stats and the leaderboard. */
export type LegacyReceipt = Receipt & { v: 1 };
export type AnyReceipt = ReceiptV2 | LegacyReceipt;

const validPrice = (p: number) => Number.isFinite(p) && p > 0;

/** HIT if (up and PT > P0) or (down and PT < P0); VOID if PT == P0; else MISS. */
export function resolveV2(dir: DirectionV2, p0: number, pt: number): OutcomeV2 {
  if (!validPrice(p0) || !validPrice(pt)) throw new Error("Invalid price");
  if (pt === p0) return "void";
  return (dir === "up") === pt > p0 ? "hit" : "miss";
}

export function statusOfV2(r: AnyReceipt, nowSec: number): StatusV2 {
  if (r.v === 1) return "legacy";
  if (r.overlap) return "overlap";
  if (r.reveal) {
    if (r.p0 == null || r.pt == null) return "unresolved";
    return resolveV2(r.reveal.call.dir, r.p0, r.pt);
  }
  if (nowSec < r.deadline) return "sealed";
  if (nowSec < r.deadline + REVEAL_GRACE_SEC) return "awaiting_reveal";
  return "forfeited";
}

/** z = (H − M) / √N with N = H + M; null when N = 0. */
export function zScore(hits: number, misses: number): number | null {
  const n = hits + misses;
  return n === 0 ? null : (hits - misses) / Math.sqrt(n);
}

export interface StatsV2 {
  total: number;
  hits: number;
  /** Revealed misses + forfeited + overlaps. */
  misses: number;
  /** "hidden & forfeited". */
  forfeited: number;
  overlaps: number;
  /** PT == P0; excluded from every count below. */
  voids: number;
  /** sealed + awaiting_reveal + unresolved. */
  pending: number;
  legacy: number;
  /** hits + misses. */
  n: number;
  hitRate: number | null;
  z: number | null;
}

/** `leaderboard: true` drops 1h practice calls (they never count for the leaderboard). */
export function statsV2(receipts: readonly AnyReceipt[], nowSec: number, opts: { leaderboard?: boolean } = {}): StatsV2 {
  const s: StatsV2 = {
    total: 0,
    hits: 0,
    misses: 0,
    forfeited: 0,
    overlaps: 0,
    voids: 0,
    pending: 0,
    legacy: 0,
    n: 0,
    hitRate: null,
    z: null,
  };
  for (const r of receipts) {
    if (opts.leaderboard && r.v === 2 && r.horizon === "1h") continue;
    s.total++;
    const st = statusOfV2(r, nowSec);
    if (st === "hit") s.hits++;
    else if (st === "miss") s.misses++;
    else if (st === "forfeited") (s.forfeited++, s.misses++);
    else if (st === "overlap") (s.overlaps++, s.misses++);
    else if (st === "void") s.voids++;
    else if (st === "legacy") s.legacy++;
    else s.pending++;
  }
  s.n = s.hits + s.misses;
  s.hitRate = s.n === 0 ? null : s.hits / s.n;
  s.z = zScore(s.hits, s.misses);
  return s;
}

export const LEADERBOARD_MIN_N = 10;
export const LEADERBOARD_MIN_DAYS = 3;

/** UTC day number of a unix time. */
export const utcDay = (ts: number): number => Math.floor(ts / 86400);

const SCORED: ReadonlySet<StatusV2> = new Set(["hit", "miss", "forfeited", "overlap"]);

export interface Eligibility {
  eligible: boolean;
  /** Resolved (scored) calls with horizon ≥ 24h. */
  n: number;
  /** Distinct UTC days of the commits of those calls. */
  days: number;
  hasGenesis: boolean;
  /** SKR balance ≥ SKR_GATE_MIN (src/core/tip.ts). */
  skrHolder: boolean;
}

/**
 * Leaderboard: N ≥ 10 resolved ≥ 24h calls, commits on ≥ 3 distinct UTC days, and a Seeker Genesis
 * Token held or an SKR balance ≥ SKR_GATE_MIN.
 */
export function eligibility(
  receipts: readonly AnyReceipt[],
  nowSec: number,
  hasGenesis: boolean,
  skrHolder = false,
): Eligibility {
  let n = 0;
  const days = new Set<number>();
  for (const r of receipts) {
    if (r.v !== 2 || r.horizon === "1h" || !SCORED.has(statusOfV2(r, nowSec))) continue;
    n++;
    days.add(utcDay(r.commit.blockTime));
  }
  return {
    eligible: n >= LEADERBOARD_MIN_N && days.size >= LEADERBOARD_MIN_DAYS && (hasGenesis || skrHolder),
    n,
    days: days.size,
    hasGenesis,
    skrHolder,
  };
}

/**
 * Consecutive UTC days with at least one v2 seal or reveal, ending today — or yesterday when
 * today has no activity yet (the streak only breaks once a whole day passes empty).
 */
export function streak(receipts: readonly AnyReceipt[], nowSec: number): number {
  const days = new Set<number>();
  for (const r of receipts) {
    if (r.v !== 2) continue;
    days.add(utcDay(r.commit.blockTime));
    if (r.reveal) days.add(utcDay(r.reveal.blockTime));
  }
  let d = utcDay(nowSec);
  if (!days.has(d)) d--;
  let count = 0;
  while (days.has(d)) (count++, d--);
  return count;
}

/** True when a new `asset` call of class `horizon` sealed now would be an overlap (UI disables Seal). */
export function hasOpenPosition(
  receipts: readonly AnyReceipt[],
  asset: Asset,
  horizon: HorizonClass,
  nowSec: number,
): boolean {
  return receipts.some(
    (r) => r.v === 2 && !r.overlap && r.asset === asset && r.horizon === horizon && nowSec < r.deadline,
  );
}
