import { horizonClass, type ReceiptV2 } from "../score";
import {
  SHARE_CARD_DEMO_LINE,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  shareCardLayout,
  shareCardModel,
  shortTx,
} from "../shareCard";

const SEALED = 1791208957; // Mon 2026-10-05 14:02:37 UTC
const DEADLINE = 1791568800; // Fri 2026-10-09 18:00:00 UTC
const NOW = DEADLINE + 3600;
const SIG = "5VERYlongSignatureABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz1234wxyz";

let n = 0;
function rcpt(over: Partial<ReceiptV2> & { dir?: "up" | "down" } = {}): ReceiptV2 {
  const { dir, ...rest } = over;
  const commitTime = rest.commit?.blockTime ?? SEALED;
  const deadline = rest.deadline ?? DEADLINE;
  const i = ++n;
  const r: ReceiptV2 = {
    v: 2,
    hash: `h${i}`,
    asset: "SOL",
    deadline,
    horizon: horizonClass(commitTime, deadline),
    commit: { signature: `${SIG}${i}`, blockTime: commitTime },
    overlap: false,
    ...rest,
  };
  if (dir) {
    r.reveal = {
      signature: `r${i}`,
      blockTime: deadline + 60,
      call: { v: 2, asset: r.asset, dir, deadline, created: commitTime - 30 },
      json: "{}",
      salt: "00",
    };
  }
  return r;
}

describe("shortTx", () => {
  it("keeps 4 chars on each side", () => {
    expect(shortTx("5VERYlongSigwxyz")).toBe("5VER…wxyz");
  });
  it("leaves short strings alone", () => {
    expect(shortTx("abcdefghi")).toBe("abcdefghi");
  });
});

describe("shareCardModel", () => {
  it("result card: number, direction, prices, move, stamp, record, short tx", () => {
    const first = rcpt({ dir: "down", p0: 100, pt: 101, commit: { signature: "c-early", blockTime: SEALED - 86400 } });
    const hit = rcpt({ dir: "up", p0: 118.83, pt: 121.56 });
    const m = shareCardModel(hit, [first, hit], NOW)!;
    expect(m).toEqual({
      kind: "result",
      number: 2,
      asset: "SOL",
      dir: "▲",
      when: "by Fri 18:00 UTC",
      p0: "$118.83",
      pt: "$121.56",
      move: "+2.3%",
      outcome: "hit",
      record: "Record 1/2 · 1 misses, undeletable · ±0.0σ",
      tx: shortTx(hit.commit.signature),
      verify: "verify on Solana",
      demo: false,
    });
  });

  it("void and miss outcomes", () => {
    const v = rcpt({ dir: "up", p0: 5, pt: 5 });
    expect(shareCardModel(v, [v], NOW)!.outcome).toBe("void");
    const miss = rcpt({ dir: "up", p0: 5, pt: 4 });
    expect(shareCardModel(miss, [miss], NOW)!).toMatchObject({ outcome: "miss", move: "−20.0%" });
  });

  it("sealed card never carries the direction", () => {
    const sealed = rcpt({ dir: "down", p0: 118.83 });
    delete sealed.reveal; // still sealed on chain
    const m = shareCardModel(sealed, [sealed], SEALED + 60)!;
    expect(m).toMatchObject({ kind: "sealed", dir: null, outcome: null, pt: null, move: null, p0: "$118.83" });
    expect(m.when).toBe("reveals Fri 18:00 UTC");
    expect(JSON.stringify(m)).not.toMatch(/down|▼|▲/);
  });

  it("nothing for forfeited, overlap, unresolved or awaiting reveal", () => {
    const forfeited = rcpt();
    expect(shareCardModel(forfeited, [forfeited], DEADLINE + 2 * 86400)).toBeNull();
    const awaiting = rcpt();
    expect(shareCardModel(awaiting, [awaiting], DEADLINE + 60)).toBeNull();
    const overlap = rcpt({ dir: "up", p0: 1, pt: 2, overlap: true });
    expect(shareCardModel(overlap, [overlap], NOW)).toBeNull();
    const unresolved = rcpt({ dir: "up", p0: 1, pt: null });
    expect(shareCardModel(unresolved, [unresolved], NOW)).toBeNull();
  });

  it("demo: flagged, and demo signatures are marked simulated", () => {
    const r = rcpt({ dir: "up", p0: 1, pt: 2, commit: { signature: "demo-abc123456789", blockTime: SEALED } });
    const m = shareCardModel(r, [r], NOW, { demo: true })!;
    expect(m.demo).toBe(true);
    expect(m.verify).toBe("simulated — not on Solana");
    expect(SHARE_CARD_DEMO_LINE).toBe("[DEMO — not a real record]");
  });
});

describe("shareCardLayout", () => {
  it("output is 1080×1350 (4:5)", () => {
    expect(SHARE_CARD_WIDTH).toBe(1080);
    expect(SHARE_CARD_HEIGHT).toBe(1350);
  });

  it.each([360, 540, 1080])("view %i wide keeps 4:5 and scales everything", (w) => {
    const l = shareCardLayout(w);
    expect(l.width).toBe(w);
    expect(l.height).toBe((w * 5) / 4);
    const unit = w / 360;
    expect(l.padding).toBeCloseTo(24 * unit);
    expect(l.paperWidth).toBeCloseTo(w - 2 * l.padding);
    expect(Number.isInteger(l.mascotScale)).toBe(true);
    expect(l.mascotScale).toBeGreaterThanOrEqual(1);
  });

  it("VT323 numbers never drop under 20 (in view units)", () => {
    const l = shareCardLayout(360);
    expect(Math.min(l.font.price, l.font.number, l.font.move)).toBeGreaterThanOrEqual(20);
  });
});
