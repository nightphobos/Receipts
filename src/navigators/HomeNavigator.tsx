import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { TopBar } from "../components/top-bar/top-bar-feature";
import { ReceiptsListScreen } from "../screens/ReceiptsListScreen";
import { NewReceiptScreen } from "../screens/NewReceiptScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { PixelTabBar } from "../theme";

export type HomeTabParamList = {
  Home: undefined;
  New: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<HomeTabParamList>();

/**
 * Main navigator: Night Register 3-tab bar (RECEIPTS · NEW · third tab).
 * The third tab is Profile until the leaderboard (T040) turns it into RANK.
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
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
