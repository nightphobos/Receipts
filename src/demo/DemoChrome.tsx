/** Demo mode guardrails: diagonal DEMO ribbon, banner with time warp + exit, and query sync. */
import React, { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { colors, fonts, space } from "../theme/tokens";
import { exitDemo, useDemo, warpDemo } from "./store";

/** Refetch everything when the simulated chain or the demo clock changes (seal, reveal, warp, reset, enter/exit). */
export function DemoSync() {
  const { version } = useDemo();
  const queryClient = useQueryClient();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    queryClient.invalidateQueries();
  }, [version, queryClient]);
  return null;
}

function WarpButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

/** Slim banner shown above every screen in demo mode. */
export function DemoBanner() {
  const { active, offsetSec } = useDemo();
  if (!active) return null;
  const warped = offsetSec > 0 ? ` · clock +${Math.round(offsetSec / 3600)}h` : "";
  return (
    <View style={styles.banner} accessibilityRole="summary" accessibilityLabel="Demo mode: simulated data, not real records">
      <View style={styles.bannerText}>
        <Text style={styles.title}>DEMO DATA</Text>
        <Text style={styles.sub}>{`not real records${warped}`}</Text>
      </View>
      <WarpButton label="⏩ +1h" onPress={() => warpDemo(3600)} />
      <WarpButton label="⏩ +24h" onPress={() => warpDemo(86400)} />
      <WarpButton label="EXIT" onPress={exitDemo} />
    </View>
  );
}

/** Diagonal ribbon in the top-right corner of every screen (touches pass through). */
export function DemoRibbon() {
  const { active } = useDemo();
  if (!active) return null;
  return (
    <View pointerEvents="none" style={styles.ribbonWrap}>
      <View style={styles.ribbon}>
        <Text style={styles.ribbonText}>DEMO</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    backgroundColor: colors.accent,
    borderBottomWidth: 2,
    borderBottomColor: colors.accentShadow,
  },
  bannerText: { flex: 1 },
  title: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.ink },
  btn: {
    minHeight: 36,
    paddingHorizontal: space.sm,
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  pressed: { transform: [{ translateY: 2 }] },
  btnText: { fontFamily: fonts.headingBold, fontSize: 13, color: colors.accent },
  ribbonWrap: { position: "absolute", top: 0, right: 0, width: 120, height: 120, overflow: "hidden", zIndex: 50 },
  ribbon: {
    position: "absolute",
    top: 24,
    right: -36,
    width: 160,
    paddingVertical: 4,
    backgroundColor: colors.accent,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.ink,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
  },
  ribbonText: { fontFamily: fonts.headingBold, fontSize: 14, letterSpacing: 2, color: colors.ink },
});
