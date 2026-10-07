import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { PixelIcon, PixelIconName } from "./icons";
import { PixelBox } from "./PixelBox";
import { colors, fonts, space } from "./tokens";

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: PixelIconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Horizon / asset selector chip. Selected = gold fill with a ▶ cursor. */
export function Chip({ label, selected, onPress, icon, disabled, style }: ChipProps) {
  const text = disabled ? colors.textMuted : selected ? colors.ink : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled || !onPress}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={style}
    >
      <PixelBox
        fill={selected ? colors.accent : colors.surface}
        borderColor={selected ? colors.accentShadow : colors.border}
        shadowColor={selected ? colors.accentShadow : undefined}
        shadow={2}
      >
        <View style={styles.row}>
          {selected ? <Text style={[styles.label, { color: text }]}>▶</Text> : null}
          {icon ? <PixelIcon name={icon} scale={1} color={text} accent={text} /> : null}
          <Text style={[styles.label, { color: text }]}>{label}</Text>
        </View>
      </PixelBox>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs + 2, paddingHorizontal: space.md },
  label: { fontFamily: fonts.heading, fontSize: 14 },
});
