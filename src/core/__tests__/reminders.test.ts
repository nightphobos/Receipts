import {
  LAST_CALL_AFTER_DEADLINE_SEC,
  REMINDER_ID_PREFIX,
  isReminderId,
  reconcileReminders,
  reminderId,
  remindersForCall,
  remindersFromReceipts,
  type ScheduledReminder,
} from "../reminders";
import type { ReceiptV2 } from "../score";

const H = 3600;
const T0 = 1_760_000_000;

function receipt(over: Partial<ReceiptV2> & { hash: string; blockTime: number; deadline: number }): ReceiptV2 {
  const { blockTime, ...rest } = over;
  return {
    v: 2,
    asset: "SOL",
    horizon: "24h",
    overlap: false,
    commit: { signature: `sig-${over.hash}`, blockTime },
    ...rest,
  };
}

const revealed = (r: ReceiptV2): ReceiptV2 => ({
  ...r,
  reveal: {
    signature: `rev-${r.hash}`,
    blockTime: r.deadline + 60,
    call: { v: 2, asset: r.asset, dir: "up", deadline: r.deadline } as never,
    json: "{}",
    salt: "00",
  },
});

describe("remindersForCall", () => {
  const rs = remindersForCall({ hash: "aa", signature: "sigA", asset: "SOL", deadline: T0, number: 7 });

  it("schedules one at the deadline and one 4 h before the reveal window closes", () => {
    expect(LAST_CALL_AFTER_DEADLINE_SEC).toBe(20 * H);
    expect(rs.map((r) => [r.id, r.kind, r.at])).toEqual([
      [reminderId("aa", "due"), "due", T0],
      [reminderId("aa", "last"), "last", T0 + 20 * H],
    ]);
  });

  it("names asset and receipt number, carries hash + signature for the tap", () => {
    expect(rs[0].body).toBe("SOL call #7 is ready — reveal it or it counts as a miss");
    expect(rs[1].body).toBe("4 h left to reveal SOL call #7 — unrevealed counts as a miss");
    expect(rs[0].title).toMatch(/#7/);
    for (const r of rs) {
      expect(r.hash).toBe("aa");
      expect(r.signature).toBe("sigA");
    }
  });

  it("never leaks the direction", () => {
    for (const r of rs) {
      const text = `${r.title} ${r.body}`;
      expect(text).not.toMatch(/[▲▼↑↓]|\bup\b|\bdown\b|long|short/i);
    }
  });

  it("ids are namespaced", () => {
    expect(reminderId("aa", "due").startsWith(REMINDER_ID_PREFIX)).toBe(true);
    expect(isReminderId(reminderId("aa", "last"))).toBe(true);
    expect(isReminderId("something-else")).toBe(false);
  });
});

describe("remindersFromReceipts", () => {
  const a = receipt({ hash: "a", blockTime: T0 - 24 * H, deadline: T0 });
  const b = receipt({ hash: "b", blockTime: T0 - 23 * H, deadline: T0 + H, asset: "SKR" });

  it("wants both reminders for unrevealed future calls, numbered by commit order", () => {
    const rs = remindersFromReceipts([b, a], T0 - H);
    expect(rs.map((r) => r.id)).toEqual([
      reminderId("a", "due"),
      reminderId("a", "last"),
      reminderId("b", "due"),
      reminderId("b", "last"),
    ]);
    expect(rs[0].body).toContain("SOL call #1");
    expect(rs[2].body).toContain("SKR call #2");
  });

  it("drops revealed and overlap receipts", () => {
    const o = receipt({ hash: "o", blockTime: T0 - 22 * H, deadline: T0 + 2 * H, overlap: true });
    expect(remindersFromReceipts([revealed(a), o], T0 - H)).toEqual([]);
  });

  it("drops reminders whose time has passed (keeps the last call one)", () => {
    const rs = remindersFromReceipts([a], T0 + H);
    expect(rs.map((r) => r.kind)).toEqual(["last"]);
    expect(remindersFromReceipts([a], T0 + 20 * H)).toEqual([]);
  });

  it("keeps numbering stable when earlier receipts are revealed", () => {
    const rs = remindersFromReceipts([revealed(a), b], T0 - H);
    expect(rs[0].body).toContain("SKR call #2");
  });
});

describe("reconcileReminders", () => {
  const a = receipt({ hash: "a", blockTime: T0 - 24 * H, deadline: T0 });
  const now = T0 - H;
  const wanted = remindersFromReceipts([a], now);
  const asScheduled = (r: (typeof wanted)[number]): ScheduledReminder => ({ id: r.id, hash: r.hash, at: r.at, body: r.body });

  it("schedules what is missing", () => {
    const plan = reconcileReminders(wanted, [], { knownHashes: ["a"], nowSec: now });
    expect(plan.schedule.map((r) => r.id)).toEqual(wanted.map((r) => r.id));
    expect(plan.cancel).toEqual([]);
  });

  it("is a no-op when everything is already scheduled", () => {
    const plan = reconcileReminders(wanted, wanted.map(asScheduled), { knownHashes: ["a"], nowSec: now });
    expect(plan).toEqual({ schedule: [], cancel: [] });
  });

  it("cancels stale reminders of known receipts (revealed since)", () => {
    const plan = reconcileReminders([], wanted.map(asScheduled), { knownHashes: ["a"], nowSec: now });
    expect(plan.cancel.sort()).toEqual(wanted.map((r) => r.id).sort());
  });

  it("keeps future reminders of receipts not (yet) in history — e.g. a seal the RPC hasn't indexed", () => {
    const plan = reconcileReminders([], wanted.map(asScheduled), { knownHashes: [], nowSec: now });
    expect(plan.cancel).toEqual([]);
  });

  it("cancels past-due unknown reminders and ignores foreign ids", () => {
    const plan = reconcileReminders(
      [],
      [
        { id: reminderId("zz", "due"), hash: "zz", at: now - 10 },
        { id: "other-app-thing", hash: "a", at: now + 10 },
      ],
      { knownHashes: [], nowSec: now },
    );
    expect(plan.cancel).toEqual([reminderId("zz", "due")]);
  });

  it("reschedules when the time or text changed (e.g. number corrected)", () => {
    const changed = { ...asScheduled(wanted[0]), body: "SOL call #9 is ready — reveal it or it counts as a miss" };
    const plan = reconcileReminders(wanted, [changed, asScheduled(wanted[1])], { knownHashes: ["a"], nowSec: now });
    expect(plan.cancel).toEqual([wanted[0].id]);
    expect(plan.schedule.map((r) => r.id)).toEqual([wanted[0].id]);
  });
});
