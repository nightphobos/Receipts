import { canonicalJsonV2, type CallV2 } from "../call";
import { commitHash } from "../commit";
import type { MemoTx } from "../history";
import { LEADERBOARD_VERSION, buildLeaderboard, walletProfile } from "../leaderboard";
import {
  computeLeaderboard,
  leaderboardBaseUrl,
  leaderboardUrl,
  parseLeaderboard,
  parseWalletProfile,
  profileUrl,
} from "../leaderboardSource";
import { encodeCommitMemoV2, encodeRevealMemoV2 } from "../memo";
import { SKR_MINT, tipMemo } from "../tip";

const DAY = 86400;
const T = 1800000000; // Fri 2027-01-15 08:00 UTC
const NOW = T + 40 * DAY;
const salt = "ab".repeat(16);

/** Tagged commit + reveal of `call`, committed at `commitTime` by `wallet`. */
function pair(wallet: string, sig: string, call: CallV2, commitTime: number): MemoTx[] {
  const json = canonicalJsonV2(call);
  const hash = commitHash(json, salt);
  return [
    { signature: `${sig}c`, blockTime: commitTime, signer: wallet, memo: encodeCommitMemoV2(hash, call.deadline, call.asset), failed: false, tagged: true },
    { signature: `${sig}r`, blockTime: call.deadline + 10, signer: wallet, memo: encodeRevealMemoV2(json, salt), failed: false, tagged: true },
  ];
}

/** `count` revealed 24h SOL "up" calls on distinct UTC days. */
function wallet24h(wallet: string, count: number): MemoTx[] {
  return Array.from({ length: count }, (_, k) => {
    const t = T + k * DAY;
    return pair(wallet, `${wallet}${k}`, { v: 2, asset: "SOL", dir: "up", deadline: t + DAY, created: t - 3 }, t);
  }).flat();
}

describe("leaderboardBaseUrl", () => {
  it("is null when unset, blank or not http(s)", () => {
    expect(leaderboardBaseUrl({})).toBeNull();
    expect(leaderboardBaseUrl({ EXPO_PUBLIC_LEADERBOARD_URL: "  " })).toBeNull();
    expect(leaderboardBaseUrl({ EXPO_PUBLIC_LEADERBOARD_URL: "ftp://x.y" })).toBeNull();
  });

  it("trims, drops a trailing slash and a trailing leaderboard.json", () => {
    expect(leaderboardBaseUrl({ EXPO_PUBLIC_LEADERBOARD_URL: " https://a.github.io/receipts/ " })).toBe(
      "https://a.github.io/receipts",
    );
    expect(leaderboardBaseUrl({ EXPO_PUBLIC_LEADERBOARD_URL: "https://a.github.io/receipts/leaderboard.json" })).toBe(
      "https://a.github.io/receipts",
    );
  });

  it("builds the static file URLs", () => {
    expect(leaderboardUrl("https://a.io/r")).toBe("https://a.io/r/leaderboard.json");
    expect(profileUrl("https://a.io/r", "Wa11et")).toBe("https://a.io/r/u/Wa11et.json");
  });
});

