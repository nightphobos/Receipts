import {
  deleteSecret,
  exportAll,
  exportSecretsJson,
  KeyValueStore,
  loadSecret,
  saveSecret,
  SECRET_KEY_PREFIX,
  secretKey,
} from "../secrets";

const SALT = "000102030405060708090a0b0c0d0e0f";
const JSON_SOL = '{"v":1,"asset":"SOL","dir":"above","target":250.5,"deadline":1800086400,"created":1800000000}';
// Same pinned vector as src/core/__tests__/commit.test.ts
const HASH_SOL = "49094bec946ff69a99d4021f4bb4a66e46d8fd43d0706b54d65fc2fa801cef66";

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  async getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  async setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  async removeItem(k: string) {
    this.data.delete(k);
  }
  async getAllKeys() {
    return [...this.data.keys()];
  }
}

describe("secretKey", () => {
  it("uses the plan's key format", () => {
    expect(SECRET_KEY_PREFIX).toBe("rcpt:secret:");
    expect(secretKey(HASH_SOL)).toBe(`rcpt:secret:${HASH_SOL}`);
  });
});

describe("saveSecret / loadSecret", () => {
  it("round-trips a secret stored as {json, salt}", async () => {
    const s = new MemoryStore();
    await saveSecret(s, HASH_SOL, { json: JSON_SOL, salt: SALT });
    expect(JSON.parse(s.data.get(secretKey(HASH_SOL))!)).toEqual({ json: JSON_SOL, salt: SALT });
    expect(await loadSecret(s, HASH_SOL)).toEqual({ json: JSON_SOL, salt: SALT });
  });

  it("rejects a secret that does not match the hash (would be unrevealable)", async () => {
    const s = new MemoryStore();
    await expect(saveSecret(s, HASH_SOL, { json: JSON_SOL, salt: "ff".repeat(16) })).rejects.toThrow();
    await expect(saveSecret(s, "0".repeat(64), { json: JSON_SOL, salt: SALT })).rejects.toThrow();
    expect(s.data.size).toBe(0);
  });

  it("rejects malformed hash or salt", async () => {
    const s = new MemoryStore();
    await expect(saveSecret(s, HASH_SOL.toUpperCase(), { json: JSON_SOL, salt: SALT })).rejects.toThrow();
    await expect(saveSecret(s, HASH_SOL, { json: JSON_SOL, salt: "xyz" })).rejects.toThrow();
    expect(s.data.size).toBe(0);
  });

  it("returns null for a missing secret", async () => {
    expect(await loadSecret(new MemoryStore(), HASH_SOL)).toBeNull();
  });

  it("returns null for corrupt or mismatching stored data", async () => {
    const s = new MemoryStore();
    s.data.set(secretKey(HASH_SOL), "not json");
    expect(await loadSecret(s, HASH_SOL)).toBeNull();
    s.data.set(secretKey(HASH_SOL), JSON.stringify({ json: JSON_SOL }));
    expect(await loadSecret(s, HASH_SOL)).toBeNull();
    s.data.set(secretKey(HASH_SOL), JSON.stringify({ json: JSON_SOL, salt: "ff".repeat(16) }));
    expect(await loadSecret(s, HASH_SOL)).toBeNull();
  });
});

describe("deleteSecret", () => {
  it("removes the entry and is a no-op when missing", async () => {
    const s = new MemoryStore();
    await saveSecret(s, HASH_SOL, { json: JSON_SOL, salt: SALT });
    await deleteSecret(s, HASH_SOL);
    expect(await loadSecret(s, HASH_SOL)).toBeNull();
    await expect(deleteSecret(s, HASH_SOL)).resolves.toBeUndefined();
  });
});

describe("exportAll", () => {
  it("returns every valid secret with its hash, ignoring foreign and corrupt keys", async () => {
    const s = new MemoryStore();
    await saveSecret(s, HASH_SOL, { json: JSON_SOL, salt: SALT });
    s.data.set("other:key", "x");
    s.data.set(secretKey("a".repeat(64)), "garbage");
    expect(await exportAll(s)).toEqual([{ hash: HASH_SOL, json: JSON_SOL, salt: SALT }]);
  });

  it("returns [] for an empty store", async () => {
    expect(await exportAll(new MemoryStore())).toEqual([]);
  });

  it("exportSecretsJson is a JSON array of the entries", async () => {
    const s = new MemoryStore();
    await saveSecret(s, HASH_SOL, { json: JSON_SOL, salt: SALT });
    expect(JSON.parse(await exportSecretsJson(s))).toEqual([{ hash: HASH_SOL, json: JSON_SOL, salt: SALT }]);
  });
});
