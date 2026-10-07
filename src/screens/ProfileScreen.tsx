import React, { useMemo } from "react";
import { appNowSec, isDemoActive } from "../demo/store";
import { demoShareText } from "../core/demoData";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";

import { formatSigma } from "../core/ceremony";
import { LEADERBOARD_MIN_DAYS, LEADERBOARD_MIN_N, eligibility, stats, statsV2, streak } from "../core/score";
import { formatHitRate, shareText } from "../core/share";
import { skrDailyStreak } from "../core/leaderboard";
import { SKR_GATE_MIN, isSkrHolder } from "../core/tip";
import { tippedLine } from "../core/tips";
import { exportAll } from "../storage/secrets";
import { useReceipts, useReceiptsV2 } from "../hooks/useReceipts";
import { useNowSec } from "../hooks/useNow";
import { usePriceSource } from "../hooks/usePriceSource";
import { DemoBadge } from "../components/receipt/demo-badge";
import { SeekerBadge, SkrHolderBadge } from "../components/receipt/seeker-badge";
import { useSeekerGenesis } from "../hooks/useSeekerGenesis";
import { useSkrBalance } from "../hooks/useSkrBalance";
import { useWalletProfile } from "../hooks/useLeaderboard";
import { useCluster } from "../components/cluster/cluster-data-access";
import { ConnectButton } from "../components/sign-in/sign-in-ui";
import { useAuthorization } from "../utils/useAuthorization";
import { alertAndLog } from "../utils/alertAndLog";
import { ellipsify } from "../utils/ellipsify";
import { showToast } from "../components/ui/toast";
import {
  Badge,
  Body,
  Loading,
  Muted,
  Num,
  PixelButton,
  PixelIcon,
  PixelPanel,
  Title,
  colors,
  fonts,
  space,
  useParallaxScroll,
} from "../theme";

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statBox}>
      <Num style={styles.statValue}>{value}</Num>
      <Muted>{label}</Muted>
    </View>
  );
}

