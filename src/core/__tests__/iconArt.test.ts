import { deflateSync, inflateSync } from "zlib";

import { crc32, encodePng, hexToRgba, rasterizeGrid } from "../iconArt";

describe("hexToRgba", () => {
  it("parses #RRGGBB and #RRGGBBAA", () => {
    expect(hexToRgba("#14122B")).toEqual([0x14, 0x12, 0x2b, 255]);
    expect(hexToRgba("#FFC94A80")).toEqual([0xff, 0xc9, 0x4a, 0x80]);
    expect(hexToRgba("transparent")).toEqual([0, 0, 0, 0]);
  });
  it("rejects garbage", () => {
    expect(() => hexToRgba("red")).toThrow();
  });
});

describe("crc32", () => {
  it("matches the standard check value and the IEND chunk CRC", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
  });
});

describe("rasterizeGrid", () => {
  const grid = ["A.", ".B"];
  const palette = { A: "#FF0000", B: "#00FF00" };

  it("fills the background and scales art pixels into blocks at the offset", () => {
    const img = rasterizeGrid({ grid, palette, width: 6, height: 5, scale: 2, bg: "#000010", x: 1, y: 1 });
    expect(img.width).toBe(6);
    expect(img.height).toBe(5);
    const px = (x: number, y: number) => Array.from(img.rgba.slice((y * 6 + x) * 4, (y * 6 + x) * 4 + 4));
    expect(px(0, 0)).toEqual([0, 0, 0x10, 255]);
    expect(px(1, 1)).toEqual([255, 0, 0, 255]);
    expect(px(2, 2)).toEqual([255, 0, 0, 255]);
    expect(px(3, 1)).toEqual([0, 0, 0x10, 255]); // "." = background
    expect(px(3, 3)).toEqual([0, 255, 0, 255]);
    expect(px(4, 4)).toEqual([0, 255, 0, 255]);
    expect(px(5, 4)).toEqual([0, 0, 0x10, 255]);
  });

  it("centres the art when no offset is given and clips to the canvas", () => {
    const img = rasterizeGrid({ grid, palette, width: 8, height: 8, scale: 2, bg: "transparent" });
    const px = (x: number, y: number) => Array.from(img.rgba.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4));
    expect(px(2, 2)).toEqual([255, 0, 0, 255]);
    expect(px(1, 1)).toEqual([0, 0, 0, 0]);
    expect(px(5, 5)).toEqual([0, 255, 0, 255]);
    const clipped = rasterizeGrid({ grid, palette, width: 2, height: 2, scale: 2, bg: "transparent", x: 1, y: 1 });
    expect(clipped.rgba.length).toBe(16);
  });

  it("rejects unknown pixel codes", () => {
    expect(() => rasterizeGrid({ grid: ["Z"], palette, width: 1, height: 1, scale: 1, bg: "#000000" })).toThrow(/Z/);
  });
});

describe("encodePng", () => {
  it("writes a valid RGBA PNG whose IDAT inflates to filtered scanlines", () => {
    const rgba = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const png = encodePng({ width: 2, height: 1, rgba }, (b) => new Uint8Array(deflateSync(b)));
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(8)).toBe(13);
    expect(new TextDecoder().decode(png.slice(12, 16))).toBe("IHDR");
    expect(view.getUint32(16)).toBe(2);
    expect(view.getUint32(20)).toBe(1);
    expect(Array.from(png.slice(24, 29))).toEqual([8, 6, 0, 0, 0]);
    expect(view.getUint32(29)).toBe(crc32(png.slice(12, 29)));
    const idatLen = view.getUint32(33);
    expect(new TextDecoder().decode(png.slice(37, 41))).toBe("IDAT");
    const raw = inflateSync(png.slice(41, 41 + idatLen));
    expect(Array.from(raw)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Array.from(png.slice(-12))).toEqual([0, 0, 0, 0, 73, 69, 78, 68, 0xae, 0x42, 0x60, 0x82]);
  });

  it("rejects a buffer of the wrong size", () => {
    expect(() => encodePng({ width: 2, height: 2, rgba: new Uint8Array(4) }, (b) => b)).toThrow();
  });
});
