import { buildLeaderboard, walletProfile } from "../leaderboard";
import { horizonClass, type ReceiptV2 } from "../score";
import { escapeHtml, renderLeaderboardHtml, renderProfileHtml } from "../site";

const DAY = 86400;
const T = 1800000000;
const NOW = T + 30 * DAY;

const hit = (k: number): ReceiptV2 => ({
  v: 2,
  hash: `${k}`.padStart(64, "a"),
  asset: "SOL",
  deadline: T + k * DAY + DAY,
  horizon: horizonClass(T, T + DAY),
  commit: { signature: `commit${k}`, blockTime: T + k * DAY },
  overlap: false,
  reveal: {
    signature: `reveal${k}`,
    blockTime: T + k * DAY + DAY + 60,
    call: { v: 2, asset: "SOL", dir: "up", deadline: T + k * DAY + DAY, created: T + k * DAY - 3 },
    json: "{}",
    salt: "00".repeat(16),
  },
  p0: 100,
  pt: 101,
});

describe("site", () => {
  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });

  it("renders the leaderboard with profile links and the empty state", () => {
    const rs = Array.from({ length: 10 }, (_, k) => hit(k));
    const html = renderLeaderboardHtml(buildLeaderboard([{ wallet: "Wal1et<x>", receipts: rs, hasGenesis: true }], NOW));
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('href="u/Wal1et&lt;x&gt;.html"');
    expect(html).toContain("+3.2σ");
    expect(html).toContain("10/10");
    expect(html).not.toContain("<x>");
    const empty = renderLeaderboardHtml(buildLeaderboard([], NOW));
    expect(empty).toContain("No eligible wallets yet");
  });

  it("renders a profile with receipts linking to solscan and hiding unrevealed directions", () => {
    const sealed: ReceiptV2 = { ...hit(40), reveal: undefined, deadline: NOW + DAY, commit: { signature: "sealedSig", blockTime: NOW - 60 }, p0: null, pt: null };
    const html = renderProfileHtml(walletProfile("W1", [hit(0), sealed], false, NOW));
    expect(html).toContain("W1");
    expect(html).toContain("https://solscan.io/tx/commit0");
    expect(html).toContain("https://solscan.io/tx/reveal0");
    expect(html).toContain("HIT");
    expect(html).toContain("SEALED");
    expect(html).toContain("██████");
    expect(html).toContain('href="../index.html"');
  });
});
