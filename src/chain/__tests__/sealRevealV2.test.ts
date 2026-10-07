import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { isUserRejection, sealCallV2, type SealV2Deps } from "../seal";
import { canRevealV2, findSecretV2, revealReceiptV2, type RevealV2Deps } from "../reveal";
import { canonicalJsonV2, type CallV2 } from "../../core/call";
import { commitHash } from "../../core/commit";
import { decodeCommitMemoV2, decodeRevealMemoV2 } from "../../core/memo";
import { REVEAL_GRACE_SEC, type ReceiptV2 } from "../../core/score";
import { masterFromSignature, saltFor } from "../../core/secret";
import { KeyValueStore, loadSecret, saveSecret } from "../../storage/secrets";
import { MEMO_PROGRAM_ID, REGISTRY_KEY } from "../memoTx";

const NOW = 1_800_000_000;
const CALL: CallV2 = { v: 2, asset: "SOL", dir: "up", deadline: NOW + 86400, created: NOW };
const JSON_CALL = canonicalJsonV2(CALL);
const MASTER = masterFromSignature(Uint8Array.from({ length: 64 }, (_, i) => i));
const OTHER_MASTER = masterFromSignature(Uint8Array.from({ length: 64 }, (_, i) => 63 - i));
const DERIVED_SALT = saltFor(MASTER, "SOL", CALL.deadline);
const HASH = commitHash(JSON_CALL, DERIVED_SALT);
const signer = Keypair.generate().publicKey;
const BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";
const AFTER = CALL.deadline + 60;
const RECEIPT: ReceiptV2 = {
  v: 2,
  hash: HASH,
  asset: "SOL",
  deadline: CALL.deadline,
  horizon: "24h",
  commit: { signature: "c1", blockTime: NOW + 7 },
  overlap: false,
};

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

type Sent = { sent: VersionedTransaction[]; store: ReturnType<typeof memStore> };

function sealDeps(over: Partial<SealV2Deps> = {}): SealV2Deps & Sent {
  const sent: VersionedTransaction[] = [];
  return {
    store: memStore(),
    sent,
    signer,
    master: MASTER,
    randomBytes: (n) => new Uint8Array(n).fill(7),
    getLatestBlockhash: async () => ({ blockhash: BLOCKHASH, slot: 42 }),
    signAndSend: async (tx) => {
      sent.push(tx);
      return "sig123";
    },
    ...over,
  } as SealV2Deps & Sent;
}

