import { useCallback, useState } from "react";
import { showErrorToast } from "../ui/toast";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { View } from "react-native";
import { PixelButton, Muted, space } from "../../theme";
import { DEMO_ALLOWED, enterDemo, useDemo } from "../../demo/store";

export function ConnectButton() {
  const { connect } = useMobileWallet();
  const [authorizationInProgress, setAuthorizationInProgress] = useState(false);
  const handleConnectPress = useCallback(async () => {
    if (authorizationInProgress) return;
    setAuthorizationInProgress(true);
    try {
      await connect();
    } catch (err) {
      showErrorToast("Wallet connect failed", err);
    } finally {
      setAuthorizationInProgress(false);
    }
  }, [authorizationInProgress, connect]);
  return (
    <View style={{ gap: space.sm }}>
      <PixelButton
        label={authorizationInProgress ? "Connecting…" : "Connect wallet"}
        big
        disabled={authorizationInProgress}
        onPress={handleConnectPress}
      />
      <TryDemoButton />
    </View>
  );
}

/** Entry to demo mode (simulated data, no wallet). Hidden in builds with EXPO_PUBLIC_DEMO_MODE=off. */
export function TryDemoButton() {
  const { active } = useDemo();
  if (!DEMO_ALLOWED || active) return null;
  return (
    <View style={{ gap: space.xs }}>
      <PixelButton label="Try demo (no wallet)" variant="ghost" onPress={enterDemo} />
      <Muted>Simulated data on this phone only. Nothing is signed or sent.</Muted>
    </View>
  );
}
