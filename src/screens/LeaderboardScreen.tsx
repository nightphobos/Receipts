import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Text } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { formatSigma } from "../core/ceremony";
import type { LeaderboardRow } from "../core/leaderboard";
import { formatHitRate } from "../core/share";
import { LEADERBOARD_MIN_DAYS, LEADERBOARD_MIN_N } from "../core/score";
import { LEADERBOARD_SOURCE, useLeaderboard } from "../hooks/useLeaderboard";
import { useAuthorization } from "../utils/useAuthorization";
import { ellipsify } from "../utils/ellipsify";
import { Chip, Loading, PixelButton, PixelPanel, Title, colors, fonts, space, useParallaxScroll } from "../theme";

type Board = "overall" | "skrDaily";

const EMPTY: Record<Board, string> = {
  overall: `No eligible callers yet. To appear: ${LEADERBOARD_MIN_N} scored calls of 24h or longer, on ${LEADERBOARD_MIN_DAYS} different UTC days, and a Seeker Genesis Token.`,
  skrDaily: "No SKR Daily calls scored yet. Seal the SKR Daily preset on the New tab (Seeker Genesis holders only).",
};

function Row({ row, me, onPress }: { row: LeaderboardRow; me: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, me && styles.rowMe]}>
      <Text style={styles.rank}>{`#${row.rank}`}</Text>
      <View style={styles.flex}>
        <Text style={styles.wallet}>{`${ellipsify(row.wallet, 4)}${me ? " (you)" : ""}`}</Text>
        <Text style={styles.muted}>
          {`N ${row.n} · ${row.hits}/${row.n} hits · ${formatHitRate(row.hitRate)} · ${row.forfeited} hidden`}
        </Text>
      </View>
      <Text style={styles.sigma}>{formatSigma(row.z).replace(" vs coin flip", "")}</Text>
    </Pressable>
  );
}

export function LeaderboardScreen() {
  const parallaxScroll = useParallaxScroll();
  const navigation = useNavigation();
  const { selectedAccount } = useAuthorization();
  const me = selectedAccount?.publicKey.toBase58();
  const query = useLeaderboard();
  const [board, setBoard] = useState<Board>("overall");
  const rows = query.data?.[board] ?? [];

  const header = (
    <View style={styles.header}>
      <Title>RANK</Title>
      <View style={styles.tabs}>
        <Chip label="OVERALL" selected={board === "overall"} onPress={() => setBoard("overall")} />
        <Chip label="SKR DAILY" icon="coin" selected={board === "skrDaily"} onPress={() => setBoard("skrDaily")} />
      </View>
      <Text style={styles.muted}>
        {board === "overall"
          ? "Ranked by z = (hits − misses) / √N over ≥24h calls. Misses include hidden (forfeited) calls."
          : "SKR Daily calls only (everyone shares the 12:00 UTC deadline)."}
      </Text>
      {query.data && (
        <Text style={styles.muted}>
          {`${query.data.wallets} callers · updated ${new Date(query.data.generatedAt * 1000).toLocaleString()} · ${
            LEADERBOARD_SOURCE === "site" ? "indexer site" : "computed on this phone from the registry"
          }`}
        </Text>
      )}
    </View>
  );

  return (
    <FlatList
      {...parallaxScroll}
      data={rows}
      keyExtractor={(r) => r.wallet}
      contentContainerStyle={styles.container}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />}
      renderItem={({ item }) => (
        <Row row={item} me={item.wallet === me} onPress={() => navigation.navigate("WalletProfile", { wallet: item.wallet })} />
      )}
      ListEmptyComponent={
        query.isLoading ? (
          <Loading caption={LEADERBOARD_SOURCE === "registry" ? "Reading every Receipts call from the registry…" : undefined} />
        ) : query.isError ? (
          <PixelPanel>
            <Text style={styles.text}>Couldn't load the leaderboard</Text>
            <Text style={styles.muted}>{query.error instanceof Error ? query.error.message : String(query.error)}</Text>
            <PixelButton label="Retry" variant="ghost" onPress={() => query.refetch()} />
          </PixelPanel>
        ) : (
          <PixelPanel>
            <Text style={styles.text}>{EMPTY[board]}</Text>
          </PixelPanel>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md, gap: space.sm },
  header: { gap: space.sm, marginBottom: space.sm },
  tabs: { flexDirection: "row", gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  rowMe: { borderColor: colors.accent },
  rank: { fontFamily: fonts.number, fontSize: 28, color: colors.accent, minWidth: 44 },
  wallet: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  sigma: { fontFamily: fonts.number, fontSize: 24, color: colors.text },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  muted: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12 },
  flex: { flex: 1 },
  gap: { marginTop: space.sm },
});
