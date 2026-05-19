import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppIcon } from "../components/AppIcon";
import { AuthForm } from "../components/AuthForm";
import { IconBadge } from "../components/IconBadge";
import { Screen } from "../components/Screen";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors";
import { authIcons } from "../theme/icons";

type SignUpScreenProps = {
  onGoToSignIn: () => void;
};

function SignUpConfirmation({
  email,
  onGoToSignIn,
}: {
  email: string;
  onGoToSignIn: () => void;
}) {
  return (
    <View style={styles.confirmation}>
      <IconBadge name={authIcons.mailSent} iconSize={34} />

      <Text style={styles.confirmationTitle}>Check your email</Text>
      <Text style={styles.confirmationBody}>
        We sent a confirmation link to{" "}
        <Text style={styles.confirmationEmail}>{email}</Text>. Open it to
        activate your account, then sign in.
      </Text>
      <Pressable
        onPress={onGoToSignIn}
        style={({ pressed }) => [
          styles.confirmationButton,
          pressed && styles.confirmationButtonPressed,
        ]}
      >
        <View style={styles.confirmationButtonContent}>
          <AppIcon name={authIcons.signIn} size={20} color={colors.text} />
          <Text style={styles.confirmationButtonLabel}>Back to sign in</Text>
        </View>
      </Pressable>
    </View>
  );
}

export function SignUpScreen({ onGoToSignIn }: SignUpScreenProps) {
  const { signUp } = useAuth();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const handleSignUp = async (email: string, password: string) => {
    const { needsEmailConfirmation } = await signUp(email, password);
    if (needsEmailConfirmation) {
      setPendingEmail(email.trim());
    }
  };

  if (pendingEmail) {
    return (
      <Screen>
        <SignUpConfirmation email={pendingEmail} onGoToSignIn={onGoToSignIn} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthForm
        title="Create account"
        subtitle="Start cataloging slabs in minutes"
        submitLabel="Sign up"
        submitIcon={authIcons.signUp}
        onSubmit={handleSignUp}
        footer={
          <Pressable onPress={onGoToSignIn} style={styles.footerLink}>
            <AppIcon name={authIcons.signIn} size={18} />
            <Text style={styles.link}>
              Already have an account?{" "}
              <Text style={styles.linkAccent}>Sign in</Text>
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
  confirmation: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  confirmationTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  confirmationBody: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  confirmationEmail: {
    color: colors.text,
    fontWeight: "600",
  },
  confirmationButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    marginTop: 8,
    paddingVertical: 16,
    width: "100%",
  },
  confirmationButtonPressed: {
    backgroundColor: colors.accentPressed,
  },
  confirmationButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  confirmationButtonLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
});
