import { DarkTheme as NavigationDarkTheme } from "@react-navigation/native";
import { MD3DarkTheme, adaptNavigationTheme, configureFonts } from "react-native-paper";

import { colors, fonts } from "./tokens";

const { DarkTheme: AdaptedNavDark } = adaptNavigationTheme({ reactNavigationDark: NavigationDarkTheme });

const HEADING_VARIANTS = new Set([
  "displayLarge", "displayMedium", "displaySmall",
  "headlineLarge", "headlineMedium", "headlineSmall",
  "titleLarge", "titleMedium", "titleSmall",
]);

/** Every MD3 variant keeps its size; family becomes Pixelify Sans (headings) or DotGothic16 (body). */
const paperFonts = configureFonts({
  config: Object.fromEntries(
    Object.keys(MD3DarkTheme.fonts).map((k) => [k, { fontFamily: HEADING_VARIANTS.has(k) ? fonts.heading : fonts.body, fontWeight: "400" as const }]),
  ),
});

/** Paper (MD3) + React Navigation theme mapped onto the Night Register tokens. Always dark. */
export const nightTheme = {
  ...MD3DarkTheme,
  ...AdaptedNavDark,
  roundness: 0,
  fonts: paperFonts,
  colors: {
    ...MD3DarkTheme.colors,
    ...AdaptedNavDark.colors,
    primary: colors.accent,
    onPrimary: colors.ink,
    primaryContainer: colors.accentShadow,
    onPrimaryContainer: colors.text,
    secondary: colors.sealed,
    onSecondary: colors.ink,
    secondaryContainer: colors.border,
    onSecondaryContainer: colors.text,
    tertiary: colors.up,
    onTertiary: colors.ink,
    error: colors.down,
    onError: colors.ink,
    background: colors.bg,
    onBackground: colors.text,
    surface: colors.surface,
    onSurface: colors.text,
    surfaceVariant: colors.surface,
    onSurfaceVariant: colors.textMuted,
    outline: colors.border,
    outlineVariant: colors.border,
    elevation: {
      level0: "transparent",
      level1: colors.surface,
      level2: colors.surface,
      level3: colors.surface,
      level4: colors.surface,
      level5: colors.surface,
    },
    // React Navigation keys
    card: colors.bgDeep,
    text: colors.text,
    border: colors.border,
    notification: colors.down,
  },
};
