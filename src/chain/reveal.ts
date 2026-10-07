import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { CallV2 } from "../core/call";
import { callFromJson, callV2FromJson } from "../core/format";
import { encodeRevealMemo, encodeRevealMemoV2 } from "../core/memo";
import { statusOf, statusOfV2, type Receipt, type ReceiptV2 } from "../core/score";
import { recoverCall } from "../core/secret";
import { loadSecret, saveSecret, type KeyValueStore } from "../storage/secrets";
import { buildMemoTransaction } from "./memoTx";

/** Everything the reveal flow touches, injected like SealDeps. */
export interface RevealDeps {
  signer: PublicKey;
  store: KeyValueStore;
  nowSec(): number;
  getLatestBlockhash(): Promise<{ blockhash: string; slot: number }>;
  signAndSend(tx: VersionedTransaction, minContextSlot: number): Promise<string>;
}

/** Reveal is offered only in [deadline, deadline + 24 h), not yet revealed, with the secret on this phone. */
export function canReveal(receipt: Receipt, hasSecret: boolean, nowSec: number): boolean {
  return hasSecret && statusOf(receipt, nowSec) === "awaiting_reveal";
}

/**
 * Send the reveal memo (call JSON + salt) for a sealed receipt. Never deletes the secret:
 * the user may need to retry, and history.ts decides which reveal counts.
 */
export async function revealReceipt(deps: RevealDeps, receipt: Receipt): Promise<{ signature: string }> {
  if (statusOf(receipt, deps.nowSec()) !== "awaiting_reveal") {
    throw new Error("Reveal is not open for this receipt");
  }
  const secret = await loadSecret(deps.store, receipt.hash);
  if (!secret) throw new Error("No secret for this receipt on this phone");
  const call = callFromJson(secret.json);
  if (!call || call.deadline !== receipt.deadline) {
    throw new Error("Stored call deadline does not match the commit");
  }
  const memo = encodeRevealMemo(secret.json, secret.salt);
  const { blockhash, slot } = await deps.getLatestBlockhash();
  const tx = buildMemoTransaction({ signer: deps.signer, memo, recentBlockhash: blockhash });
  return { signature: await deps.signAndSend(tx, slot) };
}

export interface RevealV2Deps extends RevealDeps {
  /** Derived master key for recovery when nothing is stored locally; null if unknown. */
  master: Uint8Array | null;
}

export interface FoundSecretV2 {
  call: CallV2;
  json: string;
  salt: string;
  /** True when rebuilt from the master (nothing usable was stored on this phone). */
  recovered: boolean;
}

/** v2 reveal is offered only in [deadline, deadline + 24 h), not yet revealed, and not an overlap. */
export function canRevealV2(receipt: ReceiptV2, nowSec: number): boolean {
  return statusOfV2(receipt, nowSec) === "awaiting_reveal";
}

/**
 * The call behind a v2 commit: the locally stored secret if it is a v2 call with the commit's
 * deadline and asset, else recovered from `master` (then cached locally). Null if neither works.
 */
export async function findSecretV2(
  store: KeyValueStore,
  receipt: ReceiptV2,
  master: Uint8Array | null,
): Promise<FoundSecretV2 | null> {
  const stored = await loadSecret(store, receipt.hash);
  const call = stored ? callV2FromJson(stored.json) : null;
  if (stored && call && call.deadline === receipt.deadline && call.asset === receipt.asset)
    return { call, json: stored.json, salt: stored.salt, recovered: false };
  if (!master) return null;
  const found = recoverCall(master, receipt, receipt.commit.blockTime);
  if (!found) return null;
  await saveSecret(store, receipt.hash, { json: found.json, salt: found.salt });
  return { ...found, recovered: true };
}

/** Send the tagged v2 reveal memo, recovering the call from the master when needed. */
export async function revealReceiptV2(
  deps: RevealV2Deps,
  receipt: ReceiptV2,
): Promise<{ signature: string; recovered: boolean }> {
  if (!canRevealV2(receipt, deps.nowSec())) throw new Error("Reveal is not open for this receipt");
  const secret = await findSecretV2(deps.store, receipt, deps.master);
  if (!secret) throw new Error("No secret for this receipt: not stored here and not recoverable with this wallet");
  const memo = encodeRevealMemoV2(secret.json, secret.salt);
  const { blockhash, slot } = await deps.getLatestBlockhash();
  const tx = buildMemoTransaction({ signer: deps.signer, memo, recentBlockhash: blockhash });
  return { signature: await deps.signAndSend(tx, slot), recovered: secret.recovered };
}
