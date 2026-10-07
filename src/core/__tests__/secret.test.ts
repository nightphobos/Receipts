import { canonicalJsonV2, type CallV2 } from "../call";
import { commitHash } from "../commit";
import {
  MASTER_MESSAGE,
  RECOVERY_WINDOW_SEC,
  decideMaster,
  masterFromSignature,
  recoverCall,
  saltFor,
  signatureFromSignedPayload,
} from "../secret";

// Fixed vector, computed independently with Python hashlib/hmac:
//   sig = bytes(range(64)); master = sha256(sig)
//   salt = hmac_sha256(master, "rcpt:2|SOL|1791400000").hexdigest()[:32]
const SIG = Uint8Array.from({ length: 64 }, (_, i) => i);
const MASTER_HEX = "fdeab9acf3710362bd2658cdc9a29e8f9c757fcf9811603a8c447cd1d9151108";
const SALT_SOL = "6b0f8fcf59f5d22e29260877ff776fde";
const SALT_SKR = "ced8c3ffe2ee61e18953134f75da1d49";
// sha256('{"v":2,"asset":"SOL","dir":"down","deadline":1791400000,"created":1791313000}|' + SALT_SOL)
const HASH_DOWN = "4dc458fee8bd1b9074105f16f7ba471d4609be868f48c11d5313d118e5e4ed6b";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("MASTER_MESSAGE", () => {
  it("is the exact spec text", () => {
    expect(MASTER_MESSAGE).toBe(
      "Receipts master key v1\nSigning this lets Receipts hide and later reveal your call directions. It cannot move funds.",
    );
  });
});

describe("masterFromSignature", () => {
  it("is sha256 of the signature bytes (fixed vector)", () => {
    expect(hex(masterFromSignature(SIG))).toBe(MASTER_HEX);
  });

  it("rejects signatures that are not 64 bytes", () => {
    expect(() => masterFromSignature(new Uint8Array(63))).toThrow();
    expect(() => masterFromSignature(new Uint8Array(65))).toThrow();
  });

  it("rejects an all-zero signature", () => {
    expect(() => masterFromSignature(new Uint8Array(64))).toThrow();
  });
});

describe("saltFor", () => {
  const master = masterFromSignature(SIG);

  it("matches the fixed vector", () => {
    expect(saltFor(master, "SOL", 1791400000)).toBe(SALT_SOL);
    expect(saltFor(master, "SKR", 1791400000)).toBe(SALT_SKR);
  });

  it("is 32 lowercase hex chars and deterministic", () => {
    const s = saltFor(master, "SOL", 1791400000);
    expect(s).toMatch(/^[0-9a-f]{32}$/);
    expect(saltFor(master, "SOL", 1791400000)).toBe(s);
  });

  it("differs per deadline and per master", () => {
    expect(saltFor(master, "SOL", 1791400001)).not.toBe(SALT_SOL);
    const other = masterFromSignature(Uint8Array.from({ length: 64 }, (_, i) => 63 - i));
    expect(saltFor(other, "SOL", 1791400000)).not.toBe(SALT_SOL);
  });

  it("rejects a bad master or deadline", () => {
    expect(() => saltFor(new Uint8Array(31), "SOL", 1791400000)).toThrow();
    expect(() => saltFor(master, "SOL", 1.5)).toThrow();
  });
});

