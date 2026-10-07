/**
 * Demo mode data: a deterministic simulated chain (tagged v2 memo txs of clearly fake `Demo…`
 * wallets) and a deterministic per-minute price series. Everything here is fake by design and is
 * never sent anywhere; the app badges it as DEMO on every screen. Pure TS: no RN/Expo imports.
 */
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { canonicalJsonV2, type Asset, type CallV2, type DirectionV2 } from "./call";
import { commitHash } from "./commit";
import { skrDailyDeadline } from "./draftV2";
import type { MemoTx } from "./history";
import { encodeCommitMemoV2, encodeRevealMemoV2 } from "./memo";
import { refTimeForCommit, type PriceSource } from "./price";
import type { PythPrice } from "./pyth";
import { MASTER_MESSAGE, masterFromSignature, saltFor } from "./secret";
import { SKR_MINT, tipMemo } from "./tip";

/** Valid base58 public keys that visibly start with "Demo" (found by search; nobody holds their keys). */
export const DEMO_YOU = "DemoYouaXvhkgX93EHzifMF7urqTHq3mxo7Le4GWmGW1";
export const DEMO_OTHERS = [
  "DemoAkiraaZehrpEqRv9rH2V29wEKcjaocc6G5uyEpDR",
  "DemoKai529MYzRPMdR2kSqAgXmdVRE1LYHzpb6xab86q",
  "DemoMikafTnesL8T4uLiW46YSx2xwcdXTWED6LzdEhHi",
  "DemoRentF4YmeFmwA2FBTEmG4CL3p1s5hCnKNYRhifQK",
  "DemoSoracnvP45tZaupqs3PQ3Ugcqgf2pZJAA2Bh5Ag8",
  "DemoYukiB19qkMPgPdpfQ133MXBkgP6HRiAerSs8h6yX",
  "DemoHarukJahx44XJMCdBGaRETT7ejp3rsjfP6udyFfS",
  "DemoNaowpc4ey39d6vGfXgZCBdackjux9wBz8rPF2JYw",
  "DemoRikaKMJRJ4QGjmuCJHFrBFyFPsdNbxFg8ma1p7Bp",
  "DemoTomas6yLebLMT8vo3aKCkLdkrduyVtA3KKP5mUrs",
  "DemoEmint1LxnHtUTR1eiQgms7RasJ5vxqg6NKvvxgLF",
  "DemoJunL7bjzP3uoKzraRWBAxHSHwwhcSXrMCT5TS9BM",
] as const;
/** Demo wallets without a Seeker Genesis Token (listed nowhere on the leaderboard). */
const NO_GENESIS = new Set<string>([DEMO_OTHERS[7], DEMO_OTHERS[11]]);

export const DEMO_SIG_PREFIX = "demo";
export const DEMO_RPC_ENDPOINT = "demo://simulated-chain";
export const DEMO_SHARE_PREFIX = "[DEMO — not a real record]";
/** Fake blockhash for the simulated chain (System Program id: valid 32-byte base58). */
export const DEMO_BLOCKHASH = "11111111111111111111111111111111";

export const isDemoWallet = (w: string): boolean => w.startsWith("Demo");
export const isDemoSignature = (s: string): boolean => s.startsWith(DEMO_SIG_PREFIX);
export const demoHasGenesis = (w: string): boolean => isDemoWallet(w) && !NO_GENESIS.has(w);

/** Simulated whole-SKR balances: you hold plenty; one Genesis-less wallet passes the SKR gate, the other doesn't. */
const SKR_BALANCES: Record<string, number> = {
  [DEMO_YOU]: 1250,
  [DEMO_OTHERS[0]]: 4800,
  [DEMO_OTHERS[2]]: 310,
  [DEMO_OTHERS[5]]: 75,
  [DEMO_OTHERS[7]]: 420,
  [DEMO_OTHERS[11]]: 40,
};
export const demoSkrBalance = (w: string): number => (isDemoWallet(w) ? (SKR_BALANCES[w] ?? 0) : 0);
/** Demo share text: prefixed, and links replaced (demo signatures do not exist on Solana). */
export const demoShareText = (text: string): string =>
  `${DEMO_SHARE_PREFIX}\n${text.replace(/https?:\/\/\S+/g, "(simulated)")}`;

