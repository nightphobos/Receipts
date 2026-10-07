import React from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { describeCall, describeCallV2, formatCountdown, formatUsd } from "../core/format";
import { formatChangePct } from "../core/ceremony";
import { SOURCE_LABEL, isDemo, type PriceSourceKind } from "../core/price";
import { REVEAL_GRACE_SEC, statusOf, statusOfV2, type Status, type StatusV2 } from "../core/score";
import { useReceipts, useReceiptsV2, type ReceiptRow, type ReceiptRowV2 } from "../hooks/useReceipts";
import { useNowSec } from "../hooks/useNow";
import { usePriceSource } from "../hooks/usePriceSource";
import { DemoBadge } from "../components/receipt/demo-badge";
import { ConnectButton } from "../components/sign-in/sign-in-ui";
import { useAuthorization } from "../utils/useAuthorization";
import type { RootStackParamList } from "../navigators/AppNavigator";
import type { HomeTabParamList } from "../navigators/HomeNavigator";
import {
  Body,
  Heading,
  Loading,
  MascotDialog,
  Muted,
  PixelButton,
  PixelCard,
  PixelPanel,
  StatusStamp,
  Title,
  colors,
  space,
  useParallaxScroll,
} from "../theme";

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<HomeTabParamList, "Home">,
  NativeStackNavigationProp<RootStackParamList>
>;

function statusLine(row: ReceiptRow, status: Status, now: number, src: PriceSourceKind): string {
  const { name, quote } = SOURCE_LABEL[src];
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
      return now < receipt.deadline
        ? "Revealed early — waiting for deadline"
        : `Waiting for ${name} price`;
    case "hit":
    case "miss":
      return `${name} at deadline: ${formatUsd(receipt.priceAtDeadline as number)} ${quote}`;
  }
}

function ReceiptItem({ row, now, onPress }: { row: ReceiptRow; now: number; onPress: () => void }) {
  const status = statusOf(row.receipt, now);
  const priceSource = usePriceSource();
  const demo = row.call !== null && isDemo(priceSource, row.call.asset);
  const src: PriceSourceKind = row.call !== null ? priceSource.kindOf(row.call.asset) : "pyth";
  return (
    <PixelCard style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <Heading style={styles.title}>{row.call ? describeCall(row.call) : "Hidden call"}</Heading>
        <StatusStamp status={status} tilt={false} />
      </View>
      <Muted>LEGACY v1</Muted>
      {demo && (status === "hit" || status === "miss") && <DemoBadge />}
      <Body>{statusLine(row, status, now, src)}</Body>
      <Muted>{`Deadline ${new Date(row.receipt.deadline * 1000).toLocaleString()}`}</Muted>
    </PixelCard>
  );
}

function statusLineV2(row: ReceiptRowV2, status: StatusV2, now: number): string {
  const { receipt } = row;
  const p0 = receipt.p0 != null ? `P0 $${formatUsd(receipt.p0)} · ` : "";
  switch (status) {
    case "sealed":
      return `${p0}reveal opens in ${formatCountdown(receipt.deadline - now)}`;
    case "awaiting_reveal":
      return `${p0}reveal within ${formatCountdown(receipt.deadline + REVEAL_GRACE_SEC - now)}`;
    case "forfeited":
      return "Not revealed in time — counts as a miss";
    case "overlap":
      return "Overlapping call — counts as a miss";
    case "unresolved":
      return "Waiting for prices";
    case "legacy":
      return "Legacy receipt";
    case "hit":
    case "miss":
    case "void": {
      const p0v = receipt.p0 as number;
      const ptv = receipt.pt as number;
      const line = `P0 $${formatUsd(p0v)} → PT $${formatUsd(ptv)} (${formatChangePct(p0v, ptv)})`;
      return status === "void" ? `${line} · VOID, not counted` : line;
    }
  }
}

