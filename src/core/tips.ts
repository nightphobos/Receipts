/**
 * "Most tipped": SKR tips aggregated from registry txs (spec "SKR integration v2" §3).
 * Pure TS: no RN/Expo imports. Amounts come from the parsed token transfer (MemoTx.tip), never the memo.
 */
import type { MemoTx } from "./history";
import { SKR_MINT, parseTipMemo } from "./tip";

export interface TipTotal {
  wallet: string;
  /** Sum of received tips, whole SKR. */
  tipsSkr: number;
  /** Distinct tipping wallets. */
  tippers: number;
  tipsCount: number;
}

export interface AppreciatedRow {
  wallet: string;
  tipsSkr: number;
  tippers: number;
}

/** Top list length of `Leaderboard.appreciated`. */
export const APPRECIATED_TOP = 20;

/**
 * Per recipient totals. A tx counts once (by signature) when it succeeded, is tagged, has a
 * blockTime, carries `rcpt:2:t:<R>`, and its parsed transfer is SKR, from the signer, to R ≠ signer,
 * with a positive amount.
 */
export function tipTotals(txs: readonly MemoTx[]): Map<string, TipTotal> {
  const seen = new Set<string>();
  const acc = new Map<string, { sum: number; tippers: Set<string>; count: number }>();
  for (const tx of txs) {
    if (tx.failed || tx.tagged !== true || tx.blockTime == null || !tx.tip || seen.has(tx.signature)) continue;
    const to = parseTipMemo(tx.memo);
    const t = tx.tip;
    if (!to || t.mint !== SKR_MINT || t.from !== tx.signer || t.to !== to || to === tx.signer) continue;
    if (!Number.isFinite(t.amount) || t.amount <= 0) continue;
    seen.add(tx.signature);
    const a = acc.get(to) ?? { sum: 0, tippers: new Set<string>(), count: 0 };
    a.sum += t.amount;
    a.tippers.add(t.from);
    a.count++;
    acc.set(to, a);
  }
  const out = new Map<string, TipTotal>();
  for (const wallet of [...acc.keys()].sort()) {
    const a = acc.get(wallet)!;
    // Round away float noise of summed 6-decimal amounts.
    out.set(wallet, { wallet, tipsSkr: Math.round(a.sum * 1e6) / 1e6, tippers: a.tippers.size, tipsCount: a.count });
  }
  return out;
}

/** Top `limit` recipients by tipsSkr desc, then tippers desc, then wallet asc. */
export function mostAppreciated(totals: ReadonlyMap<string, TipTotal>, limit = APPRECIATED_TOP): AppreciatedRow[] {
  return [...totals.values()]
    .sort(
      (a, b) =>
        b.tipsSkr - a.tipsSkr || b.tippers - a.tippers || (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0),
    )
    .slice(0, limit)
    .map(({ wallet, tipsSkr, tippers }) => ({ wallet, tipsSkr, tippers }));
}