/** Deterministic fake tx signature (never a real one: starts with "demo"). */
export function demoSignature(wallet: string, blockTime: number, memo: string): string {
  return DEMO_SIG_PREFIX + bytesToHex(sha256(utf8ToBytes(`${wallet}|${blockTime}|${memo}`))).slice(0, 60);
}

/** The demo "wallet" signs messages deterministically (64 bytes), so the derived master key works. */
export function demoSignMessage(wallet: string, message: Uint8Array): Uint8Array {
  const prefix = utf8ToBytes(`receipts-demo-wallet|${wallet}|`);
  const buf = new Uint8Array(prefix.length + message.length);
  buf.set(prefix);
  buf.set(message, prefix.length);
  return sha512(buf);
}

/** Master key of a demo wallet, exactly as useMasterKey derives it from the signature. */
export const demoMaster = (wallet: string): Uint8Array =>
  masterFromSignature(demoSignMessage(wallet, utf8ToBytes(MASTER_MESSAGE)));

// ---------------------------------------------------------------- prices

const BASE: Record<Asset, number> = { SOL: 118.5, SKR: 0.0167 };
const ASSET_SALT: Record<Asset, number> = { SOL: 0x9e3779b1, SKR: 0x85ebca6b };

/** Integer hash → [-1, 1). */
function hashNoise(asset: Asset, m: number): number {
  let x = (m ^ ASSET_SALT[asset]) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 2 ** 31 - 1;
}

/** Demo price of the minute containing `ts`: smooth swings + per-minute noise; SOL in cents, SKR in 0.0001. */
export function demoPrice(asset: Asset, ts: number): number {
  const m = Math.floor(ts / 60);
  const phase = asset === "SOL" ? 0 : 2.1;
  const x = 0.035 * Math.sin(m / 431 + phase) + 0.015 * Math.sin(m / 97 + 1.3 + phase) + 0.004 * hashNoise(asset, m);
  const raw = BASE[asset] * (1 + x);
  return asset === "SOL" ? Math.round(raw * 100) / 100 : Math.round(raw * 1e4) / 1e4;
}

const quote = (asset: Asset, ts: number): PythPrice => ({ asset, price: demoPrice(asset, ts), conf: 0, publishTime: ts });

/** Demo prices for every asset; kind "mock" so all existing DEMO price badges show. */
export function demoPriceSource(nowFn: () => number): PriceSource {
  return {
    kind: "mock",
    kindOf: () => "mock",
    latest: async (asset) => quote(asset, Math.floor(nowFn())),
    at: async (asset, ts) => {
      if (!Number.isSafeInteger(ts) || ts <= 0) throw new Error("Timestamp must be a positive whole unix time");
      return ts > nowFn() ? null : quote(asset, ts);
    },
  };
}

// ---------------------------------------------------------------- simulated chain

/** One memo tx on the simulated chain, tagged like a real v2 tx. */
export function demoTx(wallet: string, blockTime: number, memo: string): MemoTx {
  return { signature: demoSignature(wallet, blockTime, memo), blockTime, signer: wallet, memo, failed: false, tagged: true };
}

/** A tagged SKR tip on the simulated chain: memo `rcpt:2:t:<to>` plus the parsed transfer. */
export function demoTipTx(from: string, to: string, amount: number, blockTime: number): MemoTx {
  return { ...demoTx(from, blockTime, tipMemo(to)), tip: { mint: SKR_MINT, from, to, amount } };
}

/** Seeded tips: [from, to, whole SKR, days ago, hour UTC]. Indexes into DEMO_OTHERS; -1 = you. */
const SEED_TIPS: [number, number, number, number, number][] = [
  [0, -1, 50, 6, 10], [1, -1, 10, 4, 18], [2, -1, 100, 2, 9], [5, -1, 10, 1, 21],
  [-1, 0, 50, 5, 12], [3, 0, 100, 7, 8], [5, 0, 50, 3, 16], [8, 0, 10, 2, 11],
  [6, 1, 50, 6, 20], [9, 1, 10, 1, 7], [4, 2, 10, 8, 14], [0, 3, 100, 4, 22],
];

