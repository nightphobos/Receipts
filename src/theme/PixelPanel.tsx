import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { colors, fonts, pixel, space } from "./tokens";

export type PixelPanelProps = {
  title?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/** JRPG menu window: 2px paper outer border, 2px indigo inner border, surface fill. */
export function PixelPanel({ title, style, contentStyle, children }: PixelPanelProps) {
  return (
    <View style={[styles.outer, style]}>
      <View style={[styles.inner, contentStyle]}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {children}
      </View>
    </View>
  );
}

export type PixelCardProps = {
  onPress?: () => void;
  /** Gold border, e.g. your own row. */
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  children?: React.ReactNode;
};

/** List row: surface fill, indigo border; pressed (or highlighted) = gold border. */
export function PixelCard({ onPress, highlight, style, accessibilityLabel, children }: PixelCardProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, (pressed || highlight) && styles.cardActive, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: pixel.border, borderColor: colors.border, padding: space.md, gap: space.xs },
  cardActive: { borderColor: colors.accent },
  outer: { borderWidth: pixel.border, borderColor: colors.paper, backgroundColor: colors.surface },
  inner: { borderWidth: pixel.border, borderColor: colors.border, padding: space.md, gap: space.sm },
  title: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.accent, letterSpacing: 1 },
});
