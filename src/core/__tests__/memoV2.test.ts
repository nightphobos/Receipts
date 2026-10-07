import { canonicalJsonV2, type CallV2 } from "../call";
import { commitHash } from "../commit";
import {
  decodeCommitMemo,
  decodeCommitMemoV2,
  decodeMemo,
  decodeMemoV2,
  decodeRevealMemo,
  decodeRevealMemoV2,
  encodeCommitMemoV2,
  encodeRevealMemoV2,
  MAX_MEMO_BYTES,
  MEMO_PREFIX_V2,
  memoByteLength,
  REGISTRY,
} from "../memo";

// Fixed vector, computed independently:
//   printf '%s|%s' "$JSON" "$SALT" | shasum -a 256
//   printf '%s' "$JSON" | base64 | tr '+/' '-_' | tr -d '='
const JSON_V2 = '{"v":2,"asset":"SOL","dir":"up","deadline":1791400000,"created":1791313600}';
const SALT = "00112233445566778899aabbccddeeff";
const HASH = "077acfb5d9f38e5d35aa8875bc4e1d60f683c4a3a639837a5fa63868aba1b691";
const B64 = "eyJ2IjoyLCJhc3NldCI6IlNPTCIsImRpciI6InVwIiwiZGVhZGxpbmUiOjE3OTE0MDAwMDAsImNyZWF0ZWQiOjE3OTEzMTM2MDB9";
const CALL: CallV2 = { v: 2, asset: "SOL", dir: "up", deadline: 1791400000, created: 1791313600 };

const COMMIT = `rcpt:2:c:${HASH}:1791400000:SOL`;
const REVEAL = `rcpt:2:r:${HASH}:${B64}:${SALT}`;

describe("constants", () => {
  it("prefix and registry", () => {
    expect(MEMO_PREFIX_V2).toBe("rcpt:2:");
    expect(REGISTRY).toBe("E5YRG7uSptKAd2T4WbMyK8xadyuZ8v132Ji6XhAxX5SJ");
  });

  it("fixed vector hash matches commitHash", () => {
    expect(canonicalJsonV2(CALL)).toBe(JSON_V2);
    expect(commitHash(JSON_V2, SALT)).toBe(HASH);
  });
});

describe("commit memo v2", () => {
  it("encodes per spec", () => {
    expect(encodeCommitMemoV2(HASH, 1791400000, "SOL")).toBe(COMMIT);
    expect(encodeCommitMemoV2(HASH, 1791400000, "SKR")).toBe(`rcpt:2:c:${HASH}:1791400000:SKR`);
  });

  it("throws on invalid input", () => {
    expect(() => encodeCommitMemoV2(HASH.toUpperCase(), 1791400000, "SOL")).toThrow();
    expect(() => encodeCommitMemoV2(HASH, 1.5, "SOL")).toThrow();
    expect(() => encodeCommitMemoV2(HASH, -1, "SOL")).toThrow();
    expect(() => encodeCommitMemoV2(HASH, 1791400000, "BTC" as never)).toThrow();
  });

  it("decodes", () => {
    expect(decodeCommitMemoV2(COMMIT)).toEqual({
      kind: "commit",
      v: 2,
      hash: HASH,
      deadline: 1791400000,
      asset: "SOL",
    });
  });

  it.each([
    ["v1 prefix", `rcpt:1:c:${HASH}:1791400000:SOL`],
    ["missing asset", `rcpt:2:c:${HASH}:1791400000`],
    ["unknown asset", `rcpt:2:c:${HASH}:1791400000:BTC`],
    ["lowercase asset", `rcpt:2:c:${HASH}:1791400000:sol`],
    ["extra field", `${COMMIT}:x`],
    ["short hash", `rcpt:2:c:${HASH.slice(1)}:1791400000:SOL`],
    ["uppercase hash", `rcpt:2:c:${HASH.toUpperCase()}:1791400000:SOL`],
    ["leading zero deadline", `rcpt:2:c:${HASH}:01791400000:SOL`],
    ["float deadline", `rcpt:2:c:${HASH}:1791400000.5:SOL`],
    ["huge deadline", `rcpt:2:c:${HASH}:99999999999999999999:SOL`],
    ["reveal kind", REVEAL],
  ])("rejects %s", (_n, memo) => {
    expect(decodeCommitMemoV2(memo)).toBeNull();
  });

  it("fits in a memo", () => {
    expect(memoByteLength(COMMIT)).toBeLessThanOrEqual(MAX_MEMO_BYTES);
  });
});

describe("reveal memo v2", () => {
  it("encodes per spec (fixed vector)", () => {
    expect(encodeRevealMemoV2(JSON_V2, SALT)).toBe(REVEAL);
  });

  it("throws on non-canonical json or bad salt", () => {
    expect(() => encodeRevealMemoV2(JSON_V2.replace(":2,", ": 2,"), SALT)).toThrow();
    expect(() =>
      encodeRevealMemoV2('{"v":1,"asset":"SOL","dir":"above","target":1,"deadline":2,"created":1}', SALT),
    ).toThrow();
    expect(() => encodeRevealMemoV2(JSON_V2, SALT.slice(2))).toThrow();
  });

  it("decodes and verifies the hash", () => {
    expect(decodeRevealMemoV2(REVEAL)).toEqual({ kind: "reveal", v: 2, hash: HASH, json: JSON_V2, call: CALL, salt: SALT });
  });

  it("round-trips for SKR down", () => {
    const call: CallV2 = { v: 2, asset: "SKR", dir: "down", deadline: 1791460800, created: 1791400123 };
    const json = canonicalJsonV2(call);
    const memo = encodeRevealMemoV2(json, SALT);
    expect(decodeRevealMemoV2(memo)?.call).toEqual(call);
    expect(memoByteLength(memo)).toBeLessThanOrEqual(MAX_MEMO_BYTES);
  });

  it.each([
    ["v1 prefix", `rcpt:1:r:${HASH}:${B64}:${SALT}`],
    ["hash mismatch", `rcpt:2:r:${"0".repeat(64)}:${B64}:${SALT}`],
    ["salt mismatch", `rcpt:2:r:${HASH}:${B64}:${"f".repeat(32)}`],
    ["bad base64", `rcpt:2:r:${HASH}:${B64}*:${SALT}`],
    ["empty json", `rcpt:2:r:${HASH}::${SALT}`],
    ["missing salt", `rcpt:2:r:${HASH}:${B64}`],
    ["commit kind", COMMIT],
  ])("rejects %s", (_n, memo) => {
    expect(decodeRevealMemoV2(memo)).toBeNull();
  });

  it("rejects a v1 call json wrapped in a v2 memo", () => {
    const j = '{"v":1,"asset":"SOL","dir":"above","target":1,"deadline":2,"created":1}';
    const b64 = Buffer.from(j).toString("base64url");
    expect(decodeRevealMemoV2(`rcpt:2:r:${commitHash(j, SALT)}:${b64}:${SALT}`)).toBeNull();
  });
});

describe("decodeMemoV2 and legacy v1 isolation", () => {
  it("dispatches by kind", () => {
    expect(decodeMemoV2(COMMIT)?.kind).toBe("commit");
    expect(decodeMemoV2(REVEAL)?.kind).toBe("reveal");
    expect(decodeMemoV2("hello")).toBeNull();
  });

  it("legacy v1 decoders ignore v2 memos", () => {
    expect(decodeMemo(COMMIT)).toBeNull();
    expect(decodeMemo(REVEAL)).toBeNull();
    expect(decodeCommitMemo(COMMIT)).toBeNull();
    expect(decodeRevealMemo(REVEAL)).toBeNull();
  });
});