function seedTips(now: number): MemoTx[] {
  const w = (i: number) => (i < 0 ? DEMO_YOU : DEMO_OTHERS[i]);
  return SEED_TIPS.map(([from, to, amount, d, h]) => demoTipTx(w(from), w(to), amount, Math.floor((now - d * D) / D) * D + h * H));
}

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Want = "hit" | "miss" | "void" | "any";

interface Plan {
  wallet: string;
  asset: Asset;
  commitTime: number;
  /** Absolute deadline, or a duration from the commit. */
  deadline: { at: number } | { after: number };
  want: Want;
  /** Seconds after the deadline; null = never revealed. */
  revealAfter: number | null;
}

const H = 3600;
const D = 86400;

/** Commit + optional reveal txs for one planned call; shifts the commit by minutes to get the wanted outcome. */
function realize(plan: Plan, rnd: () => number, master: Uint8Array | null): MemoTx[] {
  let commitTime = plan.commitTime;
  let dir: DirectionV2 = rnd() < 0.5 ? "up" : "down";
  let deadline = 0;
  for (let tries = 0; tries < 720; tries++, commitTime += 60) {
    deadline = "at" in plan.deadline ? plan.deadline.at : commitTime + plan.deadline.after;
    const p0 = demoPrice(plan.asset, refTimeForCommit(commitTime));
    const pt = demoPrice(plan.asset, deadline);
    if (plan.want === "any") break;
    if (plan.want === "void") {
      if (pt === p0) break;
      continue;
    }
    if (pt === p0) continue;
    const upWins = pt > p0;
    dir = (plan.want === "hit") === upWins ? "up" : "down";
    break;
  }
  const call: CallV2 = { v: 2, asset: plan.asset, dir, deadline, created: commitTime - 5 - Math.floor(rnd() * 90) };
  const json = canonicalJsonV2(call);
  const salt = master ? saltFor(master, plan.asset, deadline) : bytesToHex(sha256(utf8ToBytes(`${plan.wallet}|${json}`))).slice(0, 32);
  const hash = commitHash(json, salt);
  const txs = [demoTx(plan.wallet, commitTime, encodeCommitMemoV2(hash, deadline, plan.asset))];
  if (plan.revealAfter !== null) txs.push(demoTx(plan.wallet, deadline + plan.revealAfter, encodeRevealMemoV2(json, salt)));
  return txs;
}

/** A (commit, deadline) pair with P0 == PT, 24–36 h apart, inside [from, to]. */
function findVoid(asset: Asset, from: number, to: number): { commit: number; deadline: number } | null {
  for (let deadline = from + 36 * H; deadline <= to; deadline += 15 * 60) {
    const pt = demoPrice(asset, deadline);
    for (let commit = deadline - 36 * H + 60; commit <= deadline - 24 * H - 60; commit += 60) {
      if (commit < from) continue;
      if (demoPrice(asset, refTimeForCommit(commit)) === pt) return { commit, deadline };
    }
  }
  return null;
}

