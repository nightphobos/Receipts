import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";

import type { StatusV2 } from "../core/score";
import { colors, fonts, space } from "./tokens";

type Shape = "round" | "rect" | "dashed" | "sealed";

/** Status is shape + colour (colour-blind safe), spec "Visual style". */
export const STAMP_META: Record<StatusV2, { label: string; shape: Shape; color: string; mark?: string }> = {
  hit: { label: "HIT", shape: "round", color: colors.stampHit, mark: "✓" },
  miss: { label: "MISS", shape: "rect", color: colors.stampMiss, mark: "✕" },
  forfeited: { label: "NO SHOW", shape: "rect", color: colors.stampMiss, mark: "✕" },
  overlap: { label: "OVERLAP", shape: "rect", color: colors.stampMiss, mark: "✕" },
  void: { label: "VOID", shape: "dashed", color: colors.stampVoid },
  sealed: { label: "SEALED", shape: "sealed", color: colors.sealed },
  awaiting_reveal: { label: "REVEAL NOW", shape: "rect", color: colors.accentShadow, mark: "!" },
  unresolved: { label: "PENDING", shape: "dashed", color: colors.stampVoid },
  legacy: { label: "LEGACY", shape: "dashed", color: colors.stampVoid },
};

export type StatusStampProps = {
  status: StatusV2;
  /** Sealed only: countdown text shown beside the dither bar, e.g. "23:59:12". */
  countdown?: string;
  /** Tilt like a rubber stamp. Off in dense lists. */
  tilt?: boolean;
};

function DitherBar({ color }: { color: string }) {
  return (
    <Svg width={72} height={16}>
      <Defs>
        <Pattern id="dither" width={4} height={4} patternUnits="userSpaceOnUse">
          <Rect x={0} y={0} width={2} height={2} fill={color} />
          <Rect x={2} y={2} width={2} height={2} fill={color} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={72} height={16} fill="url(#dither)" />
    </Svg>
  );
}

export function StatusStamp({ status, countdown, tilt = true }: StatusStampProps) {
  const m = STAMP_META[status];
  if (m.shape === "sealed") {
    return (
      <View style={styles.sealedRow} accessibilityLabel={`Sealed${countdown ? `, ${countdown} left` : ""}`}>
        <DitherBar color={m.color} />
        <Text style={[styles.countdown, { color: m.color }]}>{countdown ?? m.label}</Text>
      </View>
    );
  }
  return (
    <View
      accessibilityLabel={m.label}
      style={[
        styles.base,
        { borderColor: m.color },
        m.shape === "round" && styles.round,
        m.shape === "dashed" && styles.dashed,
        tilt && styles.tilt,
      ]}
    >
      <Text style={[styles.label, { color: m.color }]}>
        {m.mark ? `${m.mark} ` : ""}
        {m.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    borderWidth: 3,
    paddingVertical: 2,
    paddingHorizontal: space.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  round: { borderRadius: 999, paddingHorizontal: space.md, minWidth: 64 },
  dashed: { borderStyle: "dashed", borderWidth: 2 },
  tilt: { transform: [{ rotate: "-6deg" }] },
  label: { fontFamily: fonts.headingBold, fontSize: 16, letterSpacing: 1 },
  sealedRow: { flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "flex-start" },
  countdown: { fontFamily: fonts.number, fontSize: 20 },
});
