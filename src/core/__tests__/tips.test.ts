import type { MemoTx } from "../history";
import { SKR_MINT, tipMemo } from "../tip";
import { mostAppreciated, tipTotals, tippedLine } from "../tips";

const A = "AaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaA";
const B = "BbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbB";
const C = "CccccccccccccccccccccccccccccccccccccccccccC";

let n = 0;
function tip(from: string, to: string, amount: number, over: Partial<MemoTx> = {}): MemoTx {
  return {
    signature: `t${++n}`,
    blockTime: 1800000000 + n,
    signer: from,
    memo: tipMemo(to),
    failed: false,
    tagged: true,
    tip: { mint: SKR_MINT, from, to, amount },
    ...over,
  };
}

describe("tipTotals", () => {
  it("sums SKR per recipient with distinct tippers and counts", () => {
    const t = tipTotals([tip(A, B, 10), tip(A, B, 50), tip(C, B, 100), tip(B, A, 10)]);
    expect(t.get(B)).toEqual({ wallet: B, tipsSkr: 160, tippers: 2, tipsCount: 3 });
    expect(t.get(A)).toEqual({ wallet: A, tipsSkr: 10, tippers: 1, tipsCount: 1 });
    expect(t.has(C)).toBe(false);
  });

  it("ignores failed, untagged, non-SKR, self, mismatched and memo-only tips", () => {
    const bad: MemoTx[] = [
      tip(A, B, 10, { failed: true }),
      tip(A, B, 10, { tagged: false }),
      tip(A, B, 10, { tip: { mint: "So11111111111111111111111111111111111111112", from: A, to: B, amount: 10 } }),
      tip(A, A, 10),
      tip(A, B, 10, { tip: { mint: SKR_MINT, from: A, to: C, amount: 10 } }), // memo names B, transfer went to C
      tip(A, B, 10, { tip: { mint: SKR_MINT, from: C, to: B, amount: 10 } }), // not the signer's transfer
      tip(A, B, 10, { tip: undefined }), // memo claims a tip, no transfer parsed
      tip(A, B, 0),
      tip(A, B, Number.NaN),
      tip(A, B, 10, { memo: "rcpt:2:c:xyz" }),
      tip(A, B, 10, { blockTime: null }),
    ];
    expect(tipTotals(bad).size).toBe(0);
  });

  it("counts a signature once", () => {
    const t1 = tip(A, B, 10);
    expect(tipTotals([t1, { ...t1 }]).get(B)?.tipsSkr).toBe(10);
  });
});

describe("mostAppreciated", () => {
  it("top N by tipsSkr, then tippers, then wallet", () => {
    const t = tipTotals([tip(A, B, 50), tip(C, B, 50), tip(B, A, 100), tip(A, C, 100), tip(B, C, 0.5)]);
    expect(mostAppreciated(t).map((r) => [r.wallet, r.tipsSkr, r.tippers])).toEqual([
      [C, 100.5, 2],
      [B, 100, 2],
      [A, 100, 1],
    ]);
    expect(mostAppreciated(t, 1).map((r) => r.wallet)).toEqual([C]);
  });
});

describe("tippedLine", () => {
  it("says who tipped how much, or null without tips", () => {
    expect(tippedLine({ tipsSkr: 160, tippers: 3 })).toBe("Tipped 160 SKR by 3 people");
    expect(tippedLine({ tipsSkr: 12.5, tippers: 1 })).toBe("Tipped 12.5 SKR by 1 person");
    expect(tippedLine({ tipsSkr: 1234567, tippers: 2 })).toBe("Tipped 1,234,567 SKR by 2 people");
    expect(tippedLine({ tipsSkr: 0.000001, tippers: 1 })).toBe("Tipped 0.000001 SKR by 1 person");
    expect(tippedLine({ tipsSkr: 0, tippers: 0 })).toBeNull();
    expect(tippedLine(undefined)).toBeNull();
  });
});
