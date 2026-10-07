import { canonicalJsonV2, type CallV2 } from "../call";
import { commitHash } from "../commit";
import type { MemoTx } from "../history";
import {
  buildLeaderboard,
  isSkrDaily,
  priceKey,
  pricesNeeded,
  receiptsByWallet,
  walletProfile,
  withPrices,
  type WalletEntry,
} from "../leaderboard";
import { encodeCommitMemoV2, encodeRevealMemoV2 } from "../memo";
import { horizonClass, type ReceiptV2 } from "../score";

const H = 3600;
const DAY = 86400;
const T = 1800000000; // a commit blockTime (Fri 2027-01-15 08:00 UTC)
const NOW = T + 30 * DAY;

let n = 0;
function rcpt(over: Partial<ReceiptV2> & { dir?: "up" | "down" } = {}): ReceiptV2 {
  const { dir, ...rest } = over;
  const commitTime = rest.commit?.blockTime ?? T;
  const deadline = rest.deadline ?? commitTime + DAY;
  const base: ReceiptV2 = {
    v: 2,
    hash: `h${++n}`,
    asset: "SOL",
    deadline,
    horizon: horizonClass(commitTime, deadline),
    commit: { signature: `c${n}`, blockTime: commitTime },
    overlap: false,
  };
  const r = { ...base, ...rest };
  if (dir) {
    r.reveal = {
      signature: `r${n}`,
      blockTime: deadline + 60,
      call: { v: 2, asset: r.asset, dir, deadline, created: commitTime - 5 },
      json: "{}",
      salt: "00".repeat(16),
    };
  }
  return r;
}
const hit = (over: Partial<ReceiptV2> = {}) => rcpt({ dir: "up", p0: 100, pt: 101, ...over });
const miss = (over: Partial<ReceiptV2> = {}) => rcpt({ dir: "up", p0: 100, pt: 99, ...over });
/** `count` receipts spread over distinct UTC days, each committed `k` days after T. */
const onDays = (count: number, make: (o: Partial<ReceiptV2>) => ReceiptV2) =>
  Array.from({ length: count }, (_, k) => make({ commit: { signature: `d${++n}`, blockTime: T + k * DAY } }));

describe("receiptsByWallet", () => {
  const salt = "ab".repeat(16);
  function pair(wallet: string, sig: string, call: CallV2, commitTime: number): MemoTx[] {
    const json = canonicalJsonV2(call);
    const hash = commitHash(json, salt);
    return [
      { signature: `${sig}c`, blockTime: commitTime, signer: wallet, memo: encodeCommitMemoV2(hash, call.deadline, call.asset), failed: false, tagged: true },
      { signature: `${sig}r`, blockTime: call.deadline + 10, signer: wallet, memo: encodeRevealMemoV2(json, salt), failed: false, tagged: true },
    ];
  }

  it("groups registry txs per signer and builds each wallet's v2 receipts", () => {
    const a = pair("WalletA", "a1", { v: 2, asset: "SOL", dir: "up", deadline: T + DAY, created: T - 3 }, T);
    const b = pair("WalletB", "b1", { v: 2, asset: "SKR", dir: "down", deadline: T + 2 * DAY, created: T - 3 }, T);
    const out = receiptsByWallet([...b, ...a]);
    expect([...out.keys()]).toEqual(["WalletA", "WalletB"]);
    expect(out.get("WalletA")).toHaveLength(1);
    expect(out.get("WalletA")![0].reveal?.call.dir).toBe("up");
    expect(out.get("WalletB")![0].asset).toBe("SKR");
  });

  it("ignores untagged txs (same view as the app)", () => {
    const a = pair("WalletA", "a1", { v: 2, asset: "SOL", dir: "up", deadline: T + DAY, created: T - 3 }, T).map((t) => ({
      ...t,
      tagged: false,
    }));
    expect(receiptsByWallet(a).size).toBe(0);
  });
});

describe("prices", () => {
  it("priceKey is asset:ts", () => {
    expect(priceKey("SOL", 1800000060)).toBe("SOL:1800000060");
  });

  it("needs P0 for every commit and PT only for revealed past deadlines, deduped, settled ≥ 60 s ago", () => {
    const revealed = hit({ p0: undefined, pt: undefined, commit: { signature: "x", blockTime: T + 5 } });
    const sealed = rcpt({ asset: "SKR", commit: { signature: "y", blockTime: T + 5 } }); // same t0 → separate asset
    const future = rcpt({ commit: { signature: "z", blockTime: NOW - 10 }, deadline: NOW + DAY });
    const needs = pricesNeeded([revealed, sealed, future], NOW);
    expect(needs).toEqual([
      { asset: "SOL", ts: T + 60 },
      { asset: "SOL", ts: T + 5 + DAY },
      { asset: "SKR", ts: T + 60 },
    ]);
    expect(pricesNeeded([revealed, revealed], NOW)).toHaveLength(2);
  });

  it("withPrices fills p0/pt from the cache and null when missing", () => {
    const r = hit({ p0: undefined, pt: undefined });
    const filled = withPrices(r, { [priceKey("SOL", T + 60)]: 150 });
    expect(filled.p0).toBe(150);
    expect(filled.pt).toBeNull();
    expect(r.p0).toBeUndefined(); // not mutated
    const sealed = withPrices(rcpt(), { [priceKey("SOL", T + 60)]: 150, [priceKey("SOL", T + DAY)]: 1 });
    expect(sealed.pt).toBeNull(); // PT only once revealed
  });
});

