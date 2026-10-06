import { canonicalJson, type Call } from "../call";
import { commitHash } from "../commit";
import {
  base64urlDecode,
  base64urlEncode,
  decodeCommitMemo,
  decodeMemo,
  decodeRevealMemo,
  encodeCommitMemo,
  encodeRevealMemo,
  MAX_MEMO_BYTES,
  MEMO_PREFIX,
  memoByteLength,
} from "../memo";

const SALT = "000102030405060708090a0b0c0d0e0f";
const JSON_SOL = '{"v":1,"asset":"SOL","dir":"above","target":250.5,"deadline":1800086400,"created":1800000000}';
const HASH_SOL = "49094bec946ff69a99d4021f4bb4a66e46d8fd43d0706b54d65fc2fa801cef66";
// Pinned: printf '%s' "$JSON_SOL" | base64 | tr '+/' '-_' | tr -d '='
const B64_SOL =
  "eyJ2IjoxLCJhc3NldCI6IlNPTCIsImRpciI6ImFib3ZlIiwidGFyZ2V0IjoyNTAuNSwiZGVhZGxpbmUiOjE4MDAwODY0MDAsImNyZWF0ZWQiOjE4MDAwMDAwMDB9";
const CALL_SOL: Call = { v: 1, asset: "SOL", dir: "above", target: 250.5, deadline: 1800086400, created: 1800000000 };

const COMMIT_SOL = `rcpt:1:c:${HASH_SOL}:1800086400`;
const REVEAL_SOL = `rcpt:1:r:${HASH_SOL}:${B64_SOL}:${SALT}`;

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("base64url", () => {
  it.each([
    ["", ""],
    ["f", "Zg"],
    ["fo", "Zm8"],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg"],
  ])("encodes %p without padding", (raw, enc) => {
    expect(base64urlEncode(bytes(raw))).toBe(enc);
    expect(base64urlDecode(enc)).toEqual(bytes(raw));
  });

  it("uses - and _ instead of + and /", () => {
    expect(base64urlEncode(Uint8Array.from([0xfb, 0xff]))).toBe("-_8");
    expect(base64urlDecode("-_8")).toEqual(Uint8Array.from([0xfb, 0xff]));
  });

  it("round-trips all byte values", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base64urlDecode(base64urlEncode(all))).toEqual(all);
  });

  it.each(["Zg==", "Zm8=", "+/8", "Z", "Zm9vY", "Zh", "Zm9", "a b", "Zg\n"])("rejects %p", (s) => {
    expect(base64urlDecode(s)).toBeNull();
  });
});

describe("commit memo", () => {
  it("encodes per plan", () => {
    expect(encodeCommitMemo(HASH_SOL, 1800086400)).toBe(COMMIT_SOL);
    expect(MEMO_PREFIX).toBe("rcpt:1:");
  });

  it("round-trips", () => {
    expect(decodeCommitMemo(COMMIT_SOL)).toEqual({ kind: "commit", hash: HASH_SOL, deadline: 1800086400 });
  });

  it("is ≤ 500 bytes", () => {
    expect(MAX_MEMO_BYTES).toBe(500);
    expect(memoByteLength(encodeCommitMemo(HASH_SOL, Number.MAX_SAFE_INTEGER))).toBeLessThanOrEqual(MAX_MEMO_BYTES);
  });

  it("throws on bad inputs", () => {
    expect(() => encodeCommitMemo("abc", 1800086400)).toThrow();
    expect(() => encodeCommitMemo(HASH_SOL.toUpperCase(), 1800086400)).toThrow();
    expect(() => encodeCommitMemo(HASH_SOL, 1.5)).toThrow();
    expect(() => encodeCommitMemo(HASH_SOL, -1)).toThrow();
  });

  it.each([
    ["wrong prefix", `rcpt:2:c:${HASH_SOL}:1800086400`],
    ["other app", `foo:1:c:${HASH_SOL}:1800086400`],
    ["wrong kind", `rcpt:1:x:${HASH_SOL}:1800086400`],
    ["short hash", `rcpt:1:c:${HASH_SOL.slice(1)}:1800086400`],
    ["long hash", `rcpt:1:c:${HASH_SOL}0:1800086400`],
    ["uppercase hash", `rcpt:1:c:${HASH_SOL.toUpperCase()}:1800086400`],
    ["non-hex hash", `rcpt:1:c:${"g".repeat(64)}:1800086400`],
    ["fractional deadline", `rcpt:1:c:${HASH_SOL}:1800086400.5`],
    ["negative deadline", `rcpt:1:c:${HASH_SOL}:-1800086400`],
    ["exponent deadline", `rcpt:1:c:${HASH_SOL}:1e9`],
    ["leading zero deadline", `rcpt:1:c:${HASH_SOL}:01800086400`],
    ["empty deadline", `rcpt:1:c:${HASH_SOL}:`],
    ["unsafe deadline", `rcpt:1:c:${HASH_SOL}:99999999999999999999`],
    ["extra field", `${COMMIT_SOL}:x`],
    ["missing deadline", `rcpt:1:c:${HASH_SOL}`],
    ["trailing space", `${COMMIT_SOL} `],
    ["reveal memo", REVEAL_SOL],
    ["empty", ""],
  ])("returns null for %s", (_, memo) => {
    expect(decodeCommitMemo(memo)).toBeNull();
  });

  it("returns null for non-strings", () => {
    expect(decodeCommitMemo(undefined as unknown as string)).toBeNull();
    expect(decodeCommitMemo(42 as unknown as string)).toBeNull();
  });
});

