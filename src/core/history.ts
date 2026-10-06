/** Builds receipts from a wallet's on-chain memo history. Pure TS: no RN/Expo imports. */
import { decodeMemo, type CommitMemo, type RevealMemo } from "./memo";
import { REVEAL_GRACE_SEC, type Receipt } from "./score";

/** One memo-carrying transaction, as extracted by src/chain/fetchHistory.ts. */
export interface MemoTx {
  signature: string;
  /** Unix seconds; null when the RPC does not know it (such tx is ignored). */
  blockTime: number | null;
  signer: string;
  memo: string;
  failed: boolean;
}

type Dated<M> = M & { signature: string; blockTime: number };

/**
 * Receipts of `wallet`, newest commit first. Rules:
 * - failed txs, txs without blockTime and txs not signed by `wallet` are ignored;
 * - a commit landing after its own deadline is ignored; of duplicate commits the earliest wins;
 * - a reveal is valid only if its hash matches json + salt (checked by the decoder), a commit by
 *   the same wallet exists with the same deadline as the call, and it lands between the commit and
 *   deadline + REVEAL_GRACE_SEC (a late reveal cannot undo a forfeit); the earliest valid one wins.
 */
export function buildReceipts(txs: readonly MemoTx[], wallet: string): Receipt[] {
  const commits: Dated<CommitMemo>[] = [];
  const reveals: Dated<RevealMemo>[] = [];
  for (const tx of txs) {
    if (tx.failed || tx.signer !== wallet || tx.blockTime == null || !Number.isFinite(tx.blockTime)) continue;
    const m = decodeMemo(tx.memo);
    if (!m) continue;
    const dated = { ...m, signature: tx.signature, blockTime: tx.blockTime };
    if (dated.kind === "commit") commits.push(dated);
    else reveals.push(dated);
  }
  const byTime = (a: { blockTime: number }, b: { blockTime: number }) => a.blockTime - b.blockTime;
  commits.sort(byTime);
  reveals.sort(byTime);

  const receipts = new Map<string, Receipt>();
  for (const c of commits) {
    if (c.blockTime > c.deadline || receipts.has(c.hash)) continue;
    receipts.set(c.hash, {
      hash: c.hash,
      deadline: c.deadline,
      commit: { signature: c.signature, blockTime: c.blockTime },
    });
  }

  for (const r of reveals) {
    const receipt = receipts.get(r.hash);
    if (!receipt || receipt.reveal) continue;
    if (r.call.deadline !== receipt.deadline) continue;
    if (r.blockTime < receipt.commit.blockTime || r.blockTime >= receipt.deadline + REVEAL_GRACE_SEC) continue;
    receipt.reveal = { signature: r.signature, blockTime: r.blockTime, call: r.call, json: r.json, salt: r.salt };
  }

  return [...receipts.values()].sort((a, b) => b.commit.blockTime - a.commit.blockTime);
}