export function ProfileScreen() {
  const parallaxScroll = useParallaxScroll();
  const { selectedAccount } = useAuthorization();
  const { selectedCluster } = useCluster();
  const demo = usePriceSource().kind === "mock";
  const legacyQuery = useReceipts(selectedAccount?.publicKey);
  const v2Query = useReceiptsV2(selectedAccount?.publicKey);
  const genesis = useSeekerGenesis(selectedAccount?.publicKey);
  const skr = useSkrBalance(selectedAccount?.publicKey);
  const holder = skr.data != null && isSkrHolder(skr.data);
  const tipped = tippedLine(useWalletProfile(selectedAccount?.publicKey.toBase58()).data?.tips);
  const now = useNowSec();

  const receipts = {
    isLoading: legacyQuery.isLoading || v2Query.isLoading,
    isRefetching: legacyQuery.isRefetching || v2Query.isRefetching,
    isError: legacyQuery.isError || v2Query.isError,
    error: legacyQuery.error ?? v2Query.error,
    refetch: () => {
      legacyQuery.refetch();
      v2Query.refetch();
    },
  };
  const list = useMemo(() => (legacyQuery.data ?? []).map((r) => r.receipt), [legacyQuery.data]);
  const s = useMemo(() => stats(list, now), [list, now]);
  const listV2 = useMemo(() => (v2Query.data ?? []).map((r) => r.receipt), [v2Query.data]);
  const s2 = useMemo(() => statsV2(listV2, now), [listV2, now]);
  const days = useMemo(() => streak(listV2, now), [listV2, now]);
  const skrDays = useMemo(() => skrDailyStreak(listV2, now), [listV2, now]);
  const elig = useMemo(
    () => eligibility(listV2, now, genesis.data === true, holder),
    [listV2, now, genesis.data, holder],
  );

  const copyShareText = async () => {
    const text = shareText(list, appNowSec(), selectedCluster.network, { demo });
    await Clipboard.setStringAsync(isDemoActive() ? demoShareText(text) : text);
    showToast("Share text copied");
  };

  const exportSecrets = async () => {
    try {
      const entries = await exportAll(AsyncStorage);
      if (entries.length === 0) {
        alertAndLog("Nothing to export", "There are no reveal secrets stored on this phone.");
        return;
      }
      await Clipboard.setStringAsync(JSON.stringify(entries));
      showToast(`${entries.length} secret${entries.length === 1 ? "" : "s"} copied — keep them private`);
    } catch (e) {
      alertAndLog("Export failed", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView
      {...parallaxScroll}
      contentContainerStyle={styles.screenContainer}
      refreshControl={
        <RefreshControl
          refreshing={receipts.isRefetching}
          onRefresh={() => {
            receipts.refetch();
            genesis.refetch();
            skr.refetch();
          }}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      <View style={styles.row}>
        <Title>MY STATS</Title>
        <Badge label={selectedCluster.name.toUpperCase()} color={colors.border} textColor={colors.text} />
      </View>

      {selectedAccount ? (
        <View style={styles.walletRow}>
          <Muted selectable>{ellipsify(selectedAccount.publicKey.toBase58(), 8)}</Muted>
          <View style={styles.badges}>
            {genesis.data === true && <SeekerBadge />}
            {holder && <SkrHolderBadge />}
          </View>
        </View>
      ) : (
        <>
          <Body>Connect a wallet to see your hit-rate.</Body>
          <ConnectButton />
        </>
      )}

      {selectedAccount && (
        <PixelPanel title="RATING">
          {receipts.isLoading ? (
            <Loading />
          ) : receipts.isError ? (
            <>
              <Body>Couldn't load receipts</Body>
              <Muted>{receipts.error instanceof Error ? receipts.error.message : String(receipts.error)}</Muted>
              <PixelButton label="Retry" variant="ghost" onPress={() => receipts.refetch()} />
            </>
          ) : (
            <>
              {demo && (
                <View style={styles.demoRow}>
                  <DemoBadge />
                  <Muted style={styles.flex}>Scored against demo prices — not real results</Muted>
                </View>
              )}
              <Num style={styles.sigma}>{formatSigma(s2.z)}</Num>
              <Muted>{`z = (hits − misses) / √N · N = ${s2.n} · hit-rate ${formatHitRate(s2.hitRate)}`}</Muted>
              <View style={styles.statsRow}>
                <StatBox label="N" value={s2.n} />
                <StatBox label="HITS" value={s2.hits} />
                <StatBox label="MISSES" value={s2.misses} />
                <StatBox label="VOID" value={s2.voids} />
                <StatBox label="PENDING" value={s2.pending} />
              </View>
              <Body>{`hidden & forfeited: ${s2.forfeited}`}</Body>
              {s2.overlaps > 0 && <Body>{`overlapping calls: ${s2.overlaps}`}</Body>}
              <View style={styles.streakRow}>
                <PixelIcon name="flame" scale={1.5} color={colors.down} />
                <Body>{`streak: ${days} day${days === 1 ? "" : "s"}`}</Body>
              </View>
              <View style={styles.streakRow}>
                <PixelIcon name="flame" scale={1.5} color={colors.accent} />
                <Body>{`SKR Daily streak: ${skrDays} day${skrDays === 1 ? "" : "s"}`}</Body>
              </View>
              {tipped && (
                <View style={styles.streakRow}>
                  <PixelIcon name="coin" scale={1.5} color={colors.accent} />
                  <Body>{tipped}</Body>
                </View>
              )}
              <Muted>
                {`Leaderboard: ${elig.eligible ? "eligible" : "not yet"} · ${elig.n} scored ≥24h calls (need ${LEADERBOARD_MIN_N}) · ${elig.days} days (need ${LEADERBOARD_MIN_DAYS}) · Genesis ${elig.hasGenesis ? "✓" : "✕"} or SKR ≥ ${SKR_GATE_MIN} ${holder ? "✓" : "✕"}`}
              </Muted>
              <Muted>
                Misses include forfeited and overlapping calls. VOID (price unchanged) is not counted. 1h practice
                calls count here but never on the leaderboard.
              </Muted>
            </>
          )}
        </PixelPanel>
      )}

      {selectedAccount && list.length > 0 && (
        <PixelPanel title="LEGACY RECEIPTS (v1)">
          <Muted>Old price-target calls. Kept on chain and shown here, excluded from the rating and the leaderboard.</Muted>
          <View style={styles.statsRow}>
            <StatBox label="TOTAL" value={s.total} />
            <StatBox label="HITS" value={s.hits} />
            <StatBox label="MISSES" value={s.misses} />
            <StatBox label="NO SHOW" value={s.forfeited} />
            <StatBox label="PENDING" value={s.pending} />
          </View>
          <Muted>{`Legacy hit-rate ${formatHitRate(s.hitRate)}`}</Muted>
          <PixelButton
            label="Copy legacy share text"
            icon="share"
            variant="ghost"
            disabled={receipts.isLoading || receipts.isError}
            onPress={copyShareText}
          />
        </PixelPanel>
      )}

      <PixelPanel title="REVEAL SECRETS">
        <Muted>
          Secrets live only on this phone. Lose them and your sealed calls can't be revealed — they will count as
          misses. Export copies them to the clipboard as JSON; store it somewhere private.
        </Muted>
        <PixelButton label="Export secrets" icon="lock" variant="ghost" onPress={exportSecrets} />
      </PixelPanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenContainer: { padding: space.md, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  walletRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: space.sm },
  statBox: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 28 },
  sigma: { fontFamily: fonts.number, fontSize: 40, color: colors.accent },
  demoRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  streakRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
