import { canonicalJson, canonicalJsonV2, type Call, type CallV2 } from "../call";
import { commitHash } from "../commit";
import { buildHistory, buildReceiptsV2, type MemoTx } from "../history";
import { encodeCommitMemo, encodeCommitMemoV2, encodeRevealMemo, encodeRevealMemoV2 } from "../memo";
import { REVEAL_GRACE_SEC } from "../score";

const ME = "Me11111111111111111111111111111111111111111";
const OTHER = "0ther111111111111111111111111111111111111111";
const DAY = 86400;
const BT = 1800000000; // commit blockTime
const DEADLINE = BT + DAY;

const SALT_A = "000102030405060708090a0b0c0d0e0f";
const SALT_B = "f0e0d0c0b0a090807060504030201000";

const CALL_A: CallV2 = { v: 2, asset: "SOL", dir: "up", deadline: DEADLINE, created: BT - 3 };
const JSON_A = canonicalJsonV2(CALL_A);
const HASH_A = commitHash(JSON_A, SALT_A);

let n = 0;
const tx = (memo: string, blockTime: number | null, over: Partial<MemoTx> = {}): MemoTx => ({
  signature: `sig${++n}`,
  blockTime,
  signer: ME,
  memo,
  failed: false,
  tagged: true,
  ...over,
});
const commitA = (blockTime: number | null = BT, over: Partial<MemoTx> = {}) =>
  tx(encodeCommitMemoV2(HASH_A, DEADLINE, "SOL"), blockTime, over);
const revealA = (blockTime: number | null = DEADLINE + 60, over: Partial<MemoTx> = {}) =>
  tx(encodeRevealMemoV2(JSON_A, SALT_A), blockTime, over);

/** A fresh v2 call (unique hash) with its commit and reveal memos. */
function call(asset: "SOL" | "SKR", commitTime: number, deadline: number, dir: "up" | "down" = "up", salt = SALT_B) {
  const c: CallV2 = { v: 2, asset, dir, deadline, created: commitTime - 1 };
  const json = canonicalJsonV2(c);
  const hash = commitHash(json, salt);
  return {
    hash,
    commit: (over: Partial<MemoTx> = {}) => tx(encodeCommitMemoV2(hash, deadline, asset), commitTime, over),
    reveal: (t = deadline + 30, over: Partial<MemoTx> = {}) => tx(encodeRevealMemoV2(json, salt), t, over),
  };
}