function ReceiptItemV2({ row, now, onPress }: { row: ReceiptRowV2; now: number; onPress: () => void }) {
  const status = statusOfV2(row.receipt, now);
  const priceSource = usePriceSource();
  const demo = isDemo(priceSource, row.receipt.asset);
  const horizon = row.receipt.horizon === "1h" ? "1h practice" : row.receipt.horizon;
  return (
    <PixelCard style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <Heading style={styles.title}>
          {`$${row.call ? describeCallV2(row.call) : row.receipt.asset} · ${horizon}`}
        </Heading>
        <StatusStamp
          status={status}
          tilt={false}
          countdown={status === "sealed" ? formatCountdown(row.receipt.deadline - now) : undefined}
        />
      </View>
      {demo && (status === "hit" || status === "miss" || status === "void") && <DemoBadge />}
      <Body>{statusLineV2(row, status, now)}</Body>
      <Muted>{`Deadline ${new Date(row.receipt.deadline * 1000).toLocaleString()}`}</Muted>
    </PixelCard>
  );
}

type ListRow = { v: 1; row: ReceiptRow } | { v: 2; row: ReceiptRowV2 };

export function ReceiptsListScreen() {
  const { selectedAccount } = useAuthorization();
  const navigation = useNavigation<Nav>();
  const parallaxScroll = useParallaxScroll();
  const legacy = useReceipts(selectedAccount?.publicKey);
  const receiptsV2 = useReceiptsV2(selectedAccount?.publicKey);
  const now = useNowSec();
  const receipts = {
    isLoading: legacy.isLoading || receiptsV2.isLoading,
    isRefetching: legacy.isRefetching || receiptsV2.isRefetching,
    isError: legacy.isError || receiptsV2.isError,
    error: legacy.error ?? receiptsV2.error,
    refetch: () => {
      legacy.refetch();
      receiptsV2.refetch();
    },
  };
  const rows: ListRow[] = [
    ...(receiptsV2.data ?? []).map((row): ListRow => ({ v: 2, row })),
    ...(legacy.data ?? []).map((row): ListRow => ({ v: 1, row })),
  ].sort((a, b) => b.row.receipt.commit.blockTime - a.row.receipt.commit.blockTime);

  if (!selectedAccount) {
    return (
      <View style={styles.screenContainer}>
        <Title>RECEIPTS</Title>
        <MascotDialog pose="print" text="Seal a price call now, reveal it after the deadline. Hide it and it counts as a miss." />
        <PixelPanel>
          <Body>
            Seal crypto price calls on Solana now, reveal them after the deadline, and get scored against Pyth.
            Unrevealed calls count as misses — your hit-rate can't be cleaned up.
          </Body>
        </PixelPanel>
        <ConnectButton />
      </View>
    );
  }

  if (receipts.isLoading) {
    return (
      <View style={[styles.screenContainer, styles.center]}>
        <Loading caption="Reading your receipts from chain…" />
      </View>
    );
  }

  return (
    <FlatList
      {...parallaxScroll}
      contentContainerStyle={styles.list}
      data={rows}
      keyExtractor={(r) => r.row.receipt.hash}
      renderItem={({ item }) => {
        const onPress = () =>
          navigation.navigate("ReceiptDetail", {
            hash: item.row.receipt.hash,
            signature: item.row.receipt.commit.signature,
          });
        return item.v === 2 ? (
          <ReceiptItemV2 row={item.row} now={now} onPress={onPress} />
        ) : (
          <ReceiptItem row={item.row} now={now} onPress={onPress} />
        );
      }}
      refreshControl={
        <RefreshControl
          refreshing={receipts.isRefetching}
          onRefresh={() => receipts.refetch()}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.surface}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.row}>
            <Title>RECEIPTS</Title>
            <PixelButton label="MY STATS" icon="trophy" variant="ghost" onPress={() => navigation.navigate("Profile")} />
          </View>
          {receipts.isError ? (
            <PixelPanel title="COULDN'T LOAD RECEIPTS">
              <Muted>{receipts.error instanceof Error ? receipts.error.message : String(receipts.error)}</Muted>
              <PixelButton label="Retry" variant="ghost" onPress={() => receipts.refetch()} />
            </PixelPanel>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        receipts.isError ? null : (
          <View style={styles.empty}>
            <MascotDialog pose="idle" text="No receipts yet. Feed me your first price call! Pull down to refresh." />
            <PixelButton label="SEAL A CALL" icon="lock" big onPress={() => navigation.navigate("New")} />
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  screenContainer: { padding: space.md, flex: 1, gap: space.md },
  list: { padding: space.md, flexGrow: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  header: { gap: space.sm, marginBottom: space.md },
  card: { marginBottom: space.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  title: { flex: 1 },
  empty: { gap: space.md },
});
