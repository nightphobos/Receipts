/**
 * Price sources: Pyth Hermes (SOL), KuCoin spot (SKR), or deterministic demo prices.
 * Pure TS: no RN/Expo imports; fetch, clock and env are injected.
 */
import { ASSETS, type Asset } from "./call";
import { fetchKucoinAt, fetchKucoinLatest } from "./kucoin";
import { FEED_IDS, fetchLatestPrice, fetchPriceAt, type FetchFn, type PythOptions, type PythPrice } from "./pyth";

export type PriceSourceKind = "pyth" | "kucoin" | "mock";

/** Fixed per-asset resolution source (part of the scoring rules — do not switch silently). */
export const RESOLUTION_SOURCE: Record<Asset, Exclude<PriceSourceKind, "mock">> = { SOL: "pyth", SKR: "kucoin" };

/** Human label and quote currency per source, for UI text. */
export const SOURCE_LABEL: Record<PriceSourceKind, { name: string; quote: string }> = {
  pyth: { name: "Pyth", quote: "USD" },
  kucoin: { name: "KuCoin", quote: "USDT" },
  mock: { name: "Demo", quote: "USD" },
};

export interface PriceSource {
  /** "mock" if ANY asset is served by demo prices (conservative, for global badges); else the first asset's source. */
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

export function kucoinSource(fetchFn: FetchFn, nowFn: () => number): PriceSource {
  return {
    kind: "kucoin",
    kindOf: () => "kucoin",
    latest: (asset) => fetchKucoinLatest(asset, fetchFn),
    at: (asset, ts) => fetchKucoinAt(asset, ts, fetchFn, nowFn()),
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

/** Null out feed ids for assets listed in a CSV (e.g. "SKR"), forcing them onto the demo source. */
export function withMockedAssets(
  feedIds: Record<Asset, string | null>,
  csv: string | undefined,
): Record<Asset, string | null> {
  const names = (csv ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  const out = { ...feedIds };
  for (const a of ASSETS) if (names.includes(a)) out[a] = null;
  return out;
}

/**
 * Per asset: its RESOLUTION_SOURCE (SOL → Pyth, SKR → KuCoin).
 * Demo prices only when explicitly asked: EXPO_PUBLIC_PRICE_SOURCE=mock (all assets),
 * or the asset's feed id was nulled via withMockedAssets. A Pyth asset without a key
 * stays on Pyth and fails loudly (shown as "unavailable") rather than silently switching source.
 */
export function selectPriceSource(
  env: PriceEnv,
  fetchFn: FetchFn,
  nowFn: () => number,
  feedIds: Record<Asset, string | null> = FEED_IDS,
): PriceSource {
  const mock = mockSource(nowFn);
  if (env.EXPO_PUBLIC_PRICE_SOURCE?.trim() === "mock") return mock;
  const apiKey = env.EXPO_PUBLIC_PYTH_API_KEY?.trim() || undefined;
  const pyth = pythSource(fetchFn, { apiKey });
  const kucoin = kucoinSource(fetchFn, nowFn);
  const pick = (asset: Asset): PriceSource =>
    feedIds[asset] === null ? mock : RESOLUTION_SOURCE[asset] === "kucoin" ? kucoin : pyth;
  return {
    kind: ASSETS.some((a) => pick(a).kind === "mock") ? "mock" : pick(ASSETS[0]).kind,
    kindOf: (asset) => pick(asset).kind,
    latest: (asset) => pick(asset).latest(asset),
    at: (asset, ts) => pick(asset).at(asset, ts),
  };
}
