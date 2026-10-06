import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Chip, Snackbar, Text } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";

import { stats } from "../core/score";
import { formatHitRate, shareText } from "../core/share";
import { exportAll } from "../storage/secrets";
import { useReceipts } from "../hooks/useReceipts";
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

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statBox}>
      <Text variant="headlineSmall" style={styles.bold}>{value}</Text>
      <Text variant="bodySmall" style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ProfileScreen() {
  const { selectedAccount } = useAuthorization();
  const { selectedCluster } = useCluster();
  const demo = usePriceSource().kind === "mock";
  const receipts = useReceipts(selectedAccount?.publicKey);
  const genesis = useSeekerGenesis(selectedAccount?.publicKey);
  const now = useNowSec();
  const [toast, setToast] = useState<string | null>(null);

  const list = useMemo(() => (receipts.data ?? []).map((r) => r.receipt), [receipts.data]);
  const s = useMemo(() => stats(list, now), [list, now]);

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
                  <Text variant="bodyMedium" style={styles.muted}>Hit-rate</Text>
                  <Text variant="displayMedium" style={styles.bold}>{formatHitRate(s.hitRate)}</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    hits / (hits + misses + forfeited) — pending calls excluded
                  </Text>
                  <View style={[styles.statsRow, styles.gap]}>
                    <StatBox label="Total" value={s.total} />
                    <StatBox label="Hits" value={s.hits} />
                    <StatBox label="Misses" value={s.misses} />
                    <StatBox label="Forfeited" value={s.forfeited} />
                    <StatBox label="Pending" value={s.pending} />
                  </View>
                </>
              )}
            </Card.Content>
            <Card.Actions>
              <Button
                mode="contained"
                icon="share-variant"
                disabled={receipts.isLoading || receipts.isError}
                onPress={copyShareText}
              >
                Copy share text
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
});
