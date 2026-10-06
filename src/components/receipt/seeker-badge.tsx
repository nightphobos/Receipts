import React from "react";
import { StyleSheet } from "react-native";
import { Chip } from "react-native-paper";

/** Shown in Profile when the connected wallet holds a Seeker Genesis Token. */
export function SeekerBadge() {
  return (
    <Chip compact icon="check-decagram" style={styles.chip} textStyle={styles.text} selectedColor="#FFFFFF">
      Seeker verified
    </Chip>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: "flex-start", backgroundColor: "#7C3AED" },
  text: { color: "#FFFFFF", fontWeight: "bold" },
});
