import {
  eligibility,
  hasOpenPosition,
  horizonClass,
  LEADERBOARD_MIN_DAYS,
  LEADERBOARD_MIN_N,
  resolveV2,
  REVEAL_GRACE_SEC,
  statsV2,
  statusOfV2,
  streak,
  utcDay,
  zScore,
  type AnyReceipt,
  type HorizonClass,
  type ReceiptV2,
} from "../score";

const H = 3600;
const DAY = 86400;
const T = 1800000000; // commit blockTime used by default

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

describe("horizonClass", () => {
  const cases: [number, HorizonClass][] = [
    [1 * H, "1h"],
    [2 * H, "1h"],
    [2 * H + 1, "24h"],
    [24 * H, "24h"],
    [36 * H, "24h"],
    [36 * H + 1, "3d"],
    [4 * DAY, "3d"],
    [4 * DAY + 1, "7d"],
    [7 * DAY, "7d"],
    [30 * DAY, "7d"],
  ];
  it.each(cases)("deadline − commit = %i s → %s", (d, cls) => {
    expect(horizonClass(T, T + d)).toBe(cls);
  });
});

describe("resolveV2", () => {
  it("up: PT > P0 hit, PT < P0 miss", () => {
    expect(resolveV2("up", 100, 100.01)).toBe("hit");
    expect(resolveV2("up", 100, 99.99)).toBe("miss");
  });
  it("down: PT < P0 hit, PT > P0 miss", () => {
    expect(resolveV2("down", 100, 99.99)).toBe("hit");
    expect(resolveV2("down", 100, 100.01)).toBe("miss");
  });
  it("PT == P0 is void for both directions", () => {
    expect(resolveV2("up", 0.0165, 0.0165)).toBe("void");
    expect(resolveV2("down", 0.0165, 0.0165)).toBe("void");
  });
  it("rejects invalid prices", () => {
    expect(() => resolveV2("up", 0, 1)).toThrow();
    expect(() => resolveV2("up", 1, NaN)).toThrow();
    expect(() => resolveV2("up", -1, 1)).toThrow();
  });
});

describe("statusOfV2", () => {
  it("sealed before the deadline, awaiting_reveal until deadline + 24 h, then forfeited", () => {
    const r = rcpt();
    expect(statusOfV2(r, r.deadline - 1)).toBe("sealed");
    expect(statusOfV2(r, r.deadline)).toBe("awaiting_reveal");
    expect(statusOfV2(r, r.deadline + REVEAL_GRACE_SEC - 1)).toBe("awaiting_reveal");
    expect(statusOfV2(r, r.deadline + REVEAL_GRACE_SEC)).toBe("forfeited");
  });
  it("revealed: hit / miss / void from P0 and PT", () => {
    const now = T + 3 * DAY;
    expect(statusOfV2(hit(), now)).toBe("hit");
    expect(statusOfV2(miss(), now)).toBe("miss");
    expect(statusOfV2(rcpt({ dir: "down", p0: 5, pt: 5 }), now)).toBe("void");
    expect(statusOfV2(rcpt({ dir: "down", p0: 5, pt: 4 }), now)).toBe("hit");
  });
  it("revealed but P0 or PT unknown → unresolved", () => {
    const now = T + 3 * DAY;
    expect(statusOfV2(rcpt({ dir: "up" }), now)).toBe("unresolved");
    expect(statusOfV2(rcpt({ dir: "up", p0: 1, pt: null }), now)).toBe("unresolved");
    expect(statusOfV2(rcpt({ dir: "up", p0: null, pt: 1 }), now)).toBe("unresolved");
  });
  it("overlap wins over everything, even a winning reveal", () => {
    expect(statusOfV2(hit({ overlap: true }), T + 3 * DAY)).toBe("overlap");
    expect(statusOfV2(rcpt({ overlap: true }), T)).toBe("overlap");
  });
  it("v1 receipts are legacy", () => {
    const legacy: AnyReceipt = { v: 1, hash: "x", deadline: T + DAY, commit: { signature: "s", blockTime: T } };
    expect(statusOfV2(legacy, T + 3 * DAY)).toBe("legacy");
  });
});

