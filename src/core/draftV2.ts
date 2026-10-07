/** v2 New Receipt form → CallV2. Pure TS: no RN/Expo imports; the clock is passed in. */
import { validateCallV2, type Asset, type DirectionV2, type ValidationResultV2 } from "./call";

export type HorizonChoice = "24h" | "3d" | "7d" | "1h" | "skr-daily";

export interface HorizonOption {
  value: HorizonChoice;
  label: string;
}

/** Chip order on the New screen. "1h" is practice (personal stats only); "skr-daily" forces SKR. */
export const HORIZON_CHOICES: readonly HorizonOption[] = [
  { value: "24h", label: "24h" },
  { value: "3d", label: "3d" },
  { value: "7d", label: "7d" },
  { value: "1h", label: "1h practice" },
  { value: "skr-daily", label: "SKR Daily" },
];

export const DEFAULT_HORIZON: HorizonChoice = "24h";

const DAY = 86400;
const NOON = 12 * 3600;
const DURATION: Record<Exclude<HorizonChoice, "skr-daily">, number> = {
  "24h": DAY,
  "3d": 3 * DAY,
  "7d": 7 * DAY,
  "1h": 3600,
};

/** SKR Daily: the next 12:00 UTC that is at least 12 h away (shared by everybody's daily call). */
export function skrDailyDeadline(nowSec: number): number {
  let noon = Math.floor(nowSec / DAY) * DAY + NOON;
  while (noon < nowSec + NOON) noon += DAY;
  return noon;
}

export function deadlineFor(choice: HorizonChoice, nowSec: number): number {
  return choice === "skr-daily" ? skrDailyDeadline(nowSec) : nowSec + DURATION[choice];
}

export interface DraftV2 {
  asset: Asset;
  /** null = not picked yet. */
  dir: DirectionV2 | null;
  horizon: HorizonChoice;
}

/** Asset actually used: SKR Daily is always SKR. */
export const draftAsset = (d: Pick<DraftV2, "asset" | "horizon">): Asset => (d.horizon === "skr-daily" ? "SKR" : d.asset);

/** Build and validate the call at `nowSec` (created = now). */
export function draftCallV2(d: DraftV2, nowSec: number): ValidationResultV2 {
  if (d.dir === null) return { ok: false, errors: ["Pick ▲ up or ▼ down"] };
  return validateCallV2(
    { v: 2, asset: draftAsset(d), dir: d.dir, deadline: deadlineFor(d.horizon, nowSec), created: nowSec },
    nowSec,
  );
}
