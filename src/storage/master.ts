import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { MasterDecision } from "../core/secret";

/**
 * Per-wallet v2 master key state in secure storage: key `rcpt.master.<wallet>` →
 * `derived:<64 hex>` or `random` (wallet signs non-deterministically → v1-style local salts).
 * The store is injected; the app passes an `expo-secure-store` adapter.
 */
export interface SecureKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export type MasterState = MasterDecision;

const RANDOM = "random";
const DERIVED_RE = /^derived:([0-9a-f]{64})$/;

/** SecureStore keys may only contain alphanumerics, ".", "-" and "_" (base58 addresses qualify). */
export const masterStoreKey = (wallet: string): string => `rcpt.master.${wallet}`;

export async function saveMasterState(store: SecureKeyValueStore, wallet: string, state: MasterState): Promise<void> {
  if (state.mode === "derived" && state.master.length !== 32) throw new Error("Master must be 32 bytes");
  const value = state.mode === "derived" ? `derived:${bytesToHex(state.master)}` : RANDOM;
  await store.setItemAsync(masterStoreKey(wallet), value);
}

/** Null when nothing (valid) is stored for this wallet. */
export async function loadMasterState(store: SecureKeyValueStore, wallet: string): Promise<MasterState | null> {
  const raw = await store.getItemAsync(masterStoreKey(wallet));
  if (raw === RANDOM) return { mode: "random" };
  const m = raw === null ? null : DERIVED_RE.exec(raw);
  return m ? { mode: "derived", master: hexToBytes(m[1]) } : null;
}

export async function clearMasterState(store: SecureKeyValueStore, wallet: string): Promise<void> {
  await store.deleteItemAsync(masterStoreKey(wallet));
}
