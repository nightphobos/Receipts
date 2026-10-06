/**
 * Price sources: real Pyth Hermes or deterministic demo prices.
 * Pure TS: no RN/Expo imports; fetch, clock and env are injected.
 */
import { ASSETS, type Asset } from "./call";
import { FEED_IDS, fetchLatestPrice, fetchPriceAt, type FetchFn, type PythOptions, type PythPrice } from "./pyth";

export type PriceSourceKind = "pyth" | "mock";

export interface PriceSource {
  /** "mock" if ANY asset is served by demo prices (conservative, for global badges). */
  kind: PriceSourceKind;
  /** Which source actually serves this asset — drives the per-asset DEMO PRICES badge. */
  kindOf(asset: Asset): PriceSourceKind;
  latest(asset: Asset): Promise<PythPrice>;
  /** Price at unix `ts`; null = not resolvable yet (→ `unresolved`). */
  at(asset: Asset, ts: number): Promise<PythPrice | null>;
}

/** True when prices for `asset` are demo prices and must be badged as such. */
export const isDemo = (source: PriceSource, asset: Asset): boolean => source.kindOf(asset) === "mock";

export function pythSource(fetchFn: FetchFn, opts: PythOptions = {}): PriceSource {
  return {
    kind: "pyth",
    kindOf: () => "pyth",
    latest: (asset) => fetchLatestPrice(asset, fetchFn, opts),
    at: (asset, ts) => fetchPriceAt(asset, ts, fetchFn, opts),
  };
}

export const MOCK_BASE: Record<Asset, number> = { SOL: 150, SKR: 0.05 };

/** Deterministic demo price: base × (1 + 0.04·sin(ts/5400) + 0.015·sin(ts/977)). */
export function mockPrice(asset: Asset, ts: number): number {
  const raw = MOCK_BASE[asset] * (1 + 0.04 * Math.sin(ts / 5400) + 0.015 * Math.sin(ts / 977));
  return asset === "SOL" ? Math.round(raw * 100) / 100 : Number(raw.toPrecision(4));
}

const mockQuote = (asset: Asset, ts: number): PythPrice => ({ asset, price: mockPrice(asset, ts), conf: 0, publishTime: ts });

export function mockSource(nowFn: () => number): PriceSource {
  return {
    kind: "mock",
    kindOf: () => "mock",
    latest: async (asset) => mockQuote(asset, Math.floor(nowFn())),
    at: async (asset, ts) => {
      if (!Number.isSafeInteger(ts) || ts <= 0) throw new Error("Timestamp must be a positive whole unix time");
      return ts > nowFn() ? null : mockQuote(asset, ts);
    },
  };
}

export interface PriceEnv {
  EXPO_PUBLIC_PYTH_API_KEY?: string;
  EXPO_PUBLIC_PRICE_SOURCE?: string;
}

/**
 * Mock unless a Pyth key is set and EXPO_PUBLIC_PRICE_SOURCE !== "mock".
 * Assets without a Pyth feed id fall back to mock individually.
 */
export function selectPriceSource(
  env: PriceEnv,
  fetchFn: FetchFn,
  nowFn: () => number,
  feedIds: Record<Asset, string | null> = FEED_IDS,
): PriceSource {
  const mock = mockSource(nowFn);
  const apiKey = env.EXPO_PUBLIC_PYTH_API_KEY?.trim();
  if (!apiKey || env.EXPO_PUBLIC_PRICE_SOURCE?.trim() === "mock") return mock;
  const pyth = pythSource(fetchFn, { apiKey });
  const pick = (asset: Asset) => (feedIds[asset] ? pyth : mock);
  return {
    kind: ASSETS.every((a) => feedIds[a]) ? "pyth" : "mock",
    kindOf: (asset) => pick(asset).kind,
    latest: (asset) => pick(asset).latest(asset),
    at: (asset, ts) => pick(asset).at(asset, ts),
  };
}
