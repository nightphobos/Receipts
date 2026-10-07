import { Menu } from "react-native-paper";
import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Linking } from "react-native";

import { Account, useAuthorization } from "../../utils/useAuthorization";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { ellipsify } from "../../utils/ellipsify";
import { useCluster } from "../cluster/cluster-data-access";
import { showErrorToast } from "../ui/toast";
import { Chip, colors, fonts } from "../../theme";

export function TopBarWalletButton({
  selectedAccount,
  openMenu,
}: {
  selectedAccount: Account | null;
  openMenu: () => void;
}) {
  const { connect } = useMobileWallet();
  return (
    <Chip
      label={selectedAccount ? ellipsify(selectedAccount.publicKey.toBase58()) : "CONNECT"}
      selected={!selectedAccount}
      onPress={
        selectedAccount
          ? openMenu
          : () => connect().catch((e) => showErrorToast("Wallet connect failed", e))
      }
    />
  );
}

export function TopBarWalletMenu() {
  const { selectedAccount } = useAuthorization();
  const { getExplorerUrl } = useCluster();
  const [visible, setVisible] = useState(false);
  const openMenu = () => setVisible(true);
  const closeMenu = () => setVisible(false);
  const { disconnect } = useMobileWallet();

  const copyAddressToClipboard = async () => {
    if (selectedAccount) {
      await Clipboard.setStringAsync(selectedAccount.publicKey.toBase58());
    }
    closeMenu();
  };

  const viewExplorer = () => {
    if (selectedAccount) {
      Linking.openURL(getExplorerUrl(`account/${selectedAccount.publicKey.toBase58()}`));
    }
    closeMenu();
  };

  const itemStyle = { fontFamily: fonts.heading, color: colors.text };
  return (
    <Menu
      visible={visible}
      onDismiss={closeMenu}
      contentStyle={{ backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.paper, borderRadius: 0 }}
      anchor={<TopBarWalletButton selectedAccount={selectedAccount} openMenu={openMenu} />}
    >
      <Menu.Item onPress={copyAddressToClipboard} title="▶ Copy address" titleStyle={itemStyle} />
      <Menu.Item onPress={viewExplorer} title="▶ View on explorer" titleStyle={itemStyle} />
      <Menu.Item
        onPress={async () => {
          closeMenu();
          try {
            await disconnect();
          } catch (e) {
            showErrorToast("Disconnect failed", e);
          }
        }}
        title="▶ Disconnect"
        titleStyle={{ ...itemStyle, color: colors.down }}
      />
    </Menu>
  );
}
