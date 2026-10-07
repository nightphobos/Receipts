/**
 * Parallax background math (spec "Parallax background"). Pure; the functions marked
 * "worklet" also run on the Reanimated UI thread (the directive is a no-op string elsewhere).
 */

export type ParallaxLayer = {
  name: "stars" | "far" | "near";
  /** Seconds to drift one tile width to the left. */
  driftPeriodS: number;
  /** Max tilt displacement in dp at full tilt (±). */
  tiltPx: number;
  /** Fraction of the list scroll offset applied (upwards). */
  scrollFactor: number;
};

/** Back to front: stars, far city, near city. */
export const PARALLAX_LAYERS: readonly ParallaxLayer[] = [
  { name: "stars", driftPeriodS: 120, tiltPx: 4, scrollFactor: 0.1 },
  { name: "far", driftPeriodS: 60, tiltPx: 10, scrollFactor: 0.25 },
  { name: "near", driftPeriodS: 24, tiltPx: 18, scrollFactor: 0.5 },
];

/** Device rotation (radians) that maps to full tilt. ~29°. */
export const TILT_MAX_RAD = 0.5;

const finite = (v: number) => {
  "worklet";
  return Number.isFinite(v) ? v : 0;
};

const clamp = (v: number, lo: number, hi: number) => {
  "worklet";
  return Math.min(hi, Math.max(lo, v));
};

/** Round to a multiple of `grid` (dp per art pixel); grid ≤ 0 disables snapping. Never -0. */
export function snap(v: number, grid: number): number {
  "worklet";
  if (!(grid > 0)) return v;
  const r = Math.round(v / grid) * grid;
  return r === 0 ? 0 : r;
}

export type OffsetInput = {
  /** Layer index into PARALLAX_LAYERS (clamped). */
  depth: number;
  /** Seconds since start (ambient drift). */
  t: number;
  /** Normalised tilt in [-1, 1] (clamped). */
  tiltX: number;
  tiltY: number;
  /** List scroll offset in dp; negative overscroll is ignored. */
  scroll: number;
  /** Tile width in dp (= screen width; the layer is two tiles wide). */
  tileWidth: number;
  /** dp per art pixel for snapping. */
  grid: number;
  /** Reduce motion: static layers. */
  still?: boolean;
};

/**
 * Translate for one layer. x wraps into (-tileWidth, 0] so a 2-tile-wide layer always covers
 * the screen; y = tilt − scroll·factor. Both snapped to the art grid.
 */
export function layerOffset(i: OffsetInput): { x: number; y: number } {
  "worklet";
  if (i.still) return { x: 0, y: 0 };
  const layer = PARALLAX_LAYERS[clamp(Math.round(finite(i.depth)), 0, PARALLAX_LAYERS.length - 1)];
  const w = finite(i.tileWidth);
  const tiltX = clamp(finite(i.tiltX), -1, 1);
  const tiltY = clamp(finite(i.tiltY), -1, 1);
  let x = 0;
  if (w > 0) {
    x = -(finite(i.t) / layer.driftPeriodS) * w + tiltX * layer.tiltPx;
    x = x % w; // (-w, w)
    if (x > 0) x -= w;
  }
  const y = tiltY * layer.tiltPx - Math.max(0, finite(i.scroll)) * layer.scrollFactor;
  return { x: snap(x, i.grid), y: snap(y, i.grid) };
}

/** One step of an exponential low-pass filter; NaN samples are ignored. */
export function lowPass(prev: number, sample: number, alpha: number): number {
  "worklet";
  if (!Number.isFinite(sample)) return prev;
  const a = clamp(finite(alpha), 0, 1);
  return prev + (sample - prev) * a;
}

/**
 * DeviceMotion rotation → normalised tilt. gamma (left/right) is absolute; beta (front/back)
 * is relative to the resting angle the phone is held at (`restBeta`, itself slowly low-passed).
 */
export function normalizeTilt(gamma: number, beta: number, restBeta: number): { x: number; y: number } {
  "worklet";
  return {
    x: clamp(finite(gamma) / TILT_MAX_RAD, -1, 1),
    y: clamp((finite(beta) - finite(restBeta)) / TILT_MAX_RAD, -1, 1),
  };
}

/** Deterministic PRNG (mulberry32) so the art is identical on every launch. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Star = { x: number; y: number; grid: 0 | 1 };

/**
 * Two jittered dot grids (coarse bright, fine dim) in art pixels within a width × height tile.
 * Jitter stays inside each cell, so repeating the tile is seamless.
 */
export function starTile(width: number, height: number, seed: number): Star[] {
  const r = rng(seed);
  const out: Star[] = [];
  const grids: [0 | 1, number][] = [[0, 16], [1, 9]];
  for (const [grid, cell] of grids) {
    for (let cy = 0; cy + cell <= height; cy += cell) {
      for (let cx = 0; cx + cell <= width; cx += cell) {
        if (r() < (grid === 0 ? 0.5 : 0.35)) {
          out.push({ x: cx + Math.floor(r() * cell), y: cy + Math.floor(r() * cell), grid });
        }
      }
    }
  }
  return out;
}

export type Building = { x: number; w: number; h: number };
export type CityWindow = { x: number; y: number; color: number };

/**
 * A row of buildings exactly `width` art pixels wide (seamless when repeated), heights in
 * [30%, 100%] of `height`. With `lit`, 1-px windows on a 2-px lattice inside each building;
 * `color` indexes `colors.windows`.
 */
export function skylineTile(
  width: number,
  height: number,
  seed: number,
  minWidth: number,
  lit: boolean,
): { buildings: Building[]; windows: CityWindow[] } {
  const r = rng(seed);
  const minW = Math.max(1, Math.floor(minWidth));
  const buildings: Building[] = [];
  let x = 0;
  while (x < width) {
    let w = minW + Math.floor(r() * minW * 2);
    if (width - (x + w) < minW) w = width - x; // last one absorbs the remainder
    const h = Math.max(1, Math.round(height * (0.3 + 0.7 * r())));
    buildings.push({ x, w, h });
    x += w;
  }
  const windows: CityWindow[] = [];
  if (lit) {
    for (const b of buildings) {
      for (let wy = height - b.h + 2; wy < height - 1; wy += 2) {
        for (let wx = b.x + 1; wx < b.x + b.w - 1; wx += 2) {
          if (r() < 0.22) windows.push({ x: wx, y: wy, color: Math.floor(r() * 4) });
        }
      }
    }
  }
  return { buildings, windows };
}
