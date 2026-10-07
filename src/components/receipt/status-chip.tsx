import React from "react";
import { StyleSheet } from "react-native";
import { Chip } from "react-native-paper";

import type { StatusV2 } from "../../core/score";

export const STATUS_META: Record<StatusV2, { label: string; color: string; icon: string }> = {
  sealed: { label: "Sealed", color: "#3B6FD8", icon: "lock" },
  awaiting_reveal: { label: "Reveal now", color: "#D98E04", icon: "lock-open-alert" },
  unresolved: { label: "Unresolved", color: "#7A7A7A", icon: "timer-sand" },
  hit: { label: "HIT", color: "#1E9E5A", icon: "check-circle" },
  miss: { label: "MISS", color: "#D03B3B", icon: "close-circle" },
  forfeited: { label: "Forfeited", color: "#8B1E1E", icon: "flag-remove" },
  void: { label: "VOID", color: "#5F6B7A", icon: "equal" },
  overlap: { label: "Overlap · MISS", color: "#8B1E1E", icon: "layers-remove" },
  legacy: { label: "Legacy", color: "#9E9E9E", icon: "archive" },
};

export function StatusChip({ status }: { status: StatusV2 }) {
  const meta = STATUS_META[status];
  return (
    <Chip
      compact
      icon={meta.icon}
      style={[styles.chip, { backgroundColor: meta.color }]}
      textStyle={styles.text}
      selectedColor="#FFFFFF"
    >
      {meta.label}
    </Chip>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: "flex-start" },
  text: { color: "#FFFFFF", fontWeight: "bold" },
});
