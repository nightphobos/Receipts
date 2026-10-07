import React, { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Text } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { formatSigma } from "../core/ceremony";
import { byStreak, type LeaderboardRow } from "../core/leaderboard";
import { SKR_GATE_MIN } from "../core/tip";
import { formatSkr, type AppreciatedRow } from "../core/tips";
import { formatHitRate } from "../core/share";
import { LEADERBOARD_MIN_DAYS, LEADERBOARD_MIN_N } from "../core/score";
import { LEADERBOARD_SOURCE, useLeaderboard } from "../hooks/useLeaderboard";
import { useAuthorization } from "../utils/useAuthorization";
import { ellipsify } from "../utils/ellipsify";
import { Chip, Loading, PixelButton, PixelPanel, Title, colors, fonts, space, useParallaxScroll } from "../theme";

type Board = "overall" | "skrDaily" | "appreciated";
type DailySort = "sigma" | "streak";

const GATE = `a Seeker Genesis Token or ≥ ${SKR_GATE_MIN} SKR`;
const EMPTY: Record<Board, string> = {
  overall: `No eligible callers yet. To appear: ${LEADERBOARD_MIN_N} scored calls of 24h or longer, on ${LEADERBOARD_MIN_DAYS} different UTC days, and ${GATE}.`,
  skrDaily: `No SKR Daily calls scored yet. Seal the SKR Daily preset on the New tab (needs ${GATE}).`,
  appreciated: "No SKR tips yet. Open a caller's profile to tip them straight from your wallet.",
};

const NOTE: Record<Board, string> = {
  overall: "Ranked by z = (hits − misses) / √N over ≥24h calls. Misses include hidden (forfeited) calls.",
  skrDaily: "SKR Daily calls only (everyone shares the 12:00 UTC deadline). Streak = days in a row with the SKR Daily sealed and not forfeited.",
  appreciated: "Most SKR received as tips through Receipts (memo rcpt:2:t: + registry tag). Wallet → wallet, never held by the app.",
};

type Item = { kind: "row"; row: LeaderboardRow } | { kind: "tip"; row: AppreciatedRow; rank: number };

function Row({ row, me, streak, onPress }: { row: LeaderboardRow; me: boolean; streak: boolean; onPress: () => void }) {
  const tips = row.tipsSkr > 0 ? ` · ${formatSkr(row.tipsSkr)} SKR tips` : "";
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, me && styles.rowMe]}>
      <Text style={styles.rank}>{`#${row.rank}`}</Text>
      <View style={styles.flex}>
        <Text style={styles.wallet}>{`${ellipsify(row.wallet, 4)}${me ? " (you)" : ""}`}</Text>
        <Text style={styles.muted}>
          {`N ${row.n} · ${row.hits}/${row.n} hits · ${formatHitRate(row.hitRate)} · ${row.forfeited} hidden${tips}`}
        </Text>
        {row.bestStreak !== undefined && (
          <Text style={styles.muted}>{`🔥 ${row.streak} day${row.streak === 1 ? "" : "s"} · best ${row.bestStreak}`}</Text>
        )}
      </View>
      <Text style={styles.sigma}>
        {streak ? `🔥${row.streak}` : formatSigma(row.z).replace(" vs coin flip", "")}
      </Text>
    </Pressable>
  );
}

function TipRow({ row, rank, me, onPress }: { row: AppreciatedRow; rank: number; me: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, me && styles.rowMe]}>
      <Text style={styles.rank}>{`#${rank}`}</Text>
      <View style={styles.flex}>
        <Text style={styles.wallet}>{`${ellipsify(row.wallet, 4)}${me ? " (you)" : ""}`}</Text>
        <Text style={styles.muted}>{`by ${row.tippers} ${row.tippers === 1 ? "person" : "people"}`}</Text>
      </View>
      <Text style={styles.sigma}>{`${formatSkr(row.tipsSkr)} SKR`}</Text>
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
  const [dailySort, setDailySort] = useState<DailySort>("sigma");
  const items = useMemo((): Item[] => {
    const lb = query.data;
    if (!lb) return [];
    if (board === "appreciated") return lb.appreciated.map((row, i) => ({ kind: "tip", row, rank: i + 1 }));
    const rows = board === "skrDaily" && dailySort === "streak" ? byStreak(lb.skrDaily) : lb[board];
    return rows.map((row) => ({ kind: "row", row }));
  }, [query.data, board, dailySort]);
  const open = (wallet: string) => navigation.navigate("WalletProfile", { wallet });

  const header = (
    <View style={styles.header}>
      <Title>RANK</Title>
      <View style={styles.tabs}>
        <Chip label="OVERALL" selected={board === "overall"} onPress={() => setBoard("overall")} />
        <Chip label="SKR DAILY" icon="coin" selected={board === "skrDaily"} onPress={() => setBoard("skrDaily")} />
        <Chip label="MOST TIPPED" selected={board === "appreciated"} onPress={() => setBoard("appreciated")} />
      </View>
      {board === "skrDaily" && (
        <View style={styles.tabs}>
          <Chip label="BY σ" selected={dailySort === "sigma"} onPress={() => setDailySort("sigma")} />
          <Chip label="BY STREAK" icon="flame" selected={dailySort === "streak"} onPress={() => setDailySort("streak")} />
        </View>
      )}
      <Text style={styles.muted}>{NOTE[board]}</Text>
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
      data={items}
      keyExtractor={(it) => it.row.wallet}
      contentContainerStyle={styles.container}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />}
      renderItem={({ item }) =>
        item.kind === "tip" ? (
          <TipRow row={item.row} rank={item.rank} me={item.row.wallet === me} onPress={() => open(item.row.wallet)} />
        ) : (
          <Row
            row={item.row}
            me={item.row.wallet === me}
            streak={board === "skrDaily" && dailySort === "streak"}
            onPress={() => open(item.row.wallet)}
          />
        )
      }
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
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
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
