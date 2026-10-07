import { SKR_DECIMALS, SKR_MINT, TIP_AMOUNTS, canTip, skrToBaseUnits } from "../tip";

describe("tip constants", () => {
  it("pins the SKR mint verified on mainnet (SPL Token, 6 decimals)", () => {
    expect(SKR_MINT).toBe("SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3");
    expect(SKR_DECIMALS).toBe(6);
  });

  it("offers exactly 10 / 50 / 100 SKR", () => {
    expect(TIP_AMOUNTS).toEqual([10, 50, 100]);
  });
});

describe("skrToBaseUnits", () => {
  it("scales whole SKR by 10^6", () => {
    expect(skrToBaseUnits(10)).toBe(10_000_000n);
    expect(skrToBaseUnits(100)).toBe(100_000_000n);
  });

  it("rejects non-positive, fractional or unsafe amounts", () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => skrToBaseUnits(bad)).toThrow();
    }
  });
});

describe("canTip", () => {
  const a = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
  const b = "5wY8DyzUmAVc9Hkv2uhqZuPvQWmeBd3w2Q4gsaAifFBa";
  it("needs a connected wallet different from the recipient", () => {
    expect(canTip(a, b)).toBe(true);
    expect(canTip(a, a)).toBe(false);
    expect(canTip(null, b)).toBe(false);
    expect(canTip(undefined, b)).toBe(false);
  });
});
