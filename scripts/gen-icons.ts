/**
 * App icon, adaptive icon, splash and favicon: Chekko (print pose) on night indigo.
 * Original pixel art from src/core/mascot.ts, no third-party assets.
 * Run: npx tsx scripts/gen-icons.ts
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { deflateSync } from "zlib";

import { encodePng, rasterizeGrid } from "../src/core/iconArt";
import { MASCOT_POSES } from "../src/core/mascot";
import { colors, mascotFill } from "../src/theme/tokens";

const ASSETS = join(__dirname, "..", "assets");
const grid = MASCOT_POSES.print;
const deflate = (raw: Uint8Array) => new Uint8Array(deflateSync(raw, { level: 9 }));

const outputs: { file: string; size: number; scale: number; bg: string }[] = [
  // 16 art px × 48 = 768 of 1024: launcher masks crop the edges.
  { file: "icon.png", size: 1024, scale: 48, bg: colors.bg },
  // Adaptive foreground: keep inside the 66% safe zone; background colour comes from app.json.
  { file: "adaptive-icon.png", size: 1024, scale: 36, bg: "transparent" },
  { file: "splash.png", size: 1024, scale: 32, bg: colors.bg },
  { file: "favicon.png", size: 48, scale: 3, bg: colors.bg },
];

for (const o of outputs) {
  const img = rasterizeGrid({ grid, palette: mascotFill, width: o.size, height: o.size, scale: o.scale, bg: o.bg });
  writeFileSync(join(ASSETS, o.file), encodePng(img, deflate));
  console.log(`${o.file} ${o.size}×${o.size}`);
}
