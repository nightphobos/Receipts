import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Button, HelperText, SegmentedButtons, Text, TextInput } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRandomBytes } from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ASSETS, type Asset, type Direction } from "../core/call";
import { DEADLINE_PRESETS, draftCall, parseCustomHours } from "../core/draft";
import { formatUsd } from "../core/format";
import { isDemo } from "../core/price";
import { RECEIPTS_QUERY_KEY } from "../hooks/useReceipts";
import { usePriceSource } from "../hooks/usePriceSource";
import { DemoBadge } from "../components/receipt/demo-badge";
import { isUserRejection, sealCall } from "../chain/seal";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useConnection } from "../utils/ConnectionProvider";
import { ConnectButton } from "../components/sign-in/sign-in-ui";
import { alertAndLog } from "../utils/alertAndLog";
import { showToast } from "../components/ui/toast";

const WARNED_KEY = "rcpt:warned-local-secrets";
const CUSTOM = "custom";

function useLatestPrice(asset: Asset) {
  const source = usePriceSource();
  return useQuery({
    queryKey: ["price-latest", source.kindOf(asset), asset],
    queryFn: () => source.latest(asset),
    refetchInterval: 15_000,
    retry: 1,
  });
}

/** Shown once before the first seal: losing local data = forfeit. Resolves true if accepted. */
async function confirmLocalSecretsWarning(): Promise<boolean> {
  if ((await AsyncStorage.getItem(WARNED_KEY)) === "1") return true;
  const ok = await new Promise<boolean>((resolve) =>
    Alert.alert(
      "Your secret stays on this phone",
      "The salt that reveals this call is stored only on this device. If you uninstall the app or lose the phone before revealing, the call counts as a miss. Use Profile → Export secrets to back them up.",
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

export function NewReceiptScreen() {
  const { selectedAccount } = useAuthorization();
  const { connection } = useConnection();
  const wallet = useMobileWallet();
  const navigation = useNavigation();
  const queryClient = useQueryClient();

  const [asset, setAsset] = useState<Asset>("SOL");
  const [dir, setDir] = useState<Direction>("above");
  const [targetText, setTargetText] = useState("");
  const [preset, setPreset] = useState<string>(String(DEADLINE_PRESETS[1].seconds));
  const [customHours, setCustomHours] = useState("");
  const [tried, setTried] = useState(false);
  const [sealing, setSealing] = useState(false);

  const priceSource = usePriceSource();
  const demo = isDemo(priceSource, asset);
  const priceName = demo ? "demo" : "Pyth";
  const price = useLatestPrice(asset);
  const durationSec = preset === CUSTOM ? parseCustomHours(customHours) : Number(preset);
  const nowSec = Math.floor(Date.now() / 1000);
  const draft = draftCall({ asset, dir, targetText, durationSec }, nowSec);
  const showErrors = tried || targetText !== "";

  const onSeal = useCallback(async () => {
    setTried(true);
    if (!selectedAccount) return;
    const now = Math.floor(Date.now() / 1000);
    const result = draftCall({ asset, dir, targetText, durationSec }, now);
    if (!result.ok) return;
    if (!(await confirmLocalSecretsWarning())) return;

    setSealing(true);
    try {
      const { hash, signature } = await sealCall(
        {
          signer: selectedAccount.publicKey,
          store: AsyncStorage,
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
      setTargetText("");
      setTried(false);
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
  }, [selectedAccount, asset, dir, targetText, durationSec, connection, wallet, navigation, queryClient]);

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

  const deadlineSec = durationSec !== null ? nowSec + durationSec : null;

  return (
    <ScrollView contentContainerStyle={styles.screenContainer} keyboardShouldPersistTaps="handled">
      <Text variant="titleLarge">Seal a call</Text>

      <Text variant="labelLarge" style={styles.label}>Asset</Text>
      <SegmentedButtons
        value={asset}
        onValueChange={(v) => setAsset(v as Asset)}
        buttons={ASSETS.map((a) => ({ value: a, label: a }))}
      />
      <View style={styles.hintRow}>
        <HelperText type="info" visible>
          {price.isLoading
            ? `Loading ${priceName} price…`
            : price.data
              ? `${demo ? "Demo price" : "Pyth"} now: $${formatUsd(price.data.price)}`
              : `${priceName} price unavailable`}
        </HelperText>
        {demo && <DemoBadge />}
      </View>

      <Text variant="labelLarge" style={styles.label}>Price at deadline will be</Text>
      <SegmentedButtons
        value={dir}
        onValueChange={(v) => setDir(v as Direction)}
        buttons={[
          { value: "above", label: "Above", icon: "arrow-up" },
          { value: "below", label: "Below", icon: "arrow-down" },
        ]}
      />

      <TextInput
        style={styles.gap}
        mode="outlined"
        label="Target price (USD)"
        keyboardType="decimal-pad"
        value={targetText}
        onChangeText={setTargetText}
        left={<TextInput.Affix text="$" />}
      />

      <Text variant="labelLarge" style={styles.label}>Deadline</Text>
      <SegmentedButtons
        value={preset}
        onValueChange={setPreset}
        buttons={[
          ...DEADLINE_PRESETS.map((p) => ({ value: String(p.seconds), label: p.label })),
          { value: CUSTOM, label: "Custom" },
        ]}
      />
      {preset === CUSTOM && (
        <TextInput
          style={styles.gap}
          mode="outlined"
          label="Hours from now (1 – 720)"
          keyboardType="decimal-pad"
          value={customHours}
          onChangeText={setCustomHours}
        />
      )}
      {deadlineSec !== null && (
        <HelperText type="info" visible>
          {`Deadline: ${new Date(deadlineSec * 1000).toLocaleString()}`}
        </HelperText>
      )}

      {showErrors && !draft.ok &&
        draft.errors.map((e) => (
          <HelperText key={e} type="error" visible>
            {e}
          </HelperText>
        ))}

      <Button
        style={styles.gap}
        mode="contained"
        icon="lock"
        onPress={onSeal}
        loading={sealing}
        disabled={sealing || (showErrors && !draft.ok)}
      >
        Seal
      </Button>
      <Text variant="bodySmall" style={styles.gap}>
        Only a hash goes on chain now. After the deadline you reveal the call; if you don't within 24 h, it counts as a miss.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hintRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  screenContainer: {
    padding: 16,
  },
  label: {
    marginTop: 16,
    marginBottom: 8,
  },
  gap: {
    marginTop: 12,
  },
});
