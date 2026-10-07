import {
  SKR_DECIMALS,
  SKR_GATE_MIN,
  SKR_MINT,
  TIP_AMOUNTS,
  TIP_MEMO_PREFIX,
  canTip,
  isSkrHolder,
  parseTipMemo,
  skrBalanceOf,
  skrToBaseUnits,
  tipMemo,
} from "../tip";

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

describe("SKR balance gate", () => {
  const acct = (mint: string, amount: string, decimals = 6) => ({
    info: { mint, owner: "W", tokenAmount: { amount, decimals, uiAmount: Number(amount) / 10 ** decimals } },
    type: "account",
  });

  it("is 100 whole SKR", () => {
    expect(SKR_GATE_MIN).toBe(100);
  });

  it("sums every SKR token account in whole SKR, ignoring other mints and junk", () => {
    expect(
      skrBalanceOf([
        acct(SKR_MINT, "60000000"),
        acct(SKR_MINT, "40500000"),
        acct("So11111111111111111111111111111111111111112", "999000000000"),
        null,
        { info: { mint: SKR_MINT, tokenAmount: { amount: "x", decimals: 6 } } },
        { info: { mint: SKR_MINT, tokenAmount: { amount: "5", decimals: 9 } } },
      ]),
    ).toBeCloseTo(100.5);
    expect(skrBalanceOf([])).toBe(0);
  });

  it("holder = balance ≥ SKR_GATE_MIN", () => {
    expect(isSkrHolder(100)).toBe(true);
    expect(isSkrHolder(99.999999)).toBe(false);
    expect(isSkrHolder(skrBalanceOf([acct(SKR_MINT, "100000000")]))).toBe(true);
  });
});

describe("tip memo", () => {
  const R = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3";

  it("is rcpt:2:t:<recipient>", () => {
    expect(TIP_MEMO_PREFIX).toBe("rcpt:2:t:");
    expect(tipMemo(R)).toBe(`rcpt:2:t:${R}`);
    expect(parseTipMemo(tipMemo(R))).toBe(R);
  });

  it("rejects other memos and non-base58 recipients", () => {
    expect(parseTipMemo("rcpt:2:c:abc")).toBeNull();
    expect(parseTipMemo("rcpt:2:t:")).toBeNull();
    expect(parseTipMemo("rcpt:2:t:0OIl")).toBeNull();
    expect(parseTipMemo(`rcpt:2:t:${R} `)).toBeNull();
    expect(() => tipMemo("not a key")).toThrow();
  });
});