describe("buildReceiptsV2", () => {
  it("empty → empty", () => {
    expect(buildReceiptsV2([], ME)).toEqual([]);
  });

  it("tagged commit → sealed receipt with asset, horizon and no overlap", () => {
    const c = commitA();
    expect(buildReceiptsV2([c], ME)).toEqual([
      {
        v: 2,
        hash: HASH_A,
        asset: "SOL",
        deadline: DEADLINE,
        horizon: "24h",
        commit: { signature: c.signature, blockTime: BT },
        overlap: false,
      },
    ]);
  });

  it("attaches a valid tagged reveal", () => {
    const c = commitA();
    const r = revealA();
    const [rc] = buildReceiptsV2([r, c], ME);
    expect(rc.reveal).toEqual({
      signature: r.signature,
      blockTime: DEADLINE + 60,
      call: CALL_A,
      json: JSON_A,
      salt: SALT_A,
    });
  });

  it("ignores untagged commits (the reveal then has nothing to match)", () => {
    expect(buildReceiptsV2([commitA(BT, { tagged: false }), revealA()], ME)).toEqual([]);
    expect(buildReceiptsV2([commitA(BT, { tagged: undefined })], ME)).toEqual([]);
  });

  it("ignores untagged reveals", () => {
    const [rc] = buildReceiptsV2([commitA(), revealA(DEADLINE + 60, { tagged: false })], ME);
    expect(rc.reveal).toBeUndefined();
  });

  it("ignores failed txs, txs without blockTime and other signers", () => {
    expect(buildReceiptsV2([commitA(BT, { failed: true })], ME)).toEqual([]);
    expect(buildReceiptsV2([commitA(null)], ME)).toEqual([]);
    expect(buildReceiptsV2([commitA(BT, { signer: OTHER })], ME)).toEqual([]);
    const [rc] = buildReceiptsV2([commitA(), revealA(DEADLINE + 60, { signer: OTHER })], ME);
    expect(rc.reveal).toBeUndefined();
    const [rf] = buildReceiptsV2([commitA(), revealA(DEADLINE + 60, { failed: true })], ME);
    expect(rf.reveal).toBeUndefined();
  });

  it("ignores v1 memos and garbage", () => {
    const v1: Call = { v: 1, asset: "SOL", dir: "above", target: 1, deadline: DEADLINE, created: BT - 3 };
    const h1 = commitHash(canonicalJson(v1), SALT_A);
    expect(buildReceiptsV2([tx(encodeCommitMemo(h1, DEADLINE), BT), tx("rcpt:2:c:zz", BT)], ME)).toEqual([]);
  });

  it("ignores a commit landing after its deadline", () => {
    expect(buildReceiptsV2([commitA(DEADLINE + 1)], ME)).toEqual([]);
  });

  it("duplicate commits: earliest wins", () => {
    const early = commitA(BT);
    const late = commitA(BT + 100);
    const rs = buildReceiptsV2([late, early], ME);
    expect(rs).toHaveLength(1);
    expect(rs[0].commit.signature).toBe(early.signature);
    expect(rs[0].overlap).toBe(false);
  });

  it("reveal must keep the commit deadline and asset", () => {
    const wrongDeadline: CallV2 = { ...CALL_A, deadline: DEADLINE + 1 };
    const j = canonicalJsonV2(wrongDeadline);
    const h = commitHash(j, SALT_A);
    const rs = buildReceiptsV2([tx(encodeCommitMemoV2(h, DEADLINE, "SOL"), BT), tx(encodeRevealMemoV2(j, SALT_A), DEADLINE + 60)], ME);
    expect(rs[0].reveal).toBeUndefined();

    const skrCall: CallV2 = { ...CALL_A, asset: "SKR" };
    const j2 = canonicalJsonV2(skrCall);
    const h2 = commitHash(j2, SALT_A);
    const rs2 = buildReceiptsV2([tx(encodeCommitMemoV2(h2, DEADLINE, "SOL"), BT), tx(encodeRevealMemoV2(j2, SALT_A), DEADLINE + 60)], ME);
    expect(rs2[0].reveal).toBeUndefined();
  });

  it("reveal must land between commit and deadline + 24 h; earliest valid wins", () => {
    expect(buildReceiptsV2([commitA(), revealA(BT - 1)], ME)[0].reveal).toBeUndefined();
    expect(buildReceiptsV2([commitA(), revealA(DEADLINE + REVEAL_GRACE_SEC)], ME)[0].reveal).toBeUndefined();
    expect(buildReceiptsV2([commitA(), revealA(DEADLINE + REVEAL_GRACE_SEC - 1)], ME)[0].reveal).toBeDefined();
    const r1 = revealA(DEADLINE + 10);
    const r2 = revealA(DEADLINE + 20);
    expect(buildReceiptsV2([commitA(), r2, r1], ME)[0].reveal?.signature).toBe(r1.signature);
  });

  it("sorts newest commit first", () => {
    const a = call("SOL", BT, BT + DAY);
    const b = call("SKR", BT + 50, BT + DAY);
    const rs = buildReceiptsV2([a.commit(), b.commit()], ME);
    expect(rs.map((r) => r.hash)).toEqual([b.hash, a.hash]);
  });

  describe("one open position per (asset, horizon class)", () => {
    it("a second same-asset same-class commit before the first deadline is an overlap", () => {
      const a = call("SOL", BT, BT + DAY);
      const b = call("SOL", BT + 3600, BT + 3600 + DAY, "down");
      const rs = buildReceiptsV2([b.commit(), a.commit()], ME);
      const byHash = Object.fromEntries(rs.map((r) => [r.hash, r]));
      expect(byHash[a.hash].overlap).toBe(false);
      expect(byHash[b.hash].overlap).toBe(true);
    });

    it("committing exactly at the earlier deadline is allowed", () => {
      const a = call("SOL", BT, BT + DAY);
      const b = call("SOL", BT + DAY, BT + 2 * DAY);
      const rs = buildReceiptsV2([a.commit(), b.commit()], ME);
      expect(rs.every((r) => !r.overlap)).toBe(true);
    });

    it("other asset or other class is not an overlap", () => {
      const a = call("SOL", BT, BT + DAY);
      const skr = call("SKR", BT + 10, BT + 10 + DAY);
      const practice = call("SOL", BT + 20, BT + 20 + 3600);
      const week = call("SOL", BT + 30, BT + 30 + 7 * DAY);
      const rs = buildReceiptsV2([a.commit(), skr.commit(), practice.commit(), week.commit()], ME);
      expect(rs.map((r) => r.overlap)).toEqual([false, false, false, false]);
      expect(Object.fromEntries(rs.map((r) => [r.hash, r.horizon]))).toEqual({
        [a.hash]: "24h",
        [skr.hash]: "24h",
        [practice.hash]: "1h",
        [week.hash]: "7d",
      });
    });

    it("an overlap does not itself open a position", () => {
      const a = call("SOL", BT, BT + DAY);
      const b = call("SOL", BT + 3600, BT + 3600 + DAY); // overlap of a
      const c = call("SOL", BT + DAY + 60, BT + 2 * DAY); // after a's deadline, before b's
      const rs = buildReceiptsV2([a.commit(), b.commit(), c.commit()], ME);
      const byHash = Object.fromEntries(rs.map((r) => [r.hash, r.overlap]));
      expect(byHash).toEqual({ [a.hash]: false, [b.hash]: true, [c.hash]: false });
    });

    it("same blockTime: ordered by signature, the later one is the overlap", () => {
      const a = call("SOL", BT, BT + DAY);
      const b = call("SOL", BT, BT + DAY + 60, "down");
      const ca = a.commit({ signature: "zzz" });
      const cb = b.commit({ signature: "aaa" });
      const rs = buildReceiptsV2([ca, cb], ME);
      const byHash = Object.fromEntries(rs.map((r) => [r.hash, r.overlap]));
      expect(byHash).toEqual({ [a.hash]: true, [b.hash]: false });
    });

    it("hedging: ▲ and ▼ sealed together → the second is an overlap even if revealed", () => {
      const up = call("SOL", BT, BT + DAY, "up", SALT_A);
      const down = call("SOL", BT + 5, BT + DAY, "down", SALT_B);
      const rs = buildReceiptsV2([up.commit(), down.commit(), down.reveal()], ME);
      const d = rs.find((r) => r.hash === down.hash)!;
      expect(d.overlap).toBe(true);
      expect(d.reveal).toBeDefined();
    });
  });
});

describe("buildHistory", () => {
  it("merges v2 receipts with v1 receipts marked legacy, newest first", () => {
    const v1: Call = { v: 1, asset: "SOL", dir: "above", target: 1, deadline: DEADLINE, created: BT - 3 };
    const h1 = commitHash(canonicalJson(v1), SALT_B);
    const c1 = tx(encodeCommitMemo(h1, DEADLINE), BT + 10, { tagged: false });
    const r1 = tx(encodeRevealMemo(canonicalJson(v1), SALT_B), DEADLINE + 5, { tagged: false });
    const c2 = commitA();
    const rs = buildHistory([c2, r1, c1], ME);
    expect(rs.map((r) => [r.v, r.hash])).toEqual([
      [1, h1],
      [2, HASH_A],
    ]);
    const legacy = rs[0];
    expect(legacy.v === 1 && legacy.reveal?.call).toEqual(v1);
  });
});