describe("parse", () => {
  it("accepts what buildLeaderboard / walletProfile produce (after a JSON round trip)", () => {
    const lb = buildLeaderboard([], NOW);
    expect(parseLeaderboard(JSON.parse(JSON.stringify(lb)))).toEqual(lb);
    const p = walletProfile("Wa11et", [], false, NOW);
    expect(parseWalletProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it("rejects other versions and malformed shapes", () => {
    const lb = buildLeaderboard([], NOW);
    expect(parseLeaderboard({ ...lb, version: LEADERBOARD_VERSION + 1 })).toBeNull();
    expect(parseLeaderboard({ ...lb, overall: "x" })).toBeNull();
    expect(parseLeaderboard({ ...lb, skrDaily: [{ wallet: 1 }] })).toBeNull();
    expect(parseLeaderboard({ ...lb, appreciated: undefined })).toBeNull();
    expect(parseLeaderboard({ ...lb, appreciated: [{ wallet: "W", tipsSkr: "1", tippers: 1 }] })).toBeNull();
    expect(parseLeaderboard(null)).toBeNull();
    expect(parseLeaderboard("[]")).toBeNull();
    const p = walletProfile("Wa11et", [], false, NOW);
    expect(parseWalletProfile({ ...p, wallet: 5 })).toBeNull();
    expect(parseWalletProfile({ ...p, receipts: {} })).toBeNull();
    expect(parseWalletProfile({ ...p, version: 0 })).toBeNull();
    expect(parseWalletProfile({ ...p, skrHolder: "yes" })).toBeNull();
    expect(parseWalletProfile({ ...p, tips: null })).toBeNull();
  });
});

describe("computeLeaderboard", () => {
  it("matches the indexer aggregation: prices + Genesis → overall and SKR Daily, plus profiles", async () => {
    const skrT = T + 4 * 3600; // 12:00 UTC; the next 12:00 UTC ≥ 12 h away is 24 h later → SKR Daily
    const skrDaily = pair("Bob", "bskr", { v: 2, asset: "SKR", dir: "down", deadline: skrT + DAY, created: skrT - 3 }, skrT);
    const txs = [...wallet24h("Alice", 10), ...wallet24h("Bob", 2), ...skrDaily, ...wallet24h("Carol", 10)];
    const price = jest.fn(async (asset: string, ts: number) => (asset === "SOL" ? ts : 1 / ts)); // SOL rises, SKR falls
    const hasGenesis = jest.fn(async (w: string) => w !== "Carol");

    const { leaderboard, profiles } = await computeLeaderboard({ txs, nowSec: NOW, price, hasGenesis });

    expect(leaderboard.overall.map((r) => r.wallet)).toEqual(["Alice"]); // Carol: no Genesis; Bob: N < 10
    expect(leaderboard.overall[0]).toMatchObject({ rank: 1, n: 10, hits: 10, misses: 0 });
    expect(leaderboard.skrDaily.map((r) => r.wallet)).toEqual(["Bob"]);
    expect(leaderboard.skrDaily[0]).toMatchObject({ n: 1, hits: 1 });
    expect(leaderboard.wallets).toBe(3);
    expect(profiles.get("Bob")?.hasGenesis).toBe(true);
    expect(profiles.get("Bob")?.receipts).toHaveLength(3);
    expect(profiles.get("Carol")?.eligibility.eligible).toBe(false);
  });

  it("checks Genesis only for wallets that could be listed", async () => {
    const txs = [...wallet24h("Alice", 10), ...wallet24h("Bob", 2)];
    const hasGenesis = jest.fn(async (_w: string) => true);
    const { profiles } = await computeLeaderboard({ txs, nowSec: NOW, price: async (_a, ts) => ts, hasGenesis });
    expect(hasGenesis.mock.calls.map((c) => c[0])).toEqual(["Alice"]);
    expect(profiles.get("Bob")?.hasGenesis).toBe(false);
  });

  it("treats failing price and Genesis lookups as missing (unresolved / no Genesis), deduping price calls", async () => {
    const txs = wallet24h("Alice", 10);
    const price = jest.fn(async () => {
      throw new Error("down");
    });
    const { leaderboard, profiles } = await computeLeaderboard({
      txs,
      nowSec: NOW,
      price,
      hasGenesis: async () => {
        throw new Error("rpc");
      },
    });
    expect(leaderboard.overall).toEqual([]);
    expect(profiles.get("Alice")?.stats.pending).toBe(10);
    // P0 at t0 and PT at deadline: day k's deadline is day k+1's commit + 0, distinct from t0 (= commit + 60).
    expect(price).toHaveBeenCalledTimes(20);
  });
});

describe("computeLeaderboard — SKR integration v2", () => {
  it("SKR balance gate replaces Genesis when held; tips from registry txs feed rows and `appreciated`", async () => {
    const tipTx: MemoTx = {
      signature: "tip1",
      blockTime: T,
      signer: "Bob",
      memo: tipMemo("AaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaA"),
      failed: false,
      tagged: true,
      tip: { mint: SKR_MINT, from: "Bob", to: "AaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaA", amount: 50 },
    };
    const A = "AaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaA";
    const txs = [...wallet24h(A, 10), ...wallet24h("Carol", 10), tipTx];
    const skrBalance = jest.fn(async (w: string) => (w === A ? 150 : 0));
    const { leaderboard, profiles } = await computeLeaderboard({
      txs,
      nowSec: NOW,
      price: async (_a, ts) => ts,
      hasGenesis: async () => false,
      skrBalance,
    });
    expect(leaderboard.overall.map((r) => [r.wallet, r.tipsSkr])).toEqual([[A, 50]]);
    expect(leaderboard.appreciated).toEqual([{ wallet: A, tipsSkr: 50, tippers: 1 }]);
    expect(profiles.get(A)).toMatchObject({ skrHolder: true, tips: { tipsSkr: 50, tippers: 1, tipsCount: 1 } });
    expect(profiles.get("Carol")?.skrHolder).toBe(false);
    expect(skrBalance.mock.calls.map((c) => c[0]).sort()).toEqual([A, "Carol"]);
    expect(profiles.has("Bob")).toBe(false); // a tipper with no receipts has no profile
  });

  it("failing SKR balance lookups count as no holder", async () => {
    const { leaderboard } = await computeLeaderboard({
      txs: wallet24h("Alice", 10),
      nowSec: NOW,
      price: async (_a, ts) => ts,
      hasGenesis: async () => false,
      skrBalance: async () => {
        throw new Error("rpc");
      },
    });
    expect(leaderboard.overall).toEqual([]);
  });
});
