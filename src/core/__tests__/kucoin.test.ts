import candles5 from "./fixtures/kucoin-candles5-skr-2026-10-07.json";
import { fetchKucoinMedian5, medianClose } from "../kucoin";
import level1 from "./fixtures/kucoin-level1-skr-2026-10-07.json";
import candles from "./fixtures/kucoin-candles-skr-2026-10-07.json";
import {
  KUCOIN_SYMBOLS,
  fetchKucoinAt,
  fetchKucoinLatest,
  parseKucoinCandleClose,
  parseKucoinLevel1,
} from "../kucoin";
import type { FetchFn } from "../pyth";

const fakeFetch = (body: unknown, status = 200) => {
  const calls: string[] = [];
  const fn: FetchFn = async (url) => {
    calls.push(url);
    return { ok: status === 200, status, json: async () => body };
  };
  return { fn, calls };
};

describe("kucoin parsing (real responses 2026-10-07)", () => {
  it("level1 → last price, publishTime in seconds", () => {
    expect(parseKucoinLevel1(level1.data, "SKR")).toEqual({ asset: "SKR", price: 0.01668, conf: 0, publishTime: 1791352953 });
  });
  it("candle close for the row with the given start", () => {
    expect(parseKucoinCandleClose(candles.data, "SKR", 1791349200)).toEqual({
      asset: "SKR", price: 0.016513, conf: 0, publishTime: 1791349260,
    });
  });
  it("uses CLOSE (index 2), not open", () => {
    const rows = [["120", "1.5", "2.5", "3", "1", "0", "0"]];
    expect(parseKucoinCandleClose(rows, "SOL", 120)?.price).toBe(2.5);
  });
  it("null on missing row / malformed", () => {
    expect(parseKucoinCandleClose(candles.data, "SKR", 60)).toBeNull();
    expect(parseKucoinCandleClose({}, "SKR", 60)).toBeNull();
    expect(parseKucoinCandleClose([["60", "1", "x"]], "SKR", 60)).toBeNull();
    expect(parseKucoinCandleClose([["60", "1", "0"]], "SKR", 60)).toBeNull();
    expect(parseKucoinLevel1({ price: "abc", time: 1 }, "SKR")).toBeNull();
    expect(parseKucoinLevel1(null, "SKR")).toBeNull();
  });
});

describe("kucoin fetch", () => {
  it("symbols", () => expect(KUCOIN_SYMBOLS).toEqual({ SOL: "SOL-USDT", SKR: "SKR-USDT" }));

  it("latest hits level1 for the symbol", async () => {
    const f = fakeFetch(level1);
    expect((await fetchKucoinLatest("SKR", f.fn)).price).toBe(0.01668);
    expect(f.calls[0]).toBe("https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=SKR-USDT");
  });

  it("at(ts) asks for the minute ending at floor(ts/60)*60", async () => {
    const f = fakeFetch(candles);
    const ts = 1791349260 + 37; // → end 1791349260, start 1791349200
    const p = await fetchKucoinAt("SKR", ts, f.fn, ts + 3600);
    expect(p?.price).toBe(0.016513);
    expect(f.calls[0]).toBe(
      "https://api.kucoin.com/api/v1/market/candles?type=1min&symbol=SKR-USDT&startAt=1791349200&endAt=1791349260",
    );
  });

  it("null before the candle has closed (+5 s), without fetching", async () => {
    const f = fakeFetch(candles);
    expect(await fetchKucoinAt("SKR", 1791349260, f.fn, 1791349264)).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  it("throws on HTTP error or bad code; rejects bad ts", async () => {
    await expect(fetchKucoinLatest("SKR", fakeFetch({}, 500).fn)).rejects.toThrow("HTTP 500");
    await expect(fetchKucoinLatest("SKR", fakeFetch({ code: "400100" }).fn)).rejects.toThrow("bad response code");
    await expect(fetchKucoinAt("SKR", 1.5, fakeFetch(candles).fn, 9e9)).rejects.toThrow();
  });
});
describe("kucoin median of 5 closes (v2 SKR rule)", () => {
  const END = 1791348120; // real response: closes .01644 .01646 .01646 .01654 .01654

  it("median of the 5 closes of the candles ending at END (real response)", () => {
    expect(medianClose(candles5.data, "SKR", END)).toEqual({ asset: "SKR", price: 0.01646, conf: 0, publishTime: END });
  });

  it("uses CLOSE, ignores rows outside [END-300, END-60] and duplicates", () => {
    const row = (s: number, close: string) => [String(s), "9", close, "9", "0.1", "0", "0"];
    const rows = [
      row(END, "100"), // starts at END → not yet in window
      row(END - 360, "100"), // too early
      row(END - 60, "5"),
      row(END - 60, "5"),
      row(END - 120, "1"),
      row(END - 180, "4"),
      row(END - 240, "2"),
      row(END - 300, "3"),
    ];
    expect(medianClose(rows, "SOL", END)?.price).toBe(3);
  });

  it("fewer rows: median of what exists (even count → mean of middle two); none → null", () => {
    const row = (s: number, close: string) => [String(s), "0", close, "0", "0", "0", "0"];
    expect(medianClose([row(END - 60, "2"), row(END - 120, "4")], "SKR", END)?.price).toBe(3);
    expect(medianClose([row(END - 60, "7")], "SKR", END)?.price).toBe(7);
    expect(medianClose([], "SKR", END)).toBeNull();
    expect(medianClose([row(END - 60, "x")], "SKR", END)).toBeNull();
    expect(medianClose({}, "SKR", END)).toBeNull();
  });

  it("one request startAt=end-300&endAt=end with end = floor(ts/60)*60", async () => {
    const f = fakeFetch(candles5);
    const p = await fetchKucoinMedian5("SKR", END + 59, f.fn, END + 3600);
    expect(p?.price).toBe(0.01646);
    expect(f.calls).toEqual([
      "https://api.kucoin.com/api/v1/market/candles?type=1min&symbol=SKR-USDT&startAt=1791347820&endAt=1791348120",
    ]);
  });

  it("null before the last minute has closed (+5 s), without fetching; rejects bad ts", async () => {
    const f = fakeFetch(candles5);
    expect(await fetchKucoinMedian5("SKR", END, f.fn, END + 4)).toBeNull();
    expect(f.calls).toHaveLength(0);
    expect(await fetchKucoinMedian5("SKR", END, f.fn, END + 5)).not.toBeNull();
    await expect(fetchKucoinMedian5("SKR", 1.5, f.fn, 9e9)).rejects.toThrow();
    await expect(fetchKucoinMedian5("SKR", 0, f.fn, 9e9)).rejects.toThrow();
  });
});
