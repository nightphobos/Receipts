import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Chip, HelperText, SegmentedButtons, Text } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRandomBytes } from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ASSETS, type Asset, type DirectionV2 } from "../core/call";
import { DEFAULT_HORIZON, HORIZON_CHOICES, deadlineFor, draftAsset, draftCallV2, type HorizonChoice } from "../core/draftV2";
import { formatUsd } from "../core/format";
import { SOURCE_LABEL, isDemo } from "../core/price";
import { hasOpenPosition, horizonClass } from "../core/score";
import type { MasterState } from "../storage/master";
import { RECEIPTS_QUERY_KEY, useReceiptsV2 } from "../hooks/useReceipts";
import { useMasterKey } from "../hooks/useMasterKey";
import { usePriceSource } from "../hooks/usePriceSource";
import { useNowSec } from "../hooks/useNow";
import { DemoBadge } from "../components/receipt/demo-badge";
import { isUserRejection, sealCallV2 } from "../chain/seal";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useConnection } from "../utils/ConnectionProvider";
import { ConnectButton } from "../components/sign-in/sign-in-ui";
import { alertAndLog } from "../utils/alertAndLog";
import { showToast } from "../components/ui/toast";
import { MascotDialog, useParallaxScroll } from "../theme";
import { mascotLine } from "../core/mascot";

const WARNED_KEY = "rcpt:warned-local-secrets";

function useLatestPrice(asset: Asset) {
  const source = usePriceSource();
  return useQuery({
    queryKey: ["price-latest", source.kindOf(asset), asset],
    queryFn: () => source.latest(asset),
    refetchInterval: 15_000,
    retry: 1,
  });
}

/**
 * Random-salt fallback only (wallet signs non-deterministically): losing local data = forfeit.
 * Shown once before the first such seal. Resolves true if accepted.
 */
