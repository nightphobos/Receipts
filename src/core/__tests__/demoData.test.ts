import { utf8ToBytes } from "@noble/hashes/utils";
import { buildReceiptsV2 } from "../history";
import { computeLeaderboard } from "../leaderboardSource";
import { skrDailyStreak } from "../leaderboard";
import { SKR_MINT, isSkrHolder, parseTipMemo } from "../tip";
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
  demoSkrBalance,
  demoTipTx,
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

describe("demo SKR", () => {
  it("balances: you and a Genesis-less wallet hold enough SKR, another does not, real wallets 0", () => {
    expect(isSkrHolder(demoSkrBalance(DEMO_YOU))).toBe(true);
    const noGenesis = DEMO_OTHERS.filter((w) => !demoHasGenesis(w));
    expect(noGenesis.map((w) => isSkrHolder(demoSkrBalance(w))).sort()).toEqual([false, true]);
    expect(demoSkrBalance("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")).toBe(0);
  });
  it("demoTipTx is a tagged tip memo tx with the transfer attached", () => {
    const t = demoTipTx(DEMO_YOU, DEMO_OTHERS[0], 50, 1791331200);
    expect(t).toMatchObject({ signer: DEMO_YOU, tagged: true, failed: false, blockTime: 1791331200 });
    expect(parseTipMemo(t.memo)).toBe(DEMO_OTHERS[0]);
    expect(t.tip).toEqual({ mint: SKR_MINT, from: DEMO_YOU, to: DEMO_OTHERS[0], amount: 50 });
    expect(isDemoSignature(t.signature)).toBe(true);
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
      expect(decodeMemoV2(t.memo) ?? parseTipMemo(t.memo)).not.toBeNull();
    }
  });

  it("holds SKR tips between demo wallets, some to you", () => {
    const tips = txs.filter((t) => parseTipMemo(t.memo));
    expect(tips.length).toBeGreaterThanOrEqual(5);
    for (const t of tips) {
      expect(t.tip?.mint).toBe(SKR_MINT);
      expect(t.tip?.from).toBe(t.signer);
      expect(t.tip?.to).toBe(parseTipMemo(t.memo));
      expect(t.tip?.to).not.toBe(t.signer);
    }
    expect(tips.some((t) => t.tip?.to === DEMO_YOU)).toBe(true);
  });

  it("your SKR Daily streak is at least 3", () => {
    const mine = buildReceiptsV2(txs, DEMO_YOU);
    expect(skrDailyStreak(mine, now)).toBeGreaterThanOrEqual(3);
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
      skrBalance: async (w) => demoSkrBalance(w),
    });
    expect(leaderboard.overall.length).toBeGreaterThanOrEqual(5);
    expect(leaderboard.overall.some((r) => r.wallet === DEMO_YOU)).toBe(true);
    expect(leaderboard.overall.length).toBeLessThan(1 + DEMO_OTHERS.length); // some are ineligible
    expect(leaderboard.skrDaily.length).toBeGreaterThanOrEqual(3);
    expect(leaderboard.skrDaily.find((r) => r.wallet === DEMO_YOU)?.streak).toBeGreaterThanOrEqual(3);
    expect(leaderboard.appreciated.length).toBeGreaterThanOrEqual(3);
    expect(leaderboard.appreciated.some((r) => r.wallet === DEMO_YOU)).toBe(true);
    expect(leaderboard.overall.find((r) => r.wallet === DEMO_YOU)?.tipsSkr).toBeGreaterThan(0);
  });
});
