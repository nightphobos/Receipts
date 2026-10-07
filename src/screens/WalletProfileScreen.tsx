import React, { useCallback, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { PublicKey } from "@solana/web3.js";

import { formatChangePct, formatSigma } from "../core/ceremony";
import { formatUsd, solscanTxUrl } from "../core/format";
import { isDemoSignature } from "../core/demoData";
import type { ProfileReceipt } from "../core/leaderboard";
import { LEADERBOARD_MIN_DAYS, LEADERBOARD_MIN_N } from "../core/score";
import { formatHitRate, formatUtcDayTime } from "../core/share";
import { useWalletProfile } from "../hooks/useLeaderboard";
import { SKR_GATE_MIN, TIP_AMOUNTS, canTip } from "../core/tip";
import { tippedLine } from "../core/tips";
import { isDemoActive } from "../demo/store";
import { SeekerBadge, SkrHolderBadge } from "../components/receipt/seeker-badge";
import { isUserRejection } from "../chain/seal";
import { buildTipTransaction } from "../chain/tipTx";
import { ClusterNetwork, useCluster } from "../components/cluster/cluster-data-access";
import { showToast } from "../components/ui/toast";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useConnection } from "../utils/ConnectionProvider";
import { alertAndLog } from "../utils/alertAndLog";
import type { RootStackParamList } from "../navigators/AppNavigator";
import { Loading, PixelButton, PixelIcon, PixelPanel, StatusStamp, colors, fonts, space, useParallaxScroll } from "../theme";

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

/** Tip 10/50/100 SKR: a direct wallet→wallet SPL transfer the tipper approves in their wallet (mainnet only). */
function TipPanel({ recipient }: { recipient: string }) {
  const { selectedAccount } = useAuthorization();
  const { connection } = useConnection();
  const { selectedCluster } = useCluster();
  const wallet = useMobileWallet();
  const [sending, setSending] = useState<number | null>(null);
  const me = selectedAccount?.publicKey.toBase58();

  const onTip = useCallback(
    async (amount: number) => {
      if (!selectedAccount) return;
      setSending(amount);
      try {
        const { context, value } = await connection.getLatestBlockhashAndContext();
        const tx = buildTipTransaction({
          from: selectedAccount.publicKey,
          to: new PublicKey(recipient),
          amount,
          recentBlockhash: value.blockhash,
        });
        const sig = await wallet.signAndSendTransaction(tx, context.slot);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(isDemoActive() ? `Demo: simulated tip of ${amount} SKR — nothing was sent` : `Tipped ${amount} SKR`);
        console.log(`tip ${amount} SKR → ${recipient}: ${sig}`);
      } catch (e) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (isUserRejection(e)) showToast("Tip cancelled, nothing was sent.");
        else if (e instanceof Error && e.message.startsWith("Demo mode")) showToast("Demo mode — no SKR was sent");
        else alertAndLog("Tip failed", e instanceof Error ? e.message : String(e));
      } finally {
        setSending(null);
      }
    },
    [selectedAccount, connection, wallet, recipient],
  );

  if (selectedCluster.network !== ClusterNetwork.Mainnet) return null;
  if (!canTip(me, recipient)) {
    return me ? null : <Text style={styles.muted}>Connect a wallet to tip this caller in SKR.</Text>;
  }
  return (
    <PixelPanel>
      <Text style={styles.text}>Tip this caller in SKR</Text>
      <Text style={styles.muted}>Straight from your wallet to theirs. Receipts never holds funds.</Text>
      <View style={styles.tipRow}>
        {TIP_AMOUNTS.map((amount) => (
          <PixelButton
            key={amount}
            label={sending === amount ? "…" : `${amount} SKR`}
            variant="ghost"
            disabled={sending !== null}
            onPress={() => onTip(amount)}
            style={styles.flex}
            accessibilityLabel={`Tip ${amount} SKR`}
          />
        ))}
      </View>
    </PixelPanel>
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
      {p && (p.hasGenesis || p.skrHolder) && (
        <View style={styles.row}>
          {p.hasGenesis && <SeekerBadge />}
          {p.skrHolder && <SkrHolderBadge />}
        </View>
      )}
      <TipPanel recipient={wallet} />
      {p && (
        <PixelPanel>
          <Text style={styles.sigma}>{formatSigma(p.leaderboardStats.z)}</Text>
          <Text style={styles.muted}>
            {`Leaderboard (≥24h): N ${p.leaderboardStats.n} · ${p.leaderboardStats.hits} hits · ${p.leaderboardStats.misses} misses · hit-rate ${formatHitRate(p.leaderboardStats.hitRate)}`}
          </Text>
          <Text style={styles.text}>{`hidden & forfeited: ${p.stats.forfeited}`}</Text>
          {p.stats.overlaps > 0 && <Text style={styles.text}>{`overlapping calls: ${p.stats.overlaps}`}</Text>}
          <Text style={styles.text}>{`streak: ${p.streak} day${p.streak === 1 ? "" : "s"}`}</Text>
          <View style={styles.row}>
            <PixelIcon name="flame" scale={1.5} color={colors.accent} />
            <Text style={styles.text}>
              {`SKR Daily streak: ${p.skrDailyStreak} day${p.skrDailyStreak === 1 ? "" : "s"} · best ${p.bestSkrDailyStreak}`}
            </Text>
          </View>
          {tippedLine(p.tips) && (
            <View style={styles.row}>
              <PixelIcon name="coin" scale={1.5} color={colors.accent} />
              <Text style={styles.text}>{tippedLine(p.tips)}</Text>
            </View>
          )}
          <Text style={styles.muted}>
            {`All calls incl. 1h practice: N ${p.stats.n} · ${formatSigma(p.stats.z)} · void ${p.stats.voids} · pending ${p.stats.pending}`}
          </Text>
          <Text style={styles.muted}>
            {`${p.eligibility.eligible ? "Eligible" : "Not eligible yet"} · ${p.eligibility.n} calls (need ${LEADERBOARD_MIN_N}) · ${p.eligibility.days} days (need ${LEADERBOARD_MIN_DAYS}) · Genesis ${p.hasGenesis ? "✓" : "✕"} or SKR ≥ ${SKR_GATE_MIN} ${p.skrHolder ? "✓" : "✕"}`}
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
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />}
      renderItem={({ item }) => (
        <ReceiptLine
          r={item}
          onPress={() => {
            const sig = item.revealSignature ?? item.commitSignature;
            if (isDemoSignature(sig)) showToast("Demo: simulated tx — nothing is on Solana");
            else Linking.openURL(solscanTxUrl(sig, selectedCluster.network));
          }}
        />
      )}
      ListEmptyComponent={
        query.isLoading ? (
          <Loading style={styles.gap} />
        ) : query.isError ? (
          <PixelPanel>
            <Text style={styles.text}>Couldn't load this profile</Text>
            <Text style={styles.muted}>{query.error instanceof Error ? query.error.message : String(query.error)}</Text>
            <PixelButton label="Retry" variant="ghost" onPress={() => query.refetch()} />
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
  sigma: { fontFamily: fonts.number, fontSize: 36, color: colors.accent },
  receipt: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  muted: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12 },
  flex: { flex: 1 },
  tipRow: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
  gap: { marginTop: space.lg },
});
