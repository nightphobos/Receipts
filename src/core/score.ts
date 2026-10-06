/** Receipt statuses, resolution against Pyth and profile stats. Pure TS: no RN/Expo imports. */
import type { Call } from "./call";

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
