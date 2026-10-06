import { canonicalJson, type Call } from "../call";
import { commitHash } from "../commit";
import { buildReceipts, type MemoTx } from "../history";
import { encodeCommitMemo, encodeRevealMemo } from "../memo";
import { REVEAL_GRACE_SEC } from "../score";

const ME = "Me11111111111111111111111111111111111111111";
const OTHER = "0ther111111111111111111111111111111111111111";
const CREATED = 1800000000;
const DEADLINE = 1800086400;

const SALT_A = "000102030405060708090a0b0c0d0e0f";
const SALT_B = "f0e0d0c0b0a090807060504030201000";

const CALL_A: Call = { v: 1, asset: "SOL", dir: "above", target: 250.5, deadline: DEADLINE, created: CREATED };
const CALL_B: Call = { v: 1, asset: "SKR", dir: "below", target: 0.0000215, deadline: DEADLINE + 3600, created: CREATED };

const JSON_A = canonicalJson(CALL_A);
const JSON_B = canonicalJson(CALL_B);
const HASH_A = commitHash(JSON_A, SALT_A);
const HASH_B = commitHash(JSON_B, SALT_B);

let n = 0;
const tx = (memo: string, blockTime: number | null, over: Partial<MemoTx> = {}): MemoTx => ({
  signature: `sig${++n}`,
  blockTime,
  signer: ME,
  memo,
  failed: false,
  ...over,
});
const commitA = (blockTime: number | null = CREATED + 10, over: Partial<MemoTx> = {}) =>
  tx(encodeCommitMemo(HASH_A, DEADLINE), blockTime, over);
const revealA = (blockTime: number | null = DEADLINE + 60, over: Partial<MemoTx> = {}) =>
  tx(encodeRevealMemo(JSON_A, SALT_A), blockTime, over);