describe("zScore", () => {
  it("(H − M) / √N", () => {
    expect(zScore(7, 3)).toBeCloseTo(4 / Math.sqrt(10), 12);
    expect(zScore(3, 7)).toBeCloseTo(-4 / Math.sqrt(10), 12);
    expect(zScore(5, 5)).toBe(0);
    expect(zScore(4, 0)).toBe(2);
  });
  it("null when N = 0", () => {
    expect(zScore(0, 0)).toBeNull();
  });
});

describe("statsV2", () => {
  const now = T + 10 * DAY;
  const legacy: AnyReceipt = { v: 1, hash: "x", deadline: T + DAY, commit: { signature: "s", blockTime: T } };
  const all: AnyReceipt[] = [
    hit(),
    hit(),
    hit({ deadline: T + H }), // 1h practice
    miss(),
    rcpt({ dir: "up", p0: 2, pt: 2 }), // void
    rcpt(), // forfeited (no reveal, past grace)
    rcpt({ overlap: true }), // overlap
    rcpt({ dir: "down" }), // unresolved
    rcpt({ deadline: now + DAY, commit: { signature: "cx", blockTime: now - H } }), // sealed
    legacy,
  ];

  it("counts every status; misses include forfeits and overlaps; void excluded", () => {
    expect(statsV2(all, now)).toEqual({
      total: 10,
      hits: 3,
      misses: 3,
      forfeited: 1,
      overlaps: 1,
      voids: 1,
      pending: 2,
      legacy: 1,
      n: 6,
      hitRate: 0.5,
      z: 0,
    });
  });

  it("leaderboard mode drops 1h practice calls", () => {
    const s = statsV2(all, now, { leaderboard: true });
    expect(s.hits).toBe(2);
    expect(s.n).toBe(5);
    expect(s.z).toBeCloseTo(-1 / Math.sqrt(5), 12);
  });

  it("empty → null hit-rate and z", () => {
    const s = statsV2([], now);
    expect(s.n).toBe(0);
    expect(s.hitRate).toBeNull();
    expect(s.z).toBeNull();
  });
});

describe("eligibility", () => {
  const now = T + 30 * DAY;
  const onDay = (d: number, f: typeof hit = hit) => f({ commit: { signature: `d${d}-${++n}`, blockTime: T + d * DAY } });
  const tenOnThreeDays = () => [0, 0, 0, 0, 1, 1, 1, 2, 2, 2].map((d, i) => onDay(d, i % 3 ? hit : miss));

  it("eligible with N ≥ 10 (≥ 24h), ≥ 3 UTC days and a Genesis token", () => {
    const e = eligibility(tenOnThreeDays(), now, true);
    expect(e).toEqual({ eligible: true, n: 10, days: 3, hasGenesis: true });
    expect(LEADERBOARD_MIN_N).toBe(10);
    expect(LEADERBOARD_MIN_DAYS).toBe(3);
  });
  it("not eligible without the Genesis token", () => {
    expect(eligibility(tenOnThreeDays(), now, false).eligible).toBe(false);
  });
  it("not eligible with N = 9", () => {
    const e = eligibility(tenOnThreeDays().slice(1), now, true);
    expect(e.n).toBe(9);
    expect(e.eligible).toBe(false);
  });
  it("not eligible on only 2 distinct UTC days", () => {
    const rs = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1].map((d) => onDay(d));
    const e = eligibility(rs, now, true);
    expect(e.days).toBe(2);
    expect(e.eligible).toBe(false);
  });
  it("1h calls, voids, pending and legacy do not count", () => {
    const rs: AnyReceipt[] = [
      ...tenOnThreeDays().slice(1),
      hit({ deadline: T + H }),
      rcpt({ dir: "up", p0: 1, pt: 1 }),
      rcpt({ dir: "up" }),
      { v: 1, hash: "x", deadline: T + DAY, commit: { signature: "s", blockTime: T } },
    ];
    expect(eligibility(rs, now, true).n).toBe(9);
  });
  it("forfeits and overlaps count toward N", () => {
    const rs = [...tenOnThreeDays().slice(2), onDay(5, () => rcpt({ commit: { signature: "f", blockTime: T + 5 * DAY } })), rcpt({ overlap: true })];
    expect(eligibility(rs, now, true).n).toBe(10);
  });
});

