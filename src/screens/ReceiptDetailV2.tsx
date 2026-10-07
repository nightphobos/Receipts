import React, { useCallback, useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Divider, Text } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { describeCallV2, formatCountdown, formatUsd, solscanTxUrl } from "../core/format";
import { SOURCE_LABEL, isDemo } from "../core/price";
import { REVEAL_GRACE_SEC, statusOfV2, type StatusV2 } from "../core/score";
import { canRevealV2, findSecretV2, revealReceiptV2 } from "../chain/reveal";
import { isUserRejection } from "../chain/seal";
import { RECEIPTS_QUERY_KEY, type ReceiptRowV2 } from "../hooks/useReceipts";
import { useMasterKey } from "../hooks/useMasterKey";
import { useNowSec } from "../hooks/useNow";
import { usePriceSource } from "../hooks/usePriceSource";
import { DemoBadge } from "../components/receipt/demo-badge";
import { StatusChip } from "../components/receipt/status-chip";
import { RevealCeremony } from "../components/receipt/reveal-ceremony";
import { useCluster } from "../components/cluster/cluster-data-access";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useConnection } from "../utils/ConnectionProvider";
import { alertAndLog } from "../utils/alertAndLog";
import { showToast } from "../components/ui/toast";
import { MascotDialog, useParallaxScroll } from "../theme";
import { mascotLine, poseForStatus } from "../core/mascot";

const fmtTime = (sec: number) => new Date(sec * 1000).toLocaleString();

function TxLink({ label, signature, cluster }: { label: string; signature: string; cluster: string }) {
  return (
    <Button
      mode="text"
      icon="open-in-new"
      contentStyle={styles.linkContent}
      style={styles.link}
      onPress={() => Linking.openURL(solscanTxUrl(signature, cluster))}
    >
      {label}
    </Button>
  );
}

function resolutionText(row: ReceiptRowV2, status: StatusV2, now: number, priceName: string): string {
  const { receipt } = row;
  const left = (t: number) => formatCountdown(t - now);
  const p0 = receipt.p0 != null ? `${priceName} at seal (P0): $${formatUsd(receipt.p0)}\n` : "";
  switch (status) {
    case "sealed":
      return `${p0}Reveal opens in ${left(receipt.deadline)}`;
    case "awaiting_reveal":
      return `${p0}Reveal within ${left(receipt.deadline + REVEAL_GRACE_SEC)} or it counts as a miss.`;
    case "forfeited":
      return "Not revealed within 24 h of the deadline — counts as a miss.";
    case "overlap":
      return "Sealed while another call of the same asset and horizon was still open — counts as a miss.";
    case "unresolved":
      return `${priceName} price at seal or deadline is not available yet.`;
    case "legacy":
      return "Legacy v1 receipt.";
    case "hit":
    case "miss":
    case "void": {
      const p0 = formatUsd(receipt.p0 as number);
      const pt = formatUsd(receipt.pt as number);
      const verdict = status === "hit" ? "HIT" : status === "miss" ? "MISS" : "VOID (price unchanged, not counted)";
      return `${priceName}: $${p0} at seal → $${pt} at deadline — ${verdict}`;
    }
  }
}

