import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppIcon } from "../components/AppIcon";
import { IconBadge } from "../components/IconBadge";
import { Screen } from "../components/Screen";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors";
import { authIcons } from "../theme/icons";

export function HomeScreen() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <IconBadge name="home-outline" />

        <Text style={styles.eyebrow}>NexIssue</Text>
        <Text style={styles.title}>Home</Text>

        <View style={styles.emailRow}>
          <AppIcon name={authIcons.user} size={22} />
          <Text style={styles.email}>{user?.email ?? "Signed in"}</Text>
        </View>

        <Text style={styles.hint}>
          Catalog, scan, and advisor tabs are placeholders for Phase 1.
        </Text>

        <Pressable
          disabled={signingOut}
          onPress={handleSignOut}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <AppIcon
            name={authIcons.signOut}
            size={18}
            color={colors.text}
          />
          <Text style={styles.buttonLabel}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "700",
  },
  emailRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  email: {
    color: colors.textMuted,
    fontSize: 16,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
    textAlign: "center",
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
});
