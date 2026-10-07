import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PixelIcon, PixelIconName } from "./icons";
import { colors, fonts, pixel, space } from "./tokens";

/** Route name → pixel icon. Unknown routes fall back to the receipt icon. */
const TAB_ICONS: Record<string, PixelIconName> = {
  Home: "receipt",
  New: "lock",
  Profile: "trophy",
  Rank: "trophy",
};

/** Night Register bottom bar: 3 tabs, uppercase pixel labels, active = gold with ▶. */
export function PixelTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.bar}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = (options.tabBarLabel as string | undefined) ?? options.title ?? route.name;
        const color = focused ? colors.accent : colors.textMuted;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={styles.tab}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                Haptics.selectionAsync().catch(() => {});
                navigation.navigate(route.name, route.params);
              }
            }}
          >
            <PixelIcon name={TAB_ICONS[route.name] ?? "receipt"} scale={1.5} color={color} accent={color} />
            <Text style={[styles.label, { color }]}>
              {focused ? "▶ " : ""}
              {label.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: colors.bgDeep,
    borderTopWidth: pixel.border,
    borderTopColor: colors.border,
    paddingVertical: space.sm,
  },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  label: { fontFamily: fonts.heading, fontSize: 12, letterSpacing: 1 },
});
