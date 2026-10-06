import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { isUserRejection, sealCall, SealDeps } from "../seal";
import { canonicalJson, Call } from "../../core/call";
import { commitHash } from "../../core/commit";
import { decodeCommitMemo } from "../../core/memo";
import { KeyValueStore, loadSecret } from "../../storage/secrets";
import { MEMO_PROGRAM_ID } from "../memoTx";

const NOW = 1_800_000_000;
const CALL: Call = { v: 1, asset: "SOL", dir: "above", target: 250.5, deadline: NOW + 86400, created: NOW };
const signer = Keypair.generate().publicKey;
const BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";

function memStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
    getAllKeys: async () => [...map.keys()],
  };
}

function deps(over: Partial<SealDeps> = {}): SealDeps & { store: ReturnType<typeof memStore>; sent: VersionedTransaction[] } {
  const store = memStore();
  const sent: VersionedTransaction[] = [];
  return {
    store,
    sent,
    signer,
    randomBytes: (n) => new Uint8Array(n).fill(7),
    getLatestBlockhash: async () => ({ blockhash: BLOCKHASH, slot: 42 }),
    signAndSend: async (tx, slot) => {
      expect(slot).toBe(42);
      sent.push(tx);
      return "sig123";
    },
    ...over,
  } as SealDeps & { store: ReturnType<typeof memStore>; sent: VersionedTransaction[] };
}

function memoOf(tx: VersionedTransaction): string {
  const msg = tx.message;
  const ix = msg.compiledInstructions.find((i) => msg.staticAccountKeys[i.programIdIndex].equals(MEMO_PROGRAM_ID))!;
  return Buffer.from(ix.data).toString("utf8");
}

describe("sealCall", () => {
  it("saves the secret, then sends one commit memo with hash and deadline", async () => {
    const d = deps();
    const salt = "07".repeat(16);
    const hash = commitHash(canonicalJson(CALL), salt);
    const r = await sealCall(d, CALL);
    expect(r).toEqual({ hash, signature: "sig123" });
    expect(d.sent).toHaveLength(1);
    expect(decodeCommitMemo(memoOf(d.sent[0]))).toEqual({ kind: "commit", hash, deadline: CALL.deadline });
    expect(d.sent[0].message.staticAccountKeys[0].equals(signer)).toBe(true);
    expect(await loadSecret(d.store, hash)).toEqual({ json: canonicalJson(CALL), salt });
  });

  it("stores the secret before asking the wallet to sign", async () => {
    let storedAtSign = 0;
    const d = deps();
    d.signAndSend = async () => {
      storedAtSign = d.store.map.size;
      return "s";
    };
    await sealCall(d, CALL);
    expect(storedAtSign).toBe(1);
  });

  it("deletes the secret and rethrows when the user rejects signing", async () => {
    const err = Object.assign(new Error("not signed"), { code: -3 });
    const d = deps({ signAndSend: async () => Promise.reject(err) });
    await expect(sealCall(d, CALL)).rejects.toBe(err);
    expect(d.store.map.size).toBe(0);
  });

  it("keeps the secret on ambiguous failures (tx may have landed)", async () => {
    const err = new Error("network timeout");
    const d = deps({ signAndSend: async () => Promise.reject(err) });
    await expect(sealCall(d, CALL)).rejects.toBe(err);
    expect(d.store.map.size).toBe(1);
  });

  it("deletes the secret if the blockhash cannot be fetched (nothing was sent)", async () => {
    const d = deps({ getLatestBlockhash: async () => Promise.reject(new Error("rpc down")) });
    await expect(sealCall(d, CALL)).rejects.toThrow("rpc down");
    expect(d.store.map.size).toBe(0);
  });

  it("does not sign if the secret cannot be saved", async () => {
    const d = deps();
    d.store.setItem = async () => Promise.reject(new Error("disk full"));
    await expect(sealCall(d, CALL)).rejects.toThrow("disk full");
    expect(d.sent).toHaveLength(0);
  });
});

describe("isUserRejection", () => {
  it.each([
    [{ code: -1 }, true],
    [{ code: -3 }, true],
    [{ code: "ERROR_WALLET_NOT_FOUND" }, true],
    [{ code: -4 }, false],
    [{ code: "ERROR_SESSION_CLOSED" }, false],
    [new Error("x"), false],
    [null, false],
    ["str", false],
  ])("%p → %p", (e, want) => expect(isUserRejection(e)).toBe(want));
});
