import { FEED_IDS, type FetchFn } from "../pyth";
import { MOCK_BASE, isDemo, mockPrice, mockSource, pythSource, selectPriceSource, withMockedAssets } from "../price";
import latestSol from "./fixtures/hermes-latest-sol.docshape.json";

type Req = { url: string; headers: Record<string, string> };

function fakeFetch(status: number, body: unknown) {
  const reqs: Req[] = [];
  const fn: FetchFn = async (url, init) => {
    reqs.push({ url, headers: init?.headers ?? {} });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fn, reqs };
}

const NOW = 1_791_000_000;
const now = () => NOW;

describe("mockPrice", () => {
  it("follows base × (1 + 0.04·sin(ts/5400) + 0.015·sin(ts/977))", () => {
    const ts = 1_790_000_000;
    const f = 1 + 0.04 * Math.sin(ts / 5400) + 0.015 * Math.sin(ts / 977);
    expect(mockPrice("SOL", ts)).toBe(Math.round(150 * f * 100) / 100);
    expect(mockPrice("SKR", ts)).toBe(Number((0.05 * f).toPrecision(4)));
  });

  it("rounds SOL to 2 decimals and SKR to 4 significant digits", () => {
    for (let ts = NOW - 50_000; ts < NOW; ts += 1234) {
      const sol = mockPrice("SOL", ts);
      expect(Math.round(sol * 100) / 100).toBe(sol);
      const skr = mockPrice("SKR", ts);
      expect(Number(skr.toPrecision(4))).toBe(skr);
    }
  });

  it("stays within ±5.5% of the base price and positive", () => {
    for (let ts = NOW - 100_000; ts < NOW; ts += 777) {
      for (const a of ["SOL", "SKR"] as const) {
        const p = mockPrice(a, ts);
        expect(p).toBeGreaterThan(MOCK_BASE[a] * 0.94);
        expect(p).toBeLessThan(MOCK_BASE[a] * 1.06);
      }
    }
  });

  it("actually moves over an hour (so calls can hit and miss)", () => {
    expect(mockPrice("SOL", NOW)).not.toBe(mockPrice("SOL", NOW + 3600));
  });
});

describe("mockSource", () => {
  it("is kind mock for every asset", () => {
    const s = mockSource(now);
    expect(s.kind).toBe("mock");
    expect(s.kindOf("SOL")).toBe("mock");
    expect(s.kindOf("SKR")).toBe("mock");
    expect(isDemo(s, "SOL")).toBe(true);
  });

  it("is deterministic: same ts → same price, across instances", async () => {
    const a = await mockSource(now).at("SOL", NOW - 3600);
    const b = await mockSource(() => NOW + 999).at("SOL", NOW - 3600);
    expect(a).toEqual(b);
    expect(a).toEqual({ asset: "SOL", price: mockPrice("SOL", NOW - 3600), conf: 0, publishTime: NOW - 3600 });
  });

  it("at() returns null for a ts in the future (not yet resolvable)", async () => {
    const s = mockSource(now);
    await expect(s.at("SOL", NOW + 1)).resolves.toBeNull();
    await expect(s.at("SKR", NOW)).resolves.not.toBeNull();
  });

  it("latest() prices at the current clock second", async () => {
    const s = mockSource(() => NOW + 0.7);
    await expect(s.latest("SKR")).resolves.toEqual({
      asset: "SKR",
      price: mockPrice("SKR", NOW),
      conf: 0,
      publishTime: NOW,
    });
  });

  it("rejects non-integer or non-positive timestamps like the Pyth source", async () => {
    const s = mockSource(now);
    await expect(s.at("SOL", 1.5)).rejects.toThrow();
    await expect(s.at("SOL", 0)).rejects.toThrow();
  });
});

