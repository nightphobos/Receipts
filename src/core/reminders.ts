import type { Asset } from "./call";
import { REVEAL_GRACE_SEC, type ReceiptV2 } from "./score";
import { receiptNumber } from "./share";

/** Local reveal reminders: one at the deadline, one 4 h before the reveal window closes. */
export const LAST_CALL_AFTER_DEADLINE_SEC = REVEAL_GRACE_SEC - 4 * 3600;
export const REMINDER_ID_PREFIX = "rcpt-reveal:";
export const REMINDER_CHANNEL_ID = "reveal-reminders";
export const REMINDER_CHANNEL_NAME = "Reveal reminders";

export type ReminderKind = "due" | "last";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  hash: string;
  /** Commit signature, so a tap can open the detail before history has loaded. */
  signature: string;
  /** Unix seconds. */
  at: number;
  title: string;
  body: string;
}

/** What the OS reports as scheduled (fields we stored in the notification data). */
export interface ScheduledReminder {
  id: string;
  hash?: string;
  at?: number;
  body?: string;
}

export const reminderId = (hash: string, kind: ReminderKind): string => `${REMINDER_ID_PREFIX}${hash}:${kind}`;
export const isReminderId = (id: string): boolean => id.startsWith(REMINDER_ID_PREFIX);

/** Texts never mention the direction: it is hidden until the reveal. */
export function remindersForCall(c: {
  hash: string;
  signature: string;
  asset: Asset;
  deadline: number;
  number: number;
}): Reminder[] {
  const name = `${c.asset} call #${c.number}`;
  const base = { hash: c.hash, signature: c.signature };
  return [
    {
      ...base,
      id: reminderId(c.hash, "due"),
      kind: "due",
      at: c.deadline,
      title: `Receipt #${c.number} is ready to reveal`,
      body: `${name} is ready — reveal it or it counts as a miss`,
    },
    {
      ...base,
      id: reminderId(c.hash, "last"),
      kind: "last",
      at: c.deadline + LAST_CALL_AFTER_DEADLINE_SEC,
      title: `Last call for receipt #${c.number}`,
      body: `4 h left to reveal ${name} — unrevealed counts as a miss`,
    },
  ];
}

/** Reminders the wallet's history wants right now: unrevealed, non-overlap calls, future times only. */
export function remindersFromReceipts(receipts: readonly ReceiptV2[], nowSec: number): Reminder[] {
  const ordered = [...receipts].sort((a, b) => receiptNumber(a, receipts) - receiptNumber(b, receipts));
  return ordered
    .filter((r) => !r.reveal && !r.overlap)
    .flatMap((r) =>
      remindersForCall({
        hash: r.hash,
        signature: r.commit.signature,
        asset: r.asset,
        deadline: r.deadline,
        number: receiptNumber(r, receipts),
      }),
    )
    .filter((r) => r.at > nowSec);
}

/**
 * Diff wanted vs scheduled. Only our ids are touched. A scheduled reminder for a hash not in
 * `knownHashes` is kept while still in the future (its seal may not be indexed yet).
 */
export function reconcileReminders(
  wanted: readonly Reminder[],
  scheduled: readonly ScheduledReminder[],
  opts: { knownHashes: readonly string[]; nowSec: number },
): { schedule: Reminder[]; cancel: string[] } {
  const known = new Set(opts.knownHashes);
  const wantedById = new Map(wanted.map((r) => [r.id, r]));
  const kept = new Set<string>();
  const cancel: string[] = [];
  for (const s of scheduled) {
    if (!isReminderId(s.id)) continue;
    const w = wantedById.get(s.id);
    if (w) {
      if (s.at === w.at && s.body === w.body) kept.add(s.id);
      else cancel.push(s.id);
      continue;
    }
    const unknownFuture = (s.hash === undefined || !known.has(s.hash)) && s.at !== undefined && s.at > opts.nowSec;
    if (!unknownFuture) cancel.push(s.id);
  }
  return { schedule: wanted.filter((r) => !kept.has(r.id)), cancel };
}
