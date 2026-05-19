import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "./AppIcon";
import { colors } from "../theme/colors";
import { tabIcons } from "../theme/icons";
import type { MainTab } from "../navigation/types";

const TABS: { key: MainTab; label: string }[] = [
  { key: "Home", label: "Home" },
  { key: "Catalog", label: "Catalog" },
  { key: "Scan", label: "Scan" },
  { key: "Advisor", label: "Advisor" },
  { key: "Settings", label: "Settings" },
];

type MainTabBarProps = {
  active: MainTab;
  onChange: (tab: MainTab) => void;
};

export function MainTabBar({ active, onChange }: MainTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const iconName = isActive
          ? tabIcons[tab.key].active
          : tabIcons[tab.key].inactive;
        const tint = isActive ? colors.accent : colors.textMuted;

        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={styles.tab}
          >
            <AppIcon name={iconName} size={22} color={tint} />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
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
    backgroundColor: colors.surface,
    borderTopColor: colors.surfaceBorder,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    paddingVertical: 6,
  },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "500",
  },
  labelActive: {
    color: colors.accent,
    fontWeight: "600",
  },
});
