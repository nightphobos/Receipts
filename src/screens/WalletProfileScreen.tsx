import React from "react";
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { formatChangePct, formatSigma } from "../core/ceremony";
import { formatUsd, solscanTxUrl } from "../core/format";
import type { ProfileReceipt } from "../core/leaderboard";
import { LEADERBOARD_MIN_DAYS, LEADERBOARD_MIN_N } from "../core/score";
import { formatHitRate, formatUtcDayTime } from "../core/share";
import { useWalletProfile } from "../hooks/useLeaderboard";
import { useCluster } from "../components/cluster/cluster-data-access";
import type { RootStackParamList } from "../navigators/AppNavigator";
import { PixelPanel, StatusStamp, colors, fonts, space, useParallaxScroll } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "WalletProfile">;

const HORIZON_LABEL: Record<ProfileReceipt["horizon"], string> = { "1h": "1h practice", "24h": "24h", "3d": "3d", "7d": "7d" };

function ReceiptLine({ r, onPress }: { r: ProfileReceipt; onPress: () => void }) {
  const dir = r.dir === "up" ? "▲" : r.dir === "down" ? "▼" : "██";
  const prices =
    r.p0 != null && r.pt != null
      ? `$${formatUsd(r.p0)} → $${formatUsd(r.pt)} (${formatChangePct(r.p0, r.pt)})`
      : r.p0 != null
        ? `P0 $${formatUsd(r.p0)}`
        : "";
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.receipt}>
      <View style={styles.flex}>
        <Text style={styles.text}>{`$${r.asset} ${dir} · ${r.skrDaily ? "SKR Daily" : HORIZON_LABEL[r.horizon]}`}</Text>
        <Text style={styles.muted}>{`by ${formatUtcDayTime(r.deadline)}${prices ? ` · ${prices}` : ""}`}</Text>
      </View>
      <StatusStamp status={r.status} tilt={false} />
    </Pressable>
  );
}

/** Read-only profile of any wallet (from the leaderboard). Directions stay hidden until revealed. */
export function WalletProfileScreen({ route }: Props) {
  const { wallet } = route.params;
  const parallaxScroll = useParallaxScroll();
  const { selectedCluster } = useCluster();
  const query = useWalletProfile(wallet);
  const p = query.data;

  const header = (
    <View style={styles.header}>
      <Text selectable style={styles.wallet}>{wallet}</Text>
      {p && (
        <PixelPanel>
          <Text style={styles.sigma}>{formatSigma(p.leaderboardStats.z)}</Text>
          <Text style={styles.muted}>
            {`Leaderboard (≥24h): N ${p.leaderboardStats.n} · ${p.leaderboardStats.hits} hits · ${p.leaderboardStats.misses} misses · hit-rate ${formatHitRate(p.leaderboardStats.hitRate)}`}
          </Text>
          <Text style={styles.text}>{`hidden & forfeited: ${p.stats.forfeited}`}</Text>
          {p.stats.overlaps > 0 && <Text style={styles.text}>{`overlapping calls: ${p.stats.overlaps}`}</Text>}
          <Text style={styles.text}>{`streak: ${p.streak} day${p.streak === 1 ? "" : "s"}`}</Text>
          <Text style={styles.muted}>
            {`All calls incl. 1h practice: N ${p.stats.n} · ${formatSigma(p.stats.z)} · void ${p.stats.voids} · pending ${p.stats.pending}`}
          </Text>
          <Text style={styles.muted}>
            {`${p.eligibility.eligible ? "Eligible" : "Not eligible yet"} · ${p.eligibility.n}/${LEADERBOARD_MIN_N} calls · ${p.eligibility.days}/${LEADERBOARD_MIN_DAYS} days · Genesis ${p.hasGenesis ? "✓" : "✕"}`}
          </Text>
        </PixelPanel>
      )}
    </View>
  );

  return (
    <FlatList
      {...parallaxScroll}
      data={p?.receipts ?? []}
      keyExtractor={(r) => r.hash}
      contentContainerStyle={styles.container}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
      renderItem={({ item }) => (
        <ReceiptLine
          r={item}
          onPress={() => Linking.openURL(solscanTxUrl(item.revealSignature ?? item.commitSignature, selectedCluster.network))}
        />
      )}
      ListEmptyComponent={
        query.isLoading ? (
          <ActivityIndicator style={styles.gap} />
        ) : query.isError ? (
          <PixelPanel>
            <Text style={styles.text}>Couldn't load this profile</Text>
            <Text style={styles.muted}>{query.error instanceof Error ? query.error.message : String(query.error)}</Text>
            <Button onPress={() => query.refetch()}>Retry</Button>
          </PixelPanel>
        ) : (
          <PixelPanel>
            <Text style={styles.text}>No Receipts calls on record for this wallet.</Text>
          </PixelPanel>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md, gap: space.sm },
  header: { gap: space.sm, marginBottom: space.sm },
  wallet: { fontFamily: fonts.heading, fontSize: 14, color: colors.text },
  sigma: { fontFamily: fonts.headingBold, fontSize: 24, color: colors.accent },
  receipt: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  text: { color: colors.text },
  muted: { color: colors.textMuted, fontSize: 12 },
  flex: { flex: 1 },
  gap: { marginTop: space.lg },
});
