/**
 * Pixel-art → PNG for the app icon / splash (scripts/gen-icons.ts). Pure: deflate is injected.
 * Grids use the same char-row format as the mascot; "." is background.
 */

export type Rgba = [number, number, number, number];
export type Image = { width: number; height: number; rgba: Uint8Array };

/** "#RRGGBB", "#RRGGBBAA" or "transparent". */
export function hexToRgba(hex: string): Rgba {
  if (hex === "transparent") return [0, 0, 0, 0];
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex);
  if (!m) throw new Error(`bad colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
}

export type RasterizeOpts = {
  grid: readonly string[];
  palette: Readonly<Record<string, string>>;
  width: number;
  height: number;
  /** Device pixels per art pixel. */
  scale: number;
  bg: string;
  /** Top-left of the art; centred when omitted. */
  x?: number;
  y?: number;
};

export function rasterizeGrid({ grid, palette, width, height, scale, bg, x, y }: RasterizeOpts): Image {
  const rgba = new Uint8Array(width * height * 4);
  const back = hexToRgba(bg);
  for (let i = 0; i < width * height; i++) rgba.set(back, i * 4);
  const artW = Math.max(0, ...grid.map((r) => r.length)) * scale;
  const ox = x ?? Math.floor((width - artW) / 2);
  const oy = y ?? Math.floor((height - grid.length * scale) / 2);
  grid.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      const code = row[gx];
      if (code === ".") continue;
      const hex = palette[code];
      if (hex === undefined) throw new Error(`no colour for pixel code ${code}`);
      const c = hexToRgba(hex);
      for (let dy = 0; dy < scale; dy++) {
        const py = oy + gy * scale + dy;
        if (py < 0 || py >= height) continue;
        for (let dx = 0; dx < scale; dx++) {
          const px = ox + gx * scale + dx;
          if (px < 0 || px >= width) continue;
          rgba.set(c, (py * width + px) * 4);
        }
      }
    }
  });
  return { width, height, rgba };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** 8-bit RGBA, no interlace, filter 0 on every scanline. `deflate` = zlib stream (e.g. zlib.deflateSync). */
export function encodePng(img: Image, deflate: (raw: Uint8Array) => Uint8Array): Uint8Array {
  const { width, height, rgba } = img;
  if (rgba.length !== width * height * 4) throw new Error("rgba size does not match width × height × 4");
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflate(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