describe("recoverCall", () => {
  const master = masterFromSignature(SIG);
  const deadline = 1791400000;
  const commitFor = (call: CallV2) => ({
    hash: commitHash(canonicalJsonV2(call), saltFor(master, call.asset, call.deadline)),
    deadline: call.deadline,
    asset: call.asset,
  });

  it("recovers the fixed vector", () => {
    const r = recoverCall(master, { hash: HASH_DOWN, deadline, asset: "SOL" }, 1791313000 + 37);
    expect(r).not.toBeNull();
    expect(r!.call).toEqual({ v: 2, asset: "SOL", dir: "down", deadline, created: 1791313000 });
    expect(r!.salt).toBe(SALT_SOL);
    expect(r!.json).toBe('{"v":2,"asset":"SOL","dir":"down","deadline":1791400000,"created":1791313000}');
  });

  it("finds created at both window edges, both directions", () => {
    const blockTime = 1791313600;
    for (const dir of ["up", "down"] as const) {
      for (const created of [blockTime, blockTime - RECOVERY_WINDOW_SEC]) {
        const call: CallV2 = { v: 2, asset: "SKR", dir, deadline, created };
        const r = recoverCall(master, commitFor(call), blockTime);
        expect(r?.call).toEqual(call);
        expect(commitHash(r!.json, r!.salt)).toBe(commitFor(call).hash);
      }
    }
  });

  it("returns null when created is outside the window", () => {
    const blockTime = 1791313600;
    const early: CallV2 = { v: 2, asset: "SOL", dir: "up", deadline, created: blockTime - RECOVERY_WINDOW_SEC - 1 };
    const late: CallV2 = { v: 2, asset: "SOL", dir: "up", deadline, created: blockTime + 1 };
    expect(recoverCall(master, commitFor(early), blockTime)).toBeNull();
    expect(recoverCall(master, commitFor(late), blockTime)).toBeNull();
  });

  it("returns null for another wallet's master", () => {
    const call: CallV2 = { v: 2, asset: "SOL", dir: "up", deadline, created: 1791313500 };
    const other = masterFromSignature(Uint8Array.from({ length: 64 }, (_, i) => 63 - i));
    expect(recoverCall(other, commitFor(call), 1791313600)).toBeNull();
  });

  it("returns null for a malformed commit or blockTime", () => {
    expect(recoverCall(master, { hash: "zz", deadline, asset: "SOL" }, 1791313600)).toBeNull();
    expect(recoverCall(master, { hash: HASH_DOWN, deadline, asset: "SOL" }, 1.5)).toBeNull();
  });
});

describe("decideMaster", () => {
  const a = Uint8Array.from({ length: 64 }, (_, i) => i);
  it("derives the master when both signatures are identical", () => {
    expect(decideMaster(a, Uint8Array.from(a))).toEqual({ mode: "derived", master: masterFromSignature(a) });
  });
  it("falls back to random salts when the wallet signs non-deterministically", () => {
    const b = Uint8Array.from(a);
    b[63] ^= 1;
    expect(decideMaster(a, b)).toEqual({ mode: "random" });
  });
  it("falls back when a signature has the wrong length", () => {
    expect(decideMaster(a.slice(0, 63), a.slice(0, 63))).toEqual({ mode: "random" });
  });
});

describe("signatureFromSignedPayload", () => {
  const msg = new TextEncoder().encode(MASTER_MESSAGE);
  const sig = Uint8Array.from({ length: 64 }, (_, i) => i + 1);
  const concat = (a: Uint8Array, b: Uint8Array) => Uint8Array.from([...a, ...b]);
  it("accepts a bare 64-byte signature", () => expect(signatureFromSignedPayload(sig, msg)).toEqual(sig));
  it("takes the trailing 64 bytes of message ‖ signature", () =>
    expect(signatureFromSignedPayload(concat(msg, sig), msg)).toEqual(sig));
  it("takes the leading 64 bytes of signature ‖ message", () =>
    expect(signatureFromSignedPayload(concat(sig, msg), msg)).toEqual(sig));
  it("rejects anything else", () => {
    expect(signatureFromSignedPayload(sig.slice(1), msg)).toBeNull();
    expect(signatureFromSignedPayload(concat(sig, sig), msg)).toBeNull();
    const other = Uint8Array.from(msg);
    other[0] ^= 1;
    expect(signatureFromSignedPayload(concat(other, sig), msg)).toBeNull();
  });
});