describe("pythSource", () => {
  it("wraps fetchLatestPrice and passes the api key", async () => {
    const { fn, reqs } = fakeFetch(200, latestSol);
    const s = pythSource(fn, { apiKey: "k" });
    expect(s.kind).toBe("pyth");
    expect(s.kindOf("SOL")).toBe("pyth");
    expect(isDemo(s, "SOL")).toBe(false);
    const p = await s.latest("SOL");
    expect(p.asset).toBe("SOL");
    expect(reqs[0].url).toContain(`/v2/updates/price/latest?ids[]=${FEED_IDS.SOL}`);
    expect(reqs[0].headers.Authorization).toBe("Bearer k");
  });

  it("wraps fetchPriceAt (404 → null)", async () => {
    const { fn, reqs } = fakeFetch(404, {});
    await expect(pythSource(fn, { apiKey: "k" }).at("SOL", NOW)).resolves.toBeNull();
    expect(reqs[0].url).toContain(`/v2/updates/price/${NOW}?`);
  });
});

describe("selectPriceSource", () => {
  const { fn, reqs } = fakeFetch(404, {});

  it("defaults to mock when no api key is set", () => {
    expect(selectPriceSource({}, fn, now).kind).toBe("mock");
    expect(selectPriceSource({ EXPO_PUBLIC_PYTH_API_KEY: "" }, fn, now).kind).toBe("mock");
    expect(selectPriceSource({ EXPO_PUBLIC_PYTH_API_KEY: "   " }, fn, now).kind).toBe("mock");
  });

  it("uses mock when forced even with a key", () => {
    const s = selectPriceSource({ EXPO_PUBLIC_PYTH_API_KEY: "k", EXPO_PUBLIC_PRICE_SOURCE: "mock" }, fn, now);
    expect(s.kind).toBe("mock");
    expect(isDemo(s, "SOL")).toBe(true);
  });

  it("uses pyth when a key is set and not forced to mock", async () => {
    const s = selectPriceSource({ EXPO_PUBLIC_PYTH_API_KEY: "k" }, fn, now);
    expect(s.kind).toBe("pyth");
    expect(s.kindOf("SOL")).toBe("pyth");
    expect(s.kindOf("SKR")).toBe("pyth");
    reqs.length = 0;
    await s.at("SKR", NOW);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].headers.Authorization).toBe("Bearer k");
  });

  it("falls back to mock per asset when its feed id is null", async () => {
    const s = selectPriceSource({ EXPO_PUBLIC_PYTH_API_KEY: "k" }, fn, now, { ...FEED_IDS, SKR: null });
    expect(s.kind).toBe("mock"); // conservative: any demo asset → whole source counts as demo
    expect(s.kindOf("SOL")).toBe("pyth");
    expect(s.kindOf("SKR")).toBe("mock");
    expect(isDemo(s, "SKR")).toBe(true);
    expect(isDemo(s, "SOL")).toBe(false);
    reqs.length = 0;
    await expect(s.at("SKR", NOW - 60)).resolves.toEqual({
      asset: "SKR",
      price: mockPrice("SKR", NOW - 60),
      conf: 0,
      publishTime: NOW - 60,
    });
    await expect(s.latest("SKR")).resolves.toMatchObject({ price: mockPrice("SKR", NOW) });
    expect(reqs).toHaveLength(0);
    await s.at("SOL", NOW);
    expect(reqs).toHaveLength(1);
  });
});

describe("withMockedAssets", () => {
  const ids = { SOL: "aa", SKR: "bb" } as const;
  it("nulls listed assets, case/space-insensitive", () => {
    expect(withMockedAssets({ ...ids }, " skr ")).toEqual({ SOL: "aa", SKR: null });
  });
  it("leaves ids untouched for empty/undefined/unknown", () => {
    expect(withMockedAssets({ ...ids }, undefined)).toEqual(ids);
    expect(withMockedAssets({ ...ids }, "")).toEqual(ids);
    expect(withMockedAssets({ ...ids }, "BTC")).toEqual(ids);
  });
  it("does not mutate the input", () => {
    const input = { ...ids };
    withMockedAssets(input, "SOL,SKR");
    expect(input).toEqual(ids);
  });
  it("mocked SKR → per-asset demo while SOL stays pyth", () => {
    const src = selectPriceSource({ EXPO_PUBLIC_PYTH_API_KEY: "k" }, async () => ({ ok: true, status: 200, json: async () => ({}) }), () => 0, withMockedAssets({ ...ids }, "SKR"));
    expect(src.kindOf("SOL")).toBe("pyth");
    expect(src.kindOf("SKR")).toBe("mock");
    expect(src.kind).toBe("mock");
  });
});
