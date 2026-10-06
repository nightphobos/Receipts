import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { callFromJson } from "../core/format";
import { encodeRevealMemo } from "../core/memo";
import { statusOf, type Receipt } from "../core/score";
import { loadSecret, type KeyValueStore } from "../storage/secrets";
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
