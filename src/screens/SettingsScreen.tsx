import { ScrollView, StyleSheet, View } from "react-native";

import { useCluster } from "../components/cluster/cluster-data-access";
import { ASSETS } from "../core/call";
import { SOURCE_LABEL } from "../core/price";
import { usePriceSource } from "../hooks/usePriceSource";
import { LEADERBOARD_SOURCE } from "../hooks/useLeaderboard";
import { Body, Heading, Muted, PixelButton, PixelPanel, space, useParallaxScroll } from "../theme";
import { DEMO_ALLOWED, enterDemo, exitDemo, resetDemo, useDemo } from "../demo/store";

/** Read-only build settings: cluster and data sources are fixed at build time (EXPO_PUBLIC_*). */
export function SettingsScreen() {
  const parallaxScroll = useParallaxScroll();
  const { selectedCluster } = useCluster();
  const priceSource = usePriceSource();
  const demo = useDemo();
  return (
    <ScrollView {...parallaxScroll} contentContainerStyle={styles.container}>
      {DEMO_ALLOWED && (
        <PixelPanel title="DEMO MODE">
          <Muted>
            {demo.active
              ? "On: simulated wallets, calls and prices on this phone only. Nothing is signed or sent; your real wallet and secrets are untouched."
              : "Try the full loop without a wallet: simulated data, clearly marked DEMO, nothing is signed or sent."}
          </Muted>
          {demo.active ? (
            <>
              <PixelButton label="Exit demo" variant="gold" onPress={exitDemo} />
              <PixelButton label="Reset demo data" variant="ghost" onPress={() => resetDemo()} />
            </>
          ) : (
            <PixelButton label="Try demo (no wallet)" variant="ghost" onPress={enterDemo} />
          )}
        </PixelPanel>
      )}
      <PixelPanel title="CLUSTER">
        <Heading>{selectedCluster.name}</Heading>
        <Muted selectable>{selectedCluster.endpoint}</Muted>
        <Muted>Set at build time (EXPO_PUBLIC_CLUSTER / EXPO_PUBLIC_RPC_URL).</Muted>
      </PixelPanel>
      <PixelPanel title="DATA">
        {ASSETS.map((a) => (
          <View key={a} style={styles.row}>
            <Body>{`${a} price`}</Body>
            <Body>{SOURCE_LABEL[priceSource.kindOf(a)].name}</Body>
          </View>
        ))}
        <View style={styles.row}>
          <Body>Leaderboard</Body>
          <Body>{LEADERBOARD_SOURCE === "site" ? "Indexer site" : "Registry (on phone)"}</Body>
        </View>
      </PixelPanel>
      <PixelPanel title="ABOUT">
        <Body>Receipts</Body>
        <Muted>
          Seal a price call as a hash now, reveal it after the deadline. Unrevealed calls count as misses. No
          backend, no custom program — everything is read from Solana and public price APIs.
        </Muted>
      </PixelPanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.md, gap: space.md },
  row: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
});
