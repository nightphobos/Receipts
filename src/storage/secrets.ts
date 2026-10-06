import { commitHash, isHash, isSaltHex } from "../core/commit";

/**
 * Local reveal secrets: AsyncStorage key `rcpt:secret:<hash>` → `{ json, salt }`.
 * The store is injected; the app passes `AsyncStorage` directly (it satisfies this interface).
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

export interface Secret {
  json: string;
  salt: string;
}

export interface SecretEntry extends Secret {
  hash: string;
}

export const SECRET_KEY_PREFIX = "rcpt:secret:";

export const secretKey = (hash: string): string => SECRET_KEY_PREFIX + hash;

/** True when `secret` is well-formed and reveals exactly `hash`. */
function matches(hash: string, secret: unknown): secret is Secret {
  if (typeof secret !== "object" || secret === null) return false;
  const { json, salt } = secret as Record<string, unknown>;
  return typeof json === "string" && isSaltHex(salt) && commitHash(json, salt) === hash;
}

/** Save before signing the commit tx. Throws if the secret would not reveal `hash`. */
export async function saveSecret(store: KeyValueStore, hash: string, secret: Secret): Promise<void> {
  if (!isHash(hash)) throw new Error("invalid hash");
  if (!matches(hash, secret)) throw new Error("secret does not match hash");
  await store.setItem(secretKey(hash), JSON.stringify({ json: secret.json, salt: secret.salt }));
}

/** Null when missing, corrupt, or not matching the hash. */
export async function loadSecret(store: KeyValueStore, hash: string): Promise<Secret | null> {
  if (!isHash(hash)) return null;
  const raw = await store.getItem(secretKey(hash));
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return matches(hash, parsed) ? { json: parsed.json, salt: parsed.salt } : null;
}

export async function deleteSecret(store: KeyValueStore, hash: string): Promise<void> {
  await store.removeItem(secretKey(hash));
}

/** All valid stored secrets, sorted by hash. Corrupt entries are skipped. */
export async function exportAll(store: KeyValueStore): Promise<SecretEntry[]> {
  const hashes = (await store.getAllKeys())
    .filter((k) => k.startsWith(SECRET_KEY_PREFIX))
    .map((k) => k.slice(SECRET_KEY_PREFIX.length))
    .sort();
  const out: SecretEntry[] = [];
  for (const hash of hashes) {
    const s = await loadSecret(store, hash);
    if (s) out.push({ hash, ...s });
  }
  return out;
}

/** "Export secrets" payload for the clipboard: JSON array of `{hash, json, salt}`. */
export async function exportSecretsJson(store: KeyValueStore): Promise<string> {
  return JSON.stringify(await exportAll(store));
}
