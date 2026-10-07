import { DEFAULT_HORIZON, HORIZON_CHOICES, deadlineFor, draftCallV2, skrDailyDeadline } from "../draftV2";
import { horizonClass } from "../score";

const DAY = 86400;
const MIDNIGHT = 1_791_244_800; // 2026-10-07 00:00 UTC
const NOON = MIDNIGHT + 43200;

describe("HORIZON_CHOICES", () => {
  it("defaults to 24h and offers 24h, 3d, 7d, 1h practice and SKR Daily", () => {
    expect(DEFAULT_HORIZON).toBe("24h");
    expect(HORIZON_CHOICES.map((h) => h.value)).toEqual(["24h", "3d", "7d", "1h", "skr-daily"]);
  });
});

describe("skrDailyDeadline", () => {
  it("is today's 12:00 UTC when at least 12 h away", () => {
    expect(skrDailyDeadline(MIDNIGHT)).toBe(NOON);
    expect(skrDailyDeadline(NOON - 43200)).toBe(NOON);
  });
  it("is tomorrow's 12:00 UTC when today's is less than 12 h away", () => {
    expect(skrDailyDeadline(MIDNIGHT + 1)).toBe(NOON + DAY);
    expect(skrDailyDeadline(NOON)).toBe(NOON + DAY);
    expect(skrDailyDeadline(NOON + 1)).toBe(NOON + DAY);
  });
  it("is the day after tomorrow when tomorrow's noon is less than 12 h away", () => {
    expect(skrDailyDeadline(MIDNIGHT + DAY + 1)).toBe(NOON + 2 * DAY);
  });
  it("is always a 24h-class horizon", () => {
    for (let t = MIDNIGHT; t < MIDNIGHT + DAY; t += 997) {
      const d = skrDailyDeadline(t);
      expect(d % DAY).toBe(43200);
      expect(horizonClass(t, d)).toBe("24h");
    }
  });
});

describe("deadlineFor", () => {
  it.each([
    ["24h", DAY, "24h"],
    ["3d", 3 * DAY, "3d"],
    ["7d", 7 * DAY, "7d"],
    ["1h", 3600, "1h"],
  ] as const)("%s → now + %i (class %s)", (choice, sec, cls) => {
    expect(deadlineFor(choice, NOON)).toBe(NOON + sec);
    expect(horizonClass(NOON, deadlineFor(choice, NOON))).toBe(cls);
  });
  it("skr-daily → next noon UTC", () => expect(deadlineFor("skr-daily", MIDNIGHT)).toBe(NOON));
});

describe("draftCallV2", () => {
  it("builds a valid call with created = now", () => {
    expect(draftCallV2({ asset: "SOL", dir: "up", horizon: "24h" }, NOON)).toEqual({
      ok: true,
      call: { v: 2, asset: "SOL", dir: "up", deadline: NOON + DAY, created: NOON },
    });
  });
  it("accepts the 1h practice horizon", () => {
    const r = draftCallV2({ asset: "SKR", dir: "down", horizon: "1h" }, NOON);
    expect(r.ok && r.call.deadline).toBe(NOON + 3600);
  });
  it("SKR Daily forces SKR", () => {
    const r = draftCallV2({ asset: "SOL", dir: "down", horizon: "skr-daily" }, MIDNIGHT);
    expect(r).toEqual({ ok: true, call: { v: 2, asset: "SKR", dir: "down", deadline: NOON, created: MIDNIGHT } });
  });
  it("requires a direction", () => {
    expect(draftCallV2({ asset: "SOL", dir: null, horizon: "24h" }, NOON)).toEqual({
      ok: false,
      errors: ["Pick ▲ up or ▼ down"],
    });
  });
});