describe("isSkrDaily", () => {
  it("is an SKR call whose deadline is 12:00 UTC at least 12 h after the commit", () => {
    const noon = Math.floor(T / DAY) * DAY + 12 * H + DAY; // next day's noon, > 12 h away
    expect(isSkrDaily(rcpt({ asset: "SKR", deadline: noon }))).toBe(true);
    expect(isSkrDaily(rcpt({ asset: "SOL", deadline: noon }))).toBe(false);
    expect(isSkrDaily(rcpt({ asset: "SKR", deadline: noon + 60 }))).toBe(false);
    expect(isSkrDaily(rcpt({ asset: "SKR", deadline: noon + DAY }))).toBe(false); // 3d class
    expect(isSkrDaily(rcpt({ asset: "SKR", deadline: noon, commit: { signature: "s", blockTime: noon - 11 * H } }))).toBe(
      false,
    );
  });
});

describe("buildLeaderboard", () => {
  const entry = (wallet: string, receipts: ReceiptV2[], hasGenesis = true): WalletEntry => ({ wallet, receipts, hasGenesis });

  it("overall lists only eligible wallets, ranked by z, then N, then wallet", () => {
    const strong = [...onDays(10, hit), ...onDays(2, miss)]; // 10-2 → z = 8/√12
    const weak = [...onDays(6, hit), ...onDays(6, miss)]; // z = 0
    const tieBig = [...onDays(12, hit), ...onDays(4, miss)]; // z = 8/4 = 2
    const lb = buildLeaderboard(
      [
        entry("W-weak", weak),
        entry("W-strong", strong),
        entry("W-nogenesis", onDays(12, hit), false),
        entry("W-few", onDays(9, hit)),
        entry("W-tie", tieBig),
      ],
      NOW,
    );
    expect(lb.version).toBe(1);
    expect(lb.generatedAt).toBe(NOW);
    expect(lb.wallets).toBe(5);
    expect(lb.overall.map((r) => r.wallet)).toEqual(["W-strong", "W-tie", "W-weak"]);
    expect(lb.overall.map((r) => r.rank)).toEqual([1, 2, 3]);
    const top = lb.overall[0];
    expect(top).toMatchObject({ n: 12, hits: 10, misses: 2, days: 10, forfeited: 0, overlaps: 0, voids: 0 });
    expect(top.z).toBeCloseTo(8 / Math.sqrt(12));
    expect(top.hitRate).toBeCloseTo(10 / 12);
  });

  it("overall ignores 1h practice calls", () => {
    const practice = onDays(20, (o) =>
      miss({ ...o, deadline: (o.commit?.blockTime ?? T) + H }),
    );
    const lb = buildLeaderboard([entry("W", [...onDays(10, hit), ...practice])], NOW);
    expect(lb.overall[0]).toMatchObject({ n: 10, hits: 10, misses: 0 });
  });

  it("ties on z and N fall back to wallet order", () => {
    const lb = buildLeaderboard([entry("B", onDays(10, hit)), entry("A", onDays(10, hit))], NOW);
    expect(lb.overall.map((r) => r.wallet)).toEqual(["A", "B"]);
  });

  it("SKR Daily ranks Genesis holders by their SKR Daily calls only", () => {
    const daily = (o: Partial<ReceiptV2>) => {
      const bt = o.commit?.blockTime ?? T;
      return { asset: "SKR" as const, deadline: Math.floor(bt / DAY) * DAY + 12 * H + DAY, ...o };
    };
    const lb = buildLeaderboard(
      [
        entry("D1", [...onDays(2, (o) => hit(daily(o))), hit()]),
        entry("D2", [...onDays(3, (o) => hit(daily(o)))]),
        entry("D3", onDays(3, (o) => hit(daily(o))), false),
        entry("D4", [hit(), miss()]),
      ],
      NOW,
    );
    expect(lb.skrDaily.map((r) => [r.wallet, r.n])).toEqual([
      ["D2", 3],
      ["D1", 2],
    ]);
    expect(lb.overall).toEqual([]);
  });
});

describe("walletProfile", () => {
  it("summarises stats, eligibility, streak and per-receipt status", () => {
    const rs = [hit(), miss({ overlap: true }), rcpt({ commit: { signature: "s", blockTime: NOW - H }, deadline: NOW + DAY })];
    const p = walletProfile("W", rs, true, NOW);
    expect(p.wallet).toBe("W");
    expect(p.hasGenesis).toBe(true);
    expect(p.stats).toMatchObject({ hits: 1, misses: 1, overlaps: 1, pending: 1 });
    expect(p.eligibility).toMatchObject({ eligible: false, n: 2, hasGenesis: true });
    expect(p.streak).toBe(1);
    expect(p.receipts.map((r) => r.status)).toEqual(["sealed", "hit", "overlap"]);
    const revealed = p.receipts[1];
    expect(revealed).toMatchObject({ asset: "SOL", horizon: "24h", dir: "up", p0: 100, pt: 101 });
    expect(revealed.revealSignature).toMatch(/^r/);
    expect(p.receipts[0].dir).toBeUndefined(); // hidden until revealed
  });
});
