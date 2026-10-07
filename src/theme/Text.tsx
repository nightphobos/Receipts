import React from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle } from "react-native";

import { PixelIcon, PixelIconName } from "./icons";
import { colors, fonts, space } from "./tokens";

type P = TextProps & { style?: StyleProp<TextStyle> };

/** Screen title (Pixelify Sans bold, gold). */
export function Title({ style, ...rest }: P) {
  return <Text {...rest} style={[styles.title, style]} />;
}

/** Section heading / field label (Pixelify Sans). */
export function Heading({ style, ...rest }: P) {
  return <Text {...rest} style={[styles.heading, style]} />;
}

export function Body({ style, ...rest }: P) {
  return <Text {...rest} style={[styles.body, style]} />;
}

export function Muted({ style, ...rest }: P) {
  return <Text {...rest} style={[styles.muted, style]} />;
}

/** VT323 number, never below 20sp. */
export function Num({ style, ...rest }: P) {
  return <Text {...rest} style={[styles.num, style]} />;
}

/** Small pixel tag, e.g. DEMO PRICES or SEEKER VERIFIED. */
export function Badge({ label, color = colors.accent, textColor = colors.ink, style }: { label: string; color?: string; textColor?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }, style]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

/** Text link styled as a menu entry: "▶ label". */
export function PixelLink({ label, onPress, icon, color = colors.accent, style }: { label: string; onPress: () => void; icon?: PixelIconName; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.link, pressed && styles.pressed, style]}>
      {icon ? <PixelIcon name={icon} scale={1} color={color} accent={color} /> : <Text style={[styles.linkText, { color }]}>▶</Text>}
      <Text style={[styles.linkText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Gold spinner with an optional caption. */
export function Loading({ caption, style }: { caption?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.loading, style]}>
      <ActivityIndicator color={colors.accent} />
      {caption ? <Muted style={styles.center}>{caption}</Muted> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.headingBold, fontSize: 24, color: colors.accent, letterSpacing: 1 },
  heading: { fontFamily: fonts.heading, fontSize: 16, color: colors.text, letterSpacing: 1 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  muted: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  num: { fontFamily: fonts.number, fontSize: 24, color: colors.text },
  badge: { alignSelf: "flex-start", paddingHorizontal: space.sm, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.headingBold, fontSize: 12, letterSpacing: 1 },
  link: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs, alignSelf: "flex-start" },
  linkText: { fontFamily: fonts.heading, fontSize: 14 },
  pressed: { opacity: 0.6 },
  loading: { alignItems: "center", gap: space.sm, padding: space.lg },
  center: { textAlign: "center" },
});