/** Calls of the demo player: a solid record with every status represented, plus open calls to play with. */
function yourPlans(now: number): Plan[] {
  const day = (d: number, hour: number) => Math.floor((now - d * D) / D) * D + hour * H;
  const p = (asset: Asset, commitTime: number, after: number, want: Want, revealAfter: number | null): Plan => ({
    wallet: DEMO_YOU,
    asset,
    commitTime,
    deadline: { after },
    want,
    revealAfter,
  });
  const plans: Plan[] = [];
  // SOL 24h, one per day.
  const sol24: [number, Want, number | null][] = [
    [10, "hit", 2 * H], [9, "hit", 40 * 60], [8, "miss", 3 * H], [7, "hit", 1 * H], [6, "hit", 5 * H],
    [5, "hit", 2 * H], [4, "hit", 30 * 60], [3, "hit", null], [2, "hit", 90 * 60],
  ];
  for (const [d, want, rev] of sol24) plans.push(p("SOL", day(d, 9 + (10 - d) * 0.5), D, want, rev)); // 30 min later each day: no overlap even if a commit shifts
  // SKR 24h every other day, plus one overlap right after the first.
  const skr24: [number, number, Want][] = [[10, 13, "hit"], [9, 15, "hit"], [5, 14, "miss"]];
  for (const [d, h, want] of skr24) plans.push(p("SKR", day(d, h), D, want, 2 * H));
  plans.push(p("SKR", day(9, 17), D, "hit", 1 * H)); // overlap (SKR 24h still open) → counts as a miss
  // VOID: deadline fixed, the commit slides within 24–36 h before it until P0 == PT (thin SKR market).
  const v = findVoid("SKR", day(7, 0), day(6, 22));
  if (v) plans.push({ ...p("SKR", v.commit, 0, "void", 2 * H), deadline: { at: v.deadline } });
  // 3d calls.
  plans.push(p("SOL", day(10, 7), 3 * D, "hit", 4 * H));
  plans.push(p("SOL", day(6, 4), 3 * D, "miss", 2 * H));
  plans.push(p("SKR", day(8, 11), 3 * D, "hit", 6 * H));
  plans.push(p("SKR", day(5, 18), 3 * D, "any", null)); // forfeited
  // 1h practice yesterday.
  plans.push(p("SOL", day(1, 20), H, "hit", 10 * 60));
  // Open right now: one awaiting reveal (try "Reveal" immediately), one sealed 3d (+ the SKR Daily below).
  plans.push(p("SOL", now - 7 * D - 2 * H, 7 * D, "hit", null)); // the only 7d call: awaiting reveal
  plans.push(p("SOL", now - 19 * H, 3 * D, "any", null)); // sealed 3d (previous SOL 3d ended days ago)
  // SKR Daily chain: sealed 12:10 UTC on each of the last 3 days (each right after the previous deadline),
  // plus today's once today's noon deadline has passed → SKR Daily streak ≥ 3.
  for (const d of [3, 2, 1]) {
    const c = day(d, 12) + 10 * 60;
    plans.push({ ...p("SKR", c, 0, d === 2 ? "miss" : "hit", d === 1 ? H : 2 * H), deadline: { at: skrDailyDeadline(c) } });
  }
  const skrDailyCommit = now - 3 * H;
  if (skrDailyCommit >= day(0, 12))
    plans.push({ ...p("SKR", skrDailyCommit, 0, "any", null), deadline: { at: skrDailyDeadline(skrDailyCommit) } });
  return plans;
}

/** Calls of the other demo wallets: varied skill, activity and SKR Daily participation. */
function otherPlans(now: number, rnd: () => number): Plan[] {
  const plans: Plan[] = [];
  DEMO_OTHERS.forEach((wallet, i) => {
    const skill = 0.38 + 0.3 * rnd();
    const activity = i % 5 === 4 ? 0.3 : 0.65 + 0.3 * rnd(); // a few are too inactive to be eligible
    const last: Record<Asset, number> = { SOL: 0, SKR: 0 };
    for (let d = 10; d >= 1; d--) {
      for (const asset of ["SOL", "SKR"] as const) {
        if (rnd() > activity) continue;
        const dayStart = Math.floor((now - d * D) / D) * D;
        const daily = asset === "SKR" && rnd() < 0.6;
        const commitTime = Math.max(dayStart + Math.floor((daily ? 2 : 6 + 10 * rnd()) * H), last[asset] + 60);
        const end = daily ? skrDailyDeadline(commitTime) : commitTime + D;
        const deadline: Plan["deadline"] = daily ? { at: end } : { after: D };
        if (end + 2 * H > now) continue;
        last[asset] = end;
        const revealed = rnd() < 0.9;
        plans.push({
          wallet,
          asset,
          commitTime,
          deadline,
          want: rnd() < skill ? "hit" : "miss",
          revealAfter: revealed ? Math.floor((0.2 + 6 * rnd()) * H) : null,
        });
      }
    }
  });
  return plans;
}

/** The seeded simulated chain as of `anchorSec` (the moment demo mode was entered). Deterministic per anchor day. */
export function buildDemoSeed(anchorSec: number): MemoTx[] {
  const now = Math.floor(anchorSec);
  const rnd = prng(20261012);
  const you = demoMaster(DEMO_YOU);
  const txs = [
    ...yourPlans(now).flatMap((pl) => realize(pl, rnd, you)),
    ...otherPlans(now, rnd).flatMap((pl) => realize(pl, rnd, null)),
    ...seedTips(now),
  ];
  return txs.filter((t) => t.blockTime !== null && t.blockTime <= now).sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
}
