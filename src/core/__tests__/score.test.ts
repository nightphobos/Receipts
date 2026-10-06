import type { Call } from "../call";
import { REVEAL_GRACE_SEC, resolve, stats, statusOf, type Receipt } from "../score";

const DEADLINE = 1800086400;
const HASH = "49094bec946ff69a99d4021f4bb4a66e46d8fd43d0706b54d65fc2fa801cef66";
const SALT = "000102030405060708090a0b0c0d0e0f";
const CALL: Call = { v: 1, asset: "SOL", dir: "above", target: 250.5, deadline: DEADLINE, created: 1800000000 };
const JSON_SOL = '{"v":1,"asset":"SOL","dir":"above","target":250.5,"deadline":1800086400,"created":1800000000}';

const sealedReceipt = (over: Partial<Receipt> = {}): Receipt => ({
  hash: HASH,
  deadline: DEADLINE,
  commit: { signature: "commitSig", blockTime: 1800000010 },
  ...over,
});

const revealed = (call: Call = CALL, priceAtDeadline?: number | null): Receipt =>
  sealedReceipt({
    reveal: { signature: "revealSig", blockTime: DEADLINE + 60, call, json: JSON_SOL, salt: SALT },
    priceAtDeadline,
  });

describe("resolve", () => {
  it.each([
    ["above", 250.51, "hit"],
    ["above", 250.5, "miss"],
    ["above", 250.49, "miss"],
    ["below", 250.49, "hit"],
    ["below", 250.5, "miss"],
    ["below", 250.51, "miss"],
  ] as const)("%s target 250.5 at price %p → %s", (dir, price, expected) => {
    expect(resolve({ ...CALL, dir }, price)).toBe(expected);
  });

  it("compares tiny SKR prices strictly", () => {
    const skr: Call = { ...CALL, asset: "SKR", target: 0.0000215 };
    expect(resolve(skr, 0.0000215)).toBe("miss");
    expect(resolve(skr, 0.00002151)).toBe("hit");
  });

  it.each([NaN, Infinity, -1, 0])("throws on invalid price %p", (p) => {
    expect(() => resolve(CALL, p)).toThrow();
  });
});

describe("statusOf", () => {
  const r = sealedReceipt();

  it("sealed before the deadline", () => {
    expect(statusOf(r, DEADLINE - 1)).toBe("sealed");
  });

  it("awaiting_reveal exactly at the deadline", () => {
    expect(statusOf(r, DEADLINE)).toBe("awaiting_reveal");
  });

  it("awaiting_reveal one second before deadline + 24 h", () => {
    expect(REVEAL_GRACE_SEC).toBe(24 * 3600);
    expect(statusOf(r, DEADLINE + REVEAL_GRACE_SEC - 1)).toBe("awaiting_reveal");
  });

  it("forfeited exactly at deadline + 24 h and after", () => {
    expect(statusOf(r, DEADLINE + REVEAL_GRACE_SEC)).toBe("forfeited");
    expect(statusOf(r, DEADLINE + 10 * REVEAL_GRACE_SEC)).toBe("forfeited");
  });

  it("unresolved when revealed but no price yet (undefined or null)", () => {
    expect(statusOf(revealed(CALL, undefined), DEADLINE + 120)).toBe("unresolved");
    expect(statusOf(revealed(CALL, null), DEADLINE + 120)).toBe("unresolved");
  });

  it("unresolved stays unresolved past the grace window (revealed calls never forfeit)", () => {
    expect(statusOf(revealed(CALL, null), DEADLINE + 5 * REVEAL_GRACE_SEC)).toBe("unresolved");
  });

  it("hit / miss when revealed with a price", () => {
    expect(statusOf(revealed(CALL, 300), DEADLINE + 120)).toBe("hit");
    expect(statusOf(revealed(CALL, 250.5), DEADLINE + 120)).toBe("miss");
    expect(statusOf(revealed({ ...CALL, dir: "below" }, 200), DEADLINE + 120)).toBe("hit");
  });

  it("uses the commit deadline for time windows", () => {
    const early = sealedReceipt({ deadline: DEADLINE - 3600 });
    expect(statusOf(early, DEADLINE - 1)).toBe("awaiting_reveal");
  });
});

describe("stats", () => {
  const now = DEADLINE + 2 * REVEAL_GRACE_SEC;

  it("empty list → zeros and null hit-rate", () => {
    expect(stats([], now)).toEqual({
      total: 0,
      hits: 0,
      misses: 0,
      forfeited: 0,
      pending: 0,
      hitRate: null,
    });
  });

  it("counts every status; forfeited counts against hit-rate, pending excluded", () => {
    const receipts: Receipt[] = [
      revealed(CALL, 300), // hit
      revealed(CALL, 300), // hit
      revealed(CALL, 100), // miss
      sealedReceipt(), // forfeited at `now`
      sealedReceipt({ deadline: now + 3600 }), // sealed → pending
      sealedReceipt({ deadline: now - 60 }), // awaiting_reveal → pending
      revealed(CALL, null), // unresolved → pending
    ];
    expect(stats(receipts, now)).toEqual({
      total: 7,
      hits: 2,
      misses: 1,
      forfeited: 1,
      pending: 3,
      hitRate: 2 / 4,
    });
  });

  it("only pending → null hit-rate", () => {
    const s = stats([sealedReceipt({ deadline: now + 3600 }), revealed(CALL, undefined)], now);
    expect(s.pending).toBe(2);
    expect(s.hitRate).toBeNull();
  });

  it("all forfeited → hit-rate 0", () => {
    expect(stats([sealedReceipt(), sealedReceipt()], now).hitRate).toBe(0);
  });
});
