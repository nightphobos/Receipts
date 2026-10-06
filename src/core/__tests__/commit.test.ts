import { canonicalJson } from "../call";
import { commitHash, isHash, isSaltHex, makeSalt, SALT_BYTES } from "../commit";

const SALT = "000102030405060708090a0b0c0d0e0f";
const JSON_SOL = '{"v":1,"asset":"SOL","dir":"above","target":250.5,"deadline":1800086400,"created":1800000000}';
// Pinned: printf '%s' "$JSON_SOL|$SALT" | shasum -a 256
const HASH_SOL = "49094bec946ff69a99d4021f4bb4a66e46d8fd43d0706b54d65fc2fa801cef66";

const seq = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

describe("makeSalt", () => {
  it("requests 16 bytes and returns 32 lowercase hex chars", () => {
    const calls: number[] = [];
    const salt = makeSalt((n) => {
      calls.push(n);
      return seq(n);
    });
    expect(calls).toEqual([SALT_BYTES]);
    expect(SALT_BYTES).toBe(16);
    expect(salt).toBe(SALT);
    expect(isSaltHex(salt)).toBe(true);
  });

  it("lowercases high bytes", () => {
    expect(makeSalt((n) => new Uint8Array(n).fill(0xab))).toBe("ab".repeat(16));
  });

  it("throws if the RNG returns the wrong length", () => {
    expect(() => makeSalt(() => new Uint8Array(15))).toThrow();
    expect(() => makeSalt(() => new Uint8Array(17))).toThrow();
  });

  it("throws on an all-zero (broken) RNG output", () => {
    expect(() => makeSalt((n) => new Uint8Array(n))).toThrow();
  });
});

describe("isSaltHex / isHash", () => {
  it("accepts only lowercase hex of exact length", () => {
    expect(isSaltHex(SALT)).toBe(true);
    expect(isSaltHex(SALT.toUpperCase().replace(/^0/, "A"))).toBe(false);
    expect(isSaltHex(SALT.slice(1))).toBe(false);
    expect(isSaltHex(SALT + "0")).toBe(false);
    expect(isSaltHex("g".repeat(32))).toBe(false);
    expect(isHash(HASH_SOL)).toBe(true);
    expect(isHash(HASH_SOL.slice(2))).toBe(false);
    expect(isHash(HASH_SOL.toUpperCase())).toBe(false);
  });
});

describe("commitHash", () => {
  it("matches the pinned vector", () => {
    expect(commitHash(JSON_SOL, SALT)).toBe(HASH_SOL);
  });

  it("canonicalJson of the call yields the vector input", () => {
    const json = canonicalJson({ v: 1, asset: "SOL", dir: "above", target: 250.5, deadline: 1800086400, created: 1800000000 });
    expect(json).toBe(JSON_SOL);
    expect(commitHash(json, SALT)).toBe(HASH_SOL);
  });

  it("output is 64 lowercase hex", () => {
    expect(commitHash("{}", SALT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with salt or json", () => {
    expect(commitHash(JSON_SOL, "ff" + SALT.slice(2))).not.toBe(HASH_SOL);
    expect(commitHash(JSON_SOL.replace("250.5", "250.6"), SALT)).not.toBe(HASH_SOL);
  });

  it("rejects a malformed salt", () => {
    expect(() => commitHash(JSON_SOL, "xyz")).toThrow();
    expect(() => commitHash(JSON_SOL, SALT.toUpperCase())).toThrow();
  });
});
