/** New Receipt form → Call. Pure TS: no RN/Expo imports; the clock is passed in. */
import { validateCall, type Asset, type Direction, type ValidationResult } from "./call";

export interface DeadlinePreset {
  label: string;
  seconds: number;
}

export const DEADLINE_PRESETS: readonly DeadlinePreset[] = [
  { label: "1 h", seconds: 3600 },
  { label: "24 h", seconds: 86400 },
  { label: "3 d", seconds: 3 * 86400 },
  { label: "7 d", seconds: 7 * 86400 },
];

/** Plain positive decimal; comma accepted as decimal separator. No exponents, signs or thousands separators. */
function parsePositiveDecimal(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Target price text → number, or null if it isn't a plain positive decimal. */
export const parseTarget = (text: string): number | null => parsePositiveDecimal(text);

/** Custom deadline in hours from now → whole seconds, or null. Window is checked by validateCall. */
export function parseCustomHours(text: string): number | null {
  const h = parsePositiveDecimal(text);
  if (h === null) return null;
  const sec = Math.round(h * 3600);
  return Number.isSafeInteger(sec) && sec > 0 ? sec : null;
}

export interface Draft {
  asset: Asset;
  dir: Direction;
  targetText: string;
  /** Seconds from now until the deadline; null = none picked / custom input invalid. */
  durationSec: number | null;
}

/** Build and validate the call at `nowSec` (created = now, deadline = now + duration). */
export function draftCall(d: Draft, nowSec: number): ValidationResult {
  const target = parseTarget(d.targetText);
  const errors: string[] = [];
  if (target === null) errors.push("Enter a target price in USD, e.g. 150.25");
  if (d.durationSec === null) errors.push("Pick a deadline");
  if (target === null || d.durationSec === null) return { ok: false, errors };
  return validateCall(
    { v: 1, asset: d.asset, dir: d.dir, target, deadline: nowSec + d.durationSec, created: nowSec },
    nowSec,
  );
}
