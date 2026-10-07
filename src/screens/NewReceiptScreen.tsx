import React, { useCallback, useState } from "react";
import { appNowSec, useDemo } from "../demo/store";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
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
import { scheduleSealReminders } from "../notifications/reminders";
import {
  Body,
  Chip,
  Heading,
  MascotDialog,
  Muted,
  Num,
  PixelButton,
  PixelPanel,
  Title,
  colors,
  space,
  useParallaxScroll,
} from "../theme";
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
      <PixelPanel title="SECRETS STAY ON THIS PHONE" style={styles.warnPanel}>
        <Muted>
          Your wallet signed the key message differently twice, so calls can't be recovered on another device.
          Back up with My stats → Export secrets.
        </Muted>
      </PixelPanel>
    );
  return (
    <PixelPanel title="SET UP YOUR RECEIPT KEY">
      <Muted>
        Your wallet signs a fixed message (twice, to check it's deterministic). It hides your direction until you
        reveal and lets you reveal from any phone. It cannot move funds.
      </Muted>
      <PixelButton label={busy ? "Signing…" : "Sign to set up"} variant="ghost" onPress={onSetup} disabled={busy} />
    </PixelPanel>
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
  const demoMode = useDemo().active;
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
    if (!draftCallV2({ asset, dir, horizon }, appNowSec()).ok) return;
    const state = masterKey.state ?? (await setupMaster());
    if (!state) return;
    if (state.mode === "random" && !(await confirmLocalSecretsWarning())) return;
    // Draft (created, deadline) only now: first-time key setup can take minutes, and recovery
    // looks for `created` within 15 min before the commit lands.
    const result = draftCallV2({ asset, dir, horizon }, appNowSec());
    if (!result.ok) return;

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
      // Number may be off by unindexed seals; reconcile on the next history read corrects the text.
      await scheduleSealReminders({
        hash,
        signature,
        asset: result.call.asset,
        deadline: result.call.deadline,
        number: (receipts.data?.length ?? 0) + 1,
      });
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
  }, [selectedAccount, asset, dir, horizon, masterKey.state, setupMaster, connection, wallet, navigation, queryClient, receipts.data]);

  if (!selectedAccount) {
    return (
      <View style={styles.screenContainer}>
        <Title>SEAL A CALL</Title>
        <MascotDialog pose="idle" text="Connect your wallet and I'll print your first receipt." />
        <ConnectButton />
      </View>
    );
  }

  return (
    <ScrollView {...parallaxScroll} contentContainerStyle={styles.screenContainer}>
      <Title>SEAL A CALL</Title>
      <MascotDialog
        pose={sealing ? "eat" : "idle"}
        text={mascotLine(sealing ? "eat" : "idle", { asset, horizon })}
      />
      {!masterKey.isLoading && !demoMode && (
        <MasterKeyCard state={masterKey.state} onSetup={setupMaster} busy={settingUp} />
      )}

      <PixelPanel>
        <Heading>ASSET</Heading>
        <View style={styles.chips}>
          {ASSETS.map((a) => (
            <Chip
              key={a}
              label={a}
              icon={a === "SKR" ? "coin" : undefined}
              selected={asset === a}
              disabled={horizon === "skr-daily" && a !== "SKR"}
              onPress={() => setAsset(a)}
            />
          ))}
        </View>
        <View style={styles.priceRow}>
          <Muted>{`${priceName} ${asset}/${quote} now`}</Muted>
          {demo && <DemoBadge />}
        </View>
        <Num style={styles.price}>
          {price.isLoading ? "…" : price.data ? `$${formatUsd(price.data.price)}` : "unavailable"}
        </Num>
      </PixelPanel>

      <Heading style={styles.label}>AT THE DEADLINE THE PRICE WILL BE</Heading>
      <View style={styles.dirRow}>
        <PixelButton
          label="▲ UP"
          big
          variant={dir === "up" ? "up" : "upOutline"}
          style={styles.dirButton}
          onPress={() => setDir("up")}
          accessibilityLabel="Up"
        />
        <PixelButton
          label="▼ DOWN"
          big
          variant={dir === "down" ? "downSolid" : "down"}
          style={styles.dirButton}
          onPress={() => setDir("down")}
          accessibilityLabel="Down"
        />
      </View>
      <Muted>Compared with the price one minute after your seal lands on chain.</Muted>

      <Heading style={styles.label}>HORIZON</Heading>
      <View style={styles.chips}>
        {HORIZON_CHOICES.map((h) => (
          <Chip
            key={h.value}
            label={h.label}
            icon={h.value === "skr-daily" ? "coin" : undefined}
            selected={horizon === h.value}
            onPress={() => setHorizon(h.value)}
          />
        ))}
      </View>
      <View style={styles.deadline}>
        <Muted>DEADLINE</Muted>
        <Num>{new Date(deadlineSec * 1000).toLocaleString()}</Num>
      </View>
      {horizon === "1h" && <Muted>Practice: counts in your stats, never on the leaderboard.</Muted>}
      {horizon === "skr-daily" && <Muted>SKR Daily: everybody's daily SKR call ends at the same 12:00 UTC.</Muted>}
      {open && (
        <Body style={styles.error}>
          {`You already have an open ${asset} call in this horizon. A second one now would count as a miss — wait for its deadline.`}
        </Body>
      )}

      <PixelButton
        style={styles.gap}
        label={sealing ? "SEALING…" : settingUp ? "SIGNING…" : "SEAL"}
        icon="lock"
        big
        onPress={onSeal}
        disabled={sealing || settingUp || dir === null || open || masterKey.isLoading}
      />
      <Muted>
        Only a hash goes on chain now; your direction stays hidden. After the deadline you reveal it; if you don't
        within 24 h, it counts as a miss.
      </Muted>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenContainer: { padding: space.md, gap: space.md },
  label: { marginTop: space.sm },
  gap: { marginTop: space.sm },
  warnPanel: { borderColor: colors.accent },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xs },
  price: { fontSize: 32, color: colors.accent },
  dirRow: { flexDirection: "row", gap: space.md },
  dirButton: { flex: 1 },
  deadline: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  error: { color: colors.down },
});
