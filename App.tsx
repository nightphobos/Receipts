// Polyfills
import "./src/polyfills";

import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConnectionProvider } from "./src/utils/ConnectionProvider";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaperProvider } from "react-native-paper";
import { AppNavigator } from "./src/navigators/AppNavigator";
import { ClusterProvider } from "./src/components/cluster/cluster-data-access";
import { ToastHost, showErrorToast } from "./src/components/ui/toast";
import { ParallaxBackground, colors, nightTheme, useThemeFonts } from "./src/theme";
import { useEffect, useState } from "react";
import { loadDemoState } from "./src/demo/store";
import { DemoBanner, DemoRibbon, DemoSync } from "./src/demo/DemoChrome";
import { ReminderSync } from "./src/notifications/ReminderSync";
import { Onboarding } from "./src/onboarding/Onboarding";
import { loadOnboarding } from "./src/onboarding/store";

// Queries opt into an error toast with `meta: { errorToast: "<prefix>" }`.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const prefix = query.meta?.errorToast;
      if (typeof prefix === "string") showErrorToast(prefix, error);
    },
  }),
});

export default function App() {
  const fontsReady = useThemeFonts();
  const [demoLoaded, setDemoLoaded] = useState(false);
  useEffect(() => {
    Promise.all([loadDemoState(), loadOnboarding()]).finally(() => setDemoLoaded(true));
  }, []);
  if (!fontsReady || !demoLoaded) return <View style={styles.shell} />;
  return (
    <QueryClientProvider client={queryClient}>
      <ClusterProvider>
        <ConnectionProvider config={{ commitment: "confirmed" }}>
          <SafeAreaView style={styles.shell}>
            <PaperProvider theme={nightTheme}>
              <DemoSync />
              <ReminderSync />
              <DemoBanner />
              <View style={styles.content}>
                <ParallaxBackground>
                  <AppNavigator />
                </ParallaxBackground>
                {/* Inside the content area so the ribbon sits under the banner, not over its EXIT button. */}
                <DemoRibbon />
              </View>
              <Onboarding />
              <ToastHost />
            </PaperProvider>
          </SafeAreaView>
        </ConnectionProvider>
      </ClusterProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