async function confirmLocalSecretsWarning(): Promise<boolean> {
  if ((await AsyncStorage.getItem(WARNED_KEY)) === "1") return true;
  const ok = await new Promise<boolean>((resolve) =>
    Alert.alert(
      "Your secret stays on this phone",
      "Your wallet doesn't sign deterministically, so calls can't be recovered from it. The salt that reveals this call is stored only on this device. If you uninstall the app or lose the phone before revealing, the call counts as a miss. Use Profile → Export secrets to back them up.",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "I understand", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
  if (ok) await AsyncStorage.setItem(WARNED_KEY, "1");
  return ok;
}

function MasterKeyCard({ state, onSetup, busy }: { state: MasterState | null; onSetup: () => void; busy: boolean }) {
  if (state?.mode === "derived") return null;
  if (state?.mode === "random")
    return (
      <Card style={[styles.gap, styles.warnCard]}>
        <Card.Content>
          <Text variant="titleSmall">Secrets are stored only on this phone</Text>
          <Text variant="bodySmall">
            Your wallet signed the key message differently twice, so calls can't be recovered on another device.
            Back up with Profile → Export secrets.
          </Text>
        </Card.Content>
      </Card>
    );
  return (
    <Card style={styles.gap}>
      <Card.Content>
        <Text variant="titleSmall">Set up your receipt key</Text>
        <Text variant="bodySmall">
          Your wallet signs a fixed message (twice, to check it's deterministic). It hides your direction until you
          reveal and lets you reveal from any phone. It cannot move funds.
        </Text>
      </Card.Content>
      <Card.Actions>
        <Button icon="key" onPress={onSetup} loading={busy} disabled={busy}>
          Sign to set up
        </Button>
      </Card.Actions>
    </Card>
  );
}

export function NewReceiptScreen() {
  const parallaxScroll = useParallaxScroll();
  const { selectedAccount } = useAuthorization();
  const { connection } = useConnection();
  const wallet = useMobileWallet();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const masterKey = useMasterKey(selectedAccount?.publicKey);
  const receipts = useReceiptsV2(selectedAccount?.publicKey);
  const nowSec = useNowSec();

  const [assetPick, setAsset] = useState<Asset>("SOL");
  const [dir, setDir] = useState<DirectionV2 | null>(null);
  const [horizon, setHorizon] = useState<HorizonChoice>(DEFAULT_HORIZON);
  const [settingUp, setSettingUp] = useState(false);
  const [sealing, setSealing] = useState(false);

  const asset = draftAsset({ asset: assetPick, horizon });
  const priceSource = usePriceSource();
  const demo = isDemo(priceSource, asset);
  const { name: priceName, quote } = SOURCE_LABEL[priceSource.kindOf(asset)];
  const price = useLatestPrice(asset);
  const deadlineSec = deadlineFor(horizon, nowSec);
  const open = hasOpenPosition(
    (receipts.data ?? []).map((r) => r.receipt),
    asset,
    horizonClass(nowSec, deadlineSec),
    nowSec,
  );

  const setupMaster = useCallback(async (): Promise<MasterState | null> => {
    setSettingUp(true);
    try {
      const state = await masterKey.setup();
      if (state.mode === "random") showToast("Wallet signatures differ: secrets will stay on this phone only.");
      return state;
    } catch (e) {
      if (isUserRejection(e)) showToast("Key setup cancelled.");
      else alertAndLog("Key setup failed", e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setSettingUp(false);
    }
  }, [masterKey]);

  const onSeal = useCallback(async () => {
    if (!selectedAccount) return;
    const result = draftCallV2({ asset, dir, horizon }, Math.floor(Date.now() / 1000));
    if (!result.ok) return;
    const state = masterKey.state ?? (await setupMaster());
    if (!state) return;
    if (state.mode === "random" && !(await confirmLocalSecretsWarning())) return;

    setSealing(true);
    try {
      const { hash, signature } = await sealCallV2(
        {
          signer: selectedAccount.publicKey,
          store: AsyncStorage,
          master: state.mode === "derived" ? state.master : null,
          randomBytes: getRandomBytes,
          getLatestBlockhash: async () => {
            const { context, value } = await connection.getLatestBlockhashAndContext();
            return { blockhash: value.blockhash, slot: context.slot };
          },
          signAndSend: wallet.signAndSendTransaction,
        },
        result.call,
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Let Chekko finish chewing before leaving the screen.
      await new Promise((r) => setTimeout(r, 700));
      setDir(null);
      queryClient.invalidateQueries({ queryKey: [RECEIPTS_QUERY_KEY] });
      navigation.navigate("ReceiptDetail", { hash, signature });
    } catch (e) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (isUserRejection(e)) showToast("Not sealed: signing was cancelled, nothing was sent.");
      else
        alertAndLog(
          "Seal failed",
          `${e instanceof Error ? e.message : String(e)}\n\nIf the transaction landed it will appear in your list; its secret is kept on this phone.`,
        );
    } finally {
      setSealing(false);
    }
  }, [selectedAccount, asset, dir, horizon, masterKey.state, setupMaster, connection, wallet, navigation, queryClient]);

  if (!selectedAccount) {
    return (
      <View style={styles.screenContainer}>
        <Text variant="titleLarge">Seal a call</Text>
        <Text style={styles.gap}>Connect your wallet to seal a price call on Solana.</Text>
        <View style={styles.gap}>
          <ConnectButton />
        </View>
      </View>
    );
  }

  return (
    <ScrollView {...parallaxScroll} contentContainerStyle={styles.screenContainer}>
      <Text variant="titleLarge">Seal a call</Text>
      <MascotDialog
        style={styles.gap}
        pose={sealing ? "eat" : "idle"}
        text={mascotLine(sealing ? "eat" : "idle", { asset, horizon })}
      />
      {!masterKey.isLoading && (
        <MasterKeyCard state={masterKey.state} onSetup={setupMaster} busy={settingUp} />
      )}

      <Text variant="labelLarge" style={styles.label}>Asset</Text>
      <SegmentedButtons
        value={asset}
        onValueChange={(v) => setAsset(v as Asset)}
        buttons={ASSETS.map((a) => ({ value: a, label: a, disabled: horizon === "skr-daily" && a !== "SKR" }))}
      />
      <View style={styles.hintRow}>
        <HelperText type="info" visible>
          {price.isLoading
            ? `Loading ${priceName} price…`
            : price.data
              ? `${priceName} ${asset}/${quote} now: ${formatUsd(price.data.price)}`
              : `${priceName} price unavailable`}
        </HelperText>
        {demo && <DemoBadge />}
      </View>

      <Text variant="labelLarge" style={styles.label}>At the deadline the price will be</Text>
      <View style={styles.dirRow}>
        <Button
          mode={dir === "up" ? "contained" : "outlined"}
          buttonColor={dir === "up" ? "#1E9E5A" : undefined}
          style={styles.dirButton}
          contentStyle={styles.dirContent}
          labelStyle={styles.dirLabel}
          onPress={() => setDir("up")}
        >
          ▲ Up
        </Button>
        <Button
          mode={dir === "down" ? "contained" : "outlined"}
          buttonColor={dir === "down" ? "#D03B3B" : undefined}
          style={styles.dirButton}
          contentStyle={styles.dirContent}
          labelStyle={styles.dirLabel}
          onPress={() => setDir("down")}
        >
          ▼ Down
        </Button>
      </View>
      <Text variant="bodySmall" style={styles.muted}>
        Compared with the price one minute after your seal lands on chain.
      </Text>

      <Text variant="labelLarge" style={styles.label}>Horizon</Text>
      <View style={styles.chips}>
        {HORIZON_CHOICES.map((h) => (
          <Chip key={h.value} selected={horizon === h.value} showSelectedOverlay onPress={() => setHorizon(h.value)}>
            {h.label}
          </Chip>
        ))}
      </View>
      <HelperText type="info" visible>
        {`Deadline: ${new Date(deadlineSec * 1000).toLocaleString()}`}
      </HelperText>
      {horizon === "1h" && (
        <HelperText type="info" visible>
          Practice: counts in your stats, never on the leaderboard.
        </HelperText>
      )}
      {horizon === "skr-daily" && (
        <HelperText type="info" visible>
          SKR Daily: everybody's daily SKR call ends at the same 12:00 UTC.
        </HelperText>
      )}
      {open && (
        <HelperText type="error" visible>
          {`You already have an open ${asset} call in this horizon. A second one now would count as a miss — wait for its deadline.`}
        </HelperText>
      )}

      <Button
        style={styles.gap}
        mode="contained"
        icon="lock"
        onPress={onSeal}
        loading={sealing || settingUp}
        disabled={sealing || settingUp || dir === null || open || masterKey.isLoading}
      >
        Seal
      </Button>
      <Text variant="bodySmall" style={styles.gap}>
        Only a hash goes on chain now; your direction stays hidden. After the deadline you reveal it; if you don't
        within 24 h, it counts as a miss.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hintRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  screenContainer: { padding: 16 },
  label: { marginTop: 16, marginBottom: 8 },
  gap: { marginTop: 12 },
  muted: { marginTop: 6, opacity: 0.7 },
  warnCard: { backgroundColor: "#FFF4D6" },
  dirRow: { flexDirection: "row", gap: 12 },
  dirButton: { flex: 1 },
  dirContent: { height: 72 },
  dirLabel: { fontSize: 22, fontWeight: "bold" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
