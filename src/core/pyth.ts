/** Pyth Hermes price reads. Pure TS: no RN/Expo imports; fetch is injected. */
import type { Asset } from "./call";

/**
 * Pyth mainnet feed ids (Crypto.<SYMBOL>/USD), looked up 2026-10-06 via
 * GET https://hermes.pyth.network/v2/price_feeds?query=<SYMBOL>&asset_type=crypto
 * Note: ETH differs from the id suggested in plan.md; this is the one Hermes returned.
 */
export const FEED_IDS: Record<Asset, string> = {
  SOL: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  JUP: "0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
  BONK: "72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
};

export const HERMES_URL = "https://hermes.pyth.network";

/** Minimal fetch shape so callers can pass global fetch or a test fake. */
export type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Hermes /v2/updates/* answers 401 without a bearer token (seen 2026-10-06). */
export interface PythOptions {
  baseUrl?: string;
  apiKey?: string;
}

export interface PythPrice {
  asset: Asset;
  price: number;
  conf: number;
  publishTime: number;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * `price × 10^expo` for Hermes' integer price string. Done as a decimal shift so the
 * result is the double nearest the exact decimal (keeps strict target compares honest).
 */
export function scaledPrice(raw: string, expo: number): number | null {
  if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(expo) || /^0+$/.test(raw)) return null;
  let s: string;
  if (expo >= 0) s = raw + "0".repeat(expo);
  else {
    const digits = raw.padStart(-expo + 1, "0");
    s = `${digits.slice(0, expo)}.${digits.slice(expo)}`;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Extract the asset's price from a Hermes `parsed=true` response body; null if absent/malformed. */
export function parseHermesPrice(body: unknown, asset: Asset): PythPrice | null {
  if (!isObj(body) || !Array.isArray(body.parsed)) return null;
  const entry = body.parsed.find(
    (e: unknown) => isObj(e) && typeof e.id === "string" && e.id.replace(/^0x/, "").toLowerCase() === FEED_IDS[asset],
  );
  if (!isObj(entry) || !isObj(entry.price)) return null;
  const { price, conf, expo, publish_time } = entry.price;
  if (typeof price !== "string" || typeof conf !== "string" || typeof expo !== "number") return null;
  if (!Number.isSafeInteger(publish_time)) return null;
  const p = scaledPrice(price, expo);
  if (p === null) return null;
  const c = conf === "0" ? 0 : scaledPrice(conf, expo);
  if (c === null) return null;
  return { asset, price: p, conf: c, publishTime: publish_time as number };
}

async function get(path: string, asset: Asset, fetchFn: FetchFn, opts: PythOptions) {
  const base = (opts.baseUrl ?? HERMES_URL).replace(/\/+$/, "");
  const headers: Record<string, string> = opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {};
  return fetchFn(`${base}/v2/updates/price/${path}?ids[]=${FEED_IDS[asset]}&parsed=true`, { headers });
}

/** Current price (hint on the New Receipt screen). Throws on HTTP/parse failure. */
export async function fetchLatestPrice(asset: Asset, fetchFn: FetchFn, opts: PythOptions = {}): Promise<PythPrice> {
  const res = await get("latest", asset, fetchFn, opts);
  if (!res.ok) throw new Error(`Pyth latest price failed: HTTP ${res.status}`);
  const p = parseHermesPrice(await res.json(), asset);
  if (!p) throw new Error("Pyth latest price: malformed response");
  return p;
}

/**
 * Price at a unix timestamp (deadline). null = Hermes has no update yet (404) → `unresolved`.
 * Throws on other HTTP errors, malformed bodies, or a price published before `ts`.
 */
export async function fetchPriceAt(
  asset: Asset,
  ts: number,
  fetchFn: FetchFn,
  opts: PythOptions = {},
): Promise<PythPrice | null> {
  if (!Number.isSafeInteger(ts) || ts <= 0) throw new Error("Timestamp must be a positive whole unix time");
  const res = await get(String(ts), asset, fetchFn, opts);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Pyth price at ${ts} failed: HTTP ${res.status}`);
  const p = parseHermesPrice(await res.json(), asset);
  if (!p) throw new Error("Pyth price at deadline: malformed response");
  if (p.publishTime < ts) throw new Error("Pyth price predates the requested timestamp");
  return p;
}
