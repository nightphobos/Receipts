import React, { useCallback, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Divider, Text } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { describeCall, formatCountdown, formatUsd, solscanTxUrl } from "../core/format";
import { SOURCE_LABEL, isDemo, type PriceSourceKind } from "../core/price";
import { REVEAL_GRACE_SEC, statusOf, type Status } from "../core/score";
import { canReveal, revealReceipt } from "../chain/reveal";
import { isUserRejection } from "../chain/seal";
import { RECEIPTS_QUERY_KEY, useReceipts, type ReceiptRow } from "../hooks/useReceipts";
import { useNowSec } from "../hooks/useNow";
import { usePriceSource } from "../hooks/usePriceSource";
import { DemoBadge } from "../components/receipt/demo-badge";
import { StatusChip } from "../components/receipt/status-chip";
import { useCluster } from "../components/cluster/cluster-data-access";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useConnection } from "../utils/ConnectionProvider";
import { alertAndLog } from "../utils/alertAndLog";
import { showToast } from "../components/ui/toast";
import type { RootStackParamList } from "../navigators/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "ReceiptDetail">;

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

function Resolution({ row, status, now, src }: { row: ReceiptRow; status: Status; now: number; src: PriceSourceKind }) {
  const { name, quote } = SOURCE_LABEL[src];
  const { receipt } = row;
  switch (status) {
    case "sealed":
      return <Text variant="bodyLarge">{`Reveal opens in ${formatCountdown(receipt.deadline - now)}`}</Text>;
    case "awaiting_reveal":
      return (
        <Text variant="bodyLarge">
          {row.hasSecret
            ? `Reveal within ${formatCountdown(receipt.deadline + REVEAL_GRACE_SEC - now)} or it counts as a miss.`
            : `The secret for this call is not on this phone. It forfeits in ${formatCountdown(receipt.deadline + REVEAL_GRACE_SEC - now)}.`}
        </Text>
      );
    case "forfeited":
      return <Text variant="bodyLarge">Not revealed within 24 h of the deadline — counts as a miss.</Text>;
    case "unresolved":
      return (
        <Text variant="bodyLarge">
          {now < receipt.deadline
            ? `Revealed early. Resolves after the deadline (${formatCountdown(receipt.deadline - now)}).`
            : `${name} price at the deadline is not available yet.`}
        </Text>
      );
    case "hit":
    case "miss": {
      const call = receipt.reveal!.call;
      const price = receipt.priceAtDeadline as number;
      return (
        <Text variant="bodyLarge">
          {`${name} ${call.asset}/${quote} at deadline: ${formatUsd(price)} — ${call.dir} $${formatUsd(call.target)}: ${
            status === "hit" ? "HIT" : "MISS"
          }`}
        </Text>
      );
    }
  }
}

export function ReceiptDetailScreen({ route }: Props) {
  const { hash, signature } = route.params;
  const { selectedAccount } = useAuthorization();
  const { connection } = useConnection();
  const { selectedCluster } = useCluster();
  const priceSource = usePriceSource();
  const wallet = useMobileWallet();
  const queryClient = useQueryClient();
  const receipts = useReceipts(selectedAccount?.publicKey);
  const now = useNowSec();
  const [revealing, setRevealing] = useState(false);
  const [sentReveal, setSentReveal] = useState<string | null>(null);

  const cluster = selectedCluster.network;
  const row = receipts.data?.find((r) => r.receipt.hash === hash);

  const onReveal = useCallback(async () => {
    if (!selectedAccount || !row) return;
    setRevealing(true);
    try {
      const { signature: sig } = await revealReceipt(
        {
          signer: selectedAccount.publicKey,
          store: AsyncStorage,
          nowSec: () => Math.floor(Date.now() / 1000),
          getLatestBlockhash: async () => {
            const { context, value } = await connection.getLatestBlockhashAndContext();
            return { blockhash: value.blockhash, slot: context.slot };
          },
          signAndSend: wallet.signAndSendTransaction,
        },
        row.receipt,
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
  }, [selectedAccount, row, connection, wallet, queryClient]);

  const refresh = (
    <RefreshControl refreshing={receipts.isRefetching} onRefresh={() => receipts.refetch()} />
  );

  if (receipts.isLoading) {
    return (
      <View style={[styles.screenContainer, styles.center]}>
        <ActivityIndicator />
        <Text style={styles.gap}>Reading receipt from chain…</Text>
      </View>
    );
  }

  if (!row) {
    // Just sealed (not indexed yet), another wallet, or an RPC error.
    return (
      <ScrollView contentContainerStyle={styles.screenContainer} refreshControl={refresh}>
        <Text variant="titleLarge">
          {receipts.isError ? "Couldn't load receipt" : "Waiting for the commit to confirm"}
        </Text>
        <Text style={styles.gapSmall}>
          {receipts.isError
            ? receipts.error instanceof Error
              ? receipts.error.message
              : String(receipts.error)
            : "Pull down to refresh in a few seconds."}
        </Text>
        <Text variant="labelLarge" style={styles.gap}>Commit hash</Text>
        <Text selectable>{hash}</Text>
        {signature && <TxLink label="Commit on Solscan" signature={signature} cluster={cluster} />}
        <Button style={styles.gap} mode="outlined" icon="refresh" onPress={() => receipts.refetch()}>
          Refresh
        </Button>
      </ScrollView>
    );
  }

  const { receipt, call } = row;
  const status = statusOf(receipt, now);
  const pendingReveal = sentReveal !== null && !receipt.reveal;
  const demo = call !== null && isDemo(priceSource, call.asset);
  const src: PriceSourceKind = call !== null ? priceSource.kindOf(call.asset) : "pyth";

  return (
    <ScrollView contentContainerStyle={styles.screenContainer} refreshControl={refresh}>
      <View style={styles.row}>
        <Text variant="headlineSmall" style={styles.title}>
          {call ? describeCall(call) : "Hidden call"}
        </Text>
        <StatusChip status={status} />
      </View>
      {!call && (
        <Text variant="bodySmall" style={styles.muted}>
          Only the hash is on chain and the secret is not on this phone.
        </Text>
      )}

      {demo && (
        <View style={styles.gapSmall}>
          <DemoBadge />
        </View>
      )}

      <Card style={styles.gap}>
        <Card.Content>
          <Resolution row={row} status={status} now={now} src={src} />
        </Card.Content>
        {status === "unresolved" && (
          <Card.Actions>
            <Button icon="refresh" loading={receipts.isRefetching} onPress={() => receipts.refetch()}>
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

      {canReveal(receipt, row.hasSecret, now) && !pendingReveal && (
        <Button
          style={styles.gap}
          mode="contained"
          icon="lock-open-variant"
          onPress={onReveal}
          loading={revealing}
          disabled={revealing}
        >
          Reveal
        </Button>
      )}

      <Divider style={styles.gap} />
      <Text variant="labelLarge" style={styles.gap}>Deadline</Text>
      <Text>{fmtTime(receipt.deadline)}</Text>
      {call && (
        <>
          <Text variant="labelLarge" style={styles.gap}>Created</Text>
          <Text>{fmtTime(call.created)}</Text>
        </>
      )}
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
  center: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1, marginRight: 8 },
  gap: { marginTop: 12 },
  gapSmall: { marginTop: 6 },
  muted: { marginTop: 4, opacity: 0.7 },
  link: { alignSelf: "flex-start", marginLeft: -12 },
  linkContent: { flexDirection: "row-reverse" },
});
