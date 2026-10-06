import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../navigators/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "ReceiptDetail">;

/** Minimal detail view; full detail (links, reveal, resolution) comes in T014. */
export function ReceiptDetailScreen({ route }: Props) {
  const { hash, signature } = route.params;
  return (
    <View style={styles.screenContainer}>
      <Text variant="titleLarge">Receipt sealed</Text>
      <Text variant="labelLarge" style={styles.gap}>Commit hash</Text>
      <Text selectable>{hash}</Text>
      {signature && (
        <>
          <Text variant="labelLarge" style={styles.gap}>Transaction</Text>
          <Text selectable>{signature}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    padding: 16,
    flex: 1,
  },
  gap: {
    marginTop: 12,
  },
});
