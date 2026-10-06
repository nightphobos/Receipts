/** Commit and reveal memo encoding. Pure TS: no RN/Expo imports. */
import { utf8ToBytes } from "@noble/hashes/utils";
import { canonicalJson, isCall, type Call } from "./call";
import { commitHash, isHash, isSaltHex } from "./commit";

export const MEMO_PREFIX = "rcpt:1:";
export const MAX_MEMO_BYTES = 500;

export interface CommitMemo {
  kind: "commit";
  hash: string;
  deadline: number;
}

export interface RevealMemo {
  kind: "reveal";
  hash: string;
  /** Exact canonical JSON that was hashed. */
  json: string;
  call: Call;
  salt: string;
}

export type Memo = CommitMemo | RevealMemo;

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_RE = /^[A-Za-z0-9_-]*$/;
const UINT_RE = /^(0|[1-9][0-9]*)$/;

export const memoByteLength = (memo: string): number => utf8ToBytes(memo).length;

/** RFC 4648 §5 base64url, no padding. */
export function base64urlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < chars; j++) out += B64URL[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}

/** Strict decoder: unpadded base64url only, non-zero trailing bits rejected. Returns null if malformed. */
export function base64urlDecode(s: string): Uint8Array | null {
  if (typeof s !== "string" || !B64URL_RE.test(s) || s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let k = 0;
  for (const c of s) {
    acc = ((acc << 6) | B64URL.indexOf(c)) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[k++] = (acc >> bits) & 0xff;
    }
  }
  if ((acc & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

const fits = (memo: string) => memoByteLength(memo) <= MAX_MEMO_BYTES;

/** `rcpt:1:c:<hash>:<deadline>`. Throws on invalid input. */
export function encodeCommitMemo(hash: string, deadline: number): string {
  if (!isHash(hash)) throw new Error("Hash must be 64 lowercase hex chars");
  if (!Number.isSafeInteger(deadline) || deadline < 0) throw new Error("Deadline must be a non-negative integer");
  const memo = `${MEMO_PREFIX}c:${hash}:${deadline}`;
  if (!fits(memo)) throw new Error(`Memo exceeds ${MAX_MEMO_BYTES} bytes`);
  return memo;
}

/** `rcpt:1:r:<hash>:<base64url(json)>:<salt>`, hash computed from json + salt. Throws on invalid input. */
export function encodeRevealMemo(json: string, saltHex: string): string {
  if (!isSaltHex(saltHex)) throw new Error("Salt must be 32 lowercase hex chars");
  if (parseCanonical(json) === null) throw new Error("JSON must be a canonical call");
  const memo = `${MEMO_PREFIX}r:${commitHash(json, saltHex)}:${base64urlEncode(utf8ToBytes(json))}:${saltHex}`;
  if (!fits(memo)) throw new Error(`Memo exceeds ${MAX_MEMO_BYTES} bytes`);
  return memo;
}

/** Parses json as a Call and requires it to be exactly its canonical form. */
function parseCanonical(json: string): Call | null {
  let x: unknown;
  try {
    x = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isCall(x) || canonicalJson(x) !== json) return null;
  return x;
}

/** Splits `rcpt:1:<kind>:...` into fields, or null. */
function fields(memo: unknown, kind: "c" | "r"): string[] | null {
  if (typeof memo !== "string" || !memo.startsWith(`${MEMO_PREFIX}${kind}:`) || !fits(memo)) return null;
  return memo.slice(MEMO_PREFIX.length + 2).split(":");
}

export function decodeCommitMemo(memo: string): CommitMemo | null {
  const f = fields(memo, "c");
  if (!f || f.length !== 2) return null;
  const [hash, d] = f;
  if (!isHash(hash) || !UINT_RE.test(d)) return null;
  const deadline = Number(d);
  if (!Number.isSafeInteger(deadline)) return null;
  return { kind: "commit", hash, deadline };
}

/** Also verifies that hash = commitHash(json, salt), so a decoded reveal is self-consistent. */
export function decodeRevealMemo(memo: string): RevealMemo | null {
  const f = fields(memo, "r");
  if (!f || f.length !== 3) return null;
  const [hash, b64, salt] = f;
  if (!isHash(hash) || !isSaltHex(salt) || b64.length === 0) return null;
  const bytes = base64urlDecode(b64);
  // Canonical JSON is always ASCII, so any byte ≥ 0x80 is malformed.
  if (!bytes || bytes.some((b) => b >= 0x80)) return null;
  const json = String.fromCharCode(...bytes);
  const call = parseCanonical(json);
  if (!call || commitHash(json, salt) !== hash) return null;
  return { kind: "reveal", hash, json, call, salt };
}

export function decodeMemo(memo: string): Memo | null {
  return decodeCommitMemo(memo) ?? decodeRevealMemo(memo);
}
