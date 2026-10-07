import React, { useCallback, useRef, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { ONBOARDING_PANELS, pageFromOffset, panelA11yLabel } from "../core/onboarding";
import { Body, Mascot, Muted, PixelButton, PixelPanel, Title, colors, space } from "../theme";
import { DEMO_ALLOWED, enterDemo } from "../demo/store";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useAuthorization } from "../utils/useAuthorization";
import { showErrorToast } from "../components/ui/toast";
import { finishOnboarding, useOnboardingVisible } from "./store";

/** Full-screen first-run overlay: 3 swipeable panels, "Skip" always visible. */
export function Onboarding() {
  const visible = useOnboardingVisible();
  if (!visible) return null;
  return <OnboardingPanels />;
}

function OnboardingPanels() {
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = ONBOARDING_PANELS.length - 1;

  const goTo = useCallback(
    (i: number) => {
      scroll.current?.scrollTo({ x: i * width, animated: true });
      setPage(i);
    },
    [width],
  );

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <View style={styles.topRow}>
        <Muted accessibilityLabel={`Step ${page + 1} of ${ONBOARDING_PANELS.length}`}>
          {ONBOARDING_PANELS.map((_, i) => (i === page ? "■" : "□")).join(" ")}
        </Muted>
        <PixelButton label="Skip" variant="ghost" onPress={finishOnboarding} accessibilityLabel="Skip introduction" style={styles.skip} />
      </View>
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(pageFromOffset(e.nativeEvent.contentOffset.x, width, ONBOARDING_PANELS.length))}
        style={styles.pager}
      >
        {ONBOARDING_PANELS.map((p, i) => (
          <View key={p.id} style={[styles.page, { width }]}>
            <View style={styles.mascot} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Mascot pose={p.pose} scale={8} />
            </View>
            <PixelPanel>
              <View accessible accessibilityLabel={panelA11yLabel(i)} style={styles.copy}>
                <Title>{p.title}</Title>
                {p.lines.map((l) => (
                  <Body key={l}>{l}</Body>
                ))}
              </View>
            </PixelPanel>
            {p.id === "start" && <StartActions />}
          </View>
        ))}
      </ScrollView>
      {page < last && (
        <View style={styles.bottom}>
          <PixelButton label="Next" onPress={() => goTo(page + 1)} accessibilityLabel="Next step" />
        </View>
      )}
    </View>
  );
}

function StartActions() {
  const { connect } = useMobileWallet();
  const { selectedAccount } = useAuthorization();
  const [busy, setBusy] = useState(false);
  const onConnect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await connect();
      finishOnboarding();
    } catch (err) {
      showErrorToast("Wallet connect failed", err);
    } finally {
      setBusy(false);
    }
  }, [busy, connect]);
  return (
    <View style={styles.actions}>
      {selectedAccount ? (
        <PixelButton label="Start" big onPress={finishOnboarding} />
      ) : (
        <PixelButton label={busy ? "Connecting…" : "Connect wallet"} big disabled={busy} onPress={onConnect} />
      )}
      {DEMO_ALLOWED && !selectedAccount && (
        <PixelButton
          label="Try demo (no wallet)"
          variant="ghost"
          onPress={() => {
            enterDemo();
            finishOnboarding();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, zIndex: 50, elevation: 50 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  skip: { minWidth: 88, minHeight: 44 },
  pager: { flex: 1 },
  page: { padding: space.lg, gap: space.lg, justifyContent: "center" },
  mascot: { alignItems: "center" },
  copy: { gap: space.sm },
  actions: { gap: space.sm },
  bottom: { padding: space.lg },
});
