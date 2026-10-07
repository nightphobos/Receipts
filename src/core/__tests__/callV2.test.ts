import {
  canonicalJsonV2,
  DIRECTIONS_V2,
  isCallV2,
  MAX_DEADLINE_SEC,
  MIN_DEADLINE_SEC,
  validateCallV2,
  type CallV2,
} from "../call";

const NOW = 1791313600;
const CALL: CallV2 = { v: 2, asset: "SOL", dir: "up", deadline: 1791400000, created: NOW };

describe("DIRECTIONS_V2", () => {
  it("is up/down", () => {
    expect(DIRECTIONS_V2).toEqual(["up", "down"]);
  });
});

describe("canonicalJsonV2", () => {
  it("matches the spec example byte for byte", () => {
    expect(canonicalJsonV2(CALL)).toBe('{"v":2,"asset":"SOL","dir":"up","deadline":1791400000,"created":1791313600}');
  });

  it("uses fixed key order regardless of object order", () => {
    const shuffled = { created: NOW, deadline: 1791400000, dir: "down", asset: "SKR", v: 2 } as CallV2;
    expect(canonicalJsonV2(shuffled)).toBe(
      '{"v":2,"asset":"SKR","dir":"down","deadline":1791400000,"created":1791313600}',
    );
  });

  it("round-trips through JSON.parse", () => {
    expect(JSON.parse(canonicalJsonV2(CALL))).toEqual(CALL);
  });
});

describe("isCallV2", () => {
  it("accepts a valid call", () => {
    expect(isCallV2(CALL)).toBe(true);
    expect(isCallV2({ ...CALL, asset: "SKR", dir: "down" })).toBe(true);
  });

  it.each([
    ["v1 version", { ...CALL, v: 1 }],
    ["v1 direction", { ...CALL, dir: "above" }],
    ["unknown asset", { ...CALL, asset: "BTC" }],
    ["extra target key", { ...CALL, target: 1 }],
    ["missing created", { v: 2, asset: "SOL", dir: "up", deadline: 1 }],
    ["float deadline", { ...CALL, deadline: 1.5 }],
    ["string created", { ...CALL, created: "1" }],
    ["array", []],
    ["null", null],
  ])("rejects %s", (_name, x) => {
    expect(isCallV2(x)).toBe(false);
  });
});

describe("validateCallV2", () => {
  it("accepts a 24h call and returns a clean copy", () => {
    const r = validateCallV2({ ...CALL, deadline: NOW + 86400 }, NOW);
    expect(r).toEqual({ ok: true, call: { ...CALL, deadline: NOW + 86400 } });
  });

  it("accepts the 1h practice horizon exactly", () => {
    expect(validateCallV2({ ...CALL, deadline: NOW + MIN_DEADLINE_SEC }, NOW).ok).toBe(true);
  });

  it("rejects deadlines outside [now+1h, now+30d]", () => {
    expect(validateCallV2({ ...CALL, deadline: NOW + MIN_DEADLINE_SEC - 1 }, NOW).ok).toBe(false);
    expect(validateCallV2({ ...CALL, deadline: NOW + MAX_DEADLINE_SEC + 1 }, NOW).ok).toBe(false);
  });

  it("rejects created in the future", () => {
    expect(validateCallV2({ ...CALL, created: NOW + 1, deadline: NOW + 86400 }, NOW).ok).toBe(false);
  });

  it("reports schema errors", () => {
    const r = validateCallV2({ ...CALL, dir: "above", deadline: NOW + 86400 }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("Direction must be up or down");
  });
});