describe("reveal memo", () => {
  it("encodes per plan, hashing json + salt", () => {
    expect(canonicalJson(CALL_SOL)).toBe(JSON_SOL);
    expect(encodeRevealMemo(JSON_SOL, SALT)).toBe(REVEAL_SOL);
  });

  it("round-trips", () => {
    expect(decodeRevealMemo(REVEAL_SOL)).toEqual({
      kind: "reveal",
      hash: HASH_SOL,
      json: JSON_SOL,
      call: CALL_SOL,
      salt: SALT,
    });
  });

  it("round-trips a tiny SKR target", () => {
    const call: Call = { v: 1, asset: "SKR", dir: "below", target: 0.0000123, deadline: 1800086400, created: 1800000000 };
    const json = canonicalJson(call);
    const memo = encodeRevealMemo(json, SALT);
    expect(decodeRevealMemo(memo)).toEqual({ kind: "reveal", hash: commitHash(json, SALT), json, call, salt: SALT });
  });

  it("is ≤ 500 bytes for realistic calls", () => {
    const call: Call = {
      v: 1,
      asset: "SKR",
      dir: "below",
      target: 0.000012345678901234,
      deadline: 1802592000,
      created: 1800000000,
    };
    for (const m of [REVEAL_SOL, encodeRevealMemo(canonicalJson(call), SALT)])
      expect(memoByteLength(m)).toBeLessThanOrEqual(MAX_MEMO_BYTES);
  });

  it("throws when the memo would exceed 500 bytes", () => {
    const json = canonicalJson({ ...CALL_SOL, target: 1e300 });
    expect(() => encodeRevealMemo(json, SALT)).toThrow(/500/);
  });

  it("throws on bad salt or non-canonical json", () => {
    expect(() => encodeRevealMemo(JSON_SOL, "xyz")).toThrow();
    expect(() => encodeRevealMemo(JSON_SOL.replace('"v":1,', '"v":1, '), SALT)).toThrow();
  });

  const enc = (s: string) => base64urlEncode(bytes(s));
  const otherSalt = "f".repeat(32);

  it.each([
    ["wrong prefix", REVEAL_SOL.replace("rcpt:1:", "rcpt:2:")],
    ["wrong kind", REVEAL_SOL.replace("rcpt:1:r:", "rcpt:1:c:")],
    ["short hash", `rcpt:1:r:${HASH_SOL.slice(1)}:${B64_SOL}:${SALT}`],
    ["uppercase hash", `rcpt:1:r:${HASH_SOL.toUpperCase()}:${B64_SOL}:${SALT}`],
    ["hash mismatch", `rcpt:1:r:${"0".repeat(64)}:${B64_SOL}:${SALT}`],
    ["wrong salt", `rcpt:1:r:${HASH_SOL}:${B64_SOL}:${otherSalt}`],
    ["short salt", `rcpt:1:r:${HASH_SOL}:${B64_SOL}:${SALT.slice(1)}`],
    ["uppercase salt", `rcpt:1:r:${HASH_SOL}:${B64_SOL}:${SALT.toUpperCase()}`],
    ["padded base64", `rcpt:1:r:${HASH_SOL}:${B64_SOL}==:${SALT}`],
    ["standard base64 chars", `rcpt:1:r:${HASH_SOL}:${B64_SOL.slice(0, -1)}+:${SALT}`],
    ["truncated base64", `rcpt:1:r:${HASH_SOL}:${B64_SOL.slice(0, -1)}:${SALT}`],
    ["empty payload", `rcpt:1:r:${HASH_SOL}::${SALT}`],
    ["missing salt", `rcpt:1:r:${HASH_SOL}:${B64_SOL}`],
    ["extra field", `${REVEAL_SOL}:x`],
  ])("returns null for %s", (_, memo) => {
    expect(decodeRevealMemo(memo)).toBeNull();
  });

  it.each([
    ["invalid JSON", "{not json"],
    ["array", "[1,2]"],
    ["wrong version", JSON_SOL.replace('"v":1', '"v":2')],
    ["unknown asset", JSON_SOL.replace("SOL", "DOGE")],
    ["extra key", JSON_SOL.replace("}", ',"x":1}')],
    ["missing key", '{"v":1,"asset":"SOL","dir":"above","target":250.5,"deadline":1800086400}'],
    ["non-canonical key order", '{"asset":"SOL","v":1,"dir":"above","target":250.5,"deadline":1800086400,"created":1800000000}'],
    ["non-canonical whitespace", JSON_SOL.replace(",", ", ")],
    ["non-ascii", JSON_SOL.replace("SOL", "SÖL")],
  ])("returns null for payload with %s (even if hash matches)", (_, json) => {
    const memo = `rcpt:1:r:${commitHash(json, SALT)}:${enc(json)}:${SALT}`;
    expect(decodeRevealMemo(memo)).toBeNull();
  });

  it("returns null for memos over 500 bytes", () => {
    const json = canonicalJson({ ...CALL_SOL, target: 1e300 });
    const memo = `rcpt:1:r:${commitHash(json, SALT)}:${enc(json)}:${SALT}`;
    expect(memoByteLength(memo)).toBeGreaterThan(MAX_MEMO_BYTES);
    expect(decodeRevealMemo(memo)).toBeNull();
  });
});

describe("decodeMemo", () => {
  it("dispatches by kind", () => {
    expect(decodeMemo(COMMIT_SOL)?.kind).toBe("commit");
    expect(decodeMemo(REVEAL_SOL)?.kind).toBe("reveal");
    expect(decodeMemo("hello")).toBeNull();
    expect(decodeMemo("rcpt:1:z:abc")).toBeNull();
  });
});