export function ReceiptDetailV2({
  row,
  refetch,
  isRefetching,
}: {
  row: ReceiptRowV2;
  refetch: () => void;
  isRefetching: boolean;
}) {
  const parallaxScroll = useParallaxScroll();
  const { selectedAccount } = useAuthorization();
  const { connection } = useConnection();
  const { selectedCluster } = useCluster();
  const priceSource = usePriceSource();
  const wallet = useMobileWallet();
  const masterKey = useMasterKey(selectedAccount?.publicKey);
  const queryClient = useQueryClient();
  const now = useNowSec();
  const [revealing, setRevealing] = useState(false);
  const [sentReveal, setSentReveal] = useState<string | null>(null);

  const cluster = selectedCluster.network;
  const { receipt, call } = row;
  const status = statusOfV2(receipt, now);
  const pendingReveal = sentReveal !== null && !receipt.reveal;
  const demo = isDemo(priceSource, receipt.asset);
  const { name: priceName } = SOURCE_LABEL[priceSource.kindOf(receipt.asset)];
  const needsRecovery = !row.hasSecret && !masterKey.master;
  const pose = poseForStatus(status, { printing: revealing || pendingReveal });
  const resolved = status === "hit" || status === "miss" || status === "void";
  // null = show the printed receipt; a number = play the ceremony (bumped by Replay to remount).
  const [ceremonyKey, setCeremonyKey] = useState<number | null>(null);
  useEffect(() => {
    if (sentReveal && resolved) setCeremonyKey((k) => k ?? 1);
  }, [sentReveal, resolved]);

  const onReveal = useCallback(async () => {
    if (!selectedAccount) return;
    setRevealing(true);
    try {
      let master = masterKey.master;
      // Nothing usable on this phone: re-derive the master from the wallet (one signature) and recover.
      if (!(await findSecretV2(AsyncStorage, receipt, master))) {
        if (masterKey.state?.mode === "random")
          throw new Error("The secret for this call is not on this phone and your wallet can't re-derive it.");
        master = await masterKey.rederive();
        if (!(await findSecretV2(AsyncStorage, receipt, master)))
          throw new Error("This wallet's key does not open this commit (sealed with a local random salt?).");
        await masterKey.persist({ mode: "derived", master });
      }
      const { signature: sig } = await revealReceiptV2(
        {
          signer: selectedAccount.publicKey,
          store: AsyncStorage,
          master,
          nowSec: () => Math.floor(Date.now() / 1000),
          getLatestBlockhash: async () => {
            const { context, value } = await connection.getLatestBlockhashAndContext();
            return { blockhash: value.blockhash, slot: context.slot };
          },
          signAndSend: wallet.signAndSendTransaction,
        },
        receipt,
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSentReveal(sig);
      // Give the RPC a moment to index the reveal before re-reading history.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: [RECEIPTS_QUERY_KEY] }), 3000);
    } catch (e) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (isUserRejection(e)) showToast("Not revealed: signing was cancelled, nothing was sent.");
      else alertAndLog("Reveal failed", e instanceof Error ? e.message : String(e));
    } finally {
      setRevealing(false);
    }
  }, [selectedAccount, receipt, masterKey, connection, wallet, queryClient]);

  return (
    <ScrollView
      {...parallaxScroll}
      contentContainerStyle={styles.screenContainer}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <View style={styles.row}>
        <Text variant="headlineSmall" style={styles.title}>
          {call ? describeCallV2(call) : `${receipt.asset} · hidden direction`}
        </Text>
        <StatusChip status={status} />
      </View>
      <Text variant="bodySmall" style={styles.muted}>
        {`Horizon ${receipt.horizon}${receipt.horizon === "1h" ? " (practice)" : ""}`}
      </Text>
      {pose !== "idle" && (
        <MascotDialog style={styles.gap} pose={pose} text={mascotLine(pose, receipt)} />
      )}
      {demo && (
        <View style={styles.gapSmall}>
          <DemoBadge />
        </View>
      )}

      {resolved && (
        <>
          <RevealCeremony
            key={ceremonyKey ?? 0}
            style={styles.gap}
            play={ceremonyKey !== null}
            outcome={status}
            p0={receipt.p0 as number}
            pt={receipt.pt as number}
            commitSignature={receipt.commit.signature}
            sealedAt={receipt.commit.blockTime}
          />
          <Button
            style={styles.link}
            mode="text"
            icon="replay"
            onPress={() => setCeremonyKey((k) => (k ?? 0) + 1)}
          >
            Replay reveal
          </Button>
        </>
      )}

      <Card style={styles.gap}>
        <Card.Content>
          <Text variant="bodyLarge">{resolutionText(row, status, now, priceName)}</Text>
        </Card.Content>
        {status === "unresolved" && (
          <Card.Actions>
            <Button icon="refresh" loading={isRefetching} onPress={refetch}>
              Retry
            </Button>
          </Card.Actions>
        )}
      </Card>

      {pendingReveal && sentReveal && (
        <Card style={styles.gap}>
          <Card.Content>
            <Text variant="titleSmall">Reveal sent</Text>
            <Text variant="bodySmall">Waiting for it to confirm. Pull down to refresh.</Text>
          </Card.Content>
          <Card.Actions>
            <TxLink label="Reveal on Solscan" signature={sentReveal} cluster={cluster} />
          </Card.Actions>
        </Card>
      )}

      {canRevealV2(receipt, now) && !pendingReveal && (
        <>
          <Button
            style={styles.gap}
            mode="contained"
            icon={needsRecovery ? "key" : "lock-open-variant"}
            onPress={onReveal}
            loading={revealing}
            disabled={revealing}
          >
            {needsRecovery ? "Recover with wallet & reveal" : "Reveal"}
          </Button>
          {needsRecovery && (
            <Text variant="bodySmall" style={styles.muted}>
              The secret isn't on this phone. Your wallet signs the key message once to rebuild it.
            </Text>
          )}
        </>
      )}

      <Divider style={styles.gap} />
      <Text variant="labelLarge" style={styles.gap}>Deadline</Text>
      <Text>{fmtTime(receipt.deadline)}</Text>
      <Text variant="labelLarge" style={styles.gap}>Sealed on chain</Text>
      <Text>{fmtTime(receipt.commit.blockTime)}</Text>
      <TxLink label="Commit on Solscan" signature={receipt.commit.signature} cluster={cluster} />
      {receipt.reveal && (
        <>
          <Text variant="labelLarge" style={styles.gap}>Revealed on chain</Text>
          <Text>{fmtTime(receipt.reveal.blockTime)}</Text>
          <TxLink label="Reveal on Solscan" signature={receipt.reveal.signature} cluster={cluster} />
        </>
      )}

      <Text variant="labelLarge" style={styles.gap}>Commit hash</Text>
      <Text selectable variant="bodySmall">{receipt.hash}</Text>
      {receipt.reveal && (
        <>
          <Text variant="labelLarge" style={styles.gap}>Revealed JSON | salt</Text>
          <Text selectable variant="bodySmall">{`${receipt.reveal.json}|${receipt.reveal.salt}`}</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenContainer: { padding: 16, flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1, marginRight: 8 },
  gap: { marginTop: 12 },
  gapSmall: { marginTop: 6 },
  muted: { marginTop: 4, opacity: 0.7 },
  link: { alignSelf: "flex-start", marginLeft: -12 },
  linkContent: { flexDirection: "row-reverse" },
});
