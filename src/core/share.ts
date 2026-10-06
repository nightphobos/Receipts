/** Profile "Copy share text". Pure TS: no RN/Expo imports. */
import { describeCall, formatUsd, solscanTxUrl } from "./format";
import { stats, statusOf, type Receipt, type Status } from "./score";

export const SHARE_LAST_N = 5;

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

function receiptLine(r: Receipt, nowSec: number, cluster?: string): string {
  const status = statusOf(r, nowSec);
  // Only revealed calls are shown: sharing an unrevealed call would be an unverifiable claim.
  let what = "hidden call";
  if (r.reveal) {
    what = describeCall(r.reveal.call);
    if (r.priceAtDeadline != null) what += ` (Pyth $${formatUsd(r.priceAtDeadline)})`;
  }
  let line = `• ${STATUS_LABEL[status]} ${what} — ${solscanTxUrl(r.commit.signature, cluster)}`;
  if (r.reveal) line += ` · reveal ${solscanTxUrl(r.reveal.signature, cluster)}`;
  return line;
}

/** Hit-rate and counts over ALL receipts, then the last 5 by commit time with Solscan links. */
export function shareText(receipts: readonly Receipt[], nowSec: number, cluster?: string): string {
  const s = stats(receipts, nowSec);
  const scored = s.hits + s.misses + s.forfeited;
  const lines = [
    `My Receipts hit-rate: ${formatHitRate(s.hitRate)} (${s.hits} ${s.hits === 1 ? "hit" : "hits"} / ${scored} scored, ${s.forfeited} forfeited, ${s.pending} pending)`,
  ];
  const last = [...receipts].sort((a, b) => b.commit.blockTime - a.commit.blockTime).slice(0, SHARE_LAST_N);
  if (last.length > 0) {
    lines.push("", `Last ${last.length}:`, ...last.map((r) => receiptLine(r, nowSec, cluster)));
  }
  lines.push("", "Sealed as sha256 commit memos on Solana, revealed later, scored against Pyth. Unrevealed = miss.");
  return lines.join("\n");
}
