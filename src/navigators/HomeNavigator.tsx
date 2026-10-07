import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { TopBar } from "../components/top-bar/top-bar-feature";
import { ReceiptsListScreen } from "../screens/ReceiptsListScreen";
import { NewReceiptScreen } from "../screens/NewReceiptScreen";
import { LeaderboardScreen } from "../screens/LeaderboardScreen";
import { PixelTabBar } from "../theme";

export type HomeTabParamList = {
  Home: undefined;
  New: undefined;
  Rank: undefined;
};

const Tab = createBottomTabNavigator<HomeTabParamList>();

/**
 * Main navigator: Night Register 3-tab bar (RECEIPTS · NEW · RANK).
 * Own stats (Profile) are a stack screen opened from the Receipts list.
 */
export function HomeNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <PixelTabBar {...props} />}
      sceneContainerStyle={{ backgroundColor: "transparent" }}
      screenOptions={{
        header: () => <TopBar />,
      }}
    >
      <Tab.Screen name="Home" component={ReceiptsListScreen} options={{ title: "Receipts" }} />
      <Tab.Screen name="New" component={NewReceiptScreen} />
      <Tab.Screen name="Rank" component={LeaderboardScreen} options={{ title: "Rank" }} />
    </Tab.Navigator>
  );
}
