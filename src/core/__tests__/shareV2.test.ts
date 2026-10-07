import { horizonClass, type ReceiptV2 } from "../score";
import { DEMO_SHARE_PREFIX, formatUtcDay, formatUtcDayTime, receiptNumber, resultShareText, sealedShareText } from "../share";

const SEALED = 1791208957; // Mon 2026-10-05 14:02:37 UTC
const DEADLINE = 1791568800; // Fri 2026-10-09 18:00:00 UTC
const NOW = DEADLINE + 3600;

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
    commit: { signature: `c${i}`, blockTime: commitTime },
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

describe("UTC formatters", () => {
  it("formats weekday and time in UTC", () => {
    expect(formatUtcDayTime(SEALED)).toBe("Mon 14:02 UTC");
    expect(formatUtcDayTime(DEADLINE)).toBe("Fri 18:00 UTC");
    expect(formatUtcDay(DEADLINE)).toBe("Fri");
  });
});

describe("sealedShareText", () => {
  it("matches the spec template and never reveals the direction", () => {
    const r = rcpt({ dir: "up" });
    const text = sealedShareText(r, "mainnet-beta");
    expect(text).toBe(
      [
        "🔒 SEALED CALL",
        "$SOL · reveals Fri 18:00 UTC",
        "Direction: ██████",
        `Sealed on Solana: https://solscan.io/tx/${r.commit.signature}`,
        "Guess my side 👇",
      ].join("\n"),
    );
    expect(text).not.toMatch(/▲|▼|up|down/);
  });

  it("uses the devnet Solscan link on devnet", () => {
    const r = rcpt({ asset: "SKR" });
    expect(sealedShareText(r, "devnet")).toContain(`https://solscan.io/tx/${r.commit.signature}?cluster=devnet`);
    expect(sealedShareText(r, "devnet")).toContain("$SKR · reveals");
  });
});

describe("receiptNumber", () => {
  it("is the 1-based position by (commit blockTime, signature)", () => {
    const a = rcpt({ commit: { signature: "b", blockTime: 100 } });
    const b = rcpt({ commit: { signature: "a", blockTime: 100 } });
    const c = rcpt({ commit: { signature: "z", blockTime: 50 } });
    const all = [a, b, c];
    expect(receiptNumber(c, all)).toBe(1);
    expect(receiptNumber(b, all)).toBe(2);
    expect(receiptNumber(a, all)).toBe(3);
  });
});

describe("resultShareText", () => {
  // Record: 2 hits, 1 revealed miss, 1 forfeit (= miss), 1 void, 1 sealed.
  const hit = rcpt({ dir: "up", p0: 150, pt: 153.45 });
  const hit2 = rcpt({ dir: "down", p0: 160, pt: 150, commit: { signature: "c-early", blockTime: SEALED - 86400 } });
  const miss = rcpt({ dir: "down", p0: 150, pt: 151, asset: "SKR" });
  const forfeited = rcpt({ deadline: NOW - 2 * 86400, commit: { signature: "c-old", blockTime: NOW - 3 * 86400 } });
  const voided = rcpt({ dir: "up", p0: 150, pt: 150 });
  const sealed = rcpt({ deadline: NOW + 86400, commit: { signature: "c-new", blockTime: NOW } });
  const all = [hit, hit2, miss, forfeited, voided, sealed];

  it("matches the spec template for a HIT", () => {
    const num = receiptNumber(hit, all);
    expect(resultShareText(hit, all, NOW, "mainnet-beta")).toBe(
      [
        `🧾 RECEIPT #${num} — ✅ HIT`,
        "Sealed Mon 14:02 UTC @ $150.00",
        "Call: $SOL ▲ by Fri",
        "Actual: $153.45 (+2.3%)",
        "Record: 2/4 · 2 misses, undeletable · ±0.0σ",
        `Verify: https://solscan.io/tx/${hit.commit.signature}`,
      ].join("\n"),
    );
  });

  it("labels MISS and VOID and shows ▼", () => {
    const m = resultShareText(miss, all, NOW, "mainnet-beta")!;
    expect(m.split("\n")[0]).toMatch(/— ❌ MISS$/);
    expect(m).toContain("Call: $SKR ▼ by Fri");
    expect(m).toContain("Actual: $151.00 (+0.7%)");
    const v = resultShareText(voided, all, NOW, "mainnet-beta")!;
    expect(v.split("\n")[0]).toMatch(/— ➖ VOID \(not counted\)$/);
    expect(v).toContain("(±0.0%)");
  });

  it("formats a positive z with sign", () => {
    const text = resultShareText(hit, [hit, hit2], NOW, "mainnet-beta")!;
    expect(text).toContain("Record: 2/2 · 0 misses, undeletable · +1.4σ");
  });

  it("returns null for anything not resolved", () => {
    expect(resultShareText(sealed, all, NOW, "mainnet-beta")).toBeNull();
    expect(resultShareText(forfeited, all, NOW, "mainnet-beta")).toBeNull();
    expect(resultShareText(rcpt({ dir: "up", p0: 150, pt: null }), all, NOW, "mainnet-beta")).toBeNull();
    expect(resultShareText({ ...hit, overlap: true }, all, NOW, "mainnet-beta")).toBeNull();
  });

  it("prefixes demo results", () => {
    const text = resultShareText(hit, all, NOW, "mainnet-beta", { demo: true })!;
    expect(text.split("\n")[0]).toBe(DEMO_SHARE_PREFIX);
    expect(text.split("\n")[1]).toMatch(/^🧾 RECEIPT #\d+ — ✅ HIT$/);
  });

  it("numbers receipts by commit order", () => {
    expect(receiptNumber(hit2, all)).toBe(1);
    expect(resultShareText(hit2, all, NOW, "mainnet-beta")!.split("\n")[0]).toBe("🧾 RECEIPT #1 — ✅ HIT");
  });
});

describe("resultShareText SKR Daily streak", () => {
  const MON = 1791158400; // Mon 2026-10-05 00:00 UTC
  const daily = (d: number) =>
    rcpt({
      asset: "SKR",
      dir: "up",
      commit: { signature: `skr${d}`, blockTime: MON + d * 86400 + 13 * 3600 },
      deadline: MON + (d + 1) * 86400 + 12 * 3600,
      p0: 0.0167,
      pt: 0.0171,
    });
  const dailies = [daily(0), daily(1), daily(2)];
  const now = MON + 3 * 86400 + 13 * 3600; // Thu 13:00, today's not sealed yet

  it("appends the SKR Daily streak to an SKR Daily result", () => {
    const lines = resultShareText(dailies[2], dailies, now, "mainnet-beta")!.split("\n");
    expect(lines[lines.length - 1]).toBe("🔥 SKR Daily streak: 3");
  });

  it("leaves other calls without it", () => {
    const sol = rcpt({ dir: "up", p0: 150, pt: 160 });
    expect(resultShareText(sol, [...dailies, sol], NOW, "mainnet-beta")).not.toContain("SKR Daily streak");
  });
});
