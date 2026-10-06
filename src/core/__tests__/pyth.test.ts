import { ASSETS } from "../call";
import {
  FEED_IDS,
  HERMES_URL,
  fetchLatestPrice,
  fetchPriceAt,
  parseHermesPrice,
  scaledPrice,
  type FetchFn,
} from "../pyth";
import feeds from "./fixtures/hermes-price-feeds-2026-10-06.json";
import latestSol from "./fixtures/hermes-latest-sol.docshape.json";
import atSkr from "./fixtures/hermes-at-skr.docshape.json";

type Req = { url: string; headers: Record<string, string> };

/** Fake fetch: records requests, answers with a fixed status/body. */
function fakeFetch(status: number, body: unknown) {
  const reqs: Req[] = [];
  const fn: FetchFn = async (url, init) => {
    reqs.push({ url, headers: init?.headers ?? {} });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fn, reqs };
}

describe("FEED_IDS", () => {
  it("has a 64-hex id for every asset", () => {
    for (const a of ASSETS) expect(FEED_IDS[a]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches Crypto.<SYMBOL>/USD in the recorded Hermes price_feeds lookup", () => {
    for (const a of ASSETS) {
      const feed = feeds.find((f) => f.attributes.symbol === `Crypto.${a}/USD`);
      expect(feed?.id).toBe(FEED_IDS[a]);
    }
  });
});

describe("scaledPrice", () => {
  it("applies the exponent exactly (decimal shift, no float drift)", () => {
    expect(scaledPrice("15234567890", -8)).toBe(152.3456789);
    expect(scaledPrice("2012345", -10)).toBe(0.0002012345);
    expect(scaledPrice("12", 2)).toBe(1200);
    expect(scaledPrice("5", 0)).toBe(5);
    expect(scaledPrice("5", -3)).toBe(0.005);
  });

  it("equals Number(price) * 10 ** expo up to float error", () => {
    expect(scaledPrice("6234512345678", -8)).toBeCloseTo(6234512345678 * 10 ** -8, 8);
  });

  it("rejects non-integer or non-positive strings", () => {
    for (const p of ["", "abc", "1.5", "-5", "0", "1e5"]) expect(scaledPrice(p, -8)).toBeNull();
  });
});

describe("parseHermesPrice", () => {
  it("parses the parsed[] entry for the asset", () => {
    expect(parseHermesPrice(latestSol, "SOL")).toEqual({
      asset: "SOL",
      price: 152.3456789,
      conf: 0.08123456,
      publishTime: 1791316576,
    });
  });

  it("accepts ids with a 0x prefix", () => {
    const body = { parsed: [{ ...latestSol.parsed[0], id: "0x" + FEED_IDS.SOL }] };
    expect(parseHermesPrice(body, "SOL")?.price).toBe(152.3456789);
  });

  it("returns null for a foreign feed id", () => {
    expect(parseHermesPrice(latestSol, "SKR")).toBeNull();
  });

  it("returns null on malformed bodies", () => {
    const p = latestSol.parsed[0];
    const bad: unknown[] = [
      null,
      "x",
      {},
      { parsed: "x" },
      { parsed: [] },
      { parsed: [{ id: FEED_IDS.SOL }] },
      { parsed: [{ ...p, price: { ...p.price, price: 152 } }] },
      { parsed: [{ ...p, price: { ...p.price, expo: -8.5 } }] },
      { parsed: [{ ...p, price: { ...p.price, publish_time: "1" } }] },
      { parsed: [{ ...p, price: { ...p.price, price: "0" } }] },
    ];
    for (const b of bad) expect(parseHermesPrice(b, "SOL")).toBeNull();
  });
});

describe("fetchLatestPrice", () => {
  it("calls the latest endpoint with the feed id and returns the price", async () => {
    const { fn, reqs } = fakeFetch(200, latestSol);
    const p = await fetchLatestPrice("SOL", fn);
    expect(p.price).toBe(152.3456789);
    expect(reqs[0].url).toBe(`${HERMES_URL}/v2/updates/price/latest?ids[]=${FEED_IDS.SOL}&parsed=true`);
    expect(reqs[0].headers).toEqual({});
  });

  it("sends a bearer token and honours a custom base URL", async () => {
    const { fn, reqs } = fakeFetch(200, latestSol);
    await fetchLatestPrice("SOL", fn, { apiKey: "k1", baseUrl: "https://h.example/" });
    expect(reqs[0].url.startsWith("https://h.example/v2/updates/price/latest?")).toBe(true);
    expect(reqs[0].headers).toEqual({ Authorization: "Bearer k1" });
  });

  it("throws on HTTP errors (e.g. 401 without key) and malformed bodies", async () => {
    await expect(fetchLatestPrice("SOL", fakeFetch(401, "unauthorized").fn)).rejects.toThrow(/401/);
    await expect(fetchLatestPrice("SOL", fakeFetch(200, { parsed: [] }).fn)).rejects.toThrow();
  });
});

describe("fetchPriceAt", () => {
  const TS = 1759752000;

  it("calls the timestamp endpoint and returns the price", async () => {
    const { fn, reqs } = fakeFetch(200, atSkr);
    const p = await fetchPriceAt("SKR", TS, fn);
    expect(p).toEqual({ asset: "SKR", price: 0.05012345, conf: 0.00001234, publishTime: TS });
    expect(reqs[0].url).toBe(`${HERMES_URL}/v2/updates/price/${TS}?ids[]=${FEED_IDS.SKR}&parsed=true`);
  });

  it("returns null when Hermes has no price yet (404)", async () => {
    expect(await fetchPriceAt("SKR", TS, fakeFetch(404, {}).fn)).toBeNull();
  });

  it("rejects a price published before the requested timestamp", async () => {
    await expect(fetchPriceAt("SKR", TS + 1, fakeFetch(200, atSkr).fn)).rejects.toThrow();
  });

  it("rejects non-integer timestamps without fetching", async () => {
    const { fn, reqs } = fakeFetch(200, atSkr);
    await expect(fetchPriceAt("SKR", 1.5, fn)).rejects.toThrow();
    expect(reqs).toHaveLength(0);
  });

  it("throws on other HTTP errors", async () => {
    await expect(fetchPriceAt("SKR", TS, fakeFetch(500, {}).fn)).rejects.toThrow(/500/);
  });
});
