/** Builds receipts from a wallet's on-chain memo history. Pure TS: no RN/Expo imports. */
import {
  decodeMemo,
  decodeMemoV2,
  type CommitMemo,
  type CommitMemoV2,
  type RevealMemo,
  type RevealMemoV2,
} from "./memo";
import { horizonClass, REVEAL_GRACE_SEC, type AnyReceipt, type Receipt, type ReceiptV2 } from "./score";

/** One memo-carrying transaction, as extracted by src/chain/fetchHistory.ts. */
export interface MemoTx {
  signature: string;
  /** Unix seconds; null when the RPC does not know it (such tx is ignored). */
  blockTime: number | null;
  signer: string;
  memo: string;
  failed: boolean;
  /** Tx account keys include REGISTRY (v2 indexing tag). Missing = untagged. */
  tagged?: boolean;
  /**
   * Only on `rcpt:2:t:` memos: the tx's SPL token transfer from the signer to the memo's recipient
   * (amount in whole tokens, from the parsed instruction). Missing = no such transfer found.
   */
  tip?: { mint: string; from: string; to: string; amount: number };
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

/**
 * v2 receipts of `wallet`, newest commit first. Same rules as `buildReceipts`, plus:
 * - only tagged txs count (commit and reveal), so the result equals what the registry indexer sees;
 * - a reveal must keep the commit's deadline and asset;
 * - one open position per (asset, horizon class): in (blockTime, signature) order, a commit landing
 *   before the deadline of an earlier non-overlap commit of the same asset + class is an overlap.
 */
export function buildReceiptsV2(txs: readonly MemoTx[], wallet: string): ReceiptV2[] {
  const commits: Dated<CommitMemoV2>[] = [];
  const reveals: Dated<RevealMemoV2>[] = [];
  for (const tx of txs) {
    if (tx.failed || tx.tagged !== true || tx.signer !== wallet) continue;
    if (tx.blockTime == null || !Number.isFinite(tx.blockTime)) continue;
    const m = decodeMemoV2(tx.memo);
    if (!m) continue;
    const dated = { ...m, signature: tx.signature, blockTime: tx.blockTime };
    if (dated.kind === "commit") commits.push(dated);
    else reveals.push(dated);
  }
  const order = (a: { blockTime: number; signature: string }, b: { blockTime: number; signature: string }) =>
    a.blockTime - b.blockTime || (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0);
  commits.sort(order);
  reveals.sort(order);

  const receipts = new Map<string, ReceiptV2>();
  const positions: ReceiptV2[] = [];
  for (const c of commits) {
    if (c.blockTime > c.deadline || receipts.has(c.hash)) continue;
    const horizon = horizonClass(c.blockTime, c.deadline);
    const overlap = positions.some((p) => p.asset === c.asset && p.horizon === horizon && c.blockTime < p.deadline);
    const r: ReceiptV2 = {
      v: 2,
      hash: c.hash,
      asset: c.asset,
      deadline: c.deadline,
      horizon,
      commit: { signature: c.signature, blockTime: c.blockTime },
      overlap,
    };
    receipts.set(c.hash, r);
    if (!overlap) positions.push(r);
  }

  for (const r of reveals) {
    const receipt = receipts.get(r.hash);
    if (!receipt || receipt.reveal) continue;
    if (r.call.deadline !== receipt.deadline || r.call.asset !== receipt.asset) continue;
    if (r.blockTime < receipt.commit.blockTime || r.blockTime >= receipt.deadline + REVEAL_GRACE_SEC) continue;
    receipt.reveal = { signature: r.signature, blockTime: r.blockTime, call: r.call, json: r.json, salt: r.salt };
  }

  return [...receipts.values()].sort((a, b) => b.commit.blockTime - a.commit.blockTime);
}

/** v2 receipts plus v1 receipts marked legacy, newest commit first. */
export function buildHistory(txs: readonly MemoTx[], wallet: string): AnyReceipt[] {
  const legacy = buildReceipts(txs, wallet).map((r): AnyReceipt => ({ ...r, v: 1 }));
  return [...buildReceiptsV2(txs, wallet), ...legacy].sort((a, b) => b.commit.blockTime - a.commit.blockTime);
}
