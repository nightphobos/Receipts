/** Night Register design tokens (spec "Visual style"). Plain data, no RN imports. */
export const colors = {
  bg: "#14122B",
  bgDeep: "#0E0C20",
  surface: "#24214A",
  border: "#4A4580",
  text: "#F4EEDC",
  textMuted: "#B9B2D6",
  accent: "#FFC94A",
  accentShadow: "#9A7420",
  up: "#3EE08F",
  upShadow: "#1E7A4E",
  down: "#FF5C7A",
  downShadow: "#7A2234",
  sealed: "#8C7BFF",
  sealedShadow: "#4B3FA0",
  paper: "#F4EEDC",
  ink: "#1B1A2E",
  stampHit: "#137A45",
  stampMiss: "#C81E3A",
  stampVoid: "#7A7790",
  cityFar: "#1E1B3D",
  cityNear: "#2B2756",
  windows: ["#FFC94A", "#8C7BFF", "#3EE08F", "#FF5C7A"],
} as const;

/** Chekko pixel codes (src/core/mascot.ts) → colours; shared by the app and scripts/gen-icons.ts. */
export const mascotFill = {
  D: colors.sealedShadow,
  B: colors.sealed,
  S: "#123A2A",
  E: colors.up,
  G: colors.accent,
  I: colors.ink,
  P: colors.paper,
  T: "#6EC8FF",
  K: colors.accent,
} as const;

export const fonts = {
  heading: "PixelifySans_500Medium",
  headingBold: "PixelifySans_700Bold",
  body: "DotGothic16_400Regular",
  number: "VT323_400Regular",
} as const;

/** VT323 is unreadable below 20sp; number sizes never go under this. */
export const MIN_NUMBER_SIZE = 20;

export const type = {
  title: { fontFamily: fonts.headingBold, fontSize: 24 },
  heading: { fontFamily: fonts.heading, fontSize: 18 },
  body: { fontFamily: fonts.body, fontSize: 14 },
  small: { fontFamily: fonts.body, fontSize: 12 },
  number: { fontFamily: fonts.number, fontSize: 24 },
  numberBig: { fontFamily: fonts.number, fontSize: 40 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** Pixel-art constants: border width and hard drop-shadow height. */
export const pixel = { border: 2, cut: 2, shadow: 4, shadowBig: 6 } as const;
