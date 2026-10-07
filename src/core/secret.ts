/** v2 derived secrets: master key from a wallet signature, per-call salts, recovery. Pure TS: no RN/Expo imports. */
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { DIRECTIONS_V2, canonicalJsonV2, type Asset, type CallV2 } from "./call";
import { commitHash, isHash } from "./commit";

/** Fixed message the wallet signs once; `master = sha256(signature)`. Never change it (old salts would be lost). */
export const MASTER_MESSAGE =
  "Receipts master key v1\nSigning this lets Receipts hide and later reveal your call directions. It cannot move funds.";

/** Recovery searches `created` in [commit blockTime − 900, commit blockTime + 120]. */
export const RECOVERY_WINDOW_SEC = 900;
/**
 * Forward slack: `created` is the phone clock at tap time, `blockTime` the cluster's estimate. If the
 * phone runs ahead of the cluster clock, `created` can be a little after `blockTime`.
 */
export const RECOVERY_SLACK_SEC = 120;

const SIGNATURE_BYTES = 64;
const MASTER_BYTES = 32;

/** `sha256(signature)` of MASTER_MESSAGE. Throws on a non-64-byte or all-zero signature. */
export function masterFromSignature(signature: Uint8Array): Uint8Array {
  if (!(signature instanceof Uint8Array) || signature.length !== SIGNATURE_BYTES)
    throw new Error(`Signature must be ${SIGNATURE_BYTES} bytes`);
  if (signature.every((b) => b === 0)) throw new Error("Signature is all zeros");
  return sha256(signature);
}

const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The 64-byte ed25519 signature inside an MWA `signMessages` result: wallets return either the bare
 * signature or the message with the signature appended (or prepended). Null if it is none of these.
 */
export function signatureFromSignedPayload(signed: Uint8Array, message: Uint8Array): Uint8Array | null {
  if (signed.length === SIGNATURE_BYTES) return signed;
  if (signed.length !== message.length + SIGNATURE_BYTES) return null;
  if (equalBytes(signed.subarray(0, message.length), message)) return signed.slice(message.length);
  if (equalBytes(signed.subarray(SIGNATURE_BYTES), message)) return signed.slice(0, SIGNATURE_BYTES);
  return null;
}

/** Outcome of the determinism self-check: same signature twice → derived master, else random local salts. */
export type MasterDecision = { mode: "derived"; master: Uint8Array } | { mode: "random" };

/** Compare two signatures of MASTER_MESSAGE; any mismatch or malformed signature → `random` fallback. */
export function decideMaster(sigA: Uint8Array, sigB: Uint8Array): MasterDecision {
  if (sigA.length !== SIGNATURE_BYTES || sigB.length !== SIGNATURE_BYTES) return { mode: "random" };
  if (!equalBytes(sigA, sigB)) return { mode: "random" };
  try {
    return { mode: "derived", master: masterFromSignature(sigA) };
  } catch {
    return { mode: "random" };
  }
}

/** `hex(hmac_sha256(master, "rcpt:2|" + asset + "|" + deadline))[0..32]`. */
export function saltFor(master: Uint8Array, asset: Asset, deadline: number): string {
  if (!(master instanceof Uint8Array) || master.length !== MASTER_BYTES)
    throw new Error(`Master must be ${MASTER_BYTES} bytes`);
  if (!Number.isSafeInteger(deadline)) throw new Error("Deadline must be a whole unix timestamp");
  return bytesToHex(hmac(sha256, master, utf8ToBytes(`rcpt:2|${asset}|${deadline}`))).slice(0, 32);
}

export interface RecoveredCall {
  call: CallV2;
  json: string;
  salt: string;
}

/**
 * Rebuild a v2 call from its on-chain commit when nothing is stored locally: try every
 * `created` in [blockTime − 900, blockTime + 120] and both directions (≤ 2042 sha256). Null if none matches.
 */
export function recoverCall(
  master: Uint8Array,
  commit: { hash: string; deadline: number; asset: Asset },
  blockTime: number,
): RecoveredCall | null {
  if (!isHash(commit.hash) || !Number.isSafeInteger(blockTime) || !Number.isSafeInteger(commit.deadline))
    return null;
  const salt = saltFor(master, commit.asset, commit.deadline);
  for (let created = blockTime + RECOVERY_SLACK_SEC; created >= blockTime - RECOVERY_WINDOW_SEC; created--) {
    for (const dir of DIRECTIONS_V2) {
      const call: CallV2 = { v: 2, asset: commit.asset, dir, deadline: commit.deadline, created };
      const json = canonicalJsonV2(call);
      if (commitHash(json, salt) === commit.hash) return { call, json, salt };
    }
  }
  return null;
}
