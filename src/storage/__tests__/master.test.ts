import { clearMasterState, loadMasterState, masterStoreKey, saveMasterState, type SecureKeyValueStore } from "../master";

const WALLET = "4ZGj29qzVvXgJb8C5MuuqPbgoTsDvGu4iLyvnJyWa9Lm";
const MASTER = Uint8Array.from({ length: 32 }, (_, i) => i);

function memSecure(): SecureKeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
}

describe("master key storage", () => {
  it("uses a SecureStore-safe per-wallet key", () => {
    expect(masterStoreKey(WALLET)).toBe(`rcpt.master.${WALLET}`);
    expect(masterStoreKey(WALLET)).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("round-trips a derived master", async () => {
    const s = memSecure();
    await saveMasterState(s, WALLET, { mode: "derived", master: MASTER });
    expect(s.map.get(masterStoreKey(WALLET))).toBe("derived:" + Buffer.from(MASTER).toString("hex"));
    expect(await loadMasterState(s, WALLET)).toEqual({ mode: "derived", master: MASTER });
  });

  it("round-trips the random-salt fallback", async () => {
    const s = memSecure();
    await saveMasterState(s, WALLET, { mode: "random" });
    expect(await loadMasterState(s, WALLET)).toEqual({ mode: "random" });
  });

  it("is per wallet", async () => {
    const s = memSecure();
    await saveMasterState(s, WALLET, { mode: "random" });
    expect(await loadMasterState(s, "11111111111111111111111111111111")).toBeNull();
  });

  it("returns null for missing or corrupt entries", async () => {
    const s = memSecure();
    expect(await loadMasterState(s, WALLET)).toBeNull();
    for (const bad of ["derived:zz", "derived:" + "ab".repeat(31), "nope", ""]) {
      s.map.set(masterStoreKey(WALLET), bad);
      expect(await loadMasterState(s, WALLET)).toBeNull();
    }
  });

  it("rejects saving a master that is not 32 bytes", async () => {
    await expect(saveMasterState(memSecure(), WALLET, { mode: "derived", master: new Uint8Array(31) })).rejects.toThrow();
  });

  it("clears", async () => {
    const s = memSecure();
    await saveMasterState(s, WALLET, { mode: "random" });
    await clearMasterState(s, WALLET);
    expect(await loadMasterState(s, WALLET)).toBeNull();
  });
});
