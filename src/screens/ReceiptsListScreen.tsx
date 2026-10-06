import React from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import { useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { describeCall, formatCountdown, formatUsd } from "../core/format";
import { REVEAL_GRACE_SEC, statusOf, type Status } from "../core/score";
import { useReceipts, type ReceiptRow } from "../hooks/useReceipts";
import { useNowSec } from "../hooks/useNow";
import { StatusChip } from "../components/receipt/status-chip";
import { ConnectButton } from "../components/sign-in/sign-in-ui";
import { useAuthorization } from "../utils/useAuthorization";
import type { RootStackParamList } from "../navigators/AppNavigator";
import type { HomeTabParamList } from "../navigators/HomeNavigator";

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<HomeTabParamList, "Home">,
  NativeStackNavigationProp<RootStackParamList>
>;

function statusLine(row: ReceiptRow, status: Status, now: number): string {
  const { receipt } = row;
  switch (status) {
    case "sealed":
      return `Reveal opens in ${formatCountdown(receipt.deadline - now)}`;
    case "awaiting_reveal":
      return row.hasSecret
        ? `Reveal within ${formatCountdown(receipt.deadline + REVEAL_GRACE_SEC - now)}`
        : `No secret on this phone — forfeits in ${formatCountdown(receipt.deadline + REVEAL_GRACE_SEC - now)}`;
    case "forfeited":
      return "Not revealed in time — counts as a miss";
    case "unresolved":
      return now < receipt.deadline ? "Revealed early — waiting for deadline" : "Waiting for Pyth price";
    case "hit":
    case "miss":
      return `Pyth at deadline: $${formatUsd(receipt.priceAtDeadline as number)}`;
  }
}

function ReceiptItem({ row, now, onPress }: { row: ReceiptRow; now: number; onPress: () => void }) {
  const status = statusOf(row.receipt, now);
  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content>
        <View style={styles.row}>
          <Text variant="titleMedium" style={styles.title}>
            {row.call ? describeCall(row.call) : "Hidden call"}
          </Text>
          <StatusChip status={status} />
        </View>
        <Text variant="bodyMedium" style={styles.gapSmall}>{statusLine(row, status, now)}</Text>
        <Text variant="bodySmall" style={styles.muted}>
          {`Deadline ${new Date(row.receipt.deadline * 1000).toLocaleString()}`}
        </Text>
      </Card.Content>
    </Card>
  );
}

export function ReceiptsListScreen() {
  const { selectedAccount } = useAuthorization();
  const navigation = useNavigation<Nav>();
  const receipts = useReceipts(selectedAccount?.publicKey);
  const now = useNowSec();

  if (!selectedAccount) {
    return (
      <View style={styles.screenContainer}>
        <Text variant="displaySmall" style={styles.bold}>Receipts</Text>
        <Text style={styles.gap}>
          Seal crypto price calls on Solana now, reveal them after the deadline, and get scored against Pyth.
          Unrevealed calls count as misses — your hit-rate can't be cleaned up.
        </Text>
        <View style={styles.gap}>
          <ConnectButton />
        </View>
      </View>
    );
  }

  if (receipts.isLoading) {
    return (
      <View style={[styles.screenContainer, styles.center]}>
        <ActivityIndicator />
        <Text style={styles.gap}>Reading your receipts from chain…</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={receipts.data ?? []}
      keyExtractor={(r) => r.receipt.hash}
      renderItem={({ item }) => (
        <ReceiptItem
          row={item}
          now={now}
          onPress={() =>
            navigation.navigate("ReceiptDetail", {
              hash: item.receipt.hash,
              signature: item.receipt.commit.signature,
            })
          }
        />
      )}
      refreshControl={
        <RefreshControl refreshing={receipts.isRefetching} onRefresh={() => receipts.refetch()} />
      }
      ListHeaderComponent={
        receipts.isError ? (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall">Couldn't load receipts</Text>
              <Text variant="bodySmall">
                {receipts.error instanceof Error ? receipts.error.message : String(receipts.error)}
              </Text>
            </Card.Content>
            <Card.Actions>
              <Button onPress={() => receipts.refetch()}>Retry</Button>
            </Card.Actions>
          </Card>
        ) : null
      }
      ListEmptyComponent={
        receipts.isError ? null : (
          <View style={styles.center}>
            <Text variant="titleMedium" style={styles.gap}>No receipts yet</Text>
            <Text style={styles.gapSmall}>Seal your first price call. Pull down to refresh.</Text>
            <Button style={styles.gap} mode="contained" icon="lock-plus" onPress={() => navigation.navigate("New")}>
              Seal a call
            </Button>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  screenContainer: { padding: 16, flex: 1 },
  list: { padding: 16, flexGrow: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  card: { marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1, marginRight: 8 },
  bold: { fontWeight: "bold" },
  gap: { marginTop: 12 },
  gapSmall: { marginTop: 6 },
  muted: { marginTop: 2, opacity: 0.7 },
});
