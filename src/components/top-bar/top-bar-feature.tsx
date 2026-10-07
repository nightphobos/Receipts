import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/core";

import { TopBarWalletMenu } from "./top-bar-ui";
import { PixelIcon, colors, fonts, pixel, space } from "../../theme";

/** Night Register header: app name left, wallet + settings right. */
export function TopBar() {
  const navigation = useNavigation();
  return (
    <View style={styles.bar}>
      <Text style={styles.brand}>RECEIPTS</Text>
      <View style={styles.right}>
        <TopBarWalletMenu />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
          style={({ pressed }) => [styles.gear, pressed && styles.pressed]}
          onPress={() => navigation.navigate("Settings")}
        >
          <PixelIcon name="gear" scale={1.5} color={colors.textMuted} accent={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.bgDeep,
    borderBottomWidth: pixel.border,
    borderBottomColor: colors.border,
  },
  brand: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.accent, letterSpacing: 2 },
  right: { flexDirection: "row", alignItems: "center", gap: space.md },
  gear: { padding: space.xs },
  pressed: { opacity: 0.6 },
});
