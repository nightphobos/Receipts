import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Chip, Snackbar, Text } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";

import { formatSigma } from "../core/ceremony";
import { LEADERBOARD_MIN_DAYS, LEADERBOARD_MIN_N, eligibility, stats, statsV2, streak } from "../core/score";
import { formatHitRate, shareText } from "../core/share";
import { exportAll } from "../storage/secrets";
import { useReceipts, useReceiptsV2 } from "../hooks/useReceipts";
import { useNowSec } from "../hooks/useNow";
import { usePriceSource } from "../hooks/usePriceSource";
import { DemoBadge } from "../components/receipt/demo-badge";
import { SeekerBadge } from "../components/receipt/seeker-badge";
import { useSeekerGenesis } from "../hooks/useSeekerGenesis";
import { useCluster } from "../components/cluster/cluster-data-access";
import { ConnectButton } from "../components/sign-in/sign-in-ui";
import { useAuthorization } from "../utils/useAuthorization";
import { alertAndLog } from "../utils/alertAndLog";
import { ellipsify } from "../utils/ellipsify";
import { PixelIcon, colors, useParallaxScroll } from "../theme";

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statBox}>
      <Text variant="headlineSmall" style={styles.bold}>{value}</Text>
      <Text variant="bodySmall" style={styles.muted}>{label}</Text>
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
  const now = useNowSec();
  const [toast, setToast] = useState<string | null>(null);

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
  const elig = useMemo(() => eligibility(listV2, now, genesis.data === true), [listV2, now, genesis.data]);

  const copyShareText = async () => {
    await Clipboard.setStringAsync(shareText(list, Math.floor(Date.now() / 1000), selectedCluster.network, { demo }));
    setToast("Share text copied");
  };

  const exportSecrets = async () => {
    try {
      const entries = await exportAll(AsyncStorage);
      if (entries.length === 0) {
        alertAndLog("Nothing to export", "There are no reveal secrets stored on this phone.");
        return;
      }
      await Clipboard.setStringAsync(JSON.stringify(entries));
      setToast(`${entries.length} secret${entries.length === 1 ? "" : "s"} copied — keep them private`);
    } catch (e) {
      alertAndLog("Export failed", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        {...parallaxScroll}
        contentContainerStyle={styles.screenContainer}
        refreshControl={
          <RefreshControl
            refreshing={receipts.isRefetching}
            onRefresh={() => {
              receipts.refetch();
              genesis.refetch();
            }}
          />
        }
      >
        <View style={styles.row}>
          <Text variant="titleLarge" style={styles.bold}>Profile</Text>
          <Chip icon="lan" compact>{selectedCluster.name}</Chip>
        </View>

        {selectedAccount ? (
          <>
            <Text selectable variant="bodySmall" style={[styles.gapSmall, styles.muted]}>
              {ellipsify(selectedAccount.publicKey.toBase58(), 8)}
            </Text>
            {genesis.data === true && (
              <View style={styles.gapSmall}>
                <SeekerBadge />
              </View>
            )}
          </>
        ) : (
          <View style={styles.gap}>
            <Text style={styles.gapSmall}>Connect a wallet to see your hit-rate.</Text>
            <View style={styles.gap}>
              <ConnectButton />
            </View>
          </View>
        )}

        {selectedAccount && (
          <Card style={styles.gap}>
            <Card.Content>
              {receipts.isLoading ? (
                <ActivityIndicator />
              ) : receipts.isError ? (
                <>
                  <Text variant="titleSmall">Couldn't load receipts</Text>
                  <Text variant="bodySmall">
                    {receipts.error instanceof Error ? receipts.error.message : String(receipts.error)}
                  </Text>
                  <Button style={styles.gapSmall} onPress={() => receipts.refetch()}>Retry</Button>
                </>
              ) : (
                <>
                  {demo && (
                    <View style={styles.demoRow}>
                      <DemoBadge />
                      <Text variant="bodySmall" style={[styles.muted, styles.demoNote]}>
                        Scored against demo prices — not real results
                      </Text>
                    </View>
                  )}
                  <Text variant="bodyMedium" style={styles.muted}>Rating</Text>
                  <Text variant="headlineMedium" style={styles.bold}>{formatSigma(s2.z)}</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {`z = (hits − misses) / √N · N = ${s2.n} · hit-rate ${formatHitRate(s2.hitRate)}`}
                  </Text>
                  <View style={[styles.statsRow, styles.gap]}>
                    <StatBox label="N" value={s2.n} />
                    <StatBox label="Hits" value={s2.hits} />
                    <StatBox label="Misses" value={s2.misses} />
                    <StatBox label="Void" value={s2.voids} />
                    <StatBox label="Pending" value={s2.pending} />
                  </View>
                  <Text variant="bodyMedium" style={styles.gap}>{`hidden & forfeited: ${s2.forfeited}`}</Text>
                  {s2.overlaps > 0 && (
                    <Text variant="bodyMedium" style={styles.gapSmall}>{`overlapping calls: ${s2.overlaps}`}</Text>
                  )}
                  <View style={[styles.streakRow, styles.gapSmall]}>
                    <PixelIcon name="flame" scale={1.25} color={colors.down} />
                    <Text variant="bodyMedium" style={styles.streakText}>
                      {`streak: ${days} day${days === 1 ? "" : "s"}`}
                    </Text>
                  </View>
                  <Text variant="bodySmall" style={[styles.muted, styles.gapSmall]}>
                    {`Leaderboard: ${elig.eligible ? "eligible" : "not yet"} · ${elig.n}/${LEADERBOARD_MIN_N} scored ≥24h calls · ${elig.days}/${LEADERBOARD_MIN_DAYS} days · Genesis ${elig.hasGenesis ? "✓" : "✕"}`}
                  </Text>
                  <Text variant="bodySmall" style={[styles.muted, styles.gapSmall]}>
                    Misses include forfeited and overlapping calls. VOID (price unchanged) is not counted. 1h practice
                    calls count here but never on the leaderboard.
                  </Text>
                </>
              )}
            </Card.Content>
          </Card>
        )}

        {selectedAccount && list.length > 0 && (
          <Card style={styles.gap}>
            <Card.Content>
              <Text variant="titleSmall">Legacy receipts (v1)</Text>
              <Text variant="bodySmall" style={[styles.muted, styles.gapSmall]}>
                Old price-target calls. Kept on chain and shown here, excluded from the rating and the leaderboard.
              </Text>
              <View style={[styles.statsRow, styles.gap]}>
                <StatBox label="Total" value={s.total} />
                <StatBox label="Hits" value={s.hits} />
                <StatBox label="Misses" value={s.misses} />
                <StatBox label="Forfeited" value={s.forfeited} />
                <StatBox label="Pending" value={s.pending} />
              </View>
              <Text variant="bodySmall" style={[styles.muted, styles.gapSmall]}>
                {`Legacy hit-rate ${formatHitRate(s.hitRate)}`}
              </Text>
            </Card.Content>
            <Card.Actions>
              <Button icon="share-variant" disabled={receipts.isLoading || receipts.isError} onPress={copyShareText}>
                Copy legacy share text
              </Button>
            </Card.Actions>
          </Card>
        )}

        <Card style={styles.gap}>
          <Card.Content>
            <Text variant="titleSmall">Reveal secrets</Text>
            <Text variant="bodySmall" style={styles.gapSmall}>
              Secrets live only on this phone. Lose them and your sealed calls can't be revealed — they will count
              as misses. Export copies them to the clipboard as JSON; store it somewhere private.
            </Text>
          </Card.Content>
          <Card.Actions>
            <Button icon="key-variant" onPress={exportSecrets}>Export secrets</Button>
          </Card.Actions>
        </Card>
      </ScrollView>
      <Snackbar visible={toast !== null} onDismiss={() => setToast(null)} duration={2500}>
        {toast ?? ""}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenContainer: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  statBox: { alignItems: "center", flex: 1 },
  bold: { fontWeight: "bold" },
  demoRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  demoNote: { flex: 1, marginLeft: 8 },
  gap: { marginTop: 12 },
  gapSmall: { marginTop: 6 },
  muted: { opacity: 0.7 },
  streakRow: { flexDirection: "row", alignItems: "center" },
  streakText: { marginLeft: 6 },
});
