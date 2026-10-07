/**
 * KuCoin public spot market data (no API key). Used for SKR, whose Pyth feed
 * is not served by Hermes for our key. Pure TS: fetch and clock are injected.
 *
 * Resolution rule (v2, fixed, documented in README): the price "at" unix ts is the
 * MEDIAN of the closes of the 5 one-minute candles ending at floor(ts/60)*60
 * (`fetchKucoinMedian5`). Legacy v1: the single close of that last minute
 * (`fetchKucoinAt`). Quote currency is USDT.
 */
import type { Asset } from "./call";
import type { FetchFn, PythPrice } from "./pyth";

export const KUCOIN_URL = "https://api.kucoin.com";

export const KUCOIN_SYMBOLS: Record<Asset, string> = {
  SOL: "SOL-USDT",
  SKR: "SKR-USDT",
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

const positive = (s: unknown): number | null => {
  if (typeof s !== "string" || !/^[0-9]+(\.[0-9]+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function getJson(url: string, fetchFn: FetchFn): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`KuCoin request failed: HTTP ${res.status}`);
  const body = await res.json();
  if (!isObj(body) || body.code !== "200000") throw new Error("KuCoin request failed: bad response code");
  return body.data;
}

/** Parse `/api/v1/market/orderbook/level1` data → last trade price. */
export function parseKucoinLevel1(data: unknown, asset: Asset): PythPrice | null {
  if (!isObj(data)) return null;
  const price = positive(data.price);
  const t = data.time;
  if (price === null || typeof t !== "number" || !Number.isFinite(t)) return null;
  return { asset, price, conf: 0, publishTime: Math.floor(t / 1000) };
}

/** Parse `/api/v1/market/candles` rows [start, open, close, high, low, vol, turnover] → close of the row starting at `start`. */
export function parseKucoinCandleClose(data: unknown, asset: Asset, start: number): PythPrice | null {
  if (!Array.isArray(data)) return null;
  const row = data.find((r: unknown) => Array.isArray(r) && r[0] === String(start));
  if (!Array.isArray(row)) return null;
  const close = positive(row[2]);
  return close === null ? null : { asset, price: close, conf: 0, publishTime: start + 60 };
}

export async function fetchKucoinLatest(asset: Asset, fetchFn: FetchFn): Promise<PythPrice> {
  const data = await getJson(`${KUCOIN_URL}/api/v1/market/orderbook/level1?symbol=${KUCOIN_SYMBOLS[asset]}`, fetchFn);
  const p = parseKucoinLevel1(data, asset);
  if (!p) throw new Error("KuCoin latest price: malformed response");
  return p;
}

/** Price at `ts` per the rule above; null while that minute has not closed yet or no candle exists. */
export async function fetchKucoinAt(asset: Asset, ts: number, fetchFn: FetchFn, nowSec: number): Promise<PythPrice | null> {
  if (!Number.isSafeInteger(ts) || ts <= 0) throw new Error("Timestamp must be a positive whole unix time");
  const end = Math.floor(ts / 60) * 60;
  if (nowSec < end + 5) return null; // give the exchange a few seconds to finalize the candle
  const start = end - 60;
  const data = await getJson(
    `${KUCOIN_URL}/api/v1/market/candles?type=1min&symbol=${KUCOIN_SYMBOLS[asset]}&startAt=${start}&endAt=${end}`,
    fetchFn,
  );
  return parseKucoinCandleClose(data, asset, start);
}

const MEDIAN_WINDOW = 5;

/**
 * v2 rule (SKR): median of the closes of the 5 one-minute candles ending at `end`
 * (rows starting at end−300 … end−60). Rows outside the window and duplicate starts
 * are ignored; with fewer rows the median of those present (even count → mean of the
 * middle two); none → null. publishTime = end.
 */
export function medianClose(data: unknown, asset: Asset, end: number): PythPrice | null {
  if (!Array.isArray(data)) return null;
  const xs: number[] = [];
  for (let i = 1; i <= MEDIAN_WINDOW; i++) {
    const p = parseKucoinCandleClose(data, asset, end - 60 * i);
    if (p) xs.push(p.price);
  }
  xs.sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  const price = xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return { asset, price, conf: 0, publishTime: end };
}

/** v2 price at `ts`: one candles request startAt=end−300&endAt=end, end = floor(ts/60)*60; null until that minute has closed. */
export async function fetchKucoinMedian5(asset: Asset, ts: number, fetchFn: FetchFn, nowSec: number): Promise<PythPrice | null> {
  if (!Number.isSafeInteger(ts) || ts <= 0) throw new Error("Timestamp must be a positive whole unix time");
  const end = Math.floor(ts / 60) * 60;
  if (nowSec < end + 5) return null;
  const data = await getJson(
    `${KUCOIN_URL}/api/v1/market/candles?type=1min&symbol=${KUCOIN_SYMBOLS[asset]}&startAt=${end - 60 * MEDIAN_WINDOW}&endAt=${end}`,
    fetchFn,
  );
  return medianClose(data, asset, end);
}
