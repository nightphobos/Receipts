import React, { useCallback, useState } from "react";
import { appNowSec } from "../demo/store";
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { describeCall, formatCountdown, formatUsd, solscanTxUrl } from "../core/format";
import { SOURCE_LABEL, isDemo, type PriceSourceKind } from "../core/price";
import { REVEAL_GRACE_SEC, statusOf, type Status } from "../core/score";
import { canReveal, revealReceipt } from "../chain/reveal";
import { isUserRejection } from "../chain/seal";
import { RECEIPTS_QUERY_KEY, useReceipts, useReceiptsV2, type ReceiptRow } from "../hooks/useReceipts";
import { ReceiptDetailV2 } from "./ReceiptDetailV2";
import { useNowSec } from "../hooks/useNow";
import { usePriceSource } from "../hooks/usePriceSource";
import { DemoBadge } from "../components/receipt/demo-badge";
import { useCluster } from "../components/cluster/cluster-data-access";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useConnection } from "../utils/ConnectionProvider";
import { alertAndLog } from "../utils/alertAndLog";
import { showToast } from "../components/ui/toast";
import type { RootStackParamList } from "../navigators/AppNavigator";
import {
  Body,
  Loading,
  Muted,
  PixelButton,
  PixelLink,
  PixelPanel,
  StatusStamp,
  Title,
  colors,
  space,
  useParallaxScroll,
} from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "ReceiptDetail">;

const fmtTime = (sec: number) => new Date(sec * 1000).toLocaleString();

function TxLink({ label, signature, cluster }: { label: string; signature: string; cluster: string }) {
  return <PixelLink label={label} onPress={() => Linking.openURL(solscanTxUrl(signature, cluster))} />;
}

function Fact({ label, children, selectable }: { label: string; children: string; selectable?: boolean }) {
  return (
    <View style={styles.fact}>
      <Muted>{label}</Muted>
      <Body selectable={selectable}>{children}</Body>
    </View>
  );
}