describe("buildReceipts", () => {
  it("returns no receipts for no transactions", () => {
    expect(buildReceipts([], ME)).toEqual([]);
  });

  it("builds a sealed receipt from a commit", () => {
    const c = commitA();
    expect(buildReceipts([c], ME)).toEqual([
      { hash: HASH_A, deadline: DEADLINE, commit: { signature: c.signature, blockTime: c.blockTime } },
    ]);
  });

  it("attaches a valid reveal with call, json and salt", () => {
    const c = commitA();
    const r = revealA();
    const [receipt] = buildReceipts([r, c], ME);
    expect(receipt.reveal).toEqual({
      signature: r.signature,
      blockTime: r.blockTime,
      call: CALL_A,
      json: JSON_A,
      salt: SALT_A,
    });
    expect(receipt.commit.signature).toBe(c.signature);
  });

  it("orders receipts newest commit first regardless of input order", () => {
    const c1 = commitA(CREATED + 10);
    const c2 = tx(encodeCommitMemo(HASH_B, CALL_B.deadline), CREATED + 20);
    expect(buildReceipts([c1, c2], ME).map((r) => r.hash)).toEqual([HASH_B, HASH_A]);
    expect(buildReceipts([c2, c1], ME).map((r) => r.hash)).toEqual([HASH_B, HASH_A]);
  });

  it("matches each reveal to its own commit", () => {
    const txs = [
      commitA(),
      tx(encodeCommitMemo(HASH_B, CALL_B.deadline), CREATED + 20),
      tx(encodeRevealMemo(JSON_B, SALT_B), CALL_B.deadline + 5),
    ];
    const byHash = Object.fromEntries(buildReceipts(txs, ME).map((r) => [r.hash, r]));
    expect(byHash[HASH_A].reveal).toBeUndefined();
    expect(byHash[HASH_B].reveal?.call).toEqual(CALL_B);
  });

  describe("failed transactions", () => {
    it("ignores a failed commit", () => {
      expect(buildReceipts([commitA(undefined, { failed: true })], ME)).toEqual([]);
    });

    it("ignores a failed reveal", () => {
      const [r] = buildReceipts([commitA(), revealA(undefined, { failed: true })], ME);
      expect(r.reveal).toBeUndefined();
    });
  });

  describe("signer rules", () => {
    it("ignores commits by another wallet", () => {
      expect(buildReceipts([commitA(undefined, { signer: OTHER })], ME)).toEqual([]);
    });

    it("ignores a foreign reveal of my commit (same hash, other signer)", () => {
      const [r] = buildReceipts([commitA(), revealA(undefined, { signer: OTHER })], ME);
      expect(r.reveal).toBeUndefined();
    });

    it("does not let my reveal attach to another wallet's commit", () => {
      expect(buildReceipts([commitA(undefined, { signer: OTHER }), revealA()], ME)).toEqual([]);
    });
  });

  describe("commit rules", () => {
    it("ignores a commit whose blockTime is after its deadline", () => {
      expect(buildReceipts([commitA(DEADLINE + 1)], ME)).toEqual([]);
    });

    it("accepts a commit landing exactly at its deadline", () => {
      expect(buildReceipts([commitA(DEADLINE)], ME)).toHaveLength(1);
    });

    it("ignores transactions without blockTime", () => {
      expect(buildReceipts([commitA(null)], ME)).toEqual([]);
      const [r] = buildReceipts([commitA(), revealA(null)], ME);
      expect(r.reveal).toBeUndefined();
    });

    it("keeps only the earliest of duplicate commits", () => {
      const first = commitA(CREATED + 10);
      const second = commitA(CREATED + 50);
      const out = buildReceipts([second, first], ME);
      expect(out).toHaveLength(1);
      expect(out[0].commit.signature).toBe(first.signature);
    });

    it("ignores memos that are not receipts or are malformed", () => {
      const txs = [
        tx("hello world", CREATED),
        tx("rcpt:1:c:nothex:123", CREATED),
        tx(`rcpt:2:c:${HASH_A}:${DEADLINE}`, CREATED),
      ];
      expect(buildReceipts(txs, ME)).toEqual([]);
    });
  });

  describe("reveal rules", () => {
    it("ignores a reveal without a matching commit", () => {
      expect(buildReceipts([revealA()], ME)).toEqual([]);
    });

    it("ignores a forged reveal whose hash does not match json + salt", () => {
      const forged = encodeRevealMemo(JSON_A, SALT_A).replace(SALT_A, SALT_B);
      const [r] = buildReceipts([commitA(), tx(forged, DEADLINE + 60)], ME);
      expect(r.reveal).toBeUndefined();
    });

    it("ignores a reveal whose call deadline differs from the commit deadline", () => {
      const c = tx(encodeCommitMemo(HASH_A, DEADLINE + 3600), CREATED + 10);
      const [r] = buildReceipts([c, revealA(DEADLINE + 3700)], ME);
      expect(r.deadline).toBe(DEADLINE + 3600);
      expect(r.reveal).toBeUndefined();
    });

    it("keeps the earliest of duplicate reveals", () => {
      const first = revealA(DEADLINE + 60);
      const dup = revealA(DEADLINE + 120);
      const [r] = buildReceipts([dup, commitA(), first], ME);
      expect(r.reveal?.signature).toBe(first.signature);
    });

    it("ignores a reveal landing before its commit", () => {
      const [r] = buildReceipts([commitA(CREATED + 100), revealA(CREATED + 50)], ME);
      expect(r.reveal).toBeUndefined();
    });

    it("accepts a reveal up to the last second of the grace window", () => {
      const [r] = buildReceipts([commitA(), revealA(DEADLINE + REVEAL_GRACE_SEC - 1)], ME);
      expect(r.reveal).toBeDefined();
    });

    it("ignores a late reveal at or after deadline + 24 h (forfeit is final)", () => {
      const [r] = buildReceipts([commitA(), revealA(DEADLINE + REVEAL_GRACE_SEC)], ME);
      expect(r.reveal).toBeUndefined();
    });

    it("an earlier valid reveal wins over a later late one", () => {
      const late = revealA(DEADLINE + REVEAL_GRACE_SEC + 10);
      const ok = revealA(DEADLINE + 5);
      const [r] = buildReceipts([late, ok, commitA()], ME);
      expect(r.reveal?.signature).toBe(ok.signature);
    });
  });
});
