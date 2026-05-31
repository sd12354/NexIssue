import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppIcon } from "../components/AppIcon";
import { Screen } from "../components/Screen";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors";

type SettingsScreenProps = {
  onOpenIntegrations: () => void;
  onOpenShipping: () => void;
};

export function SettingsScreen({
  onOpenIntegrations,
  onOpenShipping,
}: SettingsScreenProps) {
  const { user, signOut } = useAuth();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Settings</Text>
        <Text style={styles.subheading}>
          {user?.email ?? "Signed in"}
        </Text>

        <Text style={styles.sectionLabel}>Workspace</Text>

        <Pressable
          onPress={onOpenIntegrations}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.rowIcon}>
            <AppIcon name="link" size={20} color={colors.accent} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Integrations</Text>
            <Text style={styles.rowMeta}>
              Connect eBay, Shippo, and GoCollect
            </Text>
          </View>
          <AppIcon name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Pressable
          onPress={onOpenShipping}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.rowIcon}>
            <AppIcon name="cube-outline" size={20} color={colors.accent} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Shipping</Text>
            <Text style={styles.rowMeta}>
              From address and package presets
            </Text>
          </View>
          <AppIcon name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.sectionLabel}>Account</Text>

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.row,
            styles.rowDanger,
            pressed && styles.rowPressed,
          ]}
        >
          <View style={[styles.rowIcon, styles.rowIconDanger]}>
            <AppIcon name="log-out-outline" size={20} color={colors.danger} />
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowTitle, { color: colors.danger }]}>
              Sign out
            </Text>
            <Text style={styles.rowMeta}>End this session on this device</Text>
          </View>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subheading: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 24,
    textTransform: "uppercase",
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 2,
    flexDirection: "row",
    gap: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  rowDanger: { borderColor: "rgba(255, 92, 122, 0.35)" },
  rowPressed: { opacity: 0.7 },
  rowIcon: {
    alignItems: "center",
    backgroundColor: "rgba(124, 92, 255, 0.14)",
    borderRadius: 10,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  rowIconDanger: { backgroundColor: "rgba(255, 92, 122, 0.14)" },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  rowMeta: { color: colors.textMuted, fontSize: 12 },
});
