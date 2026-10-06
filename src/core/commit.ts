/** Commit hash and salt. Pure TS: no RN/Expo imports; randomness is injected. */
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export const SALT_BYTES = 16;

/** Injected RNG: returns `n` cryptographically random bytes (expo-crypto `getRandomBytes` in the app). */
export type RandomBytes = (n: number) => Uint8Array;

const SALT_RE = /^[0-9a-f]{32}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

export const isSaltHex = (s: unknown): s is string => typeof s === "string" && SALT_RE.test(s);
export const isHash = (s: unknown): s is string => typeof s === "string" && HASH_RE.test(s);

/** 16 random bytes as 32 lowercase hex chars. Throws on a wrong-length or all-zero RNG result. */
export function makeSalt(randomBytes: RandomBytes): string {
  const bytes = randomBytes(SALT_BYTES);
  if (!(bytes instanceof Uint8Array) || bytes.length !== SALT_BYTES)
    throw new Error(`RNG must return ${SALT_BYTES} bytes`);
  if (bytes.every((b) => b === 0)) throw new Error("RNG returned all zeros");
  return bytesToHex(bytes);
}

/** `hex(sha256(utf8(canonicalJson + "|" + saltHex)))`. */
export function commitHash(json: string, saltHex: string): string {
  if (!isSaltHex(saltHex)) throw new Error("Salt must be 32 lowercase hex chars");
  return bytesToHex(sha256(utf8ToBytes(`${json}|${saltHex}`)));
}