function revealDeps(master: Uint8Array | null, now = AFTER): RevealV2Deps & Sent {
  const sent: VersionedTransaction[] = [];
  return {
    store: memStore(),
    sent,
    signer,
    master,
    nowSec: () => now,
    getLatestBlockhash: async () => ({ blockhash: BLOCKHASH, slot: 7 }),
    signAndSend: async (tx) => {
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
const isTagged = (tx: VersionedTransaction) => tx.message.staticAccountKeys.some((k) => k.equals(REGISTRY_KEY));

describe("sealCallV2", () => {
  it("uses the derived salt, saves the secret, sends one tagged v2 commit", async () => {
    const d = sealDeps();
    const r = await sealCallV2(d, CALL);
    expect(r).toEqual({ hash: HASH, signature: "sig123" });
    expect(d.sent).toHaveLength(1);
    expect(decodeCommitMemoV2(memoOf(d.sent[0]))).toMatchObject({ hash: HASH, deadline: CALL.deadline, asset: "SOL" });
    expect(isTagged(d.sent[0])).toBe(true);
    expect(await loadSecret(d.store, HASH)).toEqual({ json: JSON_CALL, salt: DERIVED_SALT });
  });

  it("falls back to a random salt without a master", async () => {
    const d = sealDeps({ master: null });
    const salt = "07".repeat(16);
    const r = await sealCallV2(d, CALL);
    expect(r.hash).toBe(commitHash(JSON_CALL, salt));
    expect(await loadSecret(d.store, r.hash)).toEqual({ json: JSON_CALL, salt });
  });

  it("deletes the local secret only when the user declined", async () => {
    const declined = sealDeps({ signAndSend: async () => Promise.reject({ code: -3 }) });
    await expect(sealCallV2(declined, CALL)).rejects.toEqual({ code: -3 });
    expect(isUserRejection({ code: -3 })).toBe(true);
    expect(declined.store.map.size).toBe(0);

    const ambiguous = sealDeps({ signAndSend: async () => Promise.reject(new Error("timeout")) });
    await expect(sealCallV2(ambiguous, CALL)).rejects.toThrow("timeout");
    expect(await loadSecret(ambiguous.store, HASH)).not.toBeNull();
  });
});

describe("canRevealV2", () => {
  it("only in [deadline, deadline + 24 h) and unrevealed, non-overlap", () => {
    expect(canRevealV2(RECEIPT, CALL.deadline - 1)).toBe(false);
    expect(canRevealV2(RECEIPT, CALL.deadline)).toBe(true);
    expect(canRevealV2(RECEIPT, CALL.deadline + REVEAL_GRACE_SEC)).toBe(false);
    expect(canRevealV2({ ...RECEIPT, overlap: true }, AFTER)).toBe(false);
  });
});

describe("findSecretV2", () => {
  it("prefers the locally stored secret", async () => {
    const d = revealDeps(null);
    await saveSecret(d.store, HASH, { json: JSON_CALL, salt: DERIVED_SALT });
    expect(await findSecretV2(d.store, RECEIPT, null)).toEqual({
      call: CALL,
      json: JSON_CALL,
      salt: DERIVED_SALT,
      recovered: false,
    });
  });

  it("recovers from the master and caches the secret locally", async () => {
    const d = revealDeps(MASTER);
    expect(await findSecretV2(d.store, RECEIPT, MASTER)).toEqual({
      call: CALL,
      json: JSON_CALL,
      salt: DERIVED_SALT,
      recovered: true,
    });
    expect(await loadSecret(d.store, HASH)).toEqual({ json: JSON_CALL, salt: DERIVED_SALT });
  });

  it("ignores a stored v1 or mismatching secret and returns null without a usable master", async () => {
    const d = revealDeps(null);
    expect(await findSecretV2(d.store, RECEIPT, null)).toBeNull();
    expect(await findSecretV2(d.store, RECEIPT, OTHER_MASTER)).toBeNull();
    const wrongAsset: CallV2 = { ...CALL, asset: "SKR" };
    const json = canonicalJsonV2(wrongAsset);
    const salt = "ab".repeat(16);
    const h = commitHash(json, salt);
    await saveSecret(d.store, h, { json, salt });
    expect(await findSecretV2(d.store, { ...RECEIPT, hash: h }, null)).toBeNull();
  });
});

describe("revealReceiptV2", () => {
  it("sends one tagged v2 reveal memo, recovering when nothing is stored", async () => {
    const d = revealDeps(MASTER);
    expect(await revealReceiptV2(d, RECEIPT)).toEqual({ signature: "revealSig", recovered: true });
    expect(d.sent).toHaveLength(1);
    expect(isTagged(d.sent[0])).toBe(true);
    expect(decodeRevealMemoV2(memoOf(d.sent[0]))).toMatchObject({ hash: HASH, json: JSON_CALL, salt: DERIVED_SALT });
  });

  it("refuses before the deadline, after the grace period, and without a secret", async () => {
    await expect(revealReceiptV2(revealDeps(MASTER, CALL.deadline - 1), RECEIPT)).rejects.toThrow("not open");
    await expect(revealReceiptV2(revealDeps(MASTER, CALL.deadline + REVEAL_GRACE_SEC), RECEIPT)).rejects.toThrow(
      "not open",
    );
    const d = revealDeps(null);
    await expect(revealReceiptV2(d, RECEIPT)).rejects.toThrow("No secret");
    expect(d.sent).toHaveLength(0);
  });
});
