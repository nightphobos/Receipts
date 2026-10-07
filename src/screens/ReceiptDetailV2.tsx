import React, { useCallback, useEffect, useState } from "react";
import { demoShareText, isDemoSignature } from "../core/demoData";
import { useDemo } from "../demo/store";
import { appNowSec } from "../demo/store";
import { Linking, RefreshControl, ScrollView, Share, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";

import { describeCallV2, formatCountdown, formatUsd, solscanTxUrl } from "../core/format";
import { SOURCE_LABEL, isDemo } from "../core/price";
import { REVEAL_GRACE_SEC, statusOfV2, type ReceiptV2, type StatusV2 } from "../core/score";
import { resultShareText, sealedShareText } from "../core/share";
import { canRevealV2, findSecretV2, revealReceiptV2 } from "../chain/reveal";
import { isUserRejection } from "../chain/seal";
import { RECEIPTS_QUERY_KEY, type ReceiptRowV2 } from "../hooks/useReceipts";
import { useMasterKey } from "../hooks/useMasterKey";
import { useNowSec } from "../hooks/useNow";
import { usePriceSource } from "../hooks/usePriceSource";
import { DemoBadge } from "../components/receipt/demo-badge";
import { RevealCeremony } from "../components/receipt/reveal-ceremony";
import { useCluster } from "../components/cluster/cluster-data-access";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useConnection } from "../utils/ConnectionProvider";
import { alertAndLog } from "../utils/alertAndLog";
import { showToast } from "../components/ui/toast";
import {
  Body,
  MascotDialog,
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
import { mascotLine, poseForStatus } from "../core/mascot";

const fmtTime = (sec: number) => new Date(sec * 1000).toLocaleString();

function TxLink({ label, signature, cluster }: { label: string; signature: string; cluster: string }) {
  if (isDemoSignature(signature))
    return <PixelLink label={`${label} · simulated`} onPress={() => showToast("Demo: simulated tx — nothing is on Solana")} />;
  return <PixelLink label={label} onPress={() => Linking.openURL(solscanTxUrl(signature, cluster))} />;
}

/** One "label / value" pair in the on-chain facts panel. */
function Fact({ label, children, selectable }: { label: string; children: string; selectable?: boolean }) {
  return (
    <View style={styles.fact}>
      <Muted>{label}</Muted>
      <Body selectable={selectable}>{children}</Body>
    </View>
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
  all,
  refetch,
  isRefetching,
}: {
  row: ReceiptRowV2;
  /** All v2 receipts of the wallet: receipt number and record in the share text. */
  all: readonly ReceiptV2[];
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
  const demoMode = useDemo().active;
  const { name: priceName } = SOURCE_LABEL[priceSource.kindOf(receipt.asset)];
  const needsRecovery = !row.hasSecret && !masterKey.master;
  const pose = poseForStatus(status, { printing: revealing || pendingReveal });
  const resolved = status === "hit" || status === "miss" || status === "void";
  // null = show the printed receipt; a number = play the ceremony (bumped by Replay to remount).
  const [ceremonyKey, setCeremonyKey] = useState<number | null>(null);
  useEffect(() => {
    if (sentReveal && resolved) setCeremonyKey((k) => k ?? 1);
  }, [sentReveal, resolved]);

  // Sealed: direction stays hidden. Resolved: the result card. Nothing else is shareable.
  const share =
    status === "sealed"
      ? sealedShareText(receipt, cluster)
      : resultShareText(receipt, all, now, cluster, { demo });
  const shareOut = demoMode && share ? demoShareText(share) : share;
  const onShare = () => Share.share({ message: shareOut ?? "" }).catch(() => undefined);
  const onCopy = async () => {
    await Clipboard.setStringAsync(shareOut ?? "");
    showToast("Share text copied");
  };

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
          nowSec: () => appNowSec(),
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
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />
      }
    >
      <View style={styles.row}>
        <Title style={styles.title}>
          {call ? `$${describeCallV2(call).toUpperCase()}` : `$${receipt.asset} · HIDDEN`}
        </Title>
        <StatusStamp
          status={status}
          countdown={status === "sealed" ? formatCountdown(receipt.deadline - now) : undefined}
        />
      </View>
      <Muted>{`Horizon ${receipt.horizon}${receipt.horizon === "1h" ? " (practice)" : ""}`}</Muted>
      {pose !== "idle" && <MascotDialog pose={pose} text={mascotLine(pose, receipt)} />}
      {demo && <DemoBadge />}

      {resolved && (
        <>
          <RevealCeremony
            key={ceremonyKey ?? 0}
            play={ceremonyKey !== null}
            outcome={status}
            p0={receipt.p0 as number}
            pt={receipt.pt as number}
            commitSignature={receipt.commit.signature}
            sealedAt={receipt.commit.blockTime}
          />
          <PixelLink label="Replay reveal" onPress={() => setCeremonyKey((k) => (k ?? 0) + 1)} />
        </>
      )}

      {share && (
        <View style={styles.shareRow}>
          <PixelButton
            style={styles.flex}
            label={status === "sealed" ? "SHARE SEALED CALL" : "SHARE RESULT"}
            icon="share"
            onPress={onShare}
          />
          <PixelButton label="COPY" variant="ghost" onPress={onCopy} />
        </View>
      )}

      <PixelPanel>
        <Body>{resolutionText(row, status, now, priceName)}</Body>
        {status === "unresolved" && (
          <PixelButton label={isRefetching ? "Retrying…" : "Retry"} variant="ghost" disabled={isRefetching} onPress={refetch} />
        )}
      </PixelPanel>

      {pendingReveal && sentReveal && (
        <PixelPanel title="REVEAL SENT">
          <Muted>Waiting for it to confirm. Pull down to refresh.</Muted>
          <TxLink label="Reveal on Solscan" signature={sentReveal} cluster={cluster} />
        </PixelPanel>
      )}

      {canRevealV2(receipt, now) && !pendingReveal && (
        <>
          <PixelButton
            label={revealing ? "REVEALING…" : needsRecovery ? "RECOVER WITH WALLET & REVEAL" : "REVEAL"}
            icon="receipt"
            big
            onPress={onReveal}
            disabled={revealing}
          />
          {needsRecovery && (
            <Muted>The secret isn't on this phone. Your wallet signs the key message once to rebuild it.</Muted>
          )}
        </>
      )}

      <PixelPanel title="ON CHAIN">
        <Fact label="Deadline">{fmtTime(receipt.deadline)}</Fact>
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
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  title: { flex: 1, color: colors.text },
  shareRow: { flexDirection: "row", gap: space.sm },
  flex: { flex: 1 },
  fact: { gap: 2 },
});
