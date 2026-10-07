import {
  CEREMONY_LINES,
  CEREMONY_LINE_MS,
  CEREMONY_TICK_MS,
  CEREMONY_TICK_STEPS,
  ceremonyDuration,
  ceremonyFrame,
  formatChangePct,
  formatSigma,
} from "../ceremony";

const P = { p0: 100, pt: 110 };
const tickStart = CEREMONY_LINES * CEREMONY_LINE_MS;
const stampAt = tickStart + CEREMONY_TICK_MS;

describe("ceremonyFrame", () => {
  it("starts empty: no lines, no price, no stamp", () => {
    expect(ceremonyFrame(0, P)).toEqual({ lines: 0, price: null, stamp: false, done: false });
  });

  it("prints the paper lines one by one", () => {
    expect(ceremonyFrame(CEREMONY_LINE_MS - 1, P).lines).toBe(0);
    expect(ceremonyFrame(CEREMONY_LINE_MS, P).lines).toBe(1);
    expect(ceremonyFrame(2 * CEREMONY_LINE_MS + 5, P).lines).toBe(2);
    expect(ceremonyFrame(tickStart, P).lines).toBe(CEREMONY_LINES);
    expect(ceremonyFrame(10 * stampAt, P).lines).toBe(CEREMONY_LINES);
  });

  it("ticks the price from P0 towards PT after the lines are printed", () => {
    expect(ceremonyFrame(tickStart - 1, P).price).toBeNull();
    expect(ceremonyFrame(tickStart, P).price).toBe(100);
    const mid = ceremonyFrame(tickStart + CEREMONY_TICK_MS / 2, P).price as number;
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(110);
    expect(ceremonyFrame(stampAt, P).price).toBe(110);
  });

  it("moves monotonically in discrete steps, also downwards", () => {
    const down = { p0: 0.02, pt: 0.015 };
    const seen = new Set<number>();
    let prev = Infinity;
    for (let t = tickStart; t <= stampAt; t += 10) {
      const p = ceremonyFrame(t, down).price as number;
      expect(p).toBeLessThanOrEqual(prev);
      prev = p;
      seen.add(p);
    }
    expect(prev).toBe(0.015);
    expect(seen.size).toBeLessThanOrEqual(CEREMONY_TICK_STEPS + 1);
    expect(seen.size).toBeGreaterThan(3);
  });

  it("stays on P0 when the price did not move (VOID)", () => {
    for (const t of [tickStart, tickStart + 300, stampAt]) expect(ceremonyFrame(t, { p0: 5, pt: 5 }).price).toBe(5);
  });

  it("drops the stamp at the end and reports done", () => {
    expect(ceremonyFrame(stampAt - 1, P)).toMatchObject({ stamp: false, done: false });
    expect(ceremonyFrame(stampAt, P)).toMatchObject({ stamp: true, done: true });
    expect(ceremonyDuration()).toBe(stampAt);
  });

  it("treats negative/NaN time as the start", () => {
    expect(ceremonyFrame(-50, P)).toEqual(ceremonyFrame(0, P));
    expect(ceremonyFrame(Number.NaN, P)).toEqual(ceremonyFrame(0, P));
  });
});

describe("formatSigma", () => {
  it("signs and rounds to one decimal, vs coin flip", () => {
    expect(formatSigma(1.94)).toBe("+1.9σ vs coin flip");
    expect(formatSigma(-0.75)).toBe("−0.8σ vs coin flip");
    expect(formatSigma(0)).toBe("±0.0σ vs coin flip");
    expect(formatSigma(-0.01)).toBe("±0.0σ vs coin flip");
  });
  it("shows a dash with no scored calls", () => {
    expect(formatSigma(null)).toBe("—σ vs coin flip");
  });
});

describe("formatChangePct", () => {
  it("formats the signed move from P0 to PT", () => {
    expect(formatChangePct(100, 102.34)).toBe("+2.3%");
    expect(formatChangePct(0.02, 0.015)).toBe("−25.0%");
    expect(formatChangePct(5, 5)).toBe("±0.0%");
  });
});
