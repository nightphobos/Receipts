/**
 * Reveal ceremony timeline (spec "Viral surfaces"): the receipt paper prints its lines
 * (tx hash, sealed time, P0), the price ticks from P0 to PT, then the HIT/MISS stamp drops.
 * Pure TS: the UI drives it with elapsed milliseconds.
 */

/** Paper lines printed before the price starts ticking: tx hash, sealed time, P0. */
export const CEREMONY_LINES = 3;
export const CEREMONY_LINE_MS = 350;
export const CEREMONY_TICK_MS = 1500;
/** The ticker shows at most this many distinct intermediate prices (a register, not a tween). */
export const CEREMONY_TICK_STEPS = 12;

export interface CeremonyFrame {
  /** Paper lines printed so far (0..CEREMONY_LINES). */
  lines: number;
  /** Price on the ticker; null until it starts. */
  price: number | null;
  stamp: boolean;
  done: boolean;
}

export const ceremonyDuration = (): number => CEREMONY_LINES * CEREMONY_LINE_MS + CEREMONY_TICK_MS;

export function ceremonyFrame(elapsedMs: number, prices: { p0: number; pt: number }): CeremonyFrame {
  const t = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const tickStart = CEREMONY_LINES * CEREMONY_LINE_MS;
  const lines = Math.min(CEREMONY_LINES, Math.floor(t / CEREMONY_LINE_MS));
  if (t < tickStart) return { lines, price: null, stamp: false, done: false };
  const u = (t - tickStart) / CEREMONY_TICK_MS;
  if (u >= 1) return { lines, price: prices.pt, stamp: true, done: true };
  // Ease-out (fast first, settling at the end), quantized into register steps.
  const eased = 1 - (1 - u) * (1 - u);
  const step = Math.floor(eased * CEREMONY_TICK_STEPS) / CEREMONY_TICK_STEPS;
  return { lines, price: prices.p0 + (prices.pt - prices.p0) * step, stamp: false, done: false };
}

/** Signed with one decimal; anything that rounds to zero is "±0.0". */
function signed(x: number, digits: number): string {
  const abs = Math.abs(x).toFixed(digits);
  if (Number(abs) === 0) return `±${abs}`;
  return `${x > 0 ? "+" : "−"}${abs}`;
}

/** "+1.9σ"; "—σ" when nothing is scored yet. */
export function formatZ(z: number | null): string {
  return `${z === null ? "—" : signed(z, 1)}σ`;
}

/** "+1.9σ vs coin flip" (spec "Rating"); "—σ vs coin flip" when nothing is scored yet. */
export function formatSigma(z: number | null): string {
  return `${formatZ(z)} vs coin flip`;
}

/** Signed move from P0 to PT: "+2.3%". */
export function formatChangePct(p0: number, pt: number): string {
  return `${signed(((pt - p0) / p0) * 100, 1)}%`;
}
