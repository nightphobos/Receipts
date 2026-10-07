import { MASCOT_POSE_NAMES } from "../mascot";
import {
  ONBOARDED_KEY,
  ONBOARDED_VALUE,
  ONBOARDING_PANELS,
  pageFromOffset,
  panelA11yLabel,
  shouldShowOnboarding,
} from "../onboarding";

describe("onboarding", () => {
  it("uses the rcpt:onboarded flag", () => {
    expect(ONBOARDED_KEY).toBe("rcpt:onboarded");
  });

  it("shows only while the flag is unset", () => {
    expect(shouldShowOnboarding(null)).toBe(true);
    expect(shouldShowOnboarding(undefined)).toBe(true);
    expect(shouldShowOnboarding("")).toBe(true);
    expect(shouldShowOnboarding(ONBOARDED_VALUE)).toBe(false);
    expect(shouldShowOnboarding("anything")).toBe(false);
  });

  it("has the three panels in order, each with a Chekko pose", () => {
    expect(ONBOARDING_PANELS.map((p) => p.id)).toEqual(["receipt", "no-take-backs", "start"]);
    expect(ONBOARDING_PANELS[0].title).toBe("Every call gets a receipt");
    expect(ONBOARDING_PANELS[1].title).toBe("No take-backs");
    expect(ONBOARDING_PANELS[2].title).toBe("Start");
    for (const p of ONBOARDING_PANELS) {
      expect(MASCOT_POSE_NAMES).toContain(p.pose);
      expect(p.lines.length).toBeGreaterThan(0);
    }
  });

  it("explains the rules honestly", () => {
    const text = (i: number) => ONBOARDING_PANELS[i].lines.join(" ");
    expect(text(0)).toMatch(/Solana/);
    expect(text(0)).toMatch(/reveal/i);
    expect(text(1)).toMatch(/unrevealed.*miss/i);
    expect(text(1)).toMatch(/both sides.*coin flip/i);
    expect(text(1)).toMatch(/σ/);
  });

  it("maps a scroll offset to the nearest page, clamped", () => {
    expect(pageFromOffset(0, 360, 3)).toBe(0);
    expect(pageFromOffset(170, 360, 3)).toBe(0);
    expect(pageFromOffset(190, 360, 3)).toBe(1);
    expect(pageFromOffset(720, 360, 3)).toBe(2);
    expect(pageFromOffset(5000, 360, 3)).toBe(2);
    expect(pageFromOffset(-40, 360, 3)).toBe(0);
    expect(pageFromOffset(100, 0, 3)).toBe(0);
  });

  it("builds a screen-reader label with the position", () => {
    expect(panelA11yLabel(0)).toBe(
      `Step 1 of 3. Every call gets a receipt. ${ONBOARDING_PANELS[0].lines.join(" ")}`,
    );
  });
});
