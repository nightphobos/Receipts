import { DEADLINE_PRESETS, draftCall, parseCustomHours, parseTarget } from "../draft";
import { MAX_DEADLINE_SEC, MIN_DEADLINE_SEC } from "../call";

const NOW = 1_800_000_000;

describe("parseTarget", () => {
  it.each([
    ["150", 150],
    ["150.25", 150.25],
    ["0,00002", 0.00002],
    [" 97000 ", 97000],
    [".5", 0.5],
    ["5.", 5],
  ])("parses %p", (s, n) => expect(parseTarget(s)).toBe(n));

  it.each(["", " ", "abc", "1e5", "-3", "1.2.3", "1,000.5", "0x10", "Infinity", "12$"])("rejects %p", (s) =>
    expect(parseTarget(s)).toBeNull(),
  );
});

describe("parseCustomHours", () => {
  it("parses whole and fractional hours to seconds", () => {
    expect(parseCustomHours("2")).toBe(7200);
    expect(parseCustomHours("1.5")).toBe(5400);
    expect(parseCustomHours("48")).toBe(172800);
  });
  it("rounds to whole seconds", () => expect(Number.isSafeInteger(parseCustomHours("1.0001"))).toBe(true));
  it.each(["", "x", "-1", "0"])("rejects %p", (s) => expect(parseCustomHours(s)).toBeNull());
});

describe("DEADLINE_PRESETS", () => {
  it("are 1h, 24h, 3d, 7d", () =>
    expect(DEADLINE_PRESETS.map((p) => p.seconds)).toEqual([3600, 86400, 3 * 86400, 7 * 86400]));
  it("all pass validation", () => {
    for (const p of DEADLINE_PRESETS) {
      const r = draftCall({ asset: "SOL", dir: "above", targetText: "1", durationSec: p.seconds }, NOW);
      expect(r.ok).toBe(true);
    }
  });
});

describe("draftCall", () => {
  it("builds a valid call with created = now, deadline = now + duration", () => {
    const r = draftCall({ asset: "SKR", dir: "below", targetText: "0,00002", durationSec: 86400 }, NOW);
    expect(r).toEqual({
      ok: true,
      call: { v: 1, asset: "SKR", dir: "below", target: 0.00002, deadline: NOW + 86400, created: NOW },
    });
  });

  it("reports an unparseable target", () => {
    const r = draftCall({ asset: "SOL", dir: "above", targetText: "abc", durationSec: 3600 }, NOW);
    expect(r).toEqual({ ok: false, errors: ["Enter a target price in USD, e.g. 150.25"] });
  });

  it("reports a missing deadline", () => {
    const r = draftCall({ asset: "SOL", dir: "above", targetText: "1", durationSec: null }, NOW);
    expect(r).toEqual({ ok: false, errors: ["Pick a deadline"] });
  });

  it("passes through validateCall window errors", () => {
    const short = draftCall({ asset: "SOL", dir: "above", targetText: "1", durationSec: MIN_DEADLINE_SEC - 1 }, NOW);
    expect(short).toEqual({ ok: false, errors: ["Deadline must be at least 1 hour from now"] });
    const long = draftCall({ asset: "SOL", dir: "above", targetText: "1", durationSec: MAX_DEADLINE_SEC + 1 }, NOW);
    expect(long).toEqual({ ok: false, errors: ["Deadline must be at most 30 days from now"] });
  });

  it("collects target and deadline errors together", () => {
    const r = draftCall({ asset: "SOL", dir: "above", targetText: "", durationSec: null }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(2);
  });
});
