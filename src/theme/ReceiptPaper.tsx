import React, { useState } from "react";
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Polygon } from "react-native-svg";

import { colors, fonts, space } from "./tokens";

const TOOTH_W = 8;
const TOOTH_H = 6;

/** Zig-zag torn edge points for a strip `width` wide (teeth pointing down). */
function zigzagPoints(width: number): string {
  const pts = ["0,0"];
  const n = Math.max(1, Math.ceil(width / TOOTH_W));
  for (let i = 0; i < n; i++) {
    const x = i * TOOTH_W;
    pts.push(`${Math.min(x + TOOTH_W / 2, width)},${TOOTH_H}`, `${Math.min(x + TOOTH_W, width)},0`);
  }
  return pts.join(" ");
}

export type ReceiptPaperProps = {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/** Thermal-paper card: paper fill, ink text, torn zig-zag bottom edge. */
export function ReceiptPaper({ style, children }: ReceiptPaperProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  return (
    <View style={style} onLayout={onLayout}>
      <View style={styles.paper}>{children}</View>
      {width > 0 ? (
        <Svg width={width} height={TOOTH_H}>
          <Polygon points={zigzagPoints(width)} fill={colors.paper} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Dashed separator line across the receipt. */
export function ReceiptDivider() {
  return <View style={styles.divider} />;
}

/** One receipt line: label left (body font), value right (VT323, ≥ 20sp). */
export function ReceiptRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

export function ReceiptTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  paper: { backgroundColor: colors.paper, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm, gap: space.xs },
  divider: { borderBottomWidth: 2, borderStyle: "dashed", borderColor: colors.ink, opacity: 0.5, marginVertical: space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.sm },
  label: { fontFamily: fonts.body, fontSize: 14, color: colors.ink },
  value: { fontFamily: fonts.number, fontSize: 22, color: colors.ink },
  title: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.ink, textAlign: "center", letterSpacing: 2 },
});
