import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "../components/AppIcon";
import { MainTabBar } from "../components/MainTabBar";
import { useAuth } from "../contexts/AuthContext";
import { HomeScreen } from "../screens/HomeScreen";
import { PlaceholderScreen } from "../screens/PlaceholderScreen";
import { SignInScreen } from "../screens/SignInScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { colors } from "../theme/colors";
import { headerIcons, screenHeroIcons } from "../theme/icons";
import type { AuthScreen, MainTab } from "./types";

function MainContent({ tab }: { tab: MainTab }) {
  switch (tab) {
    case "Home":
      return <HomeScreen />;
    case "Catalog":
      return (
        <PlaceholderScreen
          icon={screenHeroIcons.Catalog}
          title="Catalog"
          description="Your inventory list will appear here."
        />
      );
    case "Scan":
      return (
        <PlaceholderScreen
          icon={screenHeroIcons.Scan}
          title="Scan"
          description="QR cert lookup starts in the next Phase 1 milestone."
        />
      );
    case "Advisor":
      return (
        <PlaceholderScreen
          icon={screenHeroIcons.Advisor}
          title="Advisor"
          description="Buy / sell / hold recommendations come in Phase 5."
        />
      );
    case "Settings":
      return (
        <PlaceholderScreen
          icon={screenHeroIcons.Settings}
          title="Settings"
          description="Org, integrations, and rules will live here."
        />
      );
  }
}

function MainShell() {
  const [tab, setTab] = useState<MainTab>("Home");
  const insets = useSafeAreaInsets();
  const title = tab === "Home" ? "NexIssue" : tab;
  const headerIcon = headerIcons[tab];

  return (
    <View style={styles.shell}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {tab === "Home" ? (
          <Image
            accessibilityLabel="NexIssue"
            source={require("../../assets/logo.png")}
            style={styles.headerLogo}
          />
        ) : (
          <AppIcon name={headerIcon} size={22} color={colors.text} />
        )}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.content}>
        <MainContent tab={tab} />
      </View>
      <MainTabBar active={tab} onChange={setTab} />
    </View>
  );
}

export function RootNavigator() {
  const { session, loading } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>("signIn");

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!session) {
    return authScreen === "signIn" ? (
      <SignInScreen onGoToSignUp={() => setAuthScreen("signUp")} />
    ) : (
      <SignUpScreen onGoToSignIn={() => setAuthScreen("signIn")} />
    );
  }

  return <MainShell />;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
  shell: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.surfaceBorder,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  headerLogo: {
    height: 28,
    resizeMode: "contain",
    width: 28,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
});
