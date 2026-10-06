import { ASSETS, Call, canonicalJson, isCall, MAX_DEADLINE_SEC, MIN_DEADLINE_SEC, toPlainDecimal, validateCall } from "../call";

const NOW = 1_800_000_000;

const base = (over: Partial<Call> = {}): Call => ({
  v: 1,
  asset: "SOL",
  dir: "above",
  target: 250.5,
  deadline: NOW + 24 * 3600,
  created: NOW,
  ...over,
});

describe("constants", () => {
  it("has the fixed asset list", () => {
    expect(ASSETS).toEqual(["SOL", "SKR"]);
  });
  it("deadline window is 1h..30d", () => {
    expect(MIN_DEADLINE_SEC).toBe(3600);
    expect(MAX_DEADLINE_SEC).toBe(30 * 24 * 3600);
  });
});

describe("validateCall", () => {
  it("accepts a valid call", () => {
    expect(validateCall(base(), NOW)).toEqual({ ok: true, call: base() });
  });

  it.each(ASSETS)("accepts asset %s", (asset) => {
    expect(validateCall(base({ asset }), NOW).ok).toBe(true);
  });

  it("accepts below", () => {
    expect(validateCall(base({ dir: "below" }), NOW).ok).toBe(true);
  });

  it("rejects unknown asset", () => {
    const r = validateCall({ ...base(), asset: "DOGE" }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/asset/i);
  });

  it.each(["BTC", "ETH", "JUP", "BONK"])("rejects dropped asset %s", (asset) => {
    expect(validateCall({ ...base(), asset }, NOW).ok).toBe(false);
  });

  it("rejects unknown direction", () => {
    expect(validateCall({ ...base(), dir: "sideways" }, NOW).ok).toBe(false);
  });

  it("rejects wrong version", () => {
    expect(validateCall({ ...base(), v: 2 }, NOW).ok).toBe(false);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])("rejects target %p", (target) => {
    const r = validateCall(base({ target }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/target/i);
  });

  it("rejects non-number target", () => {
    expect(validateCall({ ...base(), target: "100" }, NOW).ok).toBe(false);
  });

  it("accepts tiny positive target (SKR-like)", () => {
    expect(validateCall(base({ asset: "SKR", target: 0.00002 }), NOW).ok).toBe(true);
  });

  it("deadline exactly now + 1h is valid", () => {
    expect(validateCall(base({ deadline: NOW + 3600 }), NOW).ok).toBe(true);
  });

  it("deadline now + 1h - 1s is invalid", () => {
    const r = validateCall(base({ deadline: NOW + 3599 }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/deadline/i);
  });

  it("deadline exactly now + 30d is valid", () => {
    expect(validateCall(base({ deadline: NOW + 30 * 86400 }), NOW).ok).toBe(true);
  });

  it("deadline now + 30d + 1s is invalid", () => {
    expect(validateCall(base({ deadline: NOW + 30 * 86400 + 1 }), NOW).ok).toBe(false);
  });

  it("non-integer deadline is invalid", () => {
    expect(validateCall(base({ deadline: NOW + 7200.5 }), NOW).ok).toBe(false);
  });

  it("created exactly now is valid, created in the past is valid", () => {
    expect(validateCall(base({ created: NOW }), NOW).ok).toBe(true);
    expect(validateCall(base({ created: NOW - 10 }), NOW).ok).toBe(true);
  });

  it("created in the future is invalid", () => {
    const r = validateCall(base({ created: NOW + 1 }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/created/i);
  });

  it("non-integer created is invalid", () => {
    expect(validateCall(base({ created: NOW - 0.5 }), NOW).ok).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(validateCall(null, NOW).ok).toBe(false);
    expect(validateCall("x", NOW).ok).toBe(false);
    expect(validateCall([], NOW).ok).toBe(false);
  });

  it("collects multiple errors", () => {
    const r = validateCall(base({ target: -1, deadline: NOW }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("isCall (schema only, no time window)", () => {
  it("accepts a past-deadline call", () => {
    expect(isCall(base({ deadline: 1, created: 0 }))).toBe(true);
  });
  it("rejects extra keys", () => {
    expect(isCall({ ...base(), extra: 1 })).toBe(false);
  });
  it("rejects missing keys", () => {
    const { created: _c, ...rest } = base();
    expect(isCall(rest)).toBe(false);
  });
  it("rejects bad target", () => {
    expect(isCall(base({ target: 0 }))).toBe(false);
  });
});

describe("toPlainDecimal", () => {
  it.each([
    [250.5, "250.5"],
    [100, "100"],
    [0.00002, "0.00002"],
    [1e-7, "0.0000001"],
    [1.5e-8, "0.000000015"],
    [1e21, "1000000000000000000000"],
    [1.25e22, "12500000000000000000000"],
  ])("%p -> %s", (n, s) => {
    expect(toPlainDecimal(n)).toBe(s);
    expect(Number(s)).toBe(n);
  });
});

describe("canonicalJson", () => {
  it("uses fixed key order regardless of input order", () => {
    const shuffled = { created: NOW, deadline: NOW + 3600, target: 250.5, dir: "above", asset: "SOL", v: 1 } as Call;
    expect(canonicalJson(shuffled)).toBe(
      `{"v":1,"asset":"SOL","dir":"above","target":250.5,"deadline":${NOW + 3600},"created":${NOW}}`,
    );
  });

  it("drops unknown keys", () => {
    const withExtra = { ...base(), extra: "x" } as Call;
    expect(canonicalJson(withExtra)).toBe(canonicalJson(base()));
  });

  it("serializes target as plain decimal (no exponent)", () => {
    const json = canonicalJson(base({ asset: "SKR", target: 1e-7 }));
    expect(json).toContain(`"target":0.0000001,`);
    expect(JSON.parse(json).target).toBe(1e-7);
  });

  it("round-trips through JSON.parse", () => {
    const c = base({ target: 0.00002345 });
    expect(JSON.parse(canonicalJson(c))).toEqual(c);
  });

  it("is a stable pinned string", () => {
    expect(canonicalJson({ v: 1, asset: "SKR", dir: "below", target: 0.05, deadline: 1800086400, created: 1800000000 })).toBe(
      '{"v":1,"asset":"SKR","dir":"below","target":0.05,"deadline":1800086400,"created":1800000000}',
    );
  });
});
