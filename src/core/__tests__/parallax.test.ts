import {
  PARALLAX_LAYERS,
  layerOffset,
  lowPass,
  normalizeTilt,
  snap,
  starTile,
  skylineTile,
  TILT_MAX_RAD,
} from "../parallax";

const W = 400; // tile width in dp (= screen width)

const base = { t: 0, tiltX: 0, tiltY: 0, scroll: 0, tileWidth: W, grid: 1 };

describe("PARALLAX_LAYERS", () => {
  it("matches spec periods, tilt ranges and scroll factors (stars, far, near)", () => {
    expect(PARALLAX_LAYERS.map((l) => [l.name, l.driftPeriodS, l.tiltPx, l.scrollFactor])).toEqual([
      ["stars", 120, 4, 0.1],
      ["far", 60, 10, 0.25],
      ["near", 24, 18, 0.5],
    ]);
  });
});

describe("snap", () => {
  it("rounds to the pixel grid and never returns -0", () => {
    expect(snap(5.4, 1)).toBe(5);
    expect(snap(5.6, 1)).toBe(6);
    expect(snap(7, 3)).toBe(6);
    expect(snap(8, 3)).toBe(9);
    expect(Object.is(snap(-0.2, 1), 0)).toBe(true);
    expect(snap(5.4, 0)).toBe(5.4); // grid ≤ 0 → no snapping
  });
});

describe("layerOffset", () => {
  it("is zero at rest", () => {
    for (let d = 0; d < 3; d++) expect(layerOffset({ ...base, depth: d })).toEqual({ x: 0, y: 0 });
  });

  it("drifts left by one tile width per period and wraps into (-W, 0]", () => {
    expect(layerOffset({ ...base, depth: 2, t: 6 }).x).toBe(-100); // 24 s period → quarter tile
    expect(layerOffset({ ...base, depth: 0, t: 60 }).x).toBe(-200); // 120 s period → half tile
    expect(layerOffset({ ...base, depth: 1, t: 60 }).x).toBe(0); // full period wraps
    expect(layerOffset({ ...base, depth: 1, t: 75 }).x).toBe(-100);
    for (let t = 0; t < 200; t += 7.3) {
      const { x } = layerOffset({ ...base, depth: 2, t });
      expect(x).toBeLessThanOrEqual(0);
      expect(x).toBeGreaterThan(-W);
    }
  });

  it("applies tilt within ±4 / ±10 / ±18 px and clamps tilt to [-1, 1]", () => {
    expect(layerOffset({ ...base, depth: 0, tiltX: 1, tiltY: -1 })).toEqual({ x: -W + 4, y: -4 });
    expect(layerOffset({ ...base, depth: 1, tiltX: -1, tiltY: 1 })).toEqual({ x: -10, y: 10 });
    expect(layerOffset({ ...base, depth: 2, tiltX: -5, tiltY: 5 })).toEqual({ x: -18, y: 18 });
    expect(layerOffset({ ...base, depth: 2, tiltX: -0.5, tiltY: 0.5 })).toEqual({ x: -9, y: 9 });
  });

  it("moves layers up with scroll by 0.1 / 0.25 / 0.5 and ignores overscroll", () => {
    expect(layerOffset({ ...base, depth: 0, scroll: 100 }).y).toBe(-10);
    expect(layerOffset({ ...base, depth: 1, scroll: 100 }).y).toBe(-25);
    expect(layerOffset({ ...base, depth: 2, scroll: 100 }).y).toBe(-50);
    expect(layerOffset({ ...base, depth: 2, scroll: -80 }).y).toBe(0);
  });

  it("combines sources and snaps to the art grid", () => {
    // near: drift 1 s → -16.67, tilt 0.3 → -5.4 ⇒ -22.07 → grid 3 → -21
    const o = layerOffset({ ...base, depth: 2, t: 1, tiltX: -0.3, tiltY: 0.2, scroll: 10, grid: 3 });
    expect(o.x).toBe(-21);
    // y: 0.2*18 - 10*0.5 = -1.4 → grid 3 → 0
    expect(o.y).toBe(0);
    expect(Math.abs(o.x % 3)).toBe(0);
  });

  it("is static when motion is disabled", () => {
    expect(layerOffset({ ...base, depth: 2, t: 13, tiltX: 1, tiltY: 1, scroll: 300, still: true })).toEqual({ x: 0, y: 0 });
  });

  it("clamps an unknown depth to the nearest layer and tolerates bad input", () => {
    expect(layerOffset({ ...base, depth: 9, t: 6 }).x).toBe(-100);
    expect(layerOffset({ ...base, depth: -1, tiltY: 1 }).y).toBe(4);
    expect(layerOffset({ ...base, depth: 1, t: NaN, tiltX: NaN, scroll: NaN })).toEqual({ x: 0, y: 0 });
    expect(layerOffset({ ...base, depth: 1, t: 5, tileWidth: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("lowPass / normalizeTilt", () => {
  it("lowPass moves alpha of the way to the sample", () => {
    expect(lowPass(0, 10, 0.2)).toBeCloseTo(2);
    expect(lowPass(5, 5, 0.5)).toBe(5);
    expect(lowPass(1, NaN, 0.5)).toBe(1);
    expect(lowPass(1, 3, 2)).toBe(3); // alpha clamped to 1
  });

  it("normalizeTilt maps gamma and beta relative to rest into [-1, 1]", () => {
    expect(normalizeTilt(0, 0.8, 0.8)).toEqual({ x: 0, y: 0 });
    expect(normalizeTilt(TILT_MAX_RAD / 2, 0.8 + TILT_MAX_RAD / 4, 0.8)).toEqual({ x: 0.5, y: 0.25 });
    expect(normalizeTilt(3, -3, 0)).toEqual({ x: 1, y: -1 });
    expect(normalizeTilt(NaN, NaN, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("tiles", () => {
  it("starTile is deterministic, inside the tile, two grids", () => {
    const a = starTile(100, 60, 7);
    expect(a).toEqual(starTile(100, 60, 7));
    expect(a).not.toEqual(starTile(100, 60, 8));
    expect(new Set(a.map((s) => s.grid))).toEqual(new Set([0, 1]));
    for (const s of a) {
      expect(Number.isInteger(s.x) && Number.isInteger(s.y)).toBe(true);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(100);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(60);
    }
  });

  it("skylineTile covers the full width with seamless buildings and windows inside them", () => {
    const { buildings, windows } = skylineTile(120, 40, 20, 3, true);
    expect(skylineTile(120, 40, 20, 3, true)).toEqual({ buildings, windows });
    expect(buildings[0].x).toBe(0);
    let x = 0;
    for (const b of buildings) {
      expect(b.x).toBe(x);
      expect(b.w).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThan(0);
      expect(b.h).toBeLessThanOrEqual(40);
      x += b.w;
    }
    expect(x).toBe(120); // exact width → seamless when repeated
    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) {
      const b = buildings.find((bb) => w.x >= bb.x && w.x < bb.x + bb.w)!;
      expect(w.y).toBeGreaterThanOrEqual(40 - b.h);
      expect(w.y).toBeLessThan(40);
      expect(w.color).toBeGreaterThanOrEqual(0);
      expect(w.color).toBeLessThan(4);
    }
    expect(skylineTile(120, 40, 20, 3, false).windows).toEqual([]);
  });
});
