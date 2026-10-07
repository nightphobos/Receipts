/** Profile "Copy share text". Pure TS: no RN/Expo imports. */
import { describeCall, formatUsd, solscanTxUrl } from "./format";
import { formatChangePct, formatZ } from "./ceremony";
import { stats, statsV2, statusOf, statusOfV2, type OutcomeV2, type Receipt, type ReceiptV2, type Status } from "./score";

export const SHARE_LAST_N = 5;
/** First line of the share text whenever any price came from the mock source. */
export const DEMO_SHARE_PREFIX = "[DEMO PRICES — not real results]";

export interface ShareOptions {
  /** Prices are demo prices: prefix the text and don't call them Pyth. */
  demo?: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  sealed: "SEALED",
  awaiting_reveal: "AWAITING REVEAL",
  forfeited: "FORFEITED",
  unresolved: "UNRESOLVED",
  hit: "HIT",
  miss: "MISS",
};

/** "67%"; "—" when nothing is scored yet. */
export function formatHitRate(hitRate: number | null): string {
  return hitRate === null ? "—" : `${Math.round(hitRate * 100)}%`;
}

function receiptLine(r: Receipt, nowSec: number, cluster: string | undefined, demo: boolean): string {
  const status = statusOf(r, nowSec);
  // Only revealed calls are shown: sharing an unrevealed call would be an unverifiable claim.
  let what = "hidden call";
  if (r.reveal) {
    what = describeCall(r.reveal.call);
    if (r.priceAtDeadline != null) what += ` (${demo ? "demo price" : "Pyth"} $${formatUsd(r.priceAtDeadline)})`;
  }
  let line = `• ${STATUS_LABEL[status]} ${what} — ${solscanTxUrl(r.commit.signature, cluster)}`;
  if (r.reveal) line += ` · reveal ${solscanTxUrl(r.reveal.signature, cluster)}`;
  return line;
}

/** Hit-rate and counts over ALL receipts, then the last 5 by commit time with Solscan links. */
export function shareText(
  receipts: readonly Receipt[],
  nowSec: number,
  cluster?: string,
  { demo = false }: ShareOptions = {},
): string {
  const s = stats(receipts, nowSec);
  const scored = s.hits + s.misses + s.forfeited;
  const lines = [
    ...(demo ? [DEMO_SHARE_PREFIX] : []),
    `My Receipts hit-rate: ${formatHitRate(s.hitRate)} (${s.hits} ${s.hits === 1 ? "hit" : "hits"} / ${scored} scored, ${s.forfeited} forfeited, ${s.pending} pending)`,
  ];
  const last = [...receipts].sort((a, b) => b.commit.blockTime - a.commit.blockTime).slice(0, SHARE_LAST_N);
  if (last.length > 0) {
    lines.push("", `Last ${last.length}:`, ...last.map((r) => receiptLine(r, nowSec, cluster, demo)));
  }
  lines.push("", "Sealed as sha256 commit memos on Solana, revealed later, scored against Pyth. Unrevealed = miss.");
  return lines.join("\n");
}

// ---- v2 share texts (spec "Viral surfaces") ----

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Fri" (UTC weekday). */
export function formatUtcDay(ts: number): string {
  return WEEKDAYS[new Date(ts * 1000).getUTCDay()];
}

/** "Fri 18:00 UTC". */
export function formatUtcDayTime(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${formatUtcDay(ts)} ${hh}:${mm} UTC`;
}

const byCommitOrder = (a: ReceiptV2, b: ReceiptV2) =>
  a.commit.blockTime - b.commit.blockTime || (a.commit.signature < b.commit.signature ? -1 : a.commit.signature > b.commit.signature ? 1 : 0);

/** 1-based position of `r` among the wallet's v2 receipts, ordered by (commit blockTime, signature). */
export function receiptNumber(r: ReceiptV2, all: readonly ReceiptV2[]): number {
  return all.filter((x) => byCommitOrder(x, r) < 0).length + 1;
}

/** Shareable right after sealing: the direction stays hidden. */
export function sealedShareText(r: Pick<ReceiptV2, "asset" | "deadline" | "commit">, cluster?: string): string {
  return [
    "🔒 SEALED CALL",
    `$${r.asset} · reveals ${formatUtcDayTime(r.deadline)}`,
    "Direction: ██████",
    `Sealed on Solana: ${solscanTxUrl(r.commit.signature, cluster)}`,
    "Guess my side 👇",
  ].join("\n");
}

const RESULT_LABEL: Record<OutcomeV2, string> = {
  hit: "✅ HIT",
  miss: "❌ MISS",
  void: "➖ VOID (not counted)",
};

/**
 * Result card text for a revealed and priced receipt; null for anything else (sealed, forfeited,
 * overlap, unresolved) — only on-chain-verifiable outcomes are shareable. Record = statsV2 over `all`.
 */
export function resultShareText(
  r: ReceiptV2,
  all: readonly ReceiptV2[],
  nowSec: number,
  cluster?: string,
  { demo = false }: ShareOptions = {},
): string | null {
  const status = statusOfV2(r, nowSec);
  if (status !== "hit" && status !== "miss" && status !== "void") return null;
  const { call } = r.reveal!;
  const p0 = r.p0 as number;
  const pt = r.pt as number;
  const s = statsV2(all, nowSec);
  return [
    ...(demo ? [DEMO_SHARE_PREFIX] : []),
    `🧾 RECEIPT #${receiptNumber(r, all)} — ${RESULT_LABEL[status]}`,
    `Sealed ${formatUtcDayTime(r.commit.blockTime)} @ $${formatUsd(p0)}`,
    `Call: $${r.asset} ${call.dir === "up" ? "▲" : "▼"} by ${formatUtcDay(r.deadline)}`,
    `Actual: $${formatUsd(pt)} (${formatChangePct(p0, pt)})`,
    `Record: ${s.hits}/${s.n} · ${s.misses} misses, undeletable · ${formatZ(s.z)}`,
    `Verify: ${solscanTxUrl(r.commit.signature, cluster)}`,
  ].join("\n");
}
