import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { canonicalJson, type Call } from "../core/call";
import { commitHash, makeSalt, type RandomBytes } from "../core/commit";
import { encodeCommitMemo } from "../core/memo";
import { deleteSecret, saveSecret, type KeyValueStore } from "../storage/secrets";
import { buildMemoTransaction } from "./memoTx";

/** Everything the seal flow touches, injected so it can run in tests and in the app. */
export interface SealDeps {
  signer: PublicKey;
  store: KeyValueStore;
  randomBytes: RandomBytes;
  /** `connection.getLatestBlockhashAndContext()` → `{ blockhash: value.blockhash, slot: context.slot }`. */
  getLatestBlockhash(): Promise<{ blockhash: string; slot: number }>;
  /** MWA signAndSendTransaction(tx, minContextSlot) → signature. */
  signAndSend(tx: VersionedTransaction, minContextSlot: number): Promise<string>;
}

export interface SealResult {
  hash: string;
  signature: string;
}

/**
 * MWA errors that guarantee nothing was sent: authorization failed (-1), user declined
 * signing (-3), no wallet app installed. Anything else may have landed on chain.
 */
export function isUserRejection(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === -1 || code === -3 || code === "ERROR_WALLET_NOT_FOUND";
}

/**
 * Seal a validated call: salt → hash → save secret locally → sign & send the commit memo.
 * The secret is deleted only when the tx surely wasn't sent; on ambiguous errors it is kept
 * (an orphan secret is harmless, a lost one turns the call into a forfeit).
 */
export async function sealCall(deps: SealDeps, call: Call): Promise<SealResult> {
  const json = canonicalJson(call);
  const salt = makeSalt(deps.randomBytes);
  const hash = commitHash(json, salt);
  const memo = encodeCommitMemo(hash, call.deadline);
  await saveSecret(deps.store, hash, { json, salt });

  let tx: VersionedTransaction;
  let slot: number;
  try {
    const { blockhash, slot: s } = await deps.getLatestBlockhash();
    tx = buildMemoTransaction({ signer: deps.signer, memo, recentBlockhash: blockhash });
    slot = s;
  } catch (e) {
    await deleteSecret(deps.store, hash);
    throw e;
  }

  try {
    const signature = await deps.signAndSend(tx, slot);
    return { hash, signature };
  } catch (e) {
    if (isUserRejection(e)) await deleteSecret(deps.store, hash);
    throw e;
  }
}
