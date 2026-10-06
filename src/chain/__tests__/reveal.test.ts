import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { canReveal, revealReceipt, RevealDeps } from "../reveal";
import { canonicalJson, Call } from "../../core/call";
import { commitHash } from "../../core/commit";
import { decodeRevealMemo } from "../../core/memo";
import { REVEAL_GRACE_SEC, type Receipt } from "../../core/score";
import { KeyValueStore, loadSecret, saveSecret } from "../../storage/secrets";
import { MEMO_PROGRAM_ID } from "../memoTx";

const T0 = 1_800_000_000;
const CALL: Call = { v: 1, asset: "SOL", dir: "above", target: 250.5, deadline: T0 + 86400, created: T0 };
const JSON_CALL = canonicalJson(CALL);
const SALT = "ab".repeat(16);
const HASH = commitHash(JSON_CALL, SALT);
const RECEIPT: Receipt = { hash: HASH, deadline: CALL.deadline, commit: { signature: "c1", blockTime: T0 + 5 } };
const AFTER = CALL.deadline + 60;
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

type TestDeps = RevealDeps & { store: ReturnType<typeof memStore>; sent: VersionedTransaction[] };

async function deps(now = AFTER, withSecret = true): Promise<TestDeps> {
  const store = memStore();
  if (withSecret) await saveSecret(store, HASH, { json: JSON_CALL, salt: SALT });
  const sent: VersionedTransaction[] = [];
  return {
    store,
    sent,
    signer,
    nowSec: () => now,
    getLatestBlockhash: async () => ({ blockhash: BLOCKHASH, slot: 7 }),
    signAndSend: async (tx, slot) => {
      expect(slot).toBe(7);
      sent.push(tx);
      return "revealSig";
    },
  };
}

function memoOf(tx: VersionedTransaction): string {
  const msg = tx.message;
  const ix = msg.compiledInstructions.find((i) => msg.staticAccountKeys[i.programIdIndex].equals(MEMO_PROGRAM_ID))!;
  return Buffer.from(ix.data).toString("utf8");
}

describe("canReveal", () => {
  it("is false before the deadline", () => {
    expect(canReveal(RECEIPT, true, CALL.deadline - 1)).toBe(false);
  });
  it("is true from exactly the deadline until deadline + 24 h (exclusive)", () => {
    expect(canReveal(RECEIPT, true, CALL.deadline)).toBe(true);
    expect(canReveal(RECEIPT, true, CALL.deadline + REVEAL_GRACE_SEC - 1)).toBe(true);
    expect(canReveal(RECEIPT, true, CALL.deadline + REVEAL_GRACE_SEC)).toBe(false);
  });
  it("is false without a local secret", () => {
    expect(canReveal(RECEIPT, false, AFTER)).toBe(false);
  });
  it("is false when already revealed", () => {
    const revealed: Receipt = {
      ...RECEIPT,
      reveal: { signature: "r1", blockTime: AFTER, call: CALL, json: JSON_CALL, salt: SALT },
    };
    expect(canReveal(revealed, true, AFTER)).toBe(false);
  });
});

describe("revealReceipt", () => {
  it("sends one reveal memo with the stored json and salt, signed by the wallet", async () => {
    const d = await deps();
    expect(await revealReceipt(d, RECEIPT)).toEqual({ signature: "revealSig" });
    expect(d.sent).toHaveLength(1);
    expect(decodeRevealMemo(memoOf(d.sent[0]))).toEqual({
      kind: "reveal",
      hash: HASH,
      json: JSON_CALL,
      call: CALL,
      salt: SALT,
    });
    expect(d.sent[0].message.staticAccountKeys[0].equals(signer)).toBe(true);
  });

  it("refuses before the deadline (UI must not reveal early)", async () => {
    const d = await deps(CALL.deadline - 1);
    await expect(revealReceipt(d, RECEIPT)).rejects.toThrow(/not open/i);
    expect(d.sent).toHaveLength(0);
  });

  it("refuses after the grace window", async () => {
    const d = await deps(CALL.deadline + REVEAL_GRACE_SEC);
    await expect(revealReceipt(d, RECEIPT)).rejects.toThrow(/not open/i);
    expect(d.sent).toHaveLength(0);
  });

  it("refuses without a local secret", async () => {
    const d = await deps(AFTER, false);
    await expect(revealReceipt(d, RECEIPT)).rejects.toThrow(/no secret/i);
    expect(d.sent).toHaveLength(0);
  });

  it("refuses when the stored call's deadline differs from the commit memo", async () => {
    const other: Call = { ...CALL, deadline: CALL.deadline + 3600 };
    const otherJson = canonicalJson(other);
    const otherHash = commitHash(otherJson, SALT);
    const d = await deps();
    await saveSecret(d.store, otherHash, { json: otherJson, salt: SALT });
    const receipt: Receipt = { ...RECEIPT, hash: otherHash };
    await expect(revealReceipt(d, receipt)).rejects.toThrow(/deadline/i);
    expect(d.sent).toHaveLength(0);
  });

  it("keeps the secret whatever happens (needed to retry)", async () => {
    const d = await deps();
    d.signAndSend = async () => Promise.reject(Object.assign(new Error("declined"), { code: -3 }));
    await expect(revealReceipt(d, RECEIPT)).rejects.toThrow("declined");
    expect(await loadSecret(d.store, HASH)).toEqual({ json: JSON_CALL, salt: SALT });
    const ok = await deps();
    await revealReceipt(ok, RECEIPT);
    expect(await loadSecret(ok.store, HASH)).toEqual({ json: JSON_CALL, salt: SALT });
  });
});
