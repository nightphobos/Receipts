/**
 * Mascot «Chekko» — an original cash-register mimic (spec "Visual style"). Pixel art as 16×16
 * char grids; colours are mapped in src/theme/Mascot.tsx. Pure data + helpers, no RN imports.
 */
import type { Asset } from "./call";
import type { StatusV2 } from "./score";

/** Pixel codes used in the grids ('.' = transparent). */
export const MASCOT_PIXELS = {
  D: "outline",
  B: "body",
  S: "display",
  E: "eyes",
  G: "keys",
  I: "ink",
  P: "paper",
  T: "tear",
  K: "sparkle",
} as const;

export type MascotPixel = keyof typeof MASCOT_PIXELS;

const IDLE = [
  "................",
  "..DDDDDDDDDDDD..",
  "..DSSSSSSSSSSD..",
  "..DSSESSSSESSD..",
  "..DSSESSSSESSD..",
  "..DSSSSSSSSSSD..",
  "..DDDDDDDDDDDD..",
  ".DBBBBBBBBBBBBD.",
  ".DBGBGBGBGBGBBD.",
  ".DBBBBBBBBBBBBD.",
  ".DBBIIIIIIIIBBD.",
  ".DBBBBPPPPBBBBD.",
  ".DBBBBPIPPBBBBD.",
  ".DDDDDPPPPDDDDD.",
  "......PIPP......",
  "......PPPP......",
] as const;

/** Mouth wide open, eyes squeezed shut, a receipt going in. */
const EAT = [
  "......PPPP......",
  "..DDDDPIPPDDDD..",
  "..DSSSPPPPSSSD..",
  "..DSEESPPSEESD..",
  "..DSSSSSSSSSSD..",
  "..DSSSSSSSSSSD..",
  "..DDDDDDDDDDDD..",
  ".DBBBBBBBBBBBBD.",
  ".DBGBGBGBGBGBBD.",
  ".DBIIIIIIIIIIBD.",
  ".DBIIIIIIIIIIBD.",
  ".DBIIIIIIIIIIBD.",
  ".DBBIIIIIIIIBBD.",
  ".DDDDDDDDDDDDDD.",
  "................",
  "................",
] as const;

/** Eyes looking down, a long strip of thermal paper rolling out. */
const PRINT = [
  "................",
  "..DDDDDDDDDDDD..",
  "..DSSSSSSSSSSD..",
  "..DSSSSSSSSSSD..",
  "..DSSESSSSESSD..",
  "..DSSESSSSESSD..",
  "..DDDDDDDDDDDD..",
  ".DBBBBBBBBBBBBD.",
  ".DBGBGBGBGBGBBD.",
  ".DBBBBBBBBBBBBD.",
  ".DBBIIIIIIIIBBD.",
  ".DBBPPPPPPPPBBD.",
  ".DDDPIIPIIIPDDD.",
  "....PPPPPPPP....",
  "....PIIIPIIP....",
  "....PPPPPPPP....",
] as const;

/** ^ ^ eyes, big grin, sparkles, receipt held up. */
const CHEER = [
  "K..............K",
  "..DDDDDDDDDDDD..",
  "K.DSSSSSSSSSSD.K",
  "..DSSSESSESSSD..",
  "..DSSESSSSESSD..",
  "..DSSSSSSSSSSD..",
  "..DDDDDDDDDDDD..",
  ".DBBBBBBBBBBBBD.",
  ".DBGBGBGBGBGBBD.",
  ".DBIBBBBBBBBIBD.",
  ".DBBIIIIIIIIBBD.",
  ".DBBBBPPPPBBBBD.",
  ".DBBBBPIPPBBBBD.",
  ".DDDDDPPPPDDDDD.",
  "......PIPP......",
  "......PPPP......",
] as const;

/** Droopy eyes, tears running down the display, frown, paper crumpled back in. */
const CRY = [
  "................",
  "..DDDDDDDDDDDD..",
  "..DSSSSSSSSSSD..",
  "..DSEESSSSEESD..",
  "..DSSTSSSSTSSD..",
  "..DSSTSSSSTSSD..",
  "..DDDTDDDDTDDD..",
  ".DBBBBBBBBBBBBD.",
  ".DBGBGBGBGBGBBD.",
  ".DBBBIIIIIIBBBD.",
  ".DBBIBBBBBBIBBD.",
  ".DBBBBBBBBBBBBD.",
  ".DBBBBBPPBBBBBD.",
  ".DDDDDDPPDDDDDD.",
  ".....T......T...",
  "................",
] as const;

export const MASCOT_POSES = {
  idle: IDLE,
  eat: EAT,
  print: PRINT,
  cheer: CHEER,
  cry: CRY,
} as const satisfies Record<string, readonly string[]>;

export type MascotPose = keyof typeof MASCOT_POSES;
export const MASCOT_POSE_NAMES = Object.keys(MASCOT_POSES) as MascotPose[];

export type MascotRun = { x: number; y: number; w: number; code: MascotPixel };

/** Merge horizontal runs of the same code so a pose is a few dozen rects, not 256. */
export function mascotRuns(grid: readonly string[]): MascotRun[] {
  const runs: MascotRun[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (!(ch in MASCOT_PIXELS)) {
        x++;
        continue;
      }
      let w = 1;
      while (row[x + w] === ch) w++;
      runs.push({ x, y, w, code: ch as MascotPixel });
      x += w;
    }
  });
  return runs;
}

/** Pose for a receipt: `printing` = a reveal was sent and its result isn't known yet. */
export function poseForStatus(status: StatusV2, opts: { printing?: boolean } = {}): MascotPose {
  switch (status) {
    case "hit":
      return "cheer";
    case "miss":
    case "forfeited":
    case "overlap":
      return "cry";
    case "void":
    case "legacy":
    case "sealed":
      return "idle";
    case "awaiting_reveal":
    case "unresolved":
      return opts.printing ? "print" : "idle";
  }
}

/** Chekko's dialog line; `horizon` = a HorizonChoice ("skr-daily" → fixed 12:00 UTC) or a receipt horizon. */
export function mascotLine(pose: MascotPose, ctx: { asset: Asset; horizon: string }): string {
  switch (pose) {
    case "idle": {
      const when = ctx.horizon === "skr-daily" ? "at 12:00 UTC" : `in ${ctx.horizon}`;
      return `Where will ${ctx.asset} be ${when}? I'll print your receipt.`;
    }
    case "eat":
      return "Nom. Your call is sealed inside me until the deadline.";
    case "print":
      return "Printing your receipt… checking the price.";
    case "cheer":
      return "HIT! That one goes on the wall.";
    case "cry":
      return "MISS… the receipt doesn't lie.";
  }
}
