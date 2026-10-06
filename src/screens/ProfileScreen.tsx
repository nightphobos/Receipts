import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

import { useAuthorization } from "../utils/useAuthorization";
import { ConnectButton } from "../components/sign-in/sign-in-ui";

/** Placeholder; hit-rate, share text and secrets export come in T015. */
export function ProfileScreen() {
  const { selectedAccount } = useAuthorization();
  return (
    <View style={styles.screenContainer}>
      <Text variant="titleLarge">Profile</Text>
      {selectedAccount ? (
        <Text selectable style={styles.gap}>{selectedAccount.publicKey.toBase58()}</Text>
      ) : (
        <View style={styles.gap}>
          <ConnectButton />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { padding: 16, flex: 1 },
  gap: { marginTop: 12 },
});
