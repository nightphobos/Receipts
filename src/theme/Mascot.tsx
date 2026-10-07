import React, { useEffect, useState } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";

import { MASCOT_POSES, MASCOT_POSE_NAMES, mascotRuns, type MascotPixel, type MascotPose, type MascotRun } from "../core/mascot";
import { PixelPanel } from "./PixelPanel";
import { colors, fonts, mascotFill, space } from "./tokens";

const FILL: Record<MascotPixel, string> = mascotFill;

const RUNS = Object.fromEntries(MASCOT_POSE_NAMES.map((n) => [n, mascotRuns(MASCOT_POSES[n])])) as Record<
  MascotPose,
  MascotRun[]
>;

/** Bob by one art pixel every 500 ms (eat/print chew faster); still when reduce motion is on. */
function useBob(pose: MascotPose): number {
  const still = useReducedMotion();
  const [up, setUp] = useState(0);
  useEffect(() => {
    if (still) {
      setUp(0);
      return;
    }
    const id = setInterval(() => setUp((v) => 1 - v), pose === "eat" || pose === "print" ? 220 : 500);
    return () => clearInterval(id);
  }, [pose, still]);
  return up;
}

export type MascotProps = {
  pose: MascotPose;
  /** dp per art pixel; integer keeps edges crisp. */
  scale?: number;
};

/** Chekko, the cash-register mimic: 16×16 rects on an integer grid (no `shapeRendering` in RN SVG). */
export function Mascot({ pose, scale = 4 }: MascotProps) {
  const bob = useBob(pose);
  const size = 16 * Math.round(scale);
  return (
    <View style={{ width: size, height: size, transform: [{ translateY: -bob * Math.round(scale) }] }}>
      <Svg width={size} height={size} viewBox="0 0 16 16">
        {RUNS[pose].map((r, i) => (
          <Rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={FILL[r.code]} />
        ))}
      </Svg>
    </View>
  );
}

export type MascotDialogProps = MascotProps & {
  text: string;
  style?: StyleProp<ViewStyle>;
};

/** Chekko speaking from a JRPG dialog window. */
export function MascotDialog({ pose, text, scale = 4, style }: MascotDialogProps) {
  return (
    <PixelPanel style={style} contentStyle={styles.row}>
      <Mascot pose={pose} scale={scale} />
      <View style={styles.speech}>
        <Text style={styles.name}>CHEKKO</Text>
        <Text style={styles.text}>{text}</Text>
      </View>
    </PixelPanel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  speech: { flex: 1, gap: space.xs },
  name: { fontFamily: fonts.headingBold, fontSize: 14, color: colors.accent, letterSpacing: 1 },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 },
});
