import type { Call } from "../call";
import { callFromJson, describeCall, formatCountdown, formatUsd, solscanTxUrl } from "../format";

const CALL: Call = { v: 1, asset: "SOL", dir: "above", target: 250.5, deadline: 1800086400, created: 1800000000 };
const JSON_SOL = '{"v":1,"asset":"SOL","dir":"above","target":250.5,"deadline":1800086400,"created":1800000000}';

describe("formatUsd", () => {
  it("uses 2 decimals at or above $1", () => {
    expect(formatUsd(1)).toBe("1.00");
    expect(formatUsd(250.5)).toBe("250.50");
    expect(formatUsd(65000.126)).toBe("65000.13");
  });
  it("uses 4 significant digits below $1", () => {
    expect(formatUsd(0.5)).toBe("0.5000");
    expect(formatUsd(0.00002345)).toBe("0.00002345");
  });
});

describe("formatCountdown", () => {
  it("clamps non-positive to 0s", () => {
    expect(formatCountdown(0)).toBe("0s");
    expect(formatCountdown(-5)).toBe("0s");
  });
  it("shows seconds under a minute", () => {
    expect(formatCountdown(45)).toBe("45s");
    expect(formatCountdown(59.9)).toBe("59s");
  });
  it("shows minutes and padded seconds under an hour", () => {
    expect(formatCountdown(60)).toBe("1m 00s");
    expect(formatCountdown(3599)).toBe("59m 59s");
  });
  it("shows hours and padded minutes under a day", () => {
    expect(formatCountdown(3600)).toBe("1h 00m");
    expect(formatCountdown(5 * 3600 + 7 * 60 + 30)).toBe("5h 07m");
    expect(formatCountdown(86399)).toBe("23h 59m");
  });
  it("shows days and hours from a day", () => {
    expect(formatCountdown(86400)).toBe("1d 0h");
    expect(formatCountdown(30 * 86400 - 1)).toBe("29d 23h");
  });
});

describe("describeCall", () => {
  it("renders asset, direction and target", () => {
    expect(describeCall(CALL)).toBe("SOL above $250.50");
    expect(describeCall({ ...CALL, asset: "BONK", dir: "below", target: 0.00002 })).toBe("BONK below $0.00002000");
  });
});

describe("callFromJson", () => {
  it("parses a valid call", () => {
    expect(callFromJson(JSON_SOL)).toEqual(CALL);
  });
  it("returns null for junk or schema mismatch", () => {
    expect(callFromJson("not json")).toBeNull();
    expect(callFromJson('{"v":2}')).toBeNull();
    expect(callFromJson("null")).toBeNull();
  });
});

describe("solscanTxUrl", () => {
  const SIG = "5h6xBEauJ3PK6SWCZ1PGjBvj8vDdWG3KpwATGy1ARAXFSDwt8GFXM7W5Ncn16wmqokgpiKRLuS83KUxyZyv2sUYv";
  it("has no cluster param on mainnet", () => {
    expect(solscanTxUrl(SIG, "mainnet-beta")).toBe(`https://solscan.io/tx/${SIG}`);
    expect(solscanTxUrl(SIG)).toBe(`https://solscan.io/tx/${SIG}`);
  });
  it("adds ?cluster= for devnet and testnet", () => {
    expect(solscanTxUrl(SIG, "devnet")).toBe(`https://solscan.io/tx/${SIG}?cluster=devnet`);
    expect(solscanTxUrl(SIG, "testnet")).toBe(`https://solscan.io/tx/${SIG}?cluster=testnet`);
  });
  it("treats unknown clusters as mainnet", () => {
    expect(solscanTxUrl(SIG, "custom")).toBe(`https://solscan.io/tx/${SIG}`);
  });
});
