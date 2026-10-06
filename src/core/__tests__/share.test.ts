import type { Call } from "../call";
import type { Receipt } from "../score";
import { formatHitRate, shareText, SHARE_LAST_N } from "../share";

const NOW = 1_800_000_000;
const sig = (n: number) => `sig${n}`;

function call(deadline: number, over: Partial<Call> = {}): Call {
  return { v: 1, asset: "SOL", dir: "above", target: 250, deadline, created: deadline - 7200, ...over };
}

/** Receipt committed at `t`; revealed with `price` when given (null = unresolved). */
function receipt(n: number, t: number, deadline: number, reveal?: { call: Call; price: number | null }): Receipt {
  const r: Receipt = { hash: `h${n}`, deadline, commit: { signature: sig(n), blockTime: t } };
  if (reveal) {
    r.reveal = { signature: `rev${n}`, blockTime: deadline + 60, call: reveal.call, json: "{}", salt: "00" };
    r.priceAtDeadline = reveal.price;
  }
  return r;
}

describe("formatHitRate", () => {
  it("rounds to whole percent", () => {
    expect(formatHitRate(2 / 3)).toBe("67%");
    expect(formatHitRate(1)).toBe("100%");
    expect(formatHitRate(0)).toBe("0%");
  });
  it("shows a dash when nothing is scored", () => {
    expect(formatHitRate(null)).toBe("—");
  });
});

describe("shareText", () => {
  const past = NOW - 100_000; // deadline more than 24 h ago
  const hit = receipt(1, past - 7200, past, { call: call(past), price: 300 });
  const miss = receipt(2, past - 7000, past, { call: call(past, { dir: "below", asset: "BTC", target: 50000 }), price: 60000 });
  const forfeited = receipt(3, past - 6800, past);
  const sealed = receipt(4, NOW - 100, NOW + 3600);

  it("has hit-rate with counts, forfeits counted as misses", () => {
    const text = shareText([hit, miss, forfeited, sealed], NOW, "mainnet-beta");
    expect(text.split("\n")[0]).toBe("My Receipts hit-rate: 33% (1 hit / 3 scored, 1 forfeited, 1 pending)");
  });

  it("lists receipts newest commit first with Solscan links", () => {
    const text = shareText([hit, miss, forfeited, sealed], NOW, "mainnet-beta");
    const lines = text.split("\n");
    const i = lines.indexOf("Last 4:");
    expect(i).toBeGreaterThan(0);
    expect(lines.slice(i + 1, i + 5)).toEqual([
      "• SEALED hidden call — https://solscan.io/tx/sig4",
      "• FORFEITED hidden call — https://solscan.io/tx/sig3",
      "• MISS BTC below $50000.00 (Pyth $60000.00) — https://solscan.io/tx/sig2 · reveal https://solscan.io/tx/rev2",
      "• HIT SOL above $250.00 (Pyth $300.00) — https://solscan.io/tx/sig1 · reveal https://solscan.io/tx/rev1",
    ]);
  });

  it("never discloses an unrevealed call (only revealed calls are shown)", () => {
    const text = shareText([sealed], NOW, "mainnet-beta");
    expect(text).not.toContain("SOL");
    expect(text).toContain("hidden call");
  });

  it("caps the list at the last 5 receipts", () => {
    const many = Array.from({ length: 8 }, (_, n) => receipt(n, past - 9000 + n, past));
    const text = shareText(many, NOW, "mainnet-beta");
    expect(SHARE_LAST_N).toBe(5);
    expect(text).toContain("Last 5:");
    expect(text.match(/^• /gm)).toHaveLength(5);
    expect(text).toContain("tx/sig7");
    expect(text).not.toContain("tx/sig2 ");
    expect(text).not.toMatch(/tx\/sig2$/m);
  });

  it("marks unresolved and awaiting reveal", () => {
    const awaiting = receipt(5, NOW - 8000, NOW - 600);
    const unresolved = receipt(6, NOW - 9000, NOW - 600, { call: call(NOW - 600), price: null });
    const text = shareText([awaiting, unresolved], NOW, "mainnet-beta");
    expect(text).toContain("• AWAITING REVEAL hidden call — https://solscan.io/tx/sig5");
    expect(text).toContain("• UNRESOLVED SOL above $250.00 — https://solscan.io/tx/sig6 · reveal https://solscan.io/tx/rev6");
  });

  it("adds devnet cluster param to links", () => {
    const text = shareText([forfeited], NOW, "devnet");
    expect(text).toContain("https://solscan.io/tx/sig3?cluster=devnet");
  });

  it("handles no receipts and nothing scored", () => {
    const text = shareText([], NOW, "mainnet-beta");
    expect(text.split("\n")[0]).toBe("My Receipts hit-rate: — (0 hits / 0 scored, 0 forfeited, 0 pending)");
    expect(text).not.toContain("Last");
  });

  it("ends with a how-to-verify line", () => {
    const text = shareText([hit], NOW, "mainnet-beta");
    expect(text.split("\n").pop()).toBe(
      "Sealed as sha256 commit memos on Solana, revealed later, scored against Pyth. Unrevealed = miss.",
    );
  });
});
