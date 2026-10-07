/** Share card image (T052): content model and layout numbers. Pure TS: no RN/Expo imports. */
import { formatChangePct, formatZ } from "./ceremony";
import { DEMO_SHARE_PREFIX, isDemoSignature } from "./demoData";
import { formatUsd } from "./format";
import { statsV2, statusOfV2, type OutcomeV2, type ReceiptV2 } from "./score";
import { formatUtcDayTime, receiptNumber } from "./share";

/** Exported PNG size in pixels (4:5 portrait). */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;
export const SHARE_CARD_DEMO_LINE = DEMO_SHARE_PREFIX;

export interface ShareCardModel {
  kind: "sealed" | "result";
  number: number;
  asset: string;
  /** "▲"/"▼" on result cards; null on sealed cards (the direction stays hidden). */
  dir: "▲" | "▼" | null;
  /** "reveals Fri 18:00 UTC" (sealed) or "by Fri 18:00 UTC" (result). */
  when: string;
  p0: string | null;
  pt: string | null;
  move: string | null;
  outcome: OutcomeV2 | null;
  /** "Record H/N · M misses, undeletable · zσ" over all v2 receipts. */
  record: string;
  tx: string;
  verify: string;
  demo: boolean;
}

/** "5VER…wxyz". */
export function shortTx(sig: string): string {
  return sig.length <= 9 ? sig : `${sig.slice(0, 4)}…${sig.slice(-4)}`;
}

const usd = (p: number | null | undefined) => (p == null ? null : `$${formatUsd(p)}`);

/**
 * Card content for the same receipts that have a share text: sealed (direction hidden) or a
 * revealed and priced HIT/MISS/VOID. null for everything else.
 */
export function shareCardModel(
  r: ReceiptV2,
  all: readonly ReceiptV2[],
  nowSec: number,
  { demo = false }: { demo?: boolean } = {},
): ShareCardModel | null {
  const status = statusOfV2(r, nowSec);
  const s = statsV2(all, nowSec);
  const base = {
    number: receiptNumber(r, all),
    asset: r.asset,
    record: `Record ${s.hits}/${s.n} · ${s.misses} misses, undeletable · ${formatZ(s.z)}`,
    tx: shortTx(r.commit.signature),
    verify: isDemoSignature(r.commit.signature) ? "simulated — not on Solana" : "verify on Solana",
    demo,
  };
  if (status === "sealed") {
    return {
      ...base,
      kind: "sealed",
      dir: null,
      when: `reveals ${formatUtcDayTime(r.deadline)}`,
      p0: usd(r.p0),
      pt: null,
      move: null,
      outcome: null,
    };
  }
  if (status !== "hit" && status !== "miss" && status !== "void") return null;
  const p0 = r.p0 as number;
  const pt = r.pt as number;
  return {
    ...base,
    kind: "result",
    dir: r.reveal!.call.dir === "up" ? "▲" : "▼",
    when: `by ${formatUtcDayTime(r.deadline)}`,
    p0: usd(p0),
    pt: usd(pt),
    move: formatChangePct(p0, pt),
    outcome: status,
  };
}

/** Base design is 360 view units wide; everything scales by width / 360. */
const BASE_WIDTH = 360;

export interface ShareCardLayout {
  width: number;
  height: number;
  padding: number;
  paperWidth: number;
  paperPadding: number;
  toothW: number;
  toothH: number;
  gap: number;
  /** Integer pixel-art scale for Chekko (16×16) so it stays crisp. */
  mascotScale: number;
  stampBorder: number;
  font: { wordmark: number; title: number; asset: number; price: number; number: number; move: number; stamp: number; small: number };
}

/** Layout values for a card rendered `width` view units wide (captured to 1080×1350). */
export function shareCardLayout(width: number): ShareCardLayout {
  const u = width / BASE_WIDTH;
  const padding = 24 * u;
  return {
    width,
    height: (width * SHARE_CARD_HEIGHT) / SHARE_CARD_WIDTH,
    padding,
    paperWidth: width - 2 * padding,
    paperPadding: 16 * u,
    toothW: 10 * u,
    toothH: 8 * u,
    gap: 8 * u,
    mascotScale: Math.max(1, Math.round(3 * u)),
    stampBorder: 3 * u,
    font: {
      wordmark: 22 * u,
      title: 20 * u,
      asset: 30 * u,
      price: 26 * u,
      number: 22 * u,
      move: 34 * u,
      stamp: 24 * u,
      small: 12 * u,
    },
  };
}
