import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { PixelIcon, PixelIconName } from "./icons";
import { PixelBox } from "./PixelBox";
import { colors, fonts, pixel, space } from "./tokens";

/** up/down = picked direction (solid); upOutline/down = not picked (outlined). */
export type PixelButtonVariant = "gold" | "up" | "upOutline" | "down" | "downSolid" | "ghost";

const VARIANTS: Record<PixelButtonVariant, { fill: string; border: string; shadow?: string; text: string }> = {
  gold: { fill: colors.accent, border: colors.accentShadow, shadow: colors.accentShadow, text: colors.ink },
  up: { fill: colors.up, border: colors.upShadow, shadow: colors.upShadow, text: colors.ink },
  upOutline: { fill: colors.bg, border: colors.up, shadow: colors.upShadow, text: colors.up },
  down: { fill: colors.bg, border: colors.down, shadow: colors.downShadow, text: colors.down },
  downSolid: { fill: colors.down, border: colors.downShadow, shadow: colors.downShadow, text: colors.ink },
  ghost: { fill: "transparent", border: colors.border, text: colors.text },
};

export type PixelButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: PixelButtonVariant;
  icon?: PixelIconName;
  disabled?: boolean;
  /** Bigger shadow and text for the main CTA. */
  big?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** JRPG menu button: hard shadow, sinks on press with a ▶ cursor and a light haptic. */
export function PixelButton({ label, onPress, variant = "gold", icon, disabled, big, style, accessibilityLabel }: PixelButtonProps) {
  const [pressed, setPressed] = useState(false);
  const v = disabled
    ? { fill: colors.surface, border: colors.border, shadow: undefined, text: colors.textMuted }
    : VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }}
      onPressOut={() => setPressed(false)}
      style={style}
    >
      <PixelBox
        fill={v.fill}
        borderColor={v.border}
        shadowColor={v.shadow}
        shadow={big ? pixel.shadowBig : pixel.shadow}
        pressed={pressed}
      >
        <View style={[styles.row, big && styles.rowBig]}>
          {pressed ? <Text style={[styles.cursor, { color: v.text }]}>▶</Text> : null}
          {icon ? <PixelIcon name={icon} scale={1.5} color={v.text} accent={v.text} /> : null}
          <Text style={[styles.label, big && styles.labelBig, { color: v.text }]}>{label}</Text>
        </View>
      </PixelBox>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.lg,
  },
  rowBig: { paddingVertical: space.md + 2 },
  cursor: { position: "absolute", left: space.sm, fontFamily: fonts.heading, fontSize: 14 },
  label: { fontFamily: fonts.heading, fontSize: 16, letterSpacing: 1 },
  labelBig: { fontFamily: fonts.headingBold, fontSize: 20 },
});