function Resolution({ row, status, now, src }: { row: ReceiptRow; status: Status; now: number; src: PriceSourceKind }) {
  const { name, quote } = SOURCE_LABEL[src];
  const { receipt } = row;
  switch (status) {
    case "sealed":
      return <Body>{`Reveal opens in ${formatCountdown(receipt.deadline - now)}`}</Body>;
    case "awaiting_reveal":
      return (
        <Body>
          {row.hasSecret
            ? `Reveal within ${formatCountdown(receipt.deadline + REVEAL_GRACE_SEC - now)} or it counts as a miss.`
            : `The secret for this call is not on this phone. It forfeits in ${formatCountdown(receipt.deadline + REVEAL_GRACE_SEC - now)}.`}
        </Body>
      );
    case "forfeited":
      return <Body>Not revealed within 24 h of the deadline — counts as a miss.</Body>;
    case "unresolved":
      return (
        <Body>
          {now < receipt.deadline
            ? `Revealed early. Resolves after the deadline (${formatCountdown(receipt.deadline - now)}).`
            : `${name} price at the deadline is not available yet.`}
        </Body>
      );
    case "hit":
    case "miss": {
      const call = receipt.reveal!.call;
      const price = receipt.priceAtDeadline as number;
      return (
        <Body>
          {`${name} ${call.asset}/${quote} at deadline: ${formatUsd(price)} — ${call.dir} $${formatUsd(call.target)}: ${
            status === "hit" ? "HIT" : "MISS"
          }`}
        </Body>
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
  const receiptsV2 = useReceiptsV2(selectedAccount?.publicKey);
  const now = useNowSec();
  const parallaxScroll = useParallaxScroll();
  const [revealing, setRevealing] = useState(false);
  const [sentReveal, setSentReveal] = useState<string | null>(null);

  const cluster = selectedCluster.network;
  const row = receipts.data?.find((r) => r.receipt.hash === hash);
  const rowV2 = receiptsV2.data?.find((r) => r.receipt.hash === hash);

  const onReveal = useCallback(async () => {
    if (!selectedAccount || !row) return;
    setRevealing(true);
    try {
      const { signature: sig } = await revealReceipt(
        {
          signer: selectedAccount.publicKey,
          store: AsyncStorage,
          nowSec: () => appNowSec(),
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

  const refetchAll = () => {
    receipts.refetch();
    receiptsV2.refetch();
  };
  const refresh = (
    <RefreshControl
      refreshing={receipts.isRefetching || receiptsV2.isRefetching}
      onRefresh={refetchAll}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.surface}
    />
  );

  if (rowV2) {
    return (
      <ReceiptDetailV2
        row={rowV2}
        all={(receiptsV2.data ?? []).map((r) => r.receipt)}
        refetch={refetchAll}
        isRefetching={receiptsV2.isRefetching}
      />
    );
  }

  if (receipts.isLoading || receiptsV2.isLoading) {
    return (
      <View style={[styles.screenContainer, styles.center]}>
        <Loading caption="Reading receipt from chain…" />
      </View>
    );
  }

  const loadError = receipts.error ?? receiptsV2.error;
  if (!row) {
    // Just sealed (not indexed yet), another wallet, or an RPC error.
    return (
      <ScrollView {...parallaxScroll} contentContainerStyle={styles.screenContainer} refreshControl={refresh}>
        <Title>{loadError ? "COULDN'T LOAD RECEIPT" : "CONFIRMING…"}</Title>
        <PixelPanel>
          <Body>
            {loadError
              ? loadError instanceof Error
                ? loadError.message
                : String(loadError)
              : "Waiting for the commit to confirm. Pull down to refresh in a few seconds."}
          </Body>
          <Fact label="Commit hash" selectable>{hash}</Fact>
          {signature && <TxLink label="Commit on Solscan" signature={signature} cluster={cluster} />}
        </PixelPanel>
        <PixelButton label="Refresh" variant="ghost" onPress={refetchAll} />
      </ScrollView>
    );
  }

  const { receipt, call } = row;
  const status = statusOf(receipt, now);
  const pendingReveal = sentReveal !== null && !receipt.reveal;
  const demo = call !== null && isDemo(priceSource, call.asset);
  const src: PriceSourceKind = call !== null ? priceSource.kindOf(call.asset) : "pyth";

  return (
    <ScrollView {...parallaxScroll} contentContainerStyle={styles.screenContainer} refreshControl={refresh}>
      <View style={styles.row}>
        <Title style={styles.title}>{call ? describeCall(call).toUpperCase() : "HIDDEN CALL"}</Title>
        <StatusStamp status={status} />
      </View>
      <Muted>LEGACY v1 receipt — not counted in the rating.</Muted>
      {!call && <Muted>Only the hash is on chain and the secret is not on this phone.</Muted>}
      {demo && <DemoBadge />}

      <PixelPanel>
        <Resolution row={row} status={status} now={now} src={src} />
        {status === "unresolved" && (
          <PixelButton
            label={receipts.isRefetching ? "Retrying…" : "Retry"}
            variant="ghost"
            disabled={receipts.isRefetching}
            onPress={() => receipts.refetch()}
          />
        )}
      </PixelPanel>

      {pendingReveal && sentReveal && (
        <PixelPanel title="REVEAL SENT">
          <Muted>Waiting for it to confirm. Pull down to refresh.</Muted>
          <TxLink label="Reveal on Solscan" signature={sentReveal} cluster={cluster} />
        </PixelPanel>
      )}

      {canReveal(receipt, row.hasSecret, now) && !pendingReveal && (
        <PixelButton label={revealing ? "REVEALING…" : "REVEAL"} icon="receipt" big onPress={onReveal} disabled={revealing} />
      )}

      <PixelPanel title="ON CHAIN">
        <Fact label="Deadline">{fmtTime(receipt.deadline)}</Fact>
        {call && <Fact label="Created">{fmtTime(call.created)}</Fact>}
        <Fact label="Sealed on chain">{fmtTime(receipt.commit.blockTime)}</Fact>
        <TxLink label="Commit on Solscan" signature={receipt.commit.signature} cluster={cluster} />
        {receipt.reveal && (
          <>
            <Fact label="Revealed on chain">{fmtTime(receipt.reveal.blockTime)}</Fact>
            <TxLink label="Reveal on Solscan" signature={receipt.reveal.signature} cluster={cluster} />
          </>
        )}
        <Fact label="Commit hash" selectable>{receipt.hash}</Fact>
        {receipt.reveal && (
          <Fact label="Revealed JSON | salt" selectable>{`${receipt.reveal.json}|${receipt.reveal.salt}`}</Fact>
        )}
      </PixelPanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenContainer: { padding: space.md, gap: space.md, flexGrow: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  title: { flex: 1, color: colors.text },
  fact: { gap: 2 },
});
