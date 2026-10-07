import { utf8ToBytes } from "@noble/hashes/utils";
import { buildReceiptsV2 } from "../history";
import { computeLeaderboard } from "../leaderboardSource";
import { decodeMemoV2 } from "../memo";
import { refTimeForCommit } from "../price";
import { eligibility, statsV2, statusOfV2, streak, type ReceiptV2, type StatusV2 } from "../score";
import { MASTER_MESSAGE, decideMaster, recoverCall } from "../secret";
import {
  DEMO_OTHERS,
  DEMO_YOU,
  buildDemoSeed,
  demoHasGenesis,
  demoMaster,
  demoPrice,
  demoPriceSource,
  demoShareText,
  demoSignMessage,
  isDemoSignature,
  isDemoWallet,
} from "../demoData";
import { PublicKey } from "@solana/web3.js";

// Anchors at different UTC hours/days so the seed holds whenever demo mode is entered.
const ANCHORS = [1791331200, 1791352959, 1791400000, 1791460800 + 3 * 3600, 1791500000 + 23 * 3600];

const withPrices = (r: ReceiptV2, now: number): ReceiptV2 => {
  const t0 = refTimeForCommit(r.commit.blockTime);
  return {
    ...r,
    p0: t0 <= now ? demoPrice(r.asset, t0) : null,
    pt: r.reveal && r.deadline <= now ? demoPrice(r.asset, r.deadline) : null,
  };
};

describe("demo wallets and signatures", () => {
  it("are valid public keys that visibly start with Demo", () => {
    for (const w of [DEMO_YOU, ...DEMO_OTHERS]) {
      expect(new PublicKey(w).toBase58()).toBe(w);
      expect(isDemoWallet(w)).toBe(true);
    }
    expect(isDemoWallet("7xQ4abc")).toBe(false);
  });
  it("demo wallet signs deterministically → derived master", () => {
    const msg = utf8ToBytes(MASTER_MESSAGE);
    const d = decideMaster(demoSignMessage(DEMO_YOU, msg), demoSignMessage(DEMO_YOU, msg));
    expect(d.mode).toBe("derived");
    if (d.mode === "derived") expect(Buffer.from(d.master)).toEqual(Buffer.from(demoMaster(DEMO_YOU)));
  });
  it("share text is prefixed", () => {
    expect(demoShareText("hi")).toBe("[DEMO — not a real record]\nhi");
    expect(demoShareText("Verify: https://solscan.io/tx/demoabc")).toBe("[DEMO — not a real record]\nVerify: (simulated)");
  });
});

describe("demo prices", () => {
  it("are deterministic, per minute, in plausible ranges", () => {
    expect(demoPrice("SOL", 1791331200)).toBe(demoPrice("SOL", 1791331259));
    for (let t = 1791000000; t < 1791000000 + 30 * 86400; t += 7777) {
      expect(demoPrice("SOL", t)).toBeGreaterThan(100);
      expect(demoPrice("SOL", t)).toBeLessThan(140);
      expect(demoPrice("SKR", t)).toBeGreaterThan(0.014);
      expect(demoPrice("SKR", t)).toBeLessThan(0.02);
    }
  });
  it("source returns null in the future and kind mock", async () => {
    const src = demoPriceSource(() => 1791331200);
    expect(src.kind).toBe("mock");
    expect(await src.at("SOL", 1791331300)).toBeNull();
    expect((await src.at("SOL", 1791331100))?.price).toBe(demoPrice("SOL", 1791331100));
  });
});

describe.each(ANCHORS)("seed at anchor %i", (now) => {
  const txs = buildDemoSeed(now);

  it("is deterministic, tagged, fake-signed and decodable", () => {
    expect(buildDemoSeed(now)).toEqual(txs);
    for (const t of txs) {
      expect(t.tagged).toBe(true);
      expect(isDemoSignature(t.signature)).toBe(true);
      expect(isDemoWallet(t.signer)).toBe(true);
      expect(t.blockTime).toBeLessThanOrEqual(now);
      expect(decodeMemoV2(t.memo)).not.toBeNull();
    }
  });

  it("your record shows every status, is eligible and beats the coin", () => {
    const mine = buildReceiptsV2(txs, DEMO_YOU).map((r) => withPrices(r, now));
    const statuses = new Set<StatusV2>(mine.map((r) => statusOfV2(r, now)));
    for (const s of ["hit", "miss", "void", "forfeited", "overlap", "sealed", "awaiting_reveal"] as StatusV2[])
      expect(statuses).toContain(s);
    const st = statsV2(mine, now, { leaderboard: true });
    expect(st.z).not.toBeNull();
    expect(st.z as number).toBeGreaterThan(1);
    expect(eligibility(mine, now, true).eligible).toBe(true);
    expect(streak(mine, now)).toBeGreaterThanOrEqual(3);
  });

  it("open calls can be recovered from the demo wallet's master key", () => {
    const open = buildReceiptsV2(txs, DEMO_YOU).filter((r) => !r.reveal);
    expect(open.length).toBeGreaterThan(0);
    for (const r of open) expect(recoverCall(demoMaster(DEMO_YOU), r, r.commit.blockTime)).not.toBeNull();
  });

  it("leaderboard lists you among several eligible demo players, plus SKR Daily", async () => {
    const { leaderboard } = await computeLeaderboard({
      txs,
      nowSec: now,
      price: async (asset, ts) => (ts > now ? null : demoPrice(asset, ts)),
      hasGenesis: async (w) => demoHasGenesis(w),
    });
    expect(leaderboard.overall.length).toBeGreaterThanOrEqual(5);
    expect(leaderboard.overall.some((r) => r.wallet === DEMO_YOU)).toBe(true);
    expect(leaderboard.overall.length).toBeLessThan(1 + DEMO_OTHERS.length); // some are ineligible
    expect(leaderboard.skrDaily.length).toBeGreaterThanOrEqual(3);
  });
});
