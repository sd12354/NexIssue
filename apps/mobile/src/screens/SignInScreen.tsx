import { Pressable, StyleSheet, Text } from "react-native";

import { AppIcon } from "../components/AppIcon";
import { AuthForm } from "../components/AuthForm";
import { Screen } from "../components/Screen";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors";
import { authIcons } from "../theme/icons";

type SignInScreenProps = {
  onGoToSignUp: () => void;
};

export function SignInScreen({ onGoToSignUp }: SignInScreenProps) {
  const { signIn } = useAuth();

  return (
    <Screen>
      <AuthForm
        title="Welcome back"
        subtitle="Sign in to manage your graded comics"
        submitLabel="Sign in"
        submitIcon={authIcons.signIn}
        onSubmit={signIn}
        footer={
          <Pressable onPress={onGoToSignUp} style={styles.footerLink}>
            <AppIcon name="person-add-outline" size={18} />
            <Text style={styles.link}>
              No account? <Text style={styles.linkAccent}>Sign up</Text>
            </Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footerLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  link: {
    color: colors.textMuted,
    fontSize: 15,
  },
  linkAccent: {
    color: colors.accent,
    fontWeight: "600",
  },
});