describe("streak", () => {
  const at = (ts: number, revealTs?: number): ReceiptV2 => {
    const r = rcpt({ commit: { signature: `s${++n}`, blockTime: ts }, deadline: ts + DAY });
    if (revealTs != null) {
      r.reveal = { signature: `rv${n}`, blockTime: revealTs, call: { v: 2, asset: "SOL", dir: "up", deadline: ts + DAY, created: ts }, json: "{}", salt: "00".repeat(16) };
    }
    return r;
  };
  const day0 = utcDay(T) * DAY; // 00:00 UTC of T's day

  it("utcDay floors to UTC days", () => {
    expect(utcDay(day0)).toBe(utcDay(day0 + DAY - 1));
    expect(utcDay(day0 + DAY)).toBe(utcDay(day0) + 1);
  });
  it("0 with no activity", () => {
    expect(streak([], T)).toBe(0);
  });
  it("counts consecutive UTC days ending today", () => {
    const rs = [at(day0 + 100), at(day0 + DAY + 5), at(day0 + 2 * DAY + 7)];
    expect(streak(rs, day0 + 2 * DAY + 3600)).toBe(3);
  });
  it("today without activity yet does not break yesterday's streak", () => {
    const rs = [at(day0 + 100), at(day0 + DAY + 5)];
    expect(streak(rs, day0 + 2 * DAY + 3600)).toBe(2);
  });
  it("a gap day resets it", () => {
    const rs = [at(day0 + 100), at(day0 + 2 * DAY + 5)];
    expect(streak(rs, day0 + 2 * DAY + 3600)).toBe(1);
    expect(streak(rs, day0 + 4 * DAY)).toBe(0);
  });
  it("reveals count as activity too, legacy does not", () => {
    const rs: AnyReceipt[] = [
      at(day0 - 5 * DAY, day0 + DAY + 9), // reveal on day 1
      at(day0 + 2 * DAY + 1),
      { v: 1, hash: "x", deadline: day0 + DAY, commit: { signature: "s", blockTime: day0 + 10 } },
    ];
    expect(streak(rs, day0 + 2 * DAY + 50)).toBe(2);
  });
});

describe("hasOpenPosition", () => {
  const open = rcpt({ asset: "SOL", deadline: T + DAY });
  it("true while a same asset + class call is before its deadline", () => {
    expect(hasOpenPosition([open], "SOL", "24h", T + 60)).toBe(true);
    expect(hasOpenPosition([open], "SOL", "24h", T + DAY - 1)).toBe(true);
  });
  it("false at/after the deadline, for another asset or another class", () => {
    expect(hasOpenPosition([open], "SOL", "24h", T + DAY)).toBe(false);
    expect(hasOpenPosition([open], "SKR", "24h", T + 60)).toBe(false);
    expect(hasOpenPosition([open], "SOL", "3d", T + 60)).toBe(false);
  });
  it("overlap receipts do not hold a position; legacy ignored", () => {
    expect(hasOpenPosition([rcpt({ overlap: true })], "SOL", "24h", T + 60)).toBe(false);
    const legacy: AnyReceipt = { v: 1, hash: "x", deadline: T + DAY, commit: { signature: "s", blockTime: T } };
    expect(hasOpenPosition([legacy], "SOL", "24h", T + 60)).toBe(false);
  });
});
