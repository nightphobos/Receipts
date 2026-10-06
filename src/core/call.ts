/** Call types, validation and canonical JSON. Pure TS: no RN/Expo imports. */

export const ASSETS = ["SOL", "BTC", "ETH", "JUP", "BONK"] as const;
export type Asset = (typeof ASSETS)[number];

export const DIRECTIONS = ["above", "below"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** All times are unix seconds. */
export interface Call {
  v: 1;
  asset: Asset;
  dir: Direction;
  target: number;
  deadline: number;
  created: number;
}

export const MIN_DEADLINE_SEC = 3600; // now + 1 h
export const MAX_DEADLINE_SEC = 30 * 24 * 3600; // now + 30 d

const KEYS = ["v", "asset", "dir", "target", "deadline", "created"] as const;

export type ValidationResult = { ok: true; call: Call } | { ok: false; errors: string[] };

const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Field-level checks that don't depend on the clock. */
function schemaErrors(x: unknown): string[] {
  if (!isPlainObject(x)) return ["Call must be an object"];
  const errors: string[] = [];
  if (x.v !== 1) errors.push("Unsupported version");
  if (!(ASSETS as readonly unknown[]).includes(x.asset)) errors.push(`Asset must be one of ${ASSETS.join(", ")}`);
  if (!(DIRECTIONS as readonly unknown[]).includes(x.dir)) errors.push("Direction must be above or below");
  if (typeof x.target !== "number" || !Number.isFinite(x.target) || x.target <= 0)
    errors.push("Target must be a positive number");
  if (!Number.isSafeInteger(x.deadline)) errors.push("Deadline must be a whole unix timestamp");
  if (!Number.isSafeInteger(x.created)) errors.push("Created must be a whole unix timestamp");
  return errors;
}

/** Schema-only guard (exact keys, valid fields); no time window. Used when decoding reveals. */
export function isCall(x: unknown): x is Call {
  if (!isPlainObject(x)) return false;
  const keys = Object.keys(x);
  if (keys.length !== KEYS.length || !KEYS.every((k) => keys.includes(k))) return false;
  return schemaErrors(x).length === 0;
}

/** Full validation for a new call at `nowSec`: schema + deadline in [now+1h, now+30d] + created ≤ now. */
export function validateCall(x: unknown, nowSec: number): ValidationResult {
  const errors = schemaErrors(x);
  if (isPlainObject(x)) {
    if (Number.isSafeInteger(x.deadline)) {
      const d = x.deadline as number;
      if (d < nowSec + MIN_DEADLINE_SEC) errors.push("Deadline must be at least 1 hour from now");
      if (d > nowSec + MAX_DEADLINE_SEC) errors.push("Deadline must be at most 30 days from now");
    }
    if (Number.isSafeInteger(x.created) && (x.created as number) > nowSec)
      errors.push("Created time cannot be in the future");
  }
  if (errors.length > 0) return { ok: false, errors };
  const c = x as unknown as Call;
  return { ok: true, call: { v: 1, asset: c.asset, dir: c.dir, target: c.target, deadline: c.deadline, created: c.created } };
}

/** Number → decimal string without exponent; `Number(result) === n`. Assumes finite n. */
export function toPlainDecimal(n: number): string {
  const s = String(n);
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
  if (!m) return s;
  const [, sign, intDigit, frac = "", expStr] = m;
  const exp = Number(expStr);
  const digits = intDigit + frac;
  if (exp < 0) return `${sign}0.${"0".repeat(-exp - 1)}${digits}`;
  return sign + digits + "0".repeat(exp - frac.length);
}

/** JSON with keys in fixed order v, asset, dir, target, deadline, created; target as plain decimal. */
export function canonicalJson(call: Call): string {
  return (
    `{"v":${JSON.stringify(call.v)},"asset":${JSON.stringify(call.asset)},"dir":${JSON.stringify(call.dir)},` +
    `"target":${toPlainDecimal(call.target)},"deadline":${JSON.stringify(call.deadline)},"created":${JSON.stringify(call.created)}}`
  );
}
