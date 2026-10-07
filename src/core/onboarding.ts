/** First-run onboarding: panel copy and the "seen" flag. Pure; the UI stores the flag in AsyncStorage. */
import type { MascotPose } from "./mascot";

export const ONBOARDED_KEY = "rcpt:onboarded";
export const ONBOARDED_VALUE = "1";

export type OnboardingPanel = {
  id: "receipt" | "no-take-backs" | "start";
  title: string;
  lines: string[];
  pose: MascotPose;
};

export const ONBOARDING_PANELS: readonly OnboardingPanel[] = [
  {
    id: "receipt",
    title: "Every call gets a receipt",
    lines: [
      "Pick a coin, up or down, and a deadline.",
      "Your call is sealed on Solana as a hash now — nobody can see your side.",
      "After the deadline you reveal it and it is scored against the real price.",
    ],
    pose: "print",
  },
  {
    id: "no-take-backs",
    title: "No take-backs",
    lines: [
      "An unrevealed call counts as a miss. Nothing can be hidden or deleted.",
      "Sealing both sides of the same call is just a coin flip.",
      "Callers are ranked by σ vs coin flip: how far your hits beat luck.",
    ],
    pose: "eat",
  },
  {
    id: "start",
    title: "Start",
    lines: ["Connect a wallet to seal real calls, or try the demo with simulated data — nothing is signed or sent."],
    pose: "cheer",
  },
];

/** Show onboarding until the flag has any non-empty value. */
export function shouldShowOnboarding(stored: string | null | undefined): boolean {
  return !stored;
}

/** Nearest page for a horizontal paging scroll offset, clamped to [0, count - 1]. */
export function pageFromOffset(offsetX: number, pageWidth: number, count: number): number {
  if (pageWidth <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(offsetX / pageWidth)));
}

export function panelA11yLabel(index: number): string {
  const p = ONBOARDING_PANELS[index];
  return `Step ${index + 1} of ${ONBOARDING_PANELS.length}. ${p.title}. ${p.lines.join(" ")}`;
}
