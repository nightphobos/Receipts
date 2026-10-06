import React from "react";
import { StyleSheet } from "react-native";
import { Chip } from "react-native-paper";

/** Shown on every price / HIT / MISS surface while the mock price source is active. */
export function DemoBadge() {
  return (
    <Chip compact icon="alert" style={styles.chip} textStyle={styles.text} selectedColor="#111827">
      DEMO PRICES
    </Chip>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: "flex-start", backgroundColor: "#FACC15" },
  text: { color: "#111827", fontWeight: "bold" },
});
