import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

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

const styles = StyleSheet.create({
  outer: { borderWidth: pixel.border, borderColor: colors.paper, backgroundColor: colors.surface },
  inner: { borderWidth: pixel.border, borderColor: colors.border, padding: space.md, gap: space.sm },
  title: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.accent, letterSpacing: 1 },
});
