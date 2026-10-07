import { useCallback, useState } from "react";
import { showErrorToast } from "../ui/toast";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { PixelButton } from "../../theme";

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
    <PixelButton
      label={authorizationInProgress ? "Connecting…" : "Connect wallet"}
      big
      disabled={authorizationInProgress}
      onPress={handleConnectPress}
    />
  );
}
